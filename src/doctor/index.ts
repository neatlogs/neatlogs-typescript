/**
 * Neatlogs trace doctor — main entry point.
 *
 * Usage (programmatic):
 *
 *     import { diagnose, formatReport, runCLI } from 'neatlogs/doctor';
 *     const report = diagnose('./spans.log');
 *     console.log(formatReport(report));
 *     if (report.hasErrors) process.exit(1);
 *
 * The `diagnose()` function runs the full pipeline specified by the
 * `doctor-port-handoff.md` specification. Per Section 6.1 of the handoff,
 * checks within a single trace run in this order:
 *
 *   1. Build child map, span_id set, duplicate list.
 *   2. PRE-LAUNCH RELIABILITY DIMENSIONS (always run, even on unusual traces):
 *      init-order, attribute-completeness, data-integrity,
 *      OTel GenAI semconv, token-waste.
 *   3. rootless-http-only → if true, append + return immediately.
 *   4. missing-root-kind.
 *   5. hierarchy pathologies (orphan, self, duplicate-id, multi-root, cycle).
 *   6. agent-without-llm (subtree).
 *   7. missing-io.
 *
 * Pre-PR-#20, the rootless-http-only early-return caused the 4 new
 * dimensions to be silently skipped on rootless HTTP traces (bug 12.1).
 * The new dimensions now run first. PR #21 added the OTel GenAI and
 * token-waste dimensions (steps 3d and 3e), all before the early-return.
 */

import {
  DEFAULT_SESSION_ID,
  DoctorFinding,
  DoctorReport,
  type SpanDict,
} from './types.js';
import {
  buildChildMap,
  groupByRun,
  groupByTrace,
  isInternal,
  iterTraces,
  readKind,
  readSpansSync,
} from './visibility.js';
import { readAttrs } from './io-checks.js';
import {
  agentWithoutLlmFindings,
  buildTraceIndex,
  duplicateSpanIdFindings,
  foreignInstrumentationFindings,
  isRootlessHttpOnly,
  missingIoFindings,
  missingRootKindFindings,
  multipleRootsFindings,
  orphanParentFindings,
  selfParentFindings,
} from './checks.js';
import { findCycles } from './cycle.js';
import {
  attributeCompletenessFindings,
  dataIntegrityFindings,
  initOrderFindings,
} from './dimensions.js';
import { otelGenaiFindings, tokenWasteFindings } from './otel.js';
import { pipelineStageRunFinding } from './pipeline-summary.js';

export interface DiagnoseOptions {
  /** Only analyze spans belonging to this run (session.id or trace_id). */
  runId?: string;
  /** Only return foreign-instrumentation findings. */
  foreignOnly?: boolean;
  /**
   * If True, the doctor reads LLM prompt contents (PII concern) to detect
   * the `repeated-system-prompt` pattern. Default is False. Pass
   * `--read-prompt-content` on the CLI to enable. The other token-waste
   * checks (oversized-prompt, unused-tool-definition) run regardless.
   */
  readPromptContent?: boolean;
}

export interface FormatReportOptions {
  /** Severity icon for each finding line (default = bracketed severity). */
  severityIcon?: boolean;
}

/**
 * Diagnose a processed span JSONL file. The `path` argument may be a
 * filesystem path or the literal `'-'` to read from stdin.
 */
