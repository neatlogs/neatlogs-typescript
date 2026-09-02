/**
 * Neatlogs trace doctor — the 4 new diagnostic dimensions.
 *
 * These are the dimensions added in PR #20 (per Section 12 of the handoff).
 * They run BEFORE the early-return checks (the bug we had to fix), so they
 * fire on every trace shape — including rootless HTTP, missing-root-kind,
 * and unusual hierarchies.
 *
 *   init-after-client        — error, fix_class=init_order, auto-fixable=True
 *   missing-span-kind         — warning, fix_class=attribute
 *   zero-duration-span        — warning, fix_class=data_integrity
 *   error-status-no-event     — warning, fix_class=data_integrity
 *   latency-mismatch          — error, fix_class=data_integrity
 *
 *   pipeline-stage-summary    — info, fix_class=pipeline
 *                              (run-level, built in `pipeline-summary.ts`)
 */

import {
  DoctorFinding,
  INIT_MARKER_KEYS,
  type SpanDict,
} from './types.js';
import { readKind, spanStatusIsError, truncate } from './visibility.js';
import { readAttrs } from './io-checks.js';

/**
 * Detect wrappers created BEFORE `neatlogs.init()`. The OTel SDK is
 * loaded (we get a span out) but our attribute processor never ran, so
 * none of the INIT_MARKER_KEYS are set. Only the FIRST such span per
 * trace is reported — the rest are downstream of the same root cause.
 */
