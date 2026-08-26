import { describe, expect, it } from 'vitest';
import { doctorLocalV2, doctorSemanticDigest, type DiagnosticEnvelope } from '../../src/doctor-v2.js';

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
});