export function diagnose(path: string, options: DiagnoseOptions = {}): DoctorReport {
  const findings: DoctorFinding[] = [];
  let spans: SpanDict[] = [];
  let invalidLines: number[] = [];

  if (path === '-') {
    // The CLI layer (`cli.ts`) handles stdin explicitly by reading into
    // a string and calling `diagnoseFromString()`. The programmatic
    // `diagnose()` API expects a filesystem path; the `-` shorthand is
    // a CLI-only feature.
    throw new Error(
      "diagnose('-') is not supported directly. Use the CLI entry point or readSpansSync() on a pre-buffered string.",
    );
  }

  const result = readSpansSync(path, findings);
  spans = result.spans;
  invalidLines = result.invalidLines;

  if (invalidLines.length > 0) {
    const severity: 'error' | 'warning' = spans.length > 0 ? 'warning' : 'error';
    findings.push(
      new DoctorFinding({
        severity,
        code: 'invalid-jsonl',
        title: 'Span log contains invalid JSON lines',
        evidence: `Invalid line numbers: ${invalidLines.slice(0, 5).join(', ')}`,
        suggestion: 'Use a processed span log written by NEATLOGS_LOG_SPANS_FILE.',
      }),
    );
  }

  if (spans.length === 0 && !findings.some((f) => f.code === 'file-not-found')) {
    findings.push(
      new DoctorFinding({
        severity: 'error',
        code: 'no-spans',
        title: 'No spans found',
        evidence: `${path} did not contain any processed span records.`,
        suggestion:
          'Set NEATLOGS_LOG_SPANS=true, run the app again, then call neatlogs.flush() and neatlogs.shutdown() before the process exits.',
      }),
    );
  }

  let runs = groupByRun(spans);

  if (options.runId !== undefined) {
    if (runs.has(options.runId)) {
      const onlyRun = runs.get(options.runId)!;
      runs = new Map([[options.runId, onlyRun]]);
    } else {
      const available = [...runs.keys()].sort().slice(0, 5);
      findings.push(
        new DoctorFinding({
          severity: 'error',
          code: 'run-id-not-found',
          title: 'Requested run id not present in log',
          evidence: `run_id='${options.runId}' but log has runs: ${JSON.stringify(available)}`,
          suggestion:
            'Omit --run-id to analyze all runs, or pick one from the list.',
        }),
      );
      runs = new Map();
    }
  }

  if (runs.size > 1 && options.runId === undefined) {
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'multi-run-log',
        title: 'Log file contains spans from multiple runs',
        evidence: `${runs.size} runs detected, ${spans.length} spans total. Pass --run-id <id> to scope the report to one run.`,
        suggestion:
          'Rotate NEATLOGS_LOG_SPANS_FILE between runs, or use --run-id.',
      }),
    );
  }

  const readPromptContent = options.readPromptContent ?? false;
  let anyScopeSeen = false;
  for (const [rid, runSpans] of runs) {
    const traces = groupByTrace(runSpans);
    for (const [tid, traceSpans] of traces) {
      findings.push(...diagnoseTrace(tid, traceSpans, rid, { readPromptContent }));
    }
    const { findings: scopeFindings, scopesSeen } = foreignInstrumentationFindings(
      runSpans,
      rid,
    );
    anyScopeSeen = anyScopeSeen || scopesSeen;
    findings.push(...scopeFindings);
  }

  if (!anyScopeSeen && spans.length > 0) {
    findings.push(
      new DoctorFinding({
        severity: 'info',
        code: 'scope-not-preserved',
        title:
          'instrumentation_scope not in the log — foreign detection unavailable',
        evidence: `All ${spans.length} span(s) lack instrumentation_scope. Foreign-instrumentation detection cannot run.`,
        suggestion:
          'Update neatlogs to a version that preserves instrumentation_scope in the span log (see neatlogs/core/span_processor.py).',
      }),
    );
  }

  if (options.foreignOnly) {
    return finalizeReport(
      findings.filter((f) => f.code.startsWith('foreign-instrumentation')),
      path,
      spans,
      invalidLines,
      runs,
    );
  }

  if (!options.foreignOnly) {
    const summary = pipelineStageRunFinding(findings);
    if (summary !== null) findings.push(summary);
  }

  return finalizeReport(findings, path, spans, invalidLines, runs);
}

/** Sort + finalize the report. */
function finalizeReport(
  findings: DoctorFinding[],
  path: string,
  spans: readonly SpanDict[],
  invalidLines: readonly number[],
  runs: ReadonlyMap<string, readonly SpanDict[]>,
): DoctorReport {
  const severityRank: Record<string, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => {
    const ra = severityRank[a.severity] ?? 99;
    const rb = severityRank[b.severity] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.code.localeCompare(b.code);
  });

  return new DoctorReport({
    path,
    spansRead: spans.length,
    traceCount: [...iterTraces(runs)].length,
    runCount: runs.size,
    invalidLines,
    findings,
  });
}

/**
 * Options for `diagnoseTrace`. Lets the caller opt in to PII-sensitive
 * checks without polluting the trace-level signature.
 */
export interface DiagnoseTraceOptions {
  /**
   * If True, read LLM prompt contents to detect `repeated-system-prompt`.
   * Default false. The other token-waste checks always run.
   */
  readPromptContent?: boolean;
}

/**
 * Run all per-trace checks in the exact order specified by Section 6.1
 * of the handoff. The 5 pre-launch reliability dimensions (init-order,
 * attribute-completeness, data-integrity, OTel GenAI, token-waste) run
 * FIRST (before the early-return checks), so they fire on every trace
 * shape. PR #21 added steps 3d and 3e.
 */
