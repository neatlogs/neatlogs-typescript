import { ROOT_CONTEXT, SpanKind } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';

import { FilteringExporter } from '../../src/core/filtering-exporter.js';
import {
  CompletionMarkerSpanProcessor,
  NeatlogsSpanProcessor,
} from '../../src/core/span-processor.js';

describe('HTTP span suppression', () => {
  it('drops an HTTP client span before it reaches the transport exporter', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(new FilteringExporter(sink)));

    const span = provider
      .getTracer('@opentelemetry/instrumentation-http')
      .startSpan(
        'GET',
        {
          kind: SpanKind.CLIENT,
          attributes: { 'url.full': 'https://example.com/private?token=secret' },
        },
        ROOT_CONTEXT,
      );
    span.end();
    await provider.forceFlush();

    expect(sink.getFinishedSpans()).toEqual([]);
    await provider.shutdown();
  });

  it('does not mistake a semantic LLM span containing HTTP metadata for an HTTP span', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new NeatlogsSpanProcessor({ ownAllSpans: true }));
    provider.addSpanProcessor(new SimpleSpanProcessor(new FilteringExporter(sink)));

    const span = provider.getTracer('@opentelemetry/instrumentation-http').startSpan(
      'chat',
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'neatlogs.span.kind': 'RERANKER',
          'openinference.span.kind': 'HTTP',
          'http.status_code': 200,
          'url.full': 'https://provider.example/rerank',
        },
      },
      ROOT_CONTEXT,
    );
    span.end();
    await provider.forceFlush();

    expect(sink.getFinishedSpans()).toHaveLength(1);
    expect(sink.getFinishedSpans()[0].attributes['neatlogs.span.kind']).toBe('reranker');
    await provider.shutdown();
  });

  it('suppresses HTTP before normalization and does not emit a completion marker', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    const lifecycle = new NeatlogsSpanProcessor({ ownAllSpans: true });
    provider.addSpanProcessor(lifecycle);
    provider.addSpanProcessor(new SimpleSpanProcessor(new FilteringExporter(sink)));
    provider.addSpanProcessor(
      new CompletionMarkerSpanProcessor(lifecycle, provider.getTracer('neatlogs.internal')),
    );

    const span = provider
      .getTracer('@opentelemetry/instrumentation-http')
      .startSpan(
        'POST',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'http.request.method': 'POST',
            'url.full': 'https://api.openai.com/v1/chat/completions',
            'gen_ai.prompt.0.content': 'must-not-be-backfilled',
          },
        },
        ROOT_CONTEXT,
      );
    span.end();
    await provider.forceFlush();

    expect(sink.getFinishedSpans()).toEqual([]);
    await provider.shutdown();
  });

  it('does not export a span that a mask reclassifies as HTTP', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    const lifecycle = new NeatlogsSpanProcessor({
      ownAllSpans: true,
      emitCompletionMarkers: false,
      mask: (spanData) => ({
        ...spanData,
        attributes: { ...spanData.attributes, 'neatlogs.span.kind': 'HTTP' },
      }),
    });
    provider.addSpanProcessor(lifecycle);
    provider.addSpanProcessor(new SimpleSpanProcessor(new FilteringExporter(sink)));
    provider.addSpanProcessor(
      new CompletionMarkerSpanProcessor(lifecycle, provider.getTracer('neatlogs.internal')),
    );

    provider
      .getTracer('neatlogs.test')
      .startSpan('semantic-before-mask', {
        attributes: { 'neatlogs.span.kind': 'TOOL' },
      })
      .end();
    await provider.forceFlush();

    expect(sink.getFinishedSpans()).toEqual([]);
    await provider.shutdown();
  });
});
