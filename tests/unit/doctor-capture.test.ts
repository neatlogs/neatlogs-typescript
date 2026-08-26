import { SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { capturePreparedSpans, clearDoctorCapture } from '../../src/core/doctor-capture.js';
import { doctorCapturedLocalV2 } from '../../src/doctor-v2.js';

function span(spanId: string, parentSpanId?: string) {
  return {
    name: parentSpanId ? 'doctor.tool' : 'doctor.workflow',
    kind: SpanKind.INTERNAL,
    spanContext: () => ({ traceId: '1'.repeat(32), spanId, traceFlags: TraceFlags.SAMPLED }),
    parentSpanId,
    status: { code: SpanStatusCode.OK },
    attributes: { 'neatlogs.span.kind': parentSpanId ? 'Neatlogs.TOOL' : 'Neatlogs.WORKFLOW', 'neatlogs.output': JSON.stringify({ safe: true }) },
    links: [], events: [], duration: [0, 10], startTime: [1, 0], ended: true,
    resource: { attributes: {} }, instrumentationLibrary: { name: 'test' }, droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0,
  } as any;
}

describe('final export Doctor capture', () => {
  beforeEach(clearDoctorCapture);

  it('aggregates export batches and validates the latest complete trace', () => {
    capturePreparedSpans([span('2'.repeat(16))]);
    capturePreparedSpans([span('3'.repeat(16), '2'.repeat(16))]);
    const result = doctorCapturedLocalV2();
    expect(result).toMatchObject({ mode: 'local', status: 'fail', first_failure: 'PROVIDER_OWNERSHIP_AMBIGUOUS', capture: { trace_id: '1'.repeat(32), root_span_id: '2'.repeat(16), span_count: 2 }, ownership: { provider: 'ambiguous' } });
    expect(result?.capture?.semantic_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('returns null when no exportable trace has crossed the boundary', () => {
    expect(doctorCapturedLocalV2()).toBeNull();
  });
});
