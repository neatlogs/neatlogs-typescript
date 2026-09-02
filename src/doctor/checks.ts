/**
 * Neatlogs trace doctor — the 12 trace-level check functions.
 *
 * Every function returns `DoctorFinding[]`. The caller
 * (`diagnoseTrace` in index.ts) runs them in the exact order specified by
 * Section 6.1 of the handoff so we don't produce false positives or miss
 * findings. The four "new dimension" functions live in `dimensions.ts`
 * because they share the same `fix_class` taxonomy.
 *
 * Note: the bug we had to avoid (Section 6.1 / 12.1) was that the
 * rootless-http-only early-return caused the 4 new dimensions to be
 * silently skipped on rootless HTTP traces. The new dimensions now run
 * BEFORE the early-return — see the call order in `index.ts`.
 */

import { hasInput, hasOutput, readAttrs } from './io-checks.js';
import { DoctorFinding, type SpanDict } from './types.js';
import {
  IO_KINDS,
  ROOT_KINDS,
  readKind,
  truncate,
  buildChildMap,
} from './visibility.js';

/** llm-missing-io / tool-missing-io / retriever-missing-io. */
export function missingIoFindings(
  visible: readonly SpanDict[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  const missingByKind = new Map<string, string[]>();
  for (const span of visible) {
    const kind = readKind(span);
    if (!IO_KINDS.has(kind)) continue;
    const attrs = readAttrs(span);
    if (hasInput(kind, attrs) && hasOutput(kind, attrs)) continue;
    const name = String(span.name ?? '<unnamed>');
    const arr = missingByKind.get(kind);
    if (arr) arr.push(name);
    else missingByKind.set(kind, [name]);
  }

  const findings: DoctorFinding[] = [];
  for (const [kind, names] of [...missingByKind.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const shown = names.slice(0, 3).join(', ');
    const suffix = names.length > 3 ? ` and ${names.length - 3} more` : '';
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: `${kind}-missing-io`,
        title: `${kind.toUpperCase()} spans are missing input or output`,
        evidence: `${names.length} span(s): ${shown}${suffix}`,
        suggestion:
          'Check that the SDK call completed, capture_input/capture_output is enabled, and the provider integration supports this operation.',
        traceId,
        runId,
        fixClass: 'capture',
        // NOTE: doc_url is intentionally NOT set here — pre-existing codes
        // used the broken docs.neatlogs.com URLs (bug 12.3). Out of scope
        // for the new dimensions; fix in a follow-up per the handoff.
        relatedCodes: ['instrumentation-missing'],
      }),
    );
  }
  return findings;
}

/** orphan-parent: parent_span_id references a span_id that doesn't exist. */
export function orphanParentFindings(
  visible: readonly SpanDict[],
  spanIds: ReadonlySet<string>,
  traceId: string,
  runId: string,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  for (const span of visible) {
    const pid = span.parent_span_id;
    if (typeof pid !== 'string' || !pid) continue;
    if (spanIds.has(pid)) continue;
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'orphan-parent',
        title: 'Span has a parent_span_id that does not exist in this trace',
        evidence: `span '${truncate(span.name ?? '<unnamed>')}' has parent_span_id='${pid}' but no span with that id was found`,
        suggestion:
          'This usually means a wrapper ended a span twice, or two wrappers produced overlapping traces. Inspect the call site for the named span.',
        traceId,
        runId,
      }),
    );
  }
  return findings;
}

/** self-parent: span_id == parent_span_id. One finding per trace. */
export function selfParentFindings(
  visible: readonly SpanDict[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  for (const span of visible) {
    const sid = span.span_id;
    const pid = span.parent_span_id;
    if (typeof sid === 'string' && typeof pid === 'string' && sid && sid === pid) {
      findings.push(
        new DoctorFinding({
          severity: 'error',
          code: 'self-parent',
          title: 'Span has parent_span_id equal to its own span_id',
          evidence: `span '${truncate(span.name ?? '<unnamed>')}' self-cycles`,
          suggestion:
            'This is a serious instrumentation bug — the wrapper is using the wrong field or initializing twice. Open an issue on the neatlogs repo with this trace_id.',
          traceId,
          runId,
        }),
      );
      break; // Only one per trace.
    }
  }
  return findings;
}

/** duplicate-span-id: same span_id appears more than once. */
export function duplicateSpanIdFindings(
  duplicateIds: readonly string[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  if (duplicateIds.length === 0) return [];
  const uniq = [...new Set(duplicateIds)].sort();
  return [
    new DoctorFinding({
      severity: 'error',
      code: 'duplicate-span-id',
      title: 'Two or more spans share the same span_id',
      evidence: `span_id(s) appearing more than once: ${uniq.slice(0, 5).join(', ')}`,
      suggestion:
        'Indicates a duplicate export or a wrapper that emits a new span without a unique id. The hierarchy check is unreliable for this trace.',
      traceId,
      runId,
    }),
  ];
}

/** multiple-roots: more than one root span. */
export function multipleRootsFindings(
  roots: readonly SpanDict[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  if (roots.length <= 1) return [];
  const shown = roots
    .slice(0, 3)
    .map((s) => truncate(s.name ?? '<unnamed>'))
    .join(', ');
  return [
    new DoctorFinding({
      severity: 'warning',
      code: 'multiple-roots',
      title: 'Trace has more than one root span',
      evidence: `${roots.length} root spans: ${shown}`,
      suggestion:
        "Either two entry points ran in parallel, or the trace_id is being shared across processes. Add a single @span(kind='WORKFLOW') at the top level, or generate a unique trace_id per execution.",
      traceId,
      runId,
    }),
  ];
}

/** Walk a child subtree to see if any descendant has kind=llm. */
function hasLlmDescendant(spanId: string, childMap: ReadonlyMap<string, SpanDict[]>): boolean {
  const visited = new Set<string>();
  const stack: string[] = [spanId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const child of childMap.get(cur) ?? []) {
      if (readKind(child) === 'llm') return true;
      const cid = child.span_id;
      if (typeof cid === 'string' && cid) stack.push(cid);
    }
  }
  return false;
}

/** agent-without-llm: agent span with no LLM descendant in its subtree. */
export function agentWithoutLlmFindings(
  visible: readonly SpanDict[],
  childMap: ReadonlyMap<string, SpanDict[]>,
  traceId: string,
  runId: string,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  for (const span of visible) {
    if (readKind(span) !== 'agent') continue;
    const sid = span.span_id;
    if (typeof sid !== 'string' || !sid) continue;
    if (hasLlmDescendant(sid, childMap)) continue;
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'agent-without-llm',
        title: 'Agent span ended without any LLM call in its subtree',
        evidence: `agent '${truncate(span.name ?? '<unnamed>')}' has no LLM descendant`,
        // §12.4 fix: never mention `force_reload=True` (it doesn't exist).
        suggestion:
          "Check import order: the LLM client must be created AFTER neatlogs.init(). If you cannot reorder, call neatlogs.shutdown() then neatlogs.init() again to re-attach the wrappers. Also verify the LLM library is in the `instrumentations=[...]` list.",
        traceId,
        runId,
      }),
    );
  }
  return findings;
}

