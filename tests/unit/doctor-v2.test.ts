import { describe, expect, it } from 'vitest';
import { doctorLocalV2, doctorSemanticDigest, type DiagnosticEnvelope } from '../../src/doctor-v2.js';

const CROSS_LANGUAGE_GOLDEN_DIGEST = 'sha256:824650f5fbc6d9f8d92381356411609263417219eaf7fdafbd2ba94795b6c4f7';

function crossLanguageGoldenEnvelope(): DiagnosticEnvelope {
  return JSON.parse(`{"trace_id":"11111111111111111111111111111111","root_span_id":"2222222222222222","spans":[{"span_id":"2222222222222222","parent_span_id":null,"name":"doctor.workflow","kind":"WORKFLOW","status":"OK","input":{"prompt":"generated diagnostic input"},"output":{"result":"generated diagnostic output"},"sampled":true,"ended":true},{"span_id":"3333333333333333","parent_span_id":"2222222222222222","name":"doctor.llm","kind":"LLM","status":"OK","input":{"messages":[{"role":"user","content":"generated diagnostic input"}]},"output":{"text":"generated diagnostic output"},"choices":[{"index":0,"message":{"role":"assistant","content":"choice zero","tool_calls":[{"id":"doctor_call_1","name":"diagnostic_tool","arguments":{"value":1}}]}},{"index":1,"message":{"role":"assistant","content":"choice one","tool_calls":[]}}],"stream_fragments":["generated ","diagnostic ","output"],"sampled":true,"ended":true},{"span_id":"4444444444444444","parent_span_id":"3333333333333333","name":"doctor.tool","kind":"TOOL","status":"OK","tool_call":{"id":"doctor_call_1","name":"diagnostic_tool","arguments":{"value":1},"result":{"value":2}},"sampled":true,"ended":true},{"span_id":"5555555555555555","parent_span_id":"2222222222222222","name":"doctor.payload","kind":"CHAIN","status":"OK","payload_references":[{"digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","size":1024,"mime_type":"application/json"}],"sampled":true,"ended":true}]}`) as DiagnosticEnvelope;
}

function envelope(): DiagnosticEnvelope {
  return {
    trace_id: '11111111111111111111111111111111',
    root_span_id: '2222222222222222',
    spans: [
      { span_id: '2222222222222222', parent_span_id: null, name: 'doctor.workflow', kind: 'WORKFLOW', status: 'OK', input: { prompt: 'generated diagnostic input' }, output: { result: 'generated diagnostic output' }, sampled: true, ended: true },
      { span_id: '3333333333333333', parent_span_id: '2222222222222222', name: 'doctor.llm', kind: 'LLM', status: 'OK', choices: [{ index: 0 }, { index: 1 }], expected_choice_count: 2, tool_calls: [{ id: 'doctor_call_1', name: 'diagnostic_tool' }], streaming: true, stream_fragments: ['generated ', 'diagnostic ', 'output'], sampled: true, ended: true },
      { span_id: '4444444444444444', parent_span_id: '3333333333333333', name: 'doctor.tool', kind: 'TOOL', status: 'OK', tool_call: { id: 'doctor_call_1', name: 'diagnostic_tool', result: { value: 2 } }, sampled: true, ended: true },
      { span_id: '5555555555555555', parent_span_id: '2222222222222222', name: 'doctor.payload', kind: 'CHAIN', status: 'OK', oversized: true, payload_references: [{ digest: `sha256:${'b'.repeat(64)}`, size: 1024, mime_type: 'application/json' }], sampled: true, ended: true },
    ],
  };
}

