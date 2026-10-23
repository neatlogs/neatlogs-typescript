import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { wrapAnthropic } from '../../src/anthropic.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const previous = process.env.NEATLOGS_AUTO_ROOT;
beforeAll(() => {
  process.env.NEATLOGS_AUTO_ROOT = 'false';
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 10));
  exporter.reset();
});
afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
  if (previous === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
  else process.env.NEATLOGS_AUTO_ROOT = previous;
});

const opts = { model: 'claude-test', max_tokens: 8, messages: [{ role: 'user' as const, content: 'hi' }] };
const message = {
  id: 'msg_local', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hello' }],
  model: 'claude-test', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
};

function client(fetch: () => Promise<Response>) {
  return wrapAnthropic(new Anthropic({ apiKey: 'fake-local-only', maxRetries: 0, fetch }));
}

describe('asResponse raw path', () => {
  it('does not read the body before the caller does', async () => {
    let pulls = 0;
    const json = JSON.stringify(message);
    const size = Math.ceil(json.length / 10);
    const chunks = Array.from({ length: 10 }, (_, i) => json.slice(i * size, (i + 1) * size));
    const c = client(async () => {
      let i = 0;
      const body = new ReadableStream<Uint8Array>(
        { pull(controller) { pulls++; if (i < chunks.length) controller.enqueue(new TextEncoder().encode(chunks[i++])); else controller.close(); } },
        { highWaterMark: 0 },
      );
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const response = await c.messages.create(opts).asResponse();
    await new Promise((r) => setTimeout(r, 30));
    expect(pulls).toBe(0);
    expect(await response.json()).toEqual(message);
    await new Promise((r) => setTimeout(r, 20));
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].attributes['neatlogs.llm.output_messages.0.content']).toBeTruthy();
  });

  it('keeps streaming telemetry when asResponse comes before the stream is consumed', async () => {
    const events = [
      { type: 'message_start', message: { ...message, content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ];
    const sse = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    const c = client(async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const pending = c.messages.create({ ...opts, stream: true });
    await pending.asResponse();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
    const stream = await pending;
    let seen = 0;
    for await (const _event of stream) seen++;
    expect(seen).toBe(events.length);
    await new Promise((r) => setTimeout(r, 20));
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(Object.values(spans[0].attributes).some((v) => String(v).includes('hello'))).toBe(true);
  });
});
