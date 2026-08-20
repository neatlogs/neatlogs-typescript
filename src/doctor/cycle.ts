/**
 * Neatlogs trace doctor — cycle detection.
 *
 * Iterative DFS that visits each node exactly once = O(V + E) in the
 * no-cycle case (the common case). Self-cycles (`sid == pid`) are filtered
 * out before the walk — they're reported separately by the self-parent
 * check, not double-reported as a cycle.
 *
 * Two sets:
 *   - `inPath`: nodes currently on the DFS stack (back-edge to one of
 *     these is a cycle)
 *   - `done`:   nodes whose entire subtree has been fully explored
 *     (back-edge to one of these is just a cross-edge, not a cycle)
 *
 * The walk starts from every unvisited node because in a cycle, every node
 * has a parent — there is no "root" to start from.
 */

import { DoctorFinding, type SpanDict } from './types.js';
import { truncate } from './visibility.js';

export interface CycleReport {
  /** True iff at least one back-edge (cycle) was found. */
  hasCycle: boolean;
  /** The DoctorFinding list, one per cycle, with `trace_id`/`run_id` set. */
  findings: DoctorFinding[];
}

/**
 * Detect cycles in the parent → child tree. Self-cycles are filtered out
 * upstream; this walker only sees the cleaned span list.
 */
export function findCycles(
  spans: readonly SpanDict[],
  childMap: ReadonlyMap<string, SpanDict[]>,
  traceId: string,
  runId: string,
): CycleReport {
  // Build a per-node children id list once.
  const childrenOf = new Map<string, string[]>();
  for (const [parent, kids] of childMap) {
    childrenOf.set(
      parent,
      kids.map((c) => c.span_id).filter((id): id is string => typeof id === 'string'),
    );
  }

  const inPath = new Set<string>();
  const done = new Set<string>();
  const nameOf = new Map<string, string>();
  for (const s of spans) {
    if (typeof s.span_id === 'string') {
      nameOf.set(s.span_id, s.name ?? '<unnamed>');
    }
  }

  const findings: DoctorFinding[] = [];

  function reportCycle(backTo: string, path: string[]): void {
    let cycle: string[];
    const idx = path.indexOf(backTo);
    if (idx >= 0) {
      cycle = path.slice(idx).concat([backTo]);
    } else {
      cycle = path.concat([backTo]);
    }
    const arrow = cycle.slice(0, 6).join(' → ');
    const more = cycle.length > 6 ? ' → ...' : '';
    findings.push(
      new DoctorFinding({
        severity: 'error',
        code: 'cycle',
        title: 'Span hierarchy contains a cycle',
        evidence: `span '${truncate(nameOf.get(backTo) ?? '<unnamed>')}' is in a cycle: ${arrow}${more}`,
        suggestion:
          'Wrap a function that re-enters itself with a guard, or fix the wrapper that is producing the cycle.',
        traceId,
        runId,
      }),
    );
  }

  function walk(start: string): void {
    if (done.has(start)) return;
    const path: string[] = [start];
    inPath.add(start);
    // Each frame: (node, list-of-child-ids, next-index).
    const frames: Array<[string, string[], number]> = [
      [start, childrenOf.get(start) ?? [], 0],
    ];
    while (frames.length > 0) {
      const top = frames[frames.length - 1];
      const node = top[0];
      const kids = top[1];
      let i = top[2];
      if (i >= kids.length) {
        frames.pop();
        path.pop();
        inPath.delete(node);
        done.add(node);
        continue;
      }
      // Advance the index first so the frame stays consistent on
      // backtrack / recurse.
      top[2] = i + 1;
      const cid = kids[i];
      if (done.has(cid)) continue;
      if (inPath.has(cid)) {
        // Back-edge: report and skip — don't recurse.
        reportCycle(cid, path);
        continue;
      }
      // Recurse: push a new frame for cid.
      path.push(cid);
      inPath.add(cid);
      frames.push([cid, childrenOf.get(cid) ?? [], 0]);
    }
  }

  for (const s of spans) {
    const sid = s.span_id;
    if (typeof sid !== 'string' || sid.length === 0) continue;
    if (!done.has(sid)) walk(sid);
  }

  return { hasCycle: findings.length > 0, findings };
}