export function initOrderFindings(
  visible: readonly SpanDict[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  for (const span of visible) {
    const attrs = readAttrs(span);
    let hasMarker = false;
    for (const k of INIT_MARKER_KEYS) {
      if (k in attrs) {
        hasMarker = true;
        break;
      }
    }
    if (hasMarker) continue;
    findings.push(
      new DoctorFinding({
        severity: 'error',
        code: 'init-after-client',
        title:
          'Span has no Neatlogs init markers — wrapper likely created before neatlogs.init()',
        evidence: `span '${truncate(span.name ?? '<unnamed>')}' has none of ${JSON.stringify([...INIT_MARKER_KEYS])}`,
        // §12.4 fix: never mention `force_reload=True` (it doesn't exist).
        suggestion:
          'Move neatlogs.init() to the very top of your entry point, BEFORE constructing any LLM client (openai.Anthropic(), ChatOpenAI(), genai.Client(), etc.). If you cannot reorder, call neatlogs.shutdown() then neatlogs.init() again to re-attach the wrappers.',
        traceId,
        runId,
        fixClass: 'init_order',
        automatedFixAvailable: true,
        // §11 / §12.3: in-repo path, NOT docs.neatlogs.com (which 404s).
        docUrl: 'skills/neatlogs/references/troubleshooting.md#1-import-order-issues-most-common-mistake',
        relatedCodes: ['no-spans', 'missing-root-kind'],
      }),
    );
    break;
  }
  return findings;
}

/**
 * Detect spans that lack `neatlogs.span.kind`. Suppressed when ALL spans
 * miss the kind (that's the init-order symptom in milder form).
 */
export function attributeCompletenessFindings(
  visible: readonly SpanDict[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  let missingCount = 0;
  const examples: string[] = [];
  for (const span of visible) {
    const attrs = readAttrs(span);
    if (!('neatlogs.span.kind' in attrs)) {
      missingCount += 1;
      if (examples.length < 3) {
        examples.push(String(span.name ?? '<unnamed>'));
      }
    }
  }
  if (visible.length > 0 && missingCount === visible.length) {
    // All spans missing the kind — init-order check handles it.
    return [];
  }
  if (missingCount === 0) return [];
  const suffix = missingCount > 3 ? ' ...' : '';
  return [
    new DoctorFinding({
      severity: 'warning',
      code: 'missing-span-kind',
      title: 'Some spans lack neatlogs.span.kind — dashboard will mis-categorize them',
      evidence: `${missingCount} of ${visible.length} span(s) missing neatlogs.span.kind: ${examples.join(', ')}${suffix}`,
      suggestion:
        'Set neatlogs.span.kind on every emitted span. @neatlogs.span(kind=...) populates it automatically; if you wrap a third-party client, the wrapper should set it.',
      traceId,
      runId,
      fixClass: 'attribute',
      docUrl:
        'skills/neatlogs/references/troubleshooting.md#6-common-anti-patterns-table',
    }),
  ];
}

/**
 * Three sub-checks per span (run in one pass):
 *   zero-duration-span     — duration_ns == 0  OR  start == end
 *   error-status-no-event  — status is ERROR AND no `exception` event
 *   latency-mismatch       — end < start
 *
 * Internal spans (`neatlogs.internal=True` or name == `neatlogs.trace.complete`)
 * are excluded. One finding per sub-check per trace.
 */
export function dataIntegrityFindings(
  visible: readonly SpanDict[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const zeroDur: string[] = [];
  const errorNoEvent: string[] = [];
  const latencyMismatch: string[] = [];

  for (const span of visible) {
    const name = String(span.name ?? '<unnamed>');
    const start = span.start_time;
    const end = span.end_time;
    const duration = span.duration_ns;
    const status = span.status;
    const events = Array.isArray(span.events) ? span.events : [];

    // Skip internal spans (defensive — the caller already filters, but
    // the per-trace loop sees only visible spans already).
    const attrs = readAttrs(span);
    if (attrs['neatlogs.internal'] || span.name === 'neatlogs.trace.complete') continue;

    // a) zero duration
    if (
      (typeof duration === 'number' && duration === 0) ||
      (typeof start === 'number' && typeof end === 'number' && end === start)
    ) {
      zeroDur.push(name);
    }

    // c) latency mismatch
    if (typeof start === 'number' && typeof end === 'number' && end < start) {
      latencyMismatch.push(name);
    }

    // b) error status without exception event
    if (spanStatusIsError(status)) {
      const hasException = events.some(
        (e: unknown) => e && typeof e === 'object' && (e as Record<string, unknown>)['name'] === 'exception',
      );
      if (!hasException) errorNoEvent.push(name);
    }
  }

  if (zeroDur.length > 0) {
    const shown = zeroDur.slice(0, 3).join(', ');
    const suffix = zeroDur.length > 3 ? ' ...' : '';
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'zero-duration-span',
        title: 'Some spans ended instantly (duration_ns == 0)',
        evidence: `${zeroDur.length} span(s) with zero duration: ${shown}${suffix}`,
        suggestion:
          "Wrapper likely crashed before span.end(), or an async wrapper did not await. Check the wrapper's exception path and register it with @contextlib.asynccontextmanager if the client is async.",
        traceId,
        runId,
        fixClass: 'data_integrity',
        relatedCodes: ['error-status-no-event'],
      }),
    );
  }
  if (errorNoEvent.length > 0) {
    const shown = errorNoEvent.slice(0, 3).join(', ');
    const suffix = errorNoEvent.length > 3 ? ' ...' : '';
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'error-status-no-event',
        title: 'Spans marked ERROR but no exception event recorded',
        evidence: `${errorNoEvent.length} span(s): ${shown}${suffix}`,
        suggestion:
          "Attach an exception event with stack trace when marking a span ERROR. Without it, the dashboard's error view shows the span as red but offers no detail. Use opentelemetry's record_exception() inside the wrapper's except block.",
        traceId,
        runId,
        fixClass: 'data_integrity',
        relatedCodes: ['zero-duration-span'],
      }),
    );
  }
  if (latencyMismatch.length > 0) {
    const shown = latencyMismatch.slice(0, 3).join(', ');
    findings.push(
      new DoctorFinding({
        severity: 'error',
        code: 'latency-mismatch',
        title: 'Span end_time is before start_time',
        evidence: `${latencyMismatch.length} span(s) with end < start: ${shown}`,
        suggestion:
          'Clock issue: the wrapper captured start_time and end_time from different clocks. Call time.time_ns() (or perf_counter_ns()) once per phase and use that one source for both.',
        traceId,
        runId,
        fixClass: 'data_integrity',
      }),
    );
  }
  return findings;
}

/** No-op export to keep file self-contained when imported by index.ts. */
export { readKind };
