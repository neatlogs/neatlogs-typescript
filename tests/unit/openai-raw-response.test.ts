import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { wrapOpenAI } from '../../src/openai.js';
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

const opts = { model: 'gpt-test', messages: [{ role: 'user' as const, content: 'hi' }] };
const completion = {
  id: 'chatcmpl_local', object: 'chat.completion', created: 1, model: 'gpt-test',
  choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

function client(fetch: () => Promise<Response>) {
  return wrapOpenAI(new OpenAI({ apiKey: 'fake-local-only', maxRetries: 0, fetch }));
}

describe('asResponse raw path', () => {
  it('does not read the body before the caller does', async () => {
    let pulls = 0;
    const json = JSON.stringify(completion);
    const chunks = Array.from({ length: 10 }, (_, i) => json.slice(i * Math.ceil(json.length / 10), (i + 1) * Math.ceil(json.length / 10)));
    const c = client(async () => {
      let i = 0;
      const body = new ReadableStream<Uint8Array>(
        { pull(controller) { pulls++; if (i < chunks.length) controller.enqueue(new TextEncoder().encode(chunks[i++])); else controller.close(); } },
        { highWaterMark: 0 },
      );
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const response = await c.chat.completions.create(opts).asResponse();
    await new Promise((r) => setTimeout(r, 30));
    expect(pulls).toBe(0);
    expect(await response.json()).toEqual(completion);
    await new Promise((r) => setTimeout(r, 20));
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].attributes['neatlogs.llm.output_messages.0.content']).toBeTruthy();
  });

  it('keeps streaming telemetry when asResponse comes before the stream is consumed', async () => {
    const sse = [
      { id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-test', choices: [{ index: 0, delta: { role: 'assistant', content: 'hel' }, finish_reason: null }] },
      { id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-test', choices: [{ index: 0, delta: { content: 'lo' }, finish_reason: 'stop' }] },
    ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
    const c = client(async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const pending = c.chat.completions.create({ ...opts, stream: true });
    await pending.asResponse();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
    const stream = await pending;
    let text = '';
    for await (const chunk of stream) text += chunk.choices[0]?.delta?.content ?? '';
    expect(text).toBe('hello');
    await new Promise((r) => setTimeout(r, 20));
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(Object.values(spans[0].attributes).some((v) => String(v).includes('hello'))).toBe(true);
  });
});
