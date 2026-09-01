import { context, trace as otelTrace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { beforeEach, describe, expect, it } from 'vitest';
import { capturePreparedSpans, clearDoctorCapture, getCapturedEnvelope } from '../../src/core/doctor-capture.js';
import { FilteringExporter } from '../../src/core/filtering-exporter.js';
import { NeatlogsSpanProcessor } from '../../src/core/span-processor.js';

describe('Doctor capture through the real provider/export boundary', () => {
  beforeEach(clearDoctorCapture);

  it('preserves prototype-backed timing fields on masked spans and captures the trace', async () => {
    const transport = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new NeatlogsSpanProcessor({ ownAllSpans: true }));
    provider.addSpanProcessor(new SimpleSpanProcessor(new FilteringExporter(transport, undefined, capturePreparedSpans)));
    const tracer = provider.getTracer('doctor-real-export');
    const root = tracer.startSpan('doctor.workflow', { attributes: { 'neatlogs.span.kind': 'WORKFLOW', 'input.value': JSON.stringify({ safe: true }) } });
    const traceId = root.spanContext().traceId;
    const parentContext = otelTrace.setSpan(context.active(), root);
    const tool = tracer.startSpan('doctor.tool', { attributes: { 'neatlogs.span.kind': 'TOOL', 'neatlogs.tool.name': 'lookup' } }, parentContext);
    tool.end();
    root.end();
    await provider.forceFlush();

    const envelope = getCapturedEnvelope(traceId);
    expect(envelope).toMatchObject({ trace_id: traceId, root_span_id: root.spanContext().spanId });
    expect(envelope?.spans).toHaveLength(2);
    expect(envelope?.spans.every((span) => typeof span.duration_ns === 'number' && typeof span.start_time_ns === 'number')).toBe(true);
    expect(transport.getFinishedSpans()).toHaveLength(2);
    await provider.shutdown();
  });
});
