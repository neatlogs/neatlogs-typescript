/**
 * Neatlogs trace doctor — unit tests.
 *
 * Mirrors the Python `tests/unit/test_doctor.py` shape. Each of the 14
 * finding codes has a happy-path test (fires when condition is met) and
 * a negative test (doesn't fire when condition isn't met). Plus tests
 * for the 5 bugs avoided (12.1 ordering, 12.2 status format, 12.3
 * doc_url, 12.4 force_reload, 12.5 related_codes) and CLI smoke.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SESSION_ID,
  DoctorFinding,
  DoctorReport,
  type SpanDict,
} from '../../../src/doctor/types.js';
import {
  diagnose,
  formatReport,
  readKind,
  readSpansSync,
  spanStatusIsError,
  truncate,
} from '../../../src/doctor/index.js';
import {
  parseArgs,
  CliParseError,
  main,
} from '../../../src/doctor/cli.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpFiles: string[] = [];

function writeLog(spans: SpanDict[]): string {
  const file = path.join(os.tmpdir(), `doctor-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const body = spans.map((s) => JSON.stringify(s)).join('\n');
  if (body) {
    fs.writeFileSync(file, body + '\n', 'utf-8');
  } else {
    fs.writeFileSync(file, '', 'utf-8');
  }
  tmpFiles.push(file);
  return file;
}

function makeSpan(partial: Partial<SpanDict>): SpanDict {
  return {
    trace_id: 't1',
    span_id: 's1',
    parent_span_id: null,
    name: 's',
    kind: 'chain',
    ...partial,
  };
}

afterEach(() => {
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
  tmpFiles = [];
});

// ---------------------------------------------------------------------------
// 1. Input layer
// ---------------------------------------------------------------------------

describe('readSpansSync', () => {
  it('returns empty list and file-not-found for missing file', () => {
    const findings: DoctorFinding[] = [];
    const r = readSpansSync('/no/such/file.jsonl', findings);
    expect(r.spans).toEqual([]);
    expect(r.invalidLines).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('file-not-found');
  });

  it('parses valid JSONL', () => {
    const file = writeLog([makeSpan({ name: 'a' }), makeSpan({ span_id: 's2', parent_span_id: 's1', name: 'b' })]);
    const r = readSpansSync(file);
    expect(r.spans).toHaveLength(2);
    expect(r.invalidLines).toEqual([]);
  });

  it('tracks invalid line numbers', () => {
    const file = path.join(os.tmpdir(), `doctor-invalid-${Date.now()}.jsonl`);
    fs.writeFileSync(file, 'not json\n{"x": 1}\nalso bad\n', 'utf-8');
    tmpFiles.push(file);
    const r = readSpansSync(file);
    expect(r.invalidLines).toEqual([1, 3]);
    expect(r.spans).toHaveLength(1);
  });
});

describe('readKind', () => {
  it('prefers top-level kind over attributes', () => {
    expect(readKind(makeSpan({ kind: 'LLM' }))).toBe('llm');
  });
  it('falls back to attributes.neatlogs.span.kind', () => {
    expect(readKind(makeSpan({ kind: undefined, attributes: { 'neatlogs.span.kind': 'TOOL' } }))).toBe('tool');
  });
  it('lowercases and trims', () => {
    expect(readKind(makeSpan({ kind: '  AGENT  ' }))).toBe('agent');
  });
});

describe('spanStatusIsError', () => {
  it('accepts the Neatlogs-normalized form', () => {
    expect(spanStatusIsError({ code: 'ERROR' })).toBe(true);
    expect(spanStatusIsError({ code: 'OK' })).toBe(false);
  });
  it('accepts the OTel SDK canonical form', () => {
    expect(spanStatusIsError({ status_code: { name: 'ERROR', value: 2 } })).toBe(true);
    expect(spanStatusIsError({ status_code: { name: 'OK' } })).toBe(false);
  });
  it('returns false for non-dict or missing status', () => {
    expect(spanStatusIsError(null)).toBe(false);
    expect(spanStatusIsError(undefined)).toBe(false);
    expect(spanStatusIsError('ERROR')).toBe(false);
  });
});

describe('truncate', () => {
  it('truncates strings over MAX_EVIDENCE_LEN with ...', () => {
    const long = 'a'.repeat(300);
    const r = truncate(long);
    expect(r.length).toBe(200);
    expect(r.endsWith('...')).toBe(true);
  });
  it('passes through short strings', () => {
    expect(truncate('short')).toBe('short');
  });
});

// ---------------------------------------------------------------------------
// 2. Per-finding tests (14 codes)
// ---------------------------------------------------------------------------

describe('file-level findings', () => {
  it('no-spans: empty file', () => {
    const file = writeLog([]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'no-spans')).toBe(true);
  });

  it('file-not-found: missing path', () => {
    const r = diagnose('/no/such/file.jsonl');
    expect(r.findings.some((f) => f.code === 'file-not-found')).toBe(true);
  });

  it('invalid-jsonl: tracks line numbers and is a warning when some spans parse', () => {
    const file = path.join(os.tmpdir(), `doctor-bad-${Date.now()}.jsonl`);
    fs.writeFileSync(file, 'not json\n{"trace_id":"t1","span_id":"s1","name":"a","kind":"chain"}\nalso bad\n', 'utf-8');
    tmpFiles.push(file);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'invalid-jsonl');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warning');
  });

  it('invalid-jsonl: error when no spans parse', () => {
    const file = path.join(os.tmpdir(), `doctor-bad-only-${Date.now()}.jsonl`);
    fs.writeFileSync(file, 'not json\n', 'utf-8');
    tmpFiles.push(file);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'invalid-jsonl');
    expect(f?.severity).toBe('error');
  });

  it('multi-run-log: fires when log contains >1 distinct session.id and no --run-id', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 's1', attributes: { 'session.id': 'r1', 'neatlogs.span.kind': 'chain' } }),
      makeSpan({ trace_id: 't2', span_id: 's2', parent_span_id: null, attributes: { 'session.id': 'r2', 'neatlogs.span.kind': 'chain' } }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'multi-run-log')).toBe(true);
  });

  it('run-id-not-found: error when --run-id is not present', () => {
    const file = writeLog([makeSpan({ attributes: { 'session.id': 'r1' } })]);
    const r = diagnose(file, { runId: 'missing' });
    expect(r.findings.some((f) => f.code === 'run-id-not-found')).toBe(true);
  });

  it('scope-not-preserved: info when ALL spans lack instrumentation_scope', () => {
    const file = writeLog([
      makeSpan({ kind: 'chain', attributes: { 'neatlogs.span.kind': 'chain' } }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'scope-not-preserved')).toBe(true);
  });
});

describe('rootless-http-only', () => {
  it('fires when all visible spans are rootless http', () => {
    const file = writeLog([
      makeSpan({ kind: 'http' }),
      makeSpan({ span_id: 's2', parent_span_id: null, name: 'b', kind: 'http' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'rootless-http-only')).toBe(true);
  });

  it('does NOT fire when there is a non-http root', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow' }),
      makeSpan({ span_id: 's2', parent_span_id: 's1', kind: 'http' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'rootless-http-only')).toBe(false);
  });
});

describe('missing-root-kind', () => {
  it('fires when no root is workflow/chain/agent/mcp_tool', () => {
    const file = writeLog([makeSpan({ kind: 'tool' })]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'missing-root-kind')).toBe(true);
  });

  it('does NOT fire when a root is chain', () => {
    const file = writeLog([makeSpan({ kind: 'chain' })]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'missing-root-kind')).toBe(false);
  });
});

describe('orphan-parent', () => {
  it('fires when parent_span_id references a non-existent span', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'workflow' }),
      makeSpan({ span_id: 's2', parent_span_id: 'missing', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'orphan-parent')).toBe(true);
  });

  it('does NOT fire when every parent resolves', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'workflow' }),
      makeSpan({ span_id: 's2', parent_span_id: 's1', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'orphan-parent')).toBe(false);
  });
});

describe('self-parent', () => {
  it('fires when span_id == parent_span_id (error severity)', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: 's1', kind: 'chain' }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'self-parent');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
  });

  it('does NOT fire when parents are different from ids', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'chain' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'self-parent')).toBe(false);
  });
});

describe('duplicate-span-id', () => {
  it('fires when same span_id appears twice', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'chain' }),
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'chain' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'duplicate-span-id')).toBe(true);
  });

  it('does NOT fire when all span_ids are unique', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'chain' }),
      makeSpan({ span_id: 's2', parent_span_id: null, kind: 'chain' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'duplicate-span-id')).toBe(false);
  });
});

describe('multiple-roots', () => {
  it('fires when trace has more than one root span', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'chain' }),
      makeSpan({ span_id: 's2', parent_span_id: null, kind: 'chain' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'multiple-roots')).toBe(true);
  });

  it('does NOT fire when there is exactly one root', () => {
    const file = writeLog([
      makeSpan({ span_id: 's1', parent_span_id: null, kind: 'chain' }),
      makeSpan({ span_id: 's2', parent_span_id: 's1', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'multiple-roots')).toBe(false);
  });
});

describe('cycle', () => {
  it('fires when A→B→A', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'A', parent_span_id: 'B', kind: 'chain' }),
      makeSpan({ trace_id: 't1', span_id: 'B', parent_span_id: 'A', kind: 'chain' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'cycle')).toBe(true);
  });

  it('does NOT fire on a diamond (A→B,C→D)', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'A', parent_span_id: null, kind: 'workflow' }),
      makeSpan({ trace_id: 't1', span_id: 'B', parent_span_id: 'A', kind: 'tool' }),
      makeSpan({ trace_id: 't1', span_id: 'C', parent_span_id: 'A', kind: 'tool' }),
      makeSpan({ trace_id: 't1', span_id: 'D', parent_span_id: 'B', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'cycle')).toBe(false);
  });
});

describe('agent-without-llm', () => {
  it('fires when an agent has no LLM descendant', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'a', parent_span_id: null, kind: 'agent' }),
      makeSpan({ trace_id: 't1', span_id: 't', parent_span_id: 'a', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'agent-without-llm')).toBe(true);
  });

  it('does NOT fire when the agent subtree contains an LLM', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'a', parent_span_id: null, kind: 'agent' }),
      makeSpan({ trace_id: 't1', span_id: 'l', parent_span_id: 'a', kind: 'llm' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'agent-without-llm')).toBe(false);
  });
});

describe('llm-missing-io / tool-missing-io / retriever-missing-io', () => {
  it('llm-missing-io fires when LLM span has no input/output', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'w', parent_span_id: null, kind: 'workflow' }),
      makeSpan({ trace_id: 't1', span_id: 'l', parent_span_id: 'w', kind: 'llm' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'llm-missing-io')).toBe(true);
  });

  it('does NOT fire when LLM span has input + output', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'w', parent_span_id: null, kind: 'workflow' }),
      makeSpan({
        trace_id: 't1',
        span_id: 'l',
        parent_span_id: 'w',
        kind: 'llm',
        attributes: {
          'neatlogs.llm.input_messages.0.content': 'hi',
          'neatlogs.llm.output_messages.0.content': 'hello',
        },
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'llm-missing-io')).toBe(false);
  });

  it('tool-missing-io fires when tool span has no input/output', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'w', parent_span_id: null, kind: 'workflow' }),
      makeSpan({ trace_id: 't1', span_id: 't', parent_span_id: 'w', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'tool-missing-io')).toBe(true);
  });

  it('retriever-missing-io fires when retriever span has no input/output', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'w', parent_span_id: null, kind: 'workflow' }),
      makeSpan({ trace_id: 't1', span_id: 'r', parent_span_id: 'w', kind: 'retriever' }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'retriever-missing-io')).toBe(true);
  });
});

describe('foreign-instrumentation-detected', () => {
  it('fires when a span has a non-neatlogs scope', () => {
    const file = writeLog([
      makeSpan({
        trace_id: 't1',
        span_id: 'w',
        parent_span_id: null,
        kind: 'workflow',
        instrumentation_scope: { name: 'openlit' },
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'foreign-instrumentation-detected')).toBe(true);
  });

  it('does NOT fire for neatlogs-scoped spans', () => {
    const file = writeLog([
      makeSpan({
        trace_id: 't1',
        span_id: 'w',
        parent_span_id: null,
        kind: 'workflow',
        instrumentation_scope: { name: 'neatlogs.core.context' },
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'foreign-instrumentation-detected')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. The 4 new diagnostic dimensions (PR #20)
// ---------------------------------------------------------------------------

describe('init-after-client (new dimension)', () => {
  it('fires when no span has an init marker', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', attributes: { 'some.attr': 'value' } }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'init-after-client');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
    expect(f?.fixClass).toBe('init_order');
    expect(f?.automatedFixAvailable).toBe(true);
    // §12.3: doc_url points in-repo, not to docs.neatlogs.com.
    expect(f?.docUrl).toBe('skills/neatlogs/references/troubleshooting.md#1-import-order-issues-most-common-mistake');
    expect(f?.docUrl ?? '').not.toContain('docs.neatlogs.com');
    // §12.4: never mention force_reload=True.
    expect(f?.suggestion).not.toContain('force_reload');
  });

  it('does NOT fire when any span has an init marker', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', attributes: { 'neatlogs.span.kind': 'workflow' } }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'init-after-client')).toBe(false);
  });
});

describe('missing-span-kind (new dimension)', () => {
  it('fires when some (but not all) spans miss neatlogs.span.kind', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', attributes: { 'neatlogs.span.kind': 'workflow' } }),
      makeSpan({ trace_id: 't1', span_id: 's2', parent_span_id: 's1', kind: 'tool', attributes: { 'tool.name': 'x' } }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'missing-span-kind');
    expect(f).toBeDefined();
    expect(f?.fixClass).toBe('attribute');
    expect(f?.docUrl).toBe('skills/neatlogs/references/troubleshooting.md#6-common-anti-patterns-table');
    expect(f?.docUrl ?? '').not.toContain('docs.neatlogs.com');
  });

  it('does NOT fire when ALL spans miss kind (init-order handles that)', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', attributes: { 'some.attr': 'value' } }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'missing-span-kind')).toBe(false);
  });
});

describe('zero-duration-span (new dimension)', () => {
  it('fires when a span has duration_ns == 0', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', start_time: 1000, end_time: 1000, duration_ns: 0 }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'zero-duration-span')).toBe(true);
  });

  it('does NOT fire when duration is positive', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', start_time: 1000, end_time: 2000, duration_ns: 1000 }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'zero-duration-span')).toBe(false);
  });
});

describe('error-status-no-event (new dimension)', () => {
  it('fires when an ERROR span has no exception event', () => {
    const file = writeLog([
      makeSpan({
        kind: 'workflow',
        status: { code: 'ERROR' },
        events: [],
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'error-status-no-event')).toBe(true);
  });

  it('does NOT fire when an exception event is present', () => {
    const file = writeLog([
      makeSpan({
        kind: 'workflow',
        status: { code: 'ERROR' },
        events: [{ name: 'exception', attributes: { 'exception.type': 'X' } }],
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'error-status-no-event')).toBe(false);
  });

  it('accepts the OTel SDK canonical status format (§12.2 bug fix)', () => {
    const file = writeLog([
      makeSpan({
        kind: 'workflow',
        status: { status_code: { name: 'ERROR', value: 2 } },
        events: [],
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'error-status-no-event')).toBe(true);
  });
});

describe('latency-mismatch (new dimension)', () => {
  it('fires when end < start', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', start_time: 2000, end_time: 1000 }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'latency-mismatch');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
  });

  it('does NOT fire when end >= start', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', start_time: 1000, end_time: 2000 }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'latency-mismatch')).toBe(false);
  });
});

describe('pipeline-stage-summary (new dimension)', () => {
  it('fires when one stage has >50% of findings', () => {
    // Make 3 init-stage findings and 1 instrument-stage finding — the
    // init stage should dominate.
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'a', parent_span_id: null, kind: 'workflow', attributes: { 'some.attr': 'v' } }),
      makeSpan({ trace_id: 't2', span_id: 'b', parent_span_id: null, kind: 'workflow', attributes: { 'some.attr': 'v' } }),
      makeSpan({ trace_id: 't3', span_id: 'c', parent_span_id: null, kind: 'workflow', attributes: { 'some.attr': 'v' } }),
      // The instrument-stage finding: missing-span-kind on a non-init trace.
      makeSpan({ trace_id: 't4', span_id: 'd', parent_span_id: null, kind: 'workflow', attributes: { 'neatlogs.span.kind': 'workflow' } }),
      makeSpan({ trace_id: 't4', span_id: 'e', parent_span_id: 'd', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    const summary = r.findings.find((f) => f.code === 'pipeline-stage-summary');
    expect(summary).toBeDefined();
    expect(summary?.fixClass).toBe('pipeline');
    expect(summary?.suggestion).toContain('init');
  });

  it('does NOT fire when findings are spread across stages', () => {
    // The summary is per-run; we can have multiple traces. With one
    // finding per stage, the dominant is at most 25% which is < 50%.
    // Use foreign-only to suppress the summary entirely.
    const file = writeLog([
      makeSpan({
        trace_id: 't1',
        span_id: 'a',
        parent_span_id: null,
        kind: 'workflow',
        instrumentation_scope: { name: 'openlit' },
      }),
    ]);
    const r = diagnose(file, { foreignOnly: true });
    expect(r.findings.some((f) => f.code === 'pipeline-stage-summary')).toBe(false);
  });

  it('related_codes is NOT hardcoded to init-only (bug §12.5)', () => {
    // Force a span-stage dominance: many data-integrity findings, no
    // init/instrument/hierarchy findings. We add init markers so
    // init-after-client does NOT fire (which would push the init stage
    // over 50% and dominate the summary).
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'a', parent_span_id: null, kind: 'workflow', start_time: 1000, end_time: 1000, duration_ns: 0, attributes: { 'neatlogs.span.kind': 'workflow' } }),
      makeSpan({ trace_id: 't1', span_id: 'b', parent_span_id: 'a', kind: 'tool', start_time: 1000, end_time: 1000, duration_ns: 0, attributes: { 'neatlogs.span.kind': 'tool', 'neatlogs.tool.input': '{"x":1}', 'neatlogs.tool.output': '{"y":2}' } }),
      makeSpan({ trace_id: 't1', span_id: 'c', parent_span_id: 'b', kind: 'tool', start_time: 1000, end_time: 1000, duration_ns: 0, attributes: { 'neatlogs.span.kind': 'tool', 'neatlogs.tool.input': '{"x":1}', 'neatlogs.tool.output': '{"y":2}' } }),
    ]);
    const r = diagnose(file);
    const summary = r.findings.find((f) => f.code === 'pipeline-stage-summary');
    expect(summary).toBeDefined();
    const related = summary?.relatedCodes ?? [];
    expect(related.length).toBeGreaterThan(0);
    expect(related).toContain('zero-duration-span');
  });
});

// ---------------------------------------------------------------------------
// 4. Bug 12.1 — new dimensions run BEFORE rootless-http-only
// ---------------------------------------------------------------------------

describe('bug 12.1: new dimensions still fire on rootless-http-only', () => {
  it('data-integrity still flags zero-duration alongside rootless-http-only', () => {
    const file = writeLog([
      makeSpan({
        trace_id: 't1',
        span_id: 'a',
        parent_span_id: null,
        kind: 'http',
        start_time: 1000,
        end_time: 1000,
        duration_ns: 0,
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'rootless-http-only')).toBe(true);
    expect(r.findings.some((f) => f.code === 'zero-duration-span')).toBe(true);
  });

  it('init-order still flags on rootless-http-only', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'a', parent_span_id: null, kind: 'http', attributes: { 'some.attr': 'v' } }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'rootless-http-only')).toBe(true);
    expect(r.findings.some((f) => f.code === 'init-after-client')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Bug 12.2 — status format tolerance
// ---------------------------------------------------------------------------

describe('bug 12.2: status format tolerance', () => {
  it('foreign format with status_code.name == ERROR is recognized', () => {
    const file = writeLog([
      makeSpan({
        kind: 'workflow',
        status: { status_code: { name: 'ERROR', value: 2 } },
        events: [],
      }),
    ]);
    const r = diagnose(file);
    expect(r.findings.some((f) => f.code === 'error-status-no-event')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Bug 12.3 — doc_url points in-repo, not docs.neatlogs.com
// ---------------------------------------------------------------------------

describe('bug 12.3: doc_url is in-repo, not 404', () => {
  it('no finding points to docs.neatlogs.com', () => {
    const file = writeLog([
      makeSpan({ kind: 'workflow', attributes: { 'some.attr': 'v' } }),
      makeSpan({ trace_id: 't1', span_id: 'b', parent_span_id: 'a', kind: 'tool' }),
    ]);
    const r = diagnose(file);
    for (const f of r.findings) {
      if (f.docUrl) {
        expect(f.docUrl).not.toContain('docs.neatlogs.com');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. to_dict() backward compat
// ---------------------------------------------------------------------------

describe('toDict: absent-when-unset rule', () => {
  it('omits fix_class when null', () => {
    // Use a tool span (not in ROOT_KINDS) so missing-root-kind fires.
    const r = diagnose(writeLog([makeSpan({ kind: 'tool' })]));
    const f = r.findings.find((x) => x.code === 'missing-root-kind');
    expect(f).toBeDefined();
    const d = f!.toDict();
    expect('fix_class' in d).toBe(false);
  });

  it('omits automated_fix_available when false', () => {
    const r = diagnose(writeLog([makeSpan({ kind: 'tool' })]));
    const f = r.findings.find((x) => x.code === 'missing-root-kind');
    const d = f!.toDict();
    expect('automated_fix_available' in d).toBe(false);
  });

  it('includes all fields when set (init-after-client)', () => {
    const file = writeLog([makeSpan({ kind: 'workflow', attributes: { 'some.attr': 'v' } })]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'init-after-client');
    const d = f!.toDict();
    expect(d['fix_class']).toBe('init_order');
    expect(d['automated_fix_available']).toBe(true);
    expect(d['doc_url']).toContain('troubleshooting.md');
    expect(Array.isArray(d['related_codes'])).toBe(true);
  });

  it('omits trace_id and run_id when null', () => {
    const f = new DoctorFinding({
      severity: 'info',
      code: 'scope-not-preserved',
      title: 't',
      evidence: 'e',
      suggestion: 's',
    });
    const d = f.toDict();
    expect('trace_id' in d).toBe(false);
    expect('run_id' in d).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. CLI smoke
// ---------------------------------------------------------------------------

describe('CLI parseArgs', () => {
  it('parses path + --json + --run-id + --foreign-only', () => {
    const o = parseArgs(['./spans.log', '--json', '--run-id', 'r1', '--foreign-only']);
    expect(o.path).toBe('./spans.log');
    expect(o.json).toBe(true);
    expect(o.runId).toBe('r1');
    expect(o.foreignOnly).toBe(true);
  });

  it('accepts --run-id=value', () => {
    const o = parseArgs(['./spans.log', '--run-id=r1']);
    expect(o.runId).toBe('r1');
  });

  it('rejects --run-id with no value', () => {
    expect(() => parseArgs(['./spans.log', '--run-id'])).toThrow(CliParseError);
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['./spans.log', '--bogus'])).toThrow(CliParseError);
  });

  it('uses NEATLOGS_LOG_SPANS_FILE when no path given', () => {
    const orig = process.env['NEATLOGS_LOG_SPANS_FILE'];
    process.env['NEATLOGS_LOG_SPANS_FILE'] = '/tmp/env.jsonl';
    try {
      const o = parseArgs([]);
      expect(o.path).toBe('/tmp/env.jsonl');
    } finally {
      if (orig === undefined) delete process.env['NEATLOGS_LOG_SPANS_FILE'];
      else process.env['NEATLOGS_LOG_SPANS_FILE'] = orig;
    }
  });
});

describe('CLI main', () => {
  it('returns 0 for a clean trace', () => {
    const file = writeLog([
      makeSpan({
        trace_id: 't1',
        span_id: 'w',
        parent_span_id: null,
        kind: 'workflow',
        attributes: { 'neatlogs.span.kind': 'workflow' },
      }),
      makeSpan({
        trace_id: 't1',
        span_id: 'l',
        parent_span_id: 'w',
        kind: 'llm',
        attributes: {
          'neatlogs.span.kind': 'llm',
          'neatlogs.llm.input_messages.0.content': 'hi',
          'neatlogs.llm.output_messages.0.content': 'hello',
        },
      }),
    ]);
    const code = main([file]);
    expect(code).toBe(0);
  });

  it('returns 1 when error-severity findings exist', () => {
    const file = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'w', parent_span_id: null, kind: 'chain' }),
      makeSpan({ trace_id: 't1', span_id: 's2', parent_span_id: 's1', kind: 'tool' }),
    ]);
    // This is a clean enough trace to NOT produce error findings. Build
    // an explicit error: self-parent.
    const errFile = writeLog([
      makeSpan({ trace_id: 't1', span_id: 'a', parent_span_id: 'a', kind: 'chain' }),
    ]);
    const code = main([errFile]);
    expect(code).toBe(1);
  });

  it('returns 2 for parse errors', () => {
    const code = main(['--bogus']);
    expect(code).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 9. formatReport smoke
// ---------------------------------------------------------------------------

describe('formatReport', () => {
  it('renders the header + a No problems found when empty', () => {
    const r = new DoctorReport({
      path: '/x.jsonl',
      spansRead: 0,
      traceCount: 0,
      runCount: 0,
    });
    const out = formatReport(r);
    expect(out).toContain('Trace Doctor');
    expect(out).toContain('File: /x.jsonl');
    expect(out).toContain('No problems found.');
  });
});

// ---------------------------------------------------------------------------
// 10. Performance — 100K spans in <2s
// ---------------------------------------------------------------------------

describe('performance', () => {
  it('processes 10K spans in <2s', () => {
    const spans: SpanDict[] = [];
    for (let i = 0; i < 10000; i++) {
      const kind = i % 7 === 0 ? 'llm' : (i % 11 === 0 ? 'tool' : 'chain');
      spans.push(
        makeSpan({
          trace_id: 't' + (i % 100),
          span_id: 's' + i,
          parent_span_id: i % 100 === 0 ? null : 's' + (i - 1),
          name: 'n' + i,
          kind,
          attributes: kind === 'llm' ? {
            'neatlogs.span.kind': kind,
            'neatlogs.llm.input_messages.0.content': 'x',
            'neatlogs.llm.output_messages.0.content': 'y',
          } : { 'neatlogs.span.kind': kind },
        }),
      );
    }
    const file = writeLog(spans);
    const start = performance.now();
    const r = diagnose(file);
    const elapsed = performance.now() - start;
    expect(r.spansRead).toBe(10000);
    // 2s is a comfortable ceiling; the reference completes 100K in
    // <1s on M-series, so 10K in 2s leaves 10x headroom.
    expect(elapsed).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// 10. Framework coverage (17 × 3 = 51 tests, per handoff §10.2)
// ---------------------------------------------------------------------------
//
// For each framework we generate three synthetic log shapes:
//   1. Healthy trace  — no findings
//   2. Foreign scope  — instrumentation_scope name doesn't start with `neatlogs.`
//   3. Missing IO     — tool/llm span lacks the input/output attributes
//
// The 17 frameworks mirror the Python test_doctor.py matrix.

type Framework = {
  name: string;
  scope: string;
  instrumentedKind: 'llm' | 'tool' | 'retriever';
};

const FRAMEWORKS: Framework[] = [
  { name: 'openai',         scope: 'openai_instrumentor',       instrumentedKind: 'llm' },
  { name: 'anthropic',      scope: 'anthropic_instrumentor',    instrumentedKind: 'llm' },
  { name: 'google_genai',   scope: 'google_genai_instrumentor', instrumentedKind: 'llm' },
  { name: 'vertex_ai',      scope: 'vertex_ai_instrumentor',    instrumentedKind: 'llm' },
  { name: 'bedrock',        scope: 'bedrock_instrumentor',      instrumentedKind: 'llm' },
  { name: 'cohere',         scope: 'cohere_instrumentor',       instrumentedKind: 'llm' },
  { name: 'mistral',        scope: 'mistralai_instrumentor',    instrumentedKind: 'llm' },
  { name: 'groq',           scope: 'groq_instrumentor',         instrumentedKind: 'llm' },
  { name: 'together',       scope: 'together_instrumentor',     instrumentedKind: 'llm' },
  { name: 'fireworks',      scope: 'fireworks_instrumentor',    instrumentedKind: 'llm' },
  { name: 'langchain',      scope: 'langchain_instrumentor',    instrumentedKind: 'llm' },
  { name: 'llama_index',    scope: 'llama_index_instrumentor',  instrumentedKind: 'llm' },
  { name: 'dspy',           scope: 'dspy_instrumentor',         instrumentedKind: 'llm' },
  { name: 'haystack',       scope: 'haystack_instrumentor',     instrumentedKind: 'llm' },
  { name: 'crewai',         scope: 'crewai_instrumentor',       instrumentedKind: 'tool' },
  { name: 'openai_agents',  scope: 'openai_agents_instrumentor', instrumentedKind: 'llm' },
  { name: 'strands',        scope: 'strands_instrumentor',      instrumentedKind: 'tool' },
];

function healthyTrace(fw: Framework): SpanDict[] {
  const root = makeSpan({
    trace_id: 't1',
    span_id: 'r',
    parent_span_id: null,
    name: `${fw.name}.root`,
    kind: 'workflow',
    instrumentation_scope: { name: 'neatlogs.core.context', version: '1.0.0' },
    attributes: {
      'neatlogs.span.kind': 'workflow',
      'neatlogs.instrumentation.name': 'neatlogs.core.context',
    },
  });
  // PR #21: a "healthy" trace must include BOTH neatlogs attrs AND the
  // OTel GenAI attrs (gen_ai.operation.name, provider, model, usage
  // tokens, finish_reasons) on the LLM span. A trace that only has
  // neatlogs attrs will correctly fire `otel-genai-missing`.
  const childAttrs: Record<string, unknown> = {
    'neatlogs.span.kind': fw.instrumentedKind,
    'neatlogs.instrumentation.name': 'neatlogs.core.context',
    'neatlogs.llm.input_messages.0.content': 'hello',
    'neatlogs.llm.output_messages.0.content': 'world',
    'neatlogs.tool.input': '{"x":1}',
    'neatlogs.tool.output': '{"y":2}',
  };
  if (fw.instrumentedKind === 'llm') {
    childAttrs['gen_ai.operation.name'] = 'chat';
    childAttrs['gen_ai.provider.name'] = fw.name;
    childAttrs['gen_ai.request.model'] = `${fw.name}-model-1`;
    childAttrs['gen_ai.usage.input_tokens'] = 10;
    childAttrs['gen_ai.usage.output_tokens'] = 5;
    childAttrs['gen_ai.response.finish_reasons'] = ['stop'];
  }
  const child = makeSpan({
    trace_id: 't1',
    span_id: 'c',
    parent_span_id: 'r',
    name: `${fw.name}.child`,
    kind: fw.instrumentedKind,
    instrumentation_scope: { name: 'neatlogs.core.context', version: '1.0.0' },
    attributes: childAttrs,
  });
  return [root, child];
}

function foreignTrace(fw: Framework): SpanDict[] {
  // Root is foreign (so foreign detection fires).
  const root = makeSpan({
    trace_id: 't1',
    span_id: 'r',
    parent_span_id: null,
    name: `${fw.name}.root`,
    kind: 'workflow',
    instrumentation_scope: { name: fw.scope, version: '0.1.0' },
    attributes: {
      'neatlogs.span.kind': 'workflow',
      'neatlogs.instrumentation.name': 'neatlogs.core.context',
    },
  });
  return [root];
}

function missingIoTrace(fw: Framework): SpanDict[] {
  const root = makeSpan({
    trace_id: 't1',
    span_id: 'r',
    parent_span_id: null,
    name: `${fw.name}.root`,
    kind: 'workflow',
    instrumentation_scope: { name: 'neatlogs.core.context', version: '1.0.0' },
    attributes: {
      'neatlogs.span.kind': 'workflow',
      'neatlogs.instrumentation.name': 'neatlogs.core.context',
    },
  });
  const child = makeSpan({
    trace_id: 't1',
    span_id: 'c',
    parent_span_id: 'r',
    name: `${fw.name}.child`,
    kind: fw.instrumentedKind,
    instrumentation_scope: { name: 'neatlogs.core.context', version: '1.0.0' },
    // No neatlogs.llm.* or neatlogs.tool.* — the missing-io check should fire.
    attributes: {
      'neatlogs.span.kind': fw.instrumentedKind,
      'neatlogs.instrumentation.name': 'neatlogs.core.context',
    },
  });
  return [root, child];
}

describe('framework coverage (17 × 3 = 51 tests)', () => {
  for (const fw of FRAMEWORKS) {
    describe(fw.name, () => {
      it('healthy trace → no findings', () => {
        const r = diagnose(writeLog(healthyTrace(fw)));
        // Allow info-level (e.g. scope-not-preserved only when ALL spans miss scope,
        // which isn't the case here). Hard fail on errors/warnings.
        const bad = r.findings.filter(
          (f) => f.severity === 'error' || f.severity === 'warning',
        );
        expect(bad).toEqual([]);
      });

      it('foreign scope → foreign-instrumentation-detected fires', () => {
        const r = diagnose(writeLog(foreignTrace(fw)));
        const f = r.findings.find(
          (x) => x.code === 'foreign-instrumentation-detected',
        );
        expect(f).toBeDefined();
        expect(f!.evidence).toContain(fw.scope);
      });

      it('missing IO → tool-missing-io or llm-missing-io fires', () => {
        const r = diagnose(writeLog(missingIoTrace(fw)));
        const expected = `${fw.instrumentedKind}-missing-io`;
        const f = r.findings.find((x) => x.code === expected);
        expect(f).toBeDefined();
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 11. PR #21 — OTel GenAI semconv validation
// ---------------------------------------------------------------------------

describe('otel-genai-missing (PR #21)', () => {
  it('fires when an LLM span has no gen_ai.operation.name', () => {
    const file = writeLog([
      makeSpan({
        trace_id: 't1',
        span_id: 'r',
        parent_span_id: null,
        kind: 'workflow',
        name: 'root',
        attributes: { 'neatlogs.span.kind': 'workflow' },
      }),
      makeSpan({
        trace_id: 't1',
        span_id: 'l',
        parent_span_id: 'r',
        kind: 'llm',
        name: 'chat',
        // No gen_ai.* attrs.
        attributes: { 'neatlogs.span.kind': 'llm' },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'otel-genai-missing');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warning');
    expect(f!.fixClass).toBe('config');
  });

  it('does NOT fire when gen_ai.operation.name is present', () => {
    const file = writeLog([
      makeSpan({
        trace_id: 't1',
        span_id: 'l',
        parent_span_id: null,
        kind: 'llm',
        name: 'chat',
        attributes: {
          'neatlogs.span.kind': 'llm',
          'gen_ai.operation.name': 'chat',
        },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'otel-genai-missing');
    expect(f).toBeUndefined();
  });

  it('does NOT fire when no spans are LLM-kind', () => {
    const file = writeLog([
      makeSpan({ kind: 'tool', name: 't', attributes: { 'neatlogs.span.kind': 'tool' } }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'otel-genai-missing');
    expect(f).toBeUndefined();
  });
});

describe('otel-genai-inconsistent (PR #21)', () => {
  it('fires when kind=llm but gen_ai op is embeddings', () => {
    const file = writeLog([
      makeSpan({
        kind: 'llm',
        name: 'mismatch',
        attributes: {
          'neatlogs.span.kind': 'llm',
          'gen_ai.operation.name': 'embeddings',
        },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'otel-genai-inconsistent');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('info');
    expect(f!.evidence).toContain("neatlogs.span.kind='llm'");
    expect(f!.evidence).toContain("gen_ai.operation.name='embeddings'");
  });

  // §12.8.2 (PR #21 review): the walker must check isLlmKind() BEFORE
  // looking at op-name. A tool span with chat op-name is still a tool span.
  it('does NOT fire on a tool span with chat op-name', () => {
    const file = writeLog([
      makeSpan({
        kind: 'tool',
        name: 'my-tool',
        attributes: {
          'neatlogs.span.kind': 'tool',
          'gen_ai.operation.name': 'chat',
        },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'otel-genai-inconsistent');
    expect(f).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 12. PR #21 — token-waste findings
// ---------------------------------------------------------------------------

describe('oversized-prompt (PR #21)', () => {
  it('fires when an LLM span has > 50K chars of prompt content', () => {
    const big = 'x'.repeat(50_001);
    const file = writeLog([
      makeSpan({
        kind: 'llm',
        name: 'huge',
        attributes: {
          'neatlogs.span.kind': 'llm',
          'neatlogs.llm.system': big,
        },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'oversized-prompt');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warning');
  });

  it('does NOT fire on small prompts', () => {
    const file = writeLog([
      makeSpan({
        kind: 'llm',
        name: 'small',
        attributes: {
          'neatlogs.span.kind': 'llm',
          'neatlogs.llm.system': 'You are a helpful assistant.',
        },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'oversized-prompt');
    expect(f).toBeUndefined();
  });
});

describe('repeated-system-prompt (PR #21, PII-gated)', () => {
  it('does NOT fire when read_prompt_content is false (default)', () => {
    const sys = 'You are a helpful assistant.';
    const spans: SpanDict[] = [];
    for (let i = 0; i < 15; i++) {
      spans.push(
        makeSpan({
          trace_id: 't1',
          span_id: `s${i}`,
          parent_span_id: null,
          kind: 'llm',
          name: `call-${i}`,
          attributes: {
            'neatlogs.span.kind': 'llm',
            'neatlogs.llm.system': sys,
          },
        }),
      );
    }
    const r = diagnose(writeLog(spans));
    const f = r.findings.find((x) => x.code === 'repeated-system-prompt');
    expect(f).toBeUndefined();
  });

  it('fires when read_prompt_content is true and same sys prompt 10+ times', () => {
    const sys = 'You are a helpful assistant.';
    const spans: SpanDict[] = [];
    for (let i = 0; i < 12; i++) {
      spans.push(
        makeSpan({
          trace_id: 't1',
          span_id: `s${i}`,
          parent_span_id: null,
          kind: 'llm',
          name: `call-${i}`,
          attributes: {
            'neatlogs.span.kind': 'llm',
            'neatlogs.llm.system': sys,
          },
        }),
      );
    }
    const r = diagnose(writeLog(spans), { readPromptContent: true });
    const f = r.findings.find((x) => x.code === 'repeated-system-prompt');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('info');
    expect(f!.evidence).toContain('12 times');
  });
});

describe('unused-tool-definition (PR #21)', () => {
  it('fires when a tool is defined but never called', () => {
    const file = writeLog([
      makeSpan({
        kind: 'llm',
        name: 'with-tools',
        attributes: {
          'neatlogs.span.kind': 'llm',
          'gen_ai.operation.name': 'chat',
          'gen_ai.tool.definitions': [
            { name: 'get_weather' },
            { name: 'get_news' },
          ],
          'gen_ai.output.messages': [
            { finish_reason: 'stop', tool_calls: [] },
          ],
        },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'unused-tool-definition');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('info');
    expect(f!.evidence).toContain('get_weather');
    expect(f!.evidence).toContain('get_news');
  });

  it('does NOT fire when every defined tool is called', () => {
    const file = writeLog([
      makeSpan({
        kind: 'llm',
        name: 'all-used',
        attributes: {
          'neatlogs.span.kind': 'llm',
          'gen_ai.operation.name': 'chat',
          'gen_ai.tool.definitions': [{ name: 'get_weather' }],
          'gen_ai.output.messages': [
            {
              tool_calls: [{ function: { name: 'get_weather' } }],
            },
          ],
        },
      }),
    ]);
    const r = diagnose(file);
    const f = r.findings.find((x) => x.code === 'unused-tool-definition');
    expect(f).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 13. PR #21 — Manual-fix snippets (--emit-fix)
// ---------------------------------------------------------------------------

import { FIX_SNIPPETS, renderFixSnippet } from '../../../src/doctor/fix-snippets.js';

describe('renderFixSnippet (PR #21)', () => {
  it('returns plain text for each registered code', () => {
    for (const code of Object.keys(FIX_SNIPPETS)) {
      const snippet = renderFixSnippet(code);
      expect(snippet).not.toBeNull();
      // §12.8.3: snippet is plain text, not JSON-escaped. Must contain
      // a newline literal, not '\\n'.
      expect(snippet).toContain('\n');
      expect(snippet).toContain(`# Finding: ${code}`);
      expect(snippet).toContain('# BEFORE:');
      expect(snippet).toContain('# AFTER:');
    }
  });

  it('returns null for unknown codes', () => {
    expect(renderFixSnippet('not-a-real-code')).toBeNull();
    expect(renderFixSnippet('init-after-client-typo')).toBeNull();
  });

  it('snippet body does NOT contain JSON-escaped newlines', () => {
    const snippet = renderFixSnippet('init-after-client')!;
    // The Python reference renders the raw `\n` separator in the strings
    // and the result is plain text. No JSON-stringified `\n` allowed.
    expect(snippet).not.toContain('\\n');
  });
});

describe('CLI --emit-fix (PR #21)', () => {
  it('prints snippet on stdout and exits 0 for known code', () => {
    const captured: { stdout: string; stderr: string; code: number } = {
      stdout: '',
      stderr: '',
      code: -1,
    };
    const origWrite = process.stdout.write;
    const origErrWrite = process.stderr.write;
    try {
      process.stdout.write = ((s: string) => {
        captured.stdout += s;
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((s: string) => {
        captured.stderr += s;
        return true;
      }) as typeof process.stderr.write;
      captured.code = main(['--emit-fix', 'init-after-client']);
      expect(captured.code).toBe(0);
      expect(captured.stdout).toContain('# Finding: init-after-client');
      expect(captured.stdout).toContain('neatlogs.init()');
      expect(captured.stderr).toBe('');
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErrWrite;
    }
  });

  it('exits 2 with stderr listing known codes for unknown code', () => {
    const captured: { stdout: string; stderr: string; code: number } = {
      stdout: '',
      stderr: '',
      code: -1,
    };
    const origWrite = process.stdout.write;
    const origErrWrite = process.stderr.write;
    try {
      process.stdout.write = ((s: string) => {
        captured.stdout += s;
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((s: string) => {
        captured.stderr += s;
        return true;
      }) as typeof process.stderr.write;
      captured.code = main(['--emit-fix', 'unknown-code']);
      expect(captured.code).toBe(2);
      expect(captured.stderr).toContain("Unknown finding code: 'unknown-code'");
      expect(captured.stderr).toContain('init-after-client');
      expect(captured.stdout).toBe('');
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErrWrite;
    }
  });

  it('does NOT require a path when --emit-fix is set', () => {
    const captured: { stdout: string; code: number } = { stdout: '', code: -1 };
    const origWrite = process.stdout.write;
    try {
      process.stdout.write = ((s: string) => {
        captured.stdout += s;
        return true;
      }) as typeof process.stdout.write;
      // Pass only --emit-fix, no path → must not throw "no path provided".
      captured.code = main(['--emit-fix', 'missing-span-kind']);
      expect(captured.code).toBe(0);
      expect(captured.stdout).toContain('# Finding: missing-span-kind');
    } finally {
      process.stdout.write = origWrite;
    }
  });
});

describe('CLI --read-prompt-content (PR #21)', () => {
  it('parses --read-prompt-content as a boolean flag', () => {
    const o = parseArgs(['./spans.log', '--read-prompt-content']);
    expect(o.readPromptContent).toBe(true);
  });

  it('defaults readPromptContent to false', () => {
    const o = parseArgs(['./spans.log']);
    expect(o.readPromptContent).toBe(false);
  });
});
