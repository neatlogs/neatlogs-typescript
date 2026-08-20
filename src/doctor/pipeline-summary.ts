/**
 * Neatlogs trace doctor — pipeline-stage summary.
 *
 * When most findings cluster at a single stage of the SDK pipeline
 * (init / instrument / span / hierarchy), the doctor emits one
 * `pipeline-stage-summary` info finding at the run level so the user
 * knows where to start fixing. The threshold is "more than all the
 * others combined" (i.e. `stage_count * 2 > total`).
 *
 * Critically (Section 12.5 of the handoff): BOTH the stage counter AND
 * the `related_codes` filter use the same `_FIX_CLASS_TO_STAGE` map, so
 * the related_codes list always matches the dominant stage. A previous
 * hardcoded init-only filter produced empty related_codes when the
 * dominant stage was 'span' or 'instrument'.
 */

import { DoctorFinding, type FixClass } from './types.js';

const FIX_CLASS_TO_STAGE: Record<FixClass, string> = {
  init_order: 'init',
  config: 'init',
  pipeline: 'init',
  instrumentation: 'instrument',
  capture: 'instrument',
  data_integrity: 'span',
  attribute: 'span',
  hierarchy: 'hierarchy',
};

/** Stage-specific suggestion text. NOT hardcoded to "init" — bug 12.5. */
const STAGE_SUGGESTIONS: Record<string, string> = {
  init:
    'Move neatlogs.init() to the top of the entry point (before any client is constructed), then re-run the doctor — the rest usually resolves once init is right.',
  instrument:
    'Most findings are about wrappers not capturing or being reached. Verify the LLM client is constructed after neatlogs.init() and that the wrapper registered for the framework is actually installed.',
  span:
    "Most findings are about the captured span data itself. Check the wrapper's end() and exception-recording paths; a crashed wrapper leaves spans with zero duration and no events.",
  hierarchy:
    'Most findings are about parent/child relationships. Verify that each wrapper sets parent_span_id correctly; duplicates and orphan parents usually mean a wrapper is creating spans outside the active context.',
};

/**
 * Count findings per pipeline stage. Public for callers that want the
 * stage breakdown without the finding wrapper.
 */
export function pipelineStageSummary(findings: readonly DoctorFinding[]): Record<string, number> {
  const out: Record<string, number> = { init: 0, instrument: 0, span: 0, hierarchy: 0 };
  for (const f of findings) {
    if (f.fixClass === null) continue;
    const stage = FIX_CLASS_TO_STAGE[f.fixClass];
    if (stage !== undefined) {
      out[stage] += 1;
    }
  }
  return out;
}

/**
 * Build the run-level pipeline-stage summary finding, or null when no
 * single stage dominates.
 */
export function pipelineStageRunFinding(
  findings: readonly DoctorFinding[],
): DoctorFinding | null {
  if (findings.length === 0) return null;
  const counts = pipelineStageSummary(findings);
  const total = counts.init + counts.instrument + counts.span + counts.hierarchy;
  if (total === 0) return null;
  let dominant = '';
  let dominantCount = -1;
  for (const [stage, n] of Object.entries(counts)) {
    if (n > dominantCount) {
      dominant = stage;
      dominantCount = n;
    }
  }
  if (dominantCount < 0 || dominantCount * 2 <= total) return null;
  const suggestion =
    STAGE_SUGGESTIONS[dominant] ?? `Fix the ${dominant} stage first; re-run the doctor.`;
  // Filter related_codes by the dominant stage's fix_class (so the list
  // always matches the dominant stage — bug 12.5 fix).
  const relatedCodes = findings
    .filter((f) => {
      if (f.fixClass === null) return false;
      return FIX_CLASS_TO_STAGE[f.fixClass] === dominant;
    })
    .map((f) => f.code);
  return new DoctorFinding({
    severity: 'info',
    code: 'pipeline-stage-summary',
    title: `Most findings cluster at the ${dominant} stage of the SDK pipeline`,
    evidence: `stage breakdown: init=${counts.init}, instrument=${counts.instrument}, span=${counts.span}, hierarchy=${counts.hierarchy}`,
    suggestion,
    fixClass: 'pipeline',
    relatedCodes,
  });
}
