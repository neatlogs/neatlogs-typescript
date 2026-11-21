import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { _setNeatlogsProvider, getActiveNeatlogsSpan, getNeatlogsTracer, getNeatlogsParentContext, withNeatlogsSpan } from '../../src/core/provider.js';
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
beforeAll(() => { _setNeatlogsProvider(provider); process.env.NEATLOGS_AUTO_ROOT = 'false'; });
beforeEach(() => exporter.reset());
afterAll(async () => { vi.unstubAllGlobals(); await provider.shutdown(); });
import { extractTraceContext } from '../../src/core/propagation.js';
const parent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
describe('record HTTP header casing', () => {
  it.each(['traceparent', 'TRACEPARENT', 'Traceparent', 'TraceParent', 'tRaCePaReNt'])('extracts %s', (key) => {
    extractTraceContext({ [key]: parent }, () => {
      const span = getNeatlogsTracer('test').startSpan('child', {}, getNeatlogsParentContext());
      expect(span.spanContext().traceId).toBe('0123456789abcdef0123456789abcdef');
      span.end();
    });
    expect(exporter.getFinishedSpans()[0].parentSpanId).toBe('0123456789abcdef');
  });
  it.each(['tracestate', 'TRACESTATE', 'Tracestate', 'TraceState'])('extracts %s', (key) => {
    extractTraceContext({ Traceparent: parent, [key]: 'vendor=value' }, () => {
      expect(getActiveNeatlogsSpan()?.spanContext().traceState?.get('vendor')).toBe('value');
    });
  });
  it.each([{}, {Traceparent: 'broken'}, {Traceparent: '00-00000000000000000000000000000000-0123456789abcdef-01'}])('ignores invalid record %j', (carrier) => {
    expect(extractTraceContext(carrier, () => 'ok')).toBe('ok');
    expect(getActiveNeatlogsSpan()).toBeUndefined();
  });
  it('keeps native Headers and Map getter carriers working', () => {
    for (const carrier of [new Headers({Traceparent: parent}), new Map([['traceparent', parent]])]) {
      extractTraceContext(carrier, () => expect(getActiveNeatlogsSpan()?.spanContext().traceId).toBe('0123456789abcdef0123456789abcdef'));
    }
  });
});