describe('doctor v2 local envelope', () => {
  it('matches the shared Python and Go canonical digest fixture', () => {
    expect(doctorSemanticDigest(crossLanguageGoldenEnvelope())).toBe(CROSS_LANGUAGE_GOLDEN_DIGEST);
  });

  it('keeps stream and token diagnostics outside the cross-language digest', () => {
    const value = envelope();
    const changed = {
      ...value,
      spans: value.spans.map((span) => span.kind === 'LLM' ? {
        ...span,
        stream_fragments: ['different runtime chunks'],
        attributes: {
          'neatlogs.llm.token_count.prompt': 999,
          'neatlogs.llm.token_count.completion': 998,
          'neatlogs.llm.token_count.total': 1997,
        },
      } : span),
    } satisfies DiagnosticEnvelope;
    expect(doctorSemanticDigest(changed)).toBe(doctorSemanticDigest(value));
    expect(doctorLocalV2({
      ...value,
      spans: value.spans.map((span) => span.kind === 'LLM'
        ? { ...span, stream_fragments: [] }
        : span),
    }).checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason_code: 'STREAM_FRAGMENT_MISSING' }),
    ]));
  });

  it('returns a versioned, deterministic, successful local result', () => {
    const value = envelope();
    const result = doctorLocalV2(value);
    expect(result).toMatchObject({ format_version: 'neatlogs.doctor/v2', mode: 'local', status: 'pass', first_failure: null });
    expect(result.capture?.semantic_digest).toBe(doctorSemanticDigest(value));
    expect(result.capture?.span_count).toBe(4);
  });

  it('selects the first stable failure and reports later defects without replacing it', () => {
    const value = envelope();
    const broken: DiagnosticEnvelope = {
      ...value,
      spans: value.spans.map((span) => span.kind === 'LLM' ? { ...span, choices: [], stream_fragments: [] } : span).filter((span) => span.kind !== 'TOOL'),
    };
    const result = doctorLocalV2(broken, { flushOutcome: 'timeout' });
    expect(result.status).toBe('fail');
    expect(result.first_failure).toBe('CHOICE_LOSS');
    expect(result.checks.map((check) => check.reason_code)).toEqual(expect.arrayContaining(['CHOICE_LOSS', 'STREAM_FRAGMENT_MISSING', 'TOOL_EXECUTION_MISSING', 'FLUSH_TIMEOUT']));
  });

  it('is independent of span input order', () => {
    const value = envelope();
    expect(doctorSemanticDigest({ ...value, spans: [...value.spans].reverse() })).toBe(doctorSemanticDigest(value));
  });

  it('excludes volatile IDs, timing, and language metadata from the semantic digest', () => {
    const value = envelope();
    const remappedIds = new Map(value.spans.map((item, index) => [
      item.span_id,
      `${index + 10}`.repeat(16).slice(0, 16),
    ]));
    const changed: DiagnosticEnvelope = {
      trace_id: 'f'.repeat(32),
      root_span_id: remappedIds.get(value.root_span_id)!,
      spans: value.spans.map((item) => ({
        ...item,
        span_id: remappedIds.get(item.span_id)!,
        parent_span_id: item.parent_span_id === null
          ? null
          : remappedIds.get(item.parent_span_id)!,
        start_time_ns: (item.start_time_ns ?? 0) + 999,
        duration_ns: (item.duration_ns ?? 0) + 999,
        attributes: {
          ...item.attributes,
          'telemetry.sdk.language': 'another-language',
          'telemetry.sdk.version': '999.0.0',
        },
      })),
    };
    expect(doctorSemanticDigest(changed)).toBe(doctorSemanticDigest(value));
    expect(doctorSemanticDigest({
      ...changed,
      spans: changed.spans.map((item, index) => index === 0
        ? { ...item, output: { changed: true } }
        : item),
    })).not.toBe(doctorSemanticDigest(value));
  });

  it('detects a canonical nested assistant tool request without an execution span', () => {
    const value = envelope();
    const spans = value.spans
      .filter((span) => span.kind !== 'TOOL')
      .map((span) => span.kind === 'LLM' ? {
        ...span,
        tool_calls: [],
        choices: [{ index: 0, message: { role: 'assistant', tool_calls: [{ id: 'doctor_nested_call', name: 'diagnostic_tool' }] } }],
        expected_choice_count: 1,
      } : span);
    const result = doctorLocalV2({ ...value, spans });
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason_code: 'TOOL_EXECUTION_MISSING' }),
    ]));
  });

  it('rejects hierarchy, sampling, and payload defects', () => {
    const value = envelope();
    const broken: DiagnosticEnvelope = {
      ...value,
      spans: value.spans.map((span, index) => index === 3
        ? { ...span, parent_span_id: '9999999999999999', sampled: false, payload_references: [] }
        : span),
    };
    const result = doctorLocalV2(broken);
    expect(result.first_failure).toBe('PARENT_MISSING');
    expect(result.checks.map((check) => check.reason_code)).toEqual(expect.arrayContaining(['PARENT_MISSING', 'PAYLOAD_ATTACHMENT_REQUIRED', 'SAMPLING_INCONSISTENT']));
  });

  it('warns on an LLM latency outlier while exempting the first cold call', () => {
    const value = envelope();
    const root = value.spans[0]!;
    const llmSpans = [100_000_000, 110_000_000, 900_000_000].map((duration_ns, index) => ({
      span_id: `${index + 6}`.repeat(16),
      parent_span_id: root.span_id,
      name: 'doctor.chat',
      kind: 'LLM',
      status: 'OK',
      duration_ns,
      start_time_ns: index + 1,
      attributes: { 'gen_ai.operation.name': 'chat' },
      sampled: true,
      ended: true,
    }));
    const result = doctorLocalV2({ ...value, spans: [root, ...llmSpans] });
    expect(result.status).toBe('warn');
    expect(result.first_failure).toBeNull();
    expect(result.checks.find((check) => check.reason_code === 'LATENCY_OUTLIER')).toMatchObject({ status: 'warn', remediation_code: 'INVESTIGATE_SLOW_OPERATION' });

    const coldStart = doctorLocalV2({ ...value, spans: [root, ...llmSpans.map((span, index) => ({ ...span, duration_ns: index === 0 ? 900_000_000 : 100_000_000 }))] });
    expect(coldStart.checks.some((check) => check.reason_code === 'LATENCY_OUTLIER')).toBe(false);
  });

  it('reports one rate-limit warning per affected span', () => {
    const value = envelope();
    const spans = value.spans.map((span, index) => index === 1
      ? { ...span, attributes: { 'http.response.status_code': 429, 'error.type': 'rate_limit_exceeded' } }
      : span);
    const result = doctorLocalV2({ ...value, spans });
    expect(result.checks.filter((check) => check.reason_code === 'RATE_LIMITED')).toHaveLength(1);
  });

  it('keeps PII detection opt-in and never includes matched values', () => {
    const value = envelope();
    const secret = 'person@example.com';
    const spans = value.spans.map((span, index) => index === 1
      ? { ...span, attributes: { nested: { contact: secret } } }
      : span);
    expect(doctorLocalV2({ ...value, spans }).checks.some((check) => check.reason_code === 'PII_DETECTED')).toBe(false);
    const result = doctorLocalV2({ ...value, spans }, { checkPii: true });
    const finding = result.checks.find((check) => check.reason_code === 'PII_DETECTED');
    expect(finding).toMatchObject({ status: 'warn', details: { categories: 'email' } });
    expect(JSON.stringify(finding)).not.toContain(secret);
  });
});
