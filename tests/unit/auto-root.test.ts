import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { trace as otelTrace, context as otelContext } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import { getProviderTracer } from '../../src/core/auto-root.js';
import {
  _setNeatlogsProvider,
  withNeatlogsSpan,
} from '../../src/core/provider.js';
import { captureMedia, resolvePendingMediaUploads } from '../../src/core/media.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;
let prevAutoRoot: string | undefined;

beforeAll(() => {
  prevAutoRoot = process.env.NEATLOGS_AUTO_ROOT;
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});

afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
  if (prevAutoRoot === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
  else process.env.NEATLOGS_AUTO_ROOT = prevAutoRoot;
});

beforeEach(() => {
  exporter.reset();
  delete process.env.NEATLOGS_AUTO_ROOT;
});

function getSpans(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}

function endLlmSpan(): void {
  const tracer = getProviderTracer('neatlogs');
  const span = tracer.startSpan('openai.chat.completions.create', {
    attributes: { 'neatlogs.span.kind': 'LLM' },
  });
  span.end();
}

describe('auto-root', () => {
  it('wraps a bare, parentless LLM span in a WORKFLOW root', () => {
    endLlmSpan();

    const spans = getSpans();
    expect(spans.length).toBe(2);

    const root = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'workflow');
    const llm = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'LLM');
    expect(root).toBeDefined();
    expect(llm).toBeDefined();
    expect(root!.attributes['neatlogs.auto_root']).toBe(true);
    // The LLM span is parented to the auto-created root.
    expect(llm!.parentSpanId).toBe(root!.spanContext().spanId);
    expect(root!.spanContext().traceId).toBe(llm!.spanContext().traceId);
  });

  it('does not wrap when NEATLOGS_AUTO_ROOT is disabled', () => {
    process.env.NEATLOGS_AUTO_ROOT = 'false';
    endLlmSpan();

    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].attributes['neatlogs.span.kind']).toBe('LLM');
    expect(spans[0].parentSpanId).toBeUndefined();
  });

  it('does not double-wrap a root-eligible kind (WORKFLOW)', () => {
    const tracer = getProviderTracer('neatlogs');
    const span = tracer.startSpan('my.workflow', {
      attributes: { 'neatlogs.span.kind': 'workflow' },
    });
    span.end();

    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].attributes['neatlogs.span.kind']).toBe('workflow');
    expect(spans[0].attributes['neatlogs.auto_root']).toBeUndefined();
  });

  it('does not add a root when a recording parent is already active', () => {
    const parentTracer = provider.getTracer('test');
    const parent = parentTracer.startSpan('manual.root');
    withNeatlogsSpan(parent, () => {
      endLlmSpan();
    });
    parent.end();

    const spans = getSpans();
    // manual.root + LLM only — no auto-root injected.
    expect(spans.length).toBe(2);
    expect(spans.some((s) => s.attributes['neatlogs.auto_root'])).toBe(false);
    const llm = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'LLM');
    expect(llm!.parentSpanId).toBe(parent.spanContext().spanId);
  });

  it('resolves media staged through the transparent auto-root span', async () => {
    const span = getProviderTracer('neatlogs').startSpan('openai.images.generate', {
      attributes: { 'neatlogs.span.kind': 'LLM' },
    });
    const safe = captureMedia(
      span,
      'neatlogs.llm.output_messages.0',
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${Buffer.alloc(120_000, 31).toString('base64')}`,
        },
      },
      'output',
    );
    span.setAttribute('neatlogs.llm.output_messages.0.content', JSON.stringify(safe));
    span.end();

    const child = getSpans().find((item) => item.attributes['neatlogs.span.kind'] === 'LLM')!;
    const attributes = { ...child.attributes };
    let uploads = 0;
    const resolved = await resolvePendingMediaUploads(child as object, attributes, {
      available: true,
      unavailableReason: '',
      maxPayloadBytes: 1024 * 1024,
      async upload(payload) {
        uploads += 1;
        return {
          uploadId: '018f47a6-7f32-7d67-8a1b-42d3f974c012',
          state: 'ready',
          reference: {
            id: '018f47a6-7f32-7d67-8a1b-42d3f974c012',
            purpose: payload.purpose,
            sha256: payload.sha256,
            byteLength: payload.byteLength,
            mimeType: payload.mimeType,
            contentEncoding: payload.contentEncoding,
            state: 'ready',
          },
        };
      },
    });

    expect(resolved).toBe(true);
    expect(uploads).toBe(1);
    expect(attributes['neatlogs.llm.output_messages.0.media.0.state']).toBe('available');
  });
});
