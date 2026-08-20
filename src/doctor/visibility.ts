/**
 * Neatlogs trace doctor — input layer.
 *
 * The doctor reads span log JSONL files. This module handles:
 * - the streaming JSONL reader (`_readSpans` in the Python reference)
 * - status format tolerance (`{"code": "ERROR"}` vs `{"status_code": {...}}`)
 * - instrumentation_scope format tolerance (string OR dict)
 * - run grouping (session.id → trace_id → sentinel fallback)
 * - trace grouping within a run
 * - the visibility filter (exclude internal spans from per-trace checks)
 *
 * The visibility rule (Section 5 of the handoff):
 *   "A span is internal if it has `neatlogs.internal=True` in attributes, OR
 *    if its name is exactly `neatlogs.trace.complete`. They are still
 *    counted in `spans_read` and `trace_count` but not in `visible`."
 */

import * as fs from 'node:fs';

import {
  DEFAULT_SESSION_ID,
  DoctorFinding,
  IO_KINDS,
  NEATLOGS_SCOPE_PREFIX,
  ROOT_KINDS,
  type DoctorSeverity,
  type SpanDict,
} from './types.js';

/** Read a JSONL span log into a list of span dicts, tracking invalid line numbers. */
export function readSpansSync(
  path: string,
  findings?: DoctorFinding[],
): { spans: SpanDict[]; invalidLines: number[] } {
  if (!fs.existsSync(path)) {
    findings?.push(
      new DoctorFinding({
        severity: 'error',
        code: 'file-not-found',
        title: 'Span log file not found',
        evidence: path,
        suggestion: 'Pass the processed span log path from NEATLOGS_LOG_SPANS_FILE.',
      }),
    );
    return { spans: [], invalidLines: [] };
  }

  const spans: SpanDict[] = [];
  const invalidLines: number[] = [];
  // errors="replace" on the Python side handles non-UTF-8 gracefully.
  // Node's readFileSync with 'utf-8' will substitute replacement chars.
  const content = fs.readFileSync(path, { encoding: 'utf-8' });
  const lines = content.split('\n');
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
 * Group spans by run (session.id when present, else the trace_id fallback,
 * else the sentinel).
 */
export function groupByRun(spans: readonly SpanDict[]): Map<string, SpanDict[]> {
  const runs = new Map<string, SpanDict[]>();
  for (const span of spans) {
    const attrs = (span.attributes ?? {}) as Record<string, unknown>;
    const session = attrs['session.id'];
    let runKey: string;
    if (typeof session === 'string' && session) {
      runKey = session;
    } else {
      runKey = String(span.trace_id ?? DEFAULT_SESSION_ID);
    }
    const arr = runs.get(runKey);
    if (arr) arr.push(span);
    else runs.set(runKey, [span]);
  }
  return runs;
}

/** Group spans by trace_id within a single run. */
export function groupByTrace(spans: readonly SpanDict[]): Map<string, SpanDict[]> {
  const traces = new Map<string, SpanDict[]>();
  for (const span of spans) {
    const tid = String(span.trace_id ?? 'unknown');
    const arr = traces.get(tid);
    if (arr) arr.push(span);
    else traces.set(tid, [span]);
  }
  return traces;
}

/** Yield (trace_id, run_id) for every trace in every run. */
export function* iterTraces(
  runs: ReadonlyMap<string, readonly SpanDict[]>,
): Generator<readonly [string, string]> {
  for (const [rid, runSpans] of runs) {
    const seen = new Set<string>();
    for (const span of runSpans) {
      const tid = String(span.trace_id ?? 'unknown');
      if (!seen.has(tid)) {
        seen.add(tid);
        yield [tid, rid] as const;
      }
    }
  }
}

/**
 * Read the kind from either the top-level `kind` field or
 * `attributes.neatlogs.span.kind`. Returned lowercase + trimmed.
 */
export function readKind(span: SpanDict): string {
  const attrs = (span.attributes ?? {}) as Record<string, unknown>;
  const value = (span.kind as unknown) ?? attrs['neatlogs.span.kind'] ?? '';
  return String(value).trim().toLowerCase();
}

/** True if the span is internal (excluded from per-trace checks). */
export function isInternal(span: SpanDict): boolean {
  const attrs = (span.attributes ?? {}) as Record<string, unknown>;
  if (attrs['neatlogs.internal']) return true;
  if (span.name === 'neatlogs.trace.complete') return true;
  return false;
}

/** True if the scope name is a Neatlogs-owned scope. */
export function isNeatlogsScope(scope: string): boolean {
  return scope === NEATLOGS_SCOPE_PREFIX || scope.startsWith(NEATLOGS_SCOPE_PREFIX + '.');
}

/**
 * Tolerant status error check. Accepts BOTH the Neatlogs-normalized form
 * `{"code": "ERROR", ...}` and the OTel SDK canonical form
 * `{"status_code": {"name": "ERROR", ...}}`. Non-dict statuses return false.
 */
export function spanStatusIsError(status: unknown): boolean {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return false;
  const s = status as Record<string, unknown>;
  const code = s['code'];
  if (typeof code === 'string' && code.toUpperCase() === 'ERROR') return true;
  const statusCode = s['status_code'];
  if (statusCode && typeof statusCode === 'object' && !Array.isArray(statusCode)) {
    const name = (statusCode as Record<string, unknown>)['name'];
    if (typeof name === 'string' && name.toUpperCase() === 'ERROR') return true;
  }
  if (typeof statusCode === 'string' && statusCode.toUpperCase() === 'ERROR') return true;
  return false;
}

/** Truncate a value for evidence fields; non-strings are coerced. */
export function truncate(s: unknown, maxLen: number = 200): string {
  const text = String(s);
  if (text.length > maxLen) return text.slice(0, maxLen - 3) + '...';
  return text;
}

/** Build a child_map (parent_id → children spans) for the visible subset. */
export function buildChildMap(spans: readonly SpanDict[]): Map<string, SpanDict[]> {
  const childMap = new Map<string, SpanDict[]>();
  for (const span of spans) {
    const pid = span.parent_span_id;
    if (pid) {
      const arr = childMap.get(String(pid));
      if (arr) arr.push(span);
      else childMap.set(String(pid), [span]);
    }
  }
  return childMap;
}

export { DEFAULT_SESSION_ID, IO_KINDS, NEATLOGS_SCOPE_PREFIX, ROOT_KINDS };
export type { DoctorSeverity };
