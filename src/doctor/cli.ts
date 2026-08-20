/**
 * Neatlogs trace doctor — CLI entry point.
 *
 * Usage:
 *   neatlogs-doctor ./spans.log
 *   neatlogs-doctor ./spans.log --json
 *   neatlogs-doctor ./spans.log --run-id abc123
 *   neatlogs-doctor ./spans.log --foreign-only
 *   cat spans.log | neatlogs-doctor -
 *
 * Exit code: 0 if no error-severity findings, 1 otherwise.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DoctorFinding, DoctorReport, type SpanDict } from './types.js';
import { diagnose, formatReport } from './index.js';

export interface CliOptions {
  path: string;
  json: boolean;
  runId?: string;
  foreignOnly: boolean;
}

export class CliParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliParseError';
  }
}

/**
 * Parse a CLI argv vector. Throws CliParseError on bad input. Exposed
 * separately so tests can drive the parser without invoking main().
 */
export function parseArgs(argv: string[]): CliOptions {
  const positional: string[] = [];
  let json = false;
  let runId: string | undefined;
  let foreignOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--json') {
      json = true;
    } else if (arg === '--foreign-only') {
      foreignOnly = true;
    } else if (arg === '--run-id') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new CliParseError('--run-id requires a value');
      }
      runId = next;
      i += 1;
    } else if (arg.startsWith('--run-id=')) {
      runId = arg.slice('--run-id='.length);
    } else if (arg.startsWith('--')) {
      throw new CliParseError(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  let pathArg: string | undefined = positional[0];
  if (pathArg === undefined) {
    const env = process.env['NEATLOGS_LOG_SPANS_FILE'];
    pathArg = env;
  }
  if (pathArg === undefined || pathArg === '') {
    throw new CliParseError(
      'no path provided; pass it as an argument or set NEATLOGS_LOG_SPANS_FILE',
    );
  }
  return {
    path: pathArg,
    json,
    ...(runId !== undefined ? { runId } : {}),
    foreignOnly,
  };
}

/**
 * Read all of stdin synchronously. Used when the path is `-`. Bounded
 * at 500MB so a runaway pipeline can't OOM the doctor.
 */
export function readStdin(): string {
  const chunks: Buffer[] = [];
  try {
    const buf = Buffer.alloc(64 * 1024);
    let total = 0;
    while (true) {
      const n = fs.readSync(0, buf, 0, buf.length, null);
      if (n === 0) break;
      chunks.push(Buffer.from(buf.subarray(0, n)));
      total += n;
      if (total > 500 * 1024 * 1024) {
        throw new Error('stdin exceeds 500MB cap; aborting');
      }
    }
  } catch (e) {
    // On TTY stdin, fs.readSync returns EAGAIN. Treat as no input.
    if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e;
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Parse a JSONL string into a list of span dicts + invalid line numbers. */
function parseJsonl(content: string): { spans: SpanDict[]; invalidLines: number[] } {
  const lines = content.split('\n');
  const spans: SpanDict[] = [];
  const invalidLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const stripped = lines[i].trim();
    if (!stripped) continue;
    try {
      const value = JSON.parse(stripped) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        spans.push(value as SpanDict);
      } else {
        invalidLines.push(lineNumber);
      }
    } catch {
      invalidLines.push(lineNumber);
    }
  }
  return { spans, invalidLines };
}

/**
 * Diagnose from a JSONL string (e.g. from stdin). Writes the spans to a
 * temp file and re-uses the public `diagnose()` pipeline so the logic
 * stays in one place.
 */
export function diagnoseFromString(
  content: string,
  sourceLabel: string,
  options: { runId?: string; foreignOnly?: boolean } = {},
): DoctorReport {
  const { spans, invalidLines } = parseJsonl(content);

  // The pre-parsed `invalidLines` and `file-not-found` finding logic
  // run inside `diagnose()`, but `diagnose()` only emits those when it
  // itself reads the file. To preserve parity, re-emit `invalid-jsonl`
  // and `no-spans` from the in-memory path.
  const preFindings: DoctorFinding[] = [];
  if (invalidLines.length > 0) {
    const severity: 'error' | 'warning' = spans.length > 0 ? 'warning' : 'error';
    preFindings.push(
      new DoctorFinding({
        severity,
        code: 'invalid-jsonl',
        title: 'Span log contains invalid JSON lines',
        evidence: `Invalid line numbers: ${invalidLines.slice(0, 5).join(', ')}`,
        suggestion: 'Use a processed span log written by NEATLOGS_LOG_SPANS_FILE.',
      }),
    );
  }
  if (spans.length === 0) {
    preFindings.push(
      new DoctorFinding({
        severity: 'error',
        code: 'no-spans',
        title: 'No spans found',
        evidence: `${sourceLabel} did not contain any processed span records.`,
        suggestion:
          'Set NEATLOGS_LOG_SPANS=true, run the app again, then call neatlogs.flush() and neatlogs.shutdown() before the process exits.',
      }),
    );
  }

  // Write to a temp file, run the public pipeline, then relabel the path.
  const tmpPath = path.join(
    os.tmpdir(),
    `neatlogs-doctor-${process.pid}-${Date.now()}.jsonl`,
  );
  const body = spans.map((s) => JSON.stringify(s)).join('\n');
  fs.writeFileSync(tmpPath, body ? body + '\n' : '', 'utf-8');
  try {
    const report = diagnose(tmpPath, options);
    // Merge in the pre-findings (file-not-found is impossible here).
    const merged: DoctorFinding[] = [...preFindings, ...report.findings];
    // Re-sort by (severity, code) to match `diagnose()`'s output order.
    const severityRank: Record<string, number> = { error: 0, warning: 1, info: 2 };
    merged.sort((a, b) => {
      const ra = severityRank[a.severity] ?? 99;
      const rb = severityRank[b.severity] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.code.localeCompare(b.code);
    });
    return new DoctorReport({
      path: sourceLabel,
      spansRead: report.spansRead,
      traceCount: report.traceCount,
      runCount: report.runCount,
      invalidLines: report.invalidLines,
      findings: merged,
    });
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Main CLI entry point. Returns the exit code (0 or 1).
 */
export function main(argv: string[] = process.argv.slice(2)): number {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`neatlogs-doctor: ${(e as Error).message}\n`);
    return 2;
  }

  let report: DoctorReport;
  try {
    if (opts.path === '-') {
      const content = readStdin();
      report = diagnoseFromString(content, '<stdin>', {
        ...(opts.runId !== undefined ? { runId: opts.runId } : {}),
        foreignOnly: opts.foreignOnly,
      });
    } else {
      report = diagnose(opts.path, {
        ...(opts.runId !== undefined ? { runId: opts.runId } : {}),
        foreignOnly: opts.foreignOnly,
      });
    }
  } catch (e) {
    process.stderr.write(`neatlogs-doctor: ${(e as Error).message}\n`);
    return 2;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report.toDict(), null, 2) + '\n');
  } else {
    process.stdout.write(formatReport(report) + '\n');
  }
  return report.hasErrors ? 1 : 0;
}
