import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as ai from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode } from '@opentelemetry/api';
import { wrapAISDK } from '../../src/ai-sdk.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

let provider: NodeTracerProvider;
const exporter = new InMemorySpanExporter();

beforeAll(() => {
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});
afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
});
beforeEach(() => exporter.reset());

describe('streamText abort', () => {
  it('ends the root span when the caller aborts the stream', async () => {
    const { streamText } = wrapAISDK(ai);
    const ac = new AbortController();
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: 'stream-start', warnings: [] });
            abortSignal?.addEventListener('abort', () =>
              c.error(new DOMException('aborted', 'AbortError')),
            );
          },
        }),
      }),
    });
    const seen: string[] = [];
    const r = streamText({
      model,
      prompt: 'hi',
      abortSignal: ac.signal,
      onAbort: () => {
        seen.push('user onAbort');
      },
    }) as any;
    setTimeout(() => ac.abort(), 20);
    try {
      for await (const _ of r.textStream) {
        /* drain */
      }
    } catch {
      /* abort surfaces as an error on some versions */
    }
    await new Promise((res) => setTimeout(res, 100));

    expect(seen).toEqual(['user onAbort']);
    const root = exporter.getFinishedSpans().find((s) => s.name === 'ai.streamText');
    expect(root).toBeDefined();
    expect(root!.status.code).toBe(SpanStatusCode.ERROR);
  });
});