export function diagnoseTrace(
  traceId: string,
  spans: readonly SpanDict[],
  runId: string,
  options: DiagnoseTraceOptions = {},
): DoctorFinding[] {
  const visible = spans.filter((s) => !isInternal(s));
  if (visible.length === 0) return [];

  const roots = visible.filter((s) => !s.parent_span_id);
  const rootKinds = new Set(roots.map((s) => readKind(s)));

  // (0) Build child map, span_id set, duplicate list. Used by checks below.
  const { childMap, spanIds, duplicateSpanIds } = buildTraceIndex(visible);

  // (1, 2, 3) PRE-LAUNCH RELIABILITY DIMENSIONS run FIRST, before any
  // early-return. Per Section 12.1 of the handoff, the previous version ran
  // them AFTER rootless-http-only, which caused them to be silently skipped
  // on rootless HTTP traces. Fixed in commit 9669556. PR #21 added the
  // OTel GenAI (3d) and token-waste (3e) dimensions.
  const readPromptContent = options.readPromptContent ?? false;
  const findings: DoctorFinding[] = [];
  findings.push(...initOrderFindings(visible, traceId, runId));
  findings.push(...attributeCompletenessFindings(visible, traceId, runId));
  findings.push(...dataIntegrityFindings(visible, traceId, runId));
  findings.push(...otelGenaiFindings(visible, traceId, runId));
  findings.push(...tokenWasteFindings(visible, traceId, runId, readPromptContent));

  // (4) rootless-http-only → early return. Only the new dimensions have
  // already run by this point.
  if (isRootlessHttpOnly(visible)) {
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'rootless-http-only',
        title: 'Trace only contains rootless HTTP spans',
        evidence: `${visible.length} HTTP span(s) have no traced parent.`,
        suggestion:
          'Wrap the request, job, or script entry point in @span(kind="WORKFLOW") so HTTP calls belong to an application trace.',
        traceId,
        runId,
      }),
    );
    return findings;
  }

  // (5) missing-root-kind
  findings.push(...missingRootKindFindings(rootKinds, traceId, runId));

  // (6) hierarchy pathologies (in this exact order).
  findings.push(...orphanParentFindings(visible, spanIds, traceId, runId));
  findings.push(...selfParentFindings(visible, traceId, runId));
  findings.push(...duplicateSpanIdFindings(duplicateSpanIds, traceId, runId));
  findings.push(...multipleRootsFindings(roots, traceId, runId));

  // Cycle detection on the cleaned (self-parent-filtered) spans.
  const cleanedForCycle = visible.filter(
    (s) => !(typeof s.span_id === 'string' && typeof s.parent_span_id === 'string' && s.span_id === s.parent_span_id),
  );
  // For cycle detection, we need the child_map for the cleaned subset.
  const cycleChildMap = buildChildMap(cleanedForCycle);
  findings.push(...findCycles(cleanedForCycle, cycleChildMap, traceId, runId).findings);

  // (7) agent-without-llm (subtree).
  findings.push(...agentWithoutLlmFindings(visible, childMap, traceId, runId));

  // (8) missing-io.
  findings.push(...missingIoFindings(visible, traceId, runId));

  return findings;
}

/**
 * Render a DoctorReport as a human-readable text block. Stable for
 * shell-script consumption.
 */
export function formatReport(report: DoctorReport): string {
  const lines: string[] = [
    'Trace Doctor',
    `File: ${report.path}`,
    `Spans: ${report.spansRead}`,
    `Traces: ${report.traceCount}`,
    `Runs: ${report.runCount}`,
  ];
  if (report.findings.length === 0) {
    lines.push('');
    lines.push('No problems found.');
    return lines.join('\n');
  }
  lines.push('');
  lines.push('Findings:');
  for (let i = 0; i < report.findings.length; i++) {
    const f = report.findings[i];
    const locParts: string[] = [];
    if (f.traceId) locParts.push(`trace=${f.traceId}`);
    if (f.runId && f.runId !== DEFAULT_SESSION_ID) locParts.push(`run=${f.runId}`);
    const loc = locParts.length > 0 ? ' ' + locParts.join(' ') : '';
    lines.push(`${i + 1}. [${f.severity}] ${f.title}${loc}`);
    lines.push(`   Evidence: ${f.evidence}`);
    lines.push(`   Fix: ${f.suggestion}`);
  }
  return lines.join('\n');
}

// Re-exports for convenience.
export {
  DEFAULT_SESSION_ID,
  type DoctorFinding,
  DoctorReport,
  type FixClass,
} from './types.js';
export type { SpanDict } from './types.js';

// Re-export the low-level readers so callers / tests can drive them
// directly without going through `diagnose`.
export { readAttrs } from './io-checks.js';
export {
  readSpansSync,
  readKind,
  isInternal,
  groupByRun,
  groupByTrace,
  iterTraces,
  spanStatusIsError,
  truncate,
} from './visibility.js';