/** True iff all visible spans are rootless HTTP. */
export function isRootlessHttpOnly(visible: readonly SpanDict[]): boolean {
  if (visible.length === 0) return false;
  return visible.every((s) => readKind(s) === 'http' && !s.parent_span_id);
}

/** foreign-instrumentation-detected: any non-Neatlogs scope name in the run. */
export function foreignInstrumentationFindings(
  runSpans: readonly SpanDict[],
  runId: string,
): { findings: DoctorFinding[]; scopesSeen: boolean } {
  const findings: DoctorFinding[] = [];
  let scopesSeen = false;
  const scopeCounts = new Map<string, number>();
  for (const span of runSpans) {
    const scope = span.instrumentation_scope;
    if (scope && typeof scope === 'object' && 'name' in scope) {
      const name = String((scope as { name: unknown }).name ?? '');
      if (name) {
        scopesSeen = true;
        scopeCounts.set(name, (scopeCounts.get(name) ?? 0) + 1);
      }
    } else if (typeof scope === 'string' && scope) {
      scopesSeen = true;
      scopeCounts.set(scope, (scopeCounts.get(scope) ?? 0) + 1);
    }
  }
  if (!scopesSeen) return { findings, scopesSeen: false };

  const foreign: Array<[string, number]> = [];
  let neatlogsCount = 0;
  for (const [name, n] of scopeCounts) {
    if (name === 'neatlogs' || name.startsWith('neatlogs.')) {
      neatlogsCount += n;
    } else {
      foreign.push([name, n]);
    }
  }
  if (foreign.length === 0) return { findings, scopesSeen: true };

  const parts = foreign.map(([name, n]) => `${n} spans from '${name}'`);
  findings.push(
    new DoctorFinding({
      severity: 'warning',
      code: 'foreign-instrumentation-detected',
      title: 'Foreign instrumentation is polluting the neatlogs trace',
      evidence: `${runSpans.length} total spans: ${parts.join(', ')} (+ ${neatlogsCount} neatlogs spans)`,
      suggestion:
        'Either disable the foreign instrumentations in this process, or set NEATLOGS_FILTER_SCOPE=neatlogs to scope the dashboard filter.',
      runId,
    }),
  );
  return { findings, scopesSeen: true };
}

/**
 * Build the child map and duplicate-span-id list for the visible subset of
 * a trace. Returns the data the hierarchy + agent-without-llm checks
 * need in one pass.
 */
export function buildTraceIndex(visible: readonly SpanDict[]): {
  childMap: Map<string, SpanDict[]>;
  spanIds: Set<string>;
  duplicateSpanIds: string[];
} {
  const childMap = buildChildMap(visible);
  const spanIds = new Set<string>();
  const seen = new Set<string>();
  const duplicateSpanIds: string[] = [];
  for (const span of visible) {
    const sid = span.span_id;
    if (typeof sid !== 'string' || !sid) continue;
    if (seen.has(sid)) duplicateSpanIds.push(sid);
    else seen.add(sid);
    spanIds.add(sid);
  }
  return { childMap, spanIds, duplicateSpanIds };
}

/** missing-root-kind: the set of root span kinds has no intersection with ROOT_KINDS. */
export function missingRootKindFindings(
  rootKinds: ReadonlySet<string>,
  traceId: string,
  runId: string,
): DoctorFinding[] {
  for (const k of rootKinds) {
    if (ROOT_KINDS.has(k)) return [];
  }
  const kinds = [...rootKinds].sort().join(', ') || 'none';
  return [
    new DoctorFinding({
      severity: 'warning',
      code: 'missing-root-kind',
      title: 'Trace has no workflow, chain, agent, or MCP tool root',
      evidence: `Root span kinds: ${kinds}`,
      suggestion:
        'Add @span(kind="WORKFLOW") to the entry point, or use a supported provider wrapper that creates an automatic root span.',
      traceId,
      runId,
    }),
  ];
}
