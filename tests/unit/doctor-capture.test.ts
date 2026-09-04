import { SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  capturePreparedSpans,
  clearDoctorCapture,
  getCapturedEnvelope,
  getDoctorCaptureStats,
} from '../../src/core/doctor-capture.js';
import { doctorCapturedLocalV2 } from '../../src/doctor-v2.js';

function readableSpan(
  spanId: string,
  options: Readonly<{
    parentSpanId?: string;
    name?: string;
    kind?: string;
    attributes?: Record<string, unknown>;
    events?: unknown[];
    traceId?: string;
  }> = {},
) {
  const parent = options.parentSpanId;
  return {
    name: options.name ?? (parent ? 'doctor.tool' : 'doctor.workflow'),
    kind: SpanKind.INTERNAL,
    spanContext: () => ({
      traceId: options.traceId ?? '1'.repeat(32),
      spanId,
      traceFlags: TraceFlags.SAMPLED,
    }),
    parentSpanId: parent,
    status: { code: SpanStatusCode.OK },
    attributes: {
      'openinference.span.kind': options.kind ?? (parent ? 'TOOL' : 'WORKFLOW'),
      'output.value': JSON.stringify({ safe: true }),
      ...options.attributes,
    },
    links: [],
    events: options.events ?? [],
    duration: [0, 10],
    startTime: [1, 0],
    ended: true,
    resource: { attributes: {} },
    instrumentationLibrary: { name: 'test' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as any;
}

describe('final export Doctor capture', () => {
  beforeEach(clearDoctorCapture);

  it('aggregates export batches and validates the latest complete trace', () => {
    capturePreparedSpans([readableSpan('2'.repeat(16))]);
    capturePreparedSpans([readableSpan('3'.repeat(16), { parentSpanId: '2'.repeat(16) })]);
    const result = doctorCapturedLocalV2();
    expect(result).toMatchObject({
      mode: 'local',
      status: 'fail',
      first_failure: 'PROVIDER_OWNERSHIP_AMBIGUOUS',
      capture: {
        trace_id: '1'.repeat(32),
        root_span_id: '2'.repeat(16),
        span_count: 2,
      },
      ownership: { provider: 'ambiguous' },
    });
    expect(result?.capture?.semantic_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('uses the canonical registry projection for choices, tool calls, streaming, and I/O', () => {
    capturePreparedSpans([readableSpan('2'.repeat(16), {
      name: 'doctor.llm',
      kind: 'LLM',
      attributes: {
        'input.value': JSON.stringify({ prompt: 'safe' }),
        'gen_ai.client.generation.choices': 2,
        'llm.tool_calls.0.id': 'call-1',
        'llm.tool_calls.0.name': 'lookup',
        'llm.is_streaming': true,
      },
      events: [{
        name: 'neatlogs.stream.chunk',
        attributes: { 'neatlogs.stream.chunk.summary': JSON.stringify({ text: 'chunk' }) },
        time: [1, 1],
      }],
    })]);

    const captured = getCapturedEnvelope()?.spans[0];
    expect(captured).toMatchObject({
      kind: 'LLM',
      input: { prompt: 'safe' },
      output: { safe: true },
      expected_choice_count: 2,
      tool_calls: [{ id: 'call-1', name: 'lookup' }],
      streaming: true,
      stream_fragments: [{ text: 'chunk' }],
    });
    expect(captured?.attributes).not.toHaveProperty('input.value');
  });

  it('excludes the completion marker from the comparable envelope', () => {
    capturePreparedSpans([
      readableSpan('2'.repeat(16)),
      readableSpan('3'.repeat(16), {
        parentSpanId: '2'.repeat(16),
        name: 'neatlogs.trace.complete',
      }),
    ]);
    expect(getCapturedEnvelope()?.spans).toHaveLength(1);
  });

  it('enforces span and byte bounds without retaining overflow payloads', () => {
    const rootId = '1'.padStart(16, '0');
    const spans = Array.from({ length: 65 }, (_, index) => readableSpan(
      (index + 1).toString(16).padStart(16, '0'),
      index === 0 ? {} : { parentSpanId: rootId },
    ));
    capturePreparedSpans(spans);
    expect(getDoctorCaptureStats()).toMatchObject({
      spanCount: 64,
      droppedSpans: 1,
      maxSpansPerTrace: 64,
      maxBytesPerTrace: 256 * 1024,
    });

    clearDoctorCapture();
    capturePreparedSpans([readableSpan(rootId, {
      attributes: { 'input.value': JSON.stringify({ value: 'x'.repeat(300 * 1024) }) },
    })]);
    expect(getDoctorCaptureStats()).toMatchObject({ spanCount: 0, droppedSpans: 1 });
    expect(getCapturedEnvelope()).toBeNull();

    clearDoctorCapture();
    for (let index = 0; index < 17; index += 1) {
      capturePreparedSpans([readableSpan(
        (index + 1).toString(16).padStart(16, '0'),
        { traceId: (index + 1).toString(16).padStart(32, '0') },
      )]);
    }
    expect(getDoctorCaptureStats()).toMatchObject({ traceCount: 16, maxTraces: 16 });
  });

  it('returns null when no exportable trace has crossed the boundary', () => {
    expect(doctorCapturedLocalV2()).toBeNull();
  });
});
