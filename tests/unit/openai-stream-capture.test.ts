import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { wrapOpenAI } from '../../src/openai.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';
import { MODEL_CAPTURE_ATTRIBUTE, readProviderCapture } from '../../src/replay/provider-capture.js';
import { diag, DiagLogLevel } from '@opentelemetry/api';

// F-040: streamed OpenAI calls (chat completions and Responses with stream: true) must leave the same raw
// model capture as non-streamed ones, assembled from the stream, so A/B grading with trace evidence can read it.
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

const messages = [{ role: 'user' as const, content: 'What is the capital of France?' }];
const usage = { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 };

function sse(events: unknown[]) {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
}
function client(events: unknown[]) {
  return wrapOpenAI(new OpenAI({
    apiKey: 'fake-local-only', maxRetries: 0,
    fetch: async () => new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  }));
}
async function captured(stream: AsyncIterable<unknown>, stopAfter?: number) {
  let seen = 0;
  for await (const _event of stream) if (stopAfter !== undefined && ++seen >= stopAfter) break;
  await new Promise((r) => setTimeout(r, 20));
  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  return spans[0].attributes[MODEL_CAPTURE_ATTRIBUTE];
}

const chunk = (choice: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-test', choices: [choice], ...extra });
const answer = [
  chunk({ index: 0, delta: { role: 'assistant', content: 'The capital is ' }, finish_reason: null }),
  chunk({ index: 0, delta: { content: 'Paris.' }, finish_reason: 'stop' }),
  { id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'gpt-test', choices: [], usage },
];

describe('openai chat.completions streamed capture (F-040)', () => {
  it('records the streamed reply as one chat.completion with the request that was sent', async () => {
    const stream = await client(answer).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    const capture = readProviderCapture(await captured(stream));
    expect(capture.name).toBe('openai.chat.completions.create');
    expect(capture.input).toEqual({ model: 'gpt-test', messages, stream: true, stream_options: { include_usage: true } });
    expect(capture.output).toEqual({
      id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-test',
      choices: [{ index: 0, message: { role: 'assistant', content: 'The capital is Paris.' }, finish_reason: 'stop' }],
      usage,
    });
  });

  it('assembles streamed tool calls', async () => {
    const events = [
      chunk({ index: 0, delta: { role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '' } }] }, finish_reason: null }),
      chunk({ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] }, finish_reason: null }),
      chunk({ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }] }, finish_reason: 'tool_calls' }),
    ];
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    const { output } = readProviderCapture(await captured(stream)) as { output: any };
    expect(output.choices).toEqual([{
      index: 0, finish_reason: 'tool_calls',
      message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"city":"Paris"}' } }] },
    }]);
  });

  it('joins streamed logprobs and drops streaming-only fields', async () => {
    const lp = (token: string) => ({ token, logprob: -0.1, bytes: null, top_logprobs: [] });
    const events = [
      chunk({ index: 0, delta: { role: 'assistant', content: 'Par' }, logprobs: { content: [lp('Par')], refusal: null }, finish_reason: null }, { obfuscation: 'pad1', usage: null }),
      chunk({ index: 0, delta: { content: 'is' }, logprobs: { content: [lp('is')], refusal: null }, finish_reason: 'stop' }, { obfuscation: 'pad2', usage: null }),
    ];
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true, logprobs: true });
    const { output } = readProviderCapture(await captured(stream)) as { output: any };
    expect(output.choices[0].logprobs).toEqual({ content: [lp('Par'), lp('is')], refusal: null });
    expect(output).not.toHaveProperty('obfuscation');
    expect(output).not.toHaveProperty('usage');
  });

  it('records nothing for a streamed tool call that is not a function call', async () => {
    const events = [
      chunk({ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'custom', custom: { name: 'grep', input: 'x' } }] }, finish_reason: 'tool_calls' }),
    ];
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    expect(await captured(stream)).toBeUndefined();
  });

  it('records nothing when the consumer stops reading early', async () => {
    const stream = await client(answer).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    expect(await captured(stream, 1)).toBeUndefined();
  });

  it('records nothing when the stream ends without a finish reason', async () => {
    const stream = await client(answer.slice(0, 1)).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    expect(await captured(stream)).toBeUndefined();
  });
});

const completedResponse = {
  id: 'resp_1', object: 'response', created_at: 1, model: 'gpt-test', status: 'completed',
  output: [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Paris.', annotations: [] }] }],
  usage: { input_tokens: 7, output_tokens: 2, total_tokens: 9 },
};

const enc = new TextEncoder();
function slowClient(first: unknown[], rest: unknown[] | 'error') {
  return wrapOpenAI(new OpenAI({ apiKey: 'fake-local-only', maxRetries: 0, fetch: async (_url: any, init: any) => {
    const body = new ReadableStream({ async start(c) {
      for (const e of first) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      await new Promise((r) => setTimeout(r, 50));
      if (init?.signal?.aborted) { c.error(new DOMException('aborted', 'AbortError')); return; }
      if (rest === 'error') { c.error(new Error('connection reset')); return; }
      for (const e of rest) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n')); c.close();
    } });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  } }));
}

describe('openai chat streamed capture: review fixes (F-040)', () => {
  it.each([
    ['legacy function_call', { role: 'assistant', content: null, function_call: { name: 'lookup', arguments: '{}' } }, 'function_call'],
    ['audio', { role: 'assistant', audio: { id: 'a1', transcript: 'Hello', data: 'AAAA' } }, 'stop'],
    ['annotations', { role: 'assistant', content: 'See [1]', annotations: [{ type: 'url_citation', url_citation: { url: 'https://x', title: 't', start_index: 4, end_index: 7 } }] }, 'stop'],
  ])('records nothing when a delta carries %s (a field it cannot rebuild)', async (_label, delta, finish) => {
    const stream = await client([chunk({ index: 0, delta, finish_reason: finish })]).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    expect(await captured(stream)).toBeUndefined();
  });

  it('records nothing for a non-function tool call even in a function-shaped delta', async () => {
    const events = [chunk({ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'c', type: 'custom', function: { name: 'grep', arguments: 'x' } }] }, finish_reason: 'tool_calls' })];
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    expect(await captured(stream)).toBeUndefined();
  });

  it('records nothing when the caller returns early and then calls next() again', async () => {
    const warnings: string[] = [];
    diag.setLogger({ error: (m: string) => warnings.push(m), warn: (m: string) => warnings.push(m), info() {}, debug() {}, verbose() {} }, DiagLogLevel.WARN);
    try {
      // A compatible client whose stream has no abort controller, so only the cancellation guard applies.
      const fake = { chat: { completions: { create: async () => (async function* () { yield answer[1]; yield answer[2]; })() } } };
      const stream: any = await (wrapOpenAI(fake as any) as any).chat.completions.create({ model: 'gpt-test', messages, stream: true });
      const it = stream[Symbol.asyncIterator]();
      await it.next();
      await it.return();
      while (!(await it.next()).done) { /* drain the rest */ }
      await new Promise((r) => setTimeout(r, 20));
      expect(exporter.getFinishedSpans().at(-1)?.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined();
      expect(warnings.filter((m) => m.includes('ended Span'))).toEqual([]);
    } finally { diag.disable(); }
  });

  it('records nothing when a streamed tool call never gets a name', async () => {
    const events = [chunk({ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'a', type: 'function', function: { arguments: '{}' } }] }, finish_reason: 'tool_calls' })];
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    expect(await captured(stream)).toBeUndefined();
  });

  it('keeps a tool name that a compatible server repeats on every delta', async () => {
    const events = [
      chunk({ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'lookup', arguments: '{"city":' } }] }, finish_reason: null }),
      chunk({ index: 0, delta: { tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'lookup', arguments: '"Paris"}' } }] }, finish_reason: 'tool_calls' }),
    ];
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    const { output } = readProviderCapture(await captured(stream)) as { output: any };
    expect(output.choices[0].message.tool_calls[0].function).toEqual({ name: 'lookup', arguments: '{"city":"Paris"}' });
  });

  it('records nothing when the caller aborts, even after the finish reason', async () => {
    const stream: any = await slowClient([answer[1]], [answer[2]]).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    try { for await (const c of stream) if (c.choices?.[0]?.finish_reason) stream.controller.abort(); } catch { /* abort */ }
    await new Promise((r) => setTimeout(r, 80));
    expect(exporter.getFinishedSpans().at(-1)?.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined();
  });

  it('records nothing when the stream fails after its last chunk', async () => {
    const stream: any = await slowClient(answer, 'error').chat.completions.create({ model: 'gpt-test', messages, stream: true });
    await expect((async () => { for await (const _c of stream) { /* drain */ } })()).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 80));
    expect(exporter.getFinishedSpans().at(-1)?.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined();
  });

  it('rebuilds interleaved choices (n=2) and parallel tool calls', async () => {
    const events = [
      chunk({ index: 1, delta: { role: 'assistant', content: 'B1' }, finish_reason: null }),
      chunk({ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'f', arguments: '' } }] }, finish_reason: null }),
      chunk({ index: 0, delta: { tool_calls: [{ index: 1, id: 'b', type: 'function', function: { name: 'g', arguments: '{"y"' } }] }, finish_reason: null }),
      chunk({ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"x":1}' } }] }, finish_reason: null }),
      chunk({ index: 0, delta: { tool_calls: [{ index: 1, function: { arguments: ':2}' } }] }, finish_reason: 'tool_calls' }),
      chunk({ index: 1, delta: { content: 'B2' }, finish_reason: 'stop' }),
    ];
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true, n: 2 });
    const { output } = readProviderCapture(await captured(stream)) as { output: any };
    expect(output.choices.map((c: any) => [c.index, c.finish_reason, c.message.content, (c.message.tool_calls ?? []).map((t: any) => `${t.id}:${t.function.name}:${t.function.arguments}`)])).toEqual([
      [0, 'tool_calls', null, ['a:f:{"x":1}', 'b:g:{"y":2}']],
      [1, 'stop', 'B1B2', []],
    ]);
  });

  it('captures a long answer made of many one-token chunks', async () => {
    const events: any[] = [chunk({ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }, { obfuscation: 'Ab3', usage: null })];
    for (let i = 0; i < 8000; i++) events.push(chunk({ index: 0, delta: { content: ' word' }, logprobs: null, finish_reason: null }, { obfuscation: 'xY9z', usage: null, system_fingerprint: 'fp_7f6be3efb0', service_tier: 'default' }));
    events.push(chunk({ index: 0, delta: {}, finish_reason: 'stop' }));
    const stream = await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    const { output } = readProviderCapture(await captured(stream)) as { output: any };
    expect(output.choices[0].message.content).toHaveLength(8000 * 5);
  });

  it('never lets a capture failure reach the caller, and passes chunks through unchanged', async () => {
    const evil: any = chunk({ index: 0, delta: { content: 'Paris.' }, finish_reason: 'stop' });
    Object.defineProperty(evil, 'lazyField', { enumerable: true, get() { throw new Error('getter boom'); } });
    const first = chunk({ index: 0, delta: { role: 'assistant', content: 'The capital is ' }, finish_reason: null });
    const fake = { chat: { completions: { create: async () => (async function* () { yield first; yield evil; })() } } };
    const stream = await (wrapOpenAI(fake as any) as any).chat.completions.create({ model: 'gpt-test', messages, stream: true });
    const seen: unknown[] = [];
    for await (const c of stream) seen.push(c);
    expect(seen).toEqual([first, evil].map((c) => expect.objectContaining({ id: c.id })));
    expect(seen[0]).toBe(first);
    expect(seen[1]).toBe(evil);
    await new Promise((r) => setTimeout(r, 20));
    expect(exporter.getFinishedSpans().at(-1)?.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined();
  });

  it('does not touch the ended span when next() is called again after the end', async () => {
    const warnings: string[] = [];
    diag.setLogger({ error: (m: string) => warnings.push(m), warn: (m: string) => warnings.push(m), info() {}, debug() {}, verbose() {} }, DiagLogLevel.WARN);
    try {
      const stream: any = await client(answer).chat.completions.create({ model: 'gpt-test', messages, stream: true });
      const it = stream[Symbol.asyncIterator]();
      while (!(await it.next()).done) { /* drain */ }
      expect(await it.next()).toEqual({ done: true, value: undefined });
      expect(warnings.filter((m) => m.includes('ended Span'))).toEqual([]);
    } finally { diag.disable(); }
  });
});

describe('openai chat streamed capture: review round 2 (F-040)', () => {
  it('joins a streamed refusal', async () => {
    const events = [chunk({ index: 0, delta: { role: 'assistant', content: null, refusal: "I can't" }, finish_reason: null }), chunk({ index: 0, delta: { refusal: ' help.' }, finish_reason: 'stop' }), answer[2]];
    const { output } = readProviderCapture(await captured(await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true }))) as { output: any };
    expect(output.choices[0].message).toEqual({ role: 'assistant', content: null, refusal: "I can't help." });
  });

  it('records nothing when a tool-call delta carries an unknown key', async () => {
    const events = [chunk({ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'f', arguments: '{}' }, extra_content: { google: {} } }] }, finish_reason: 'tool_calls' }), answer[2]];
    expect(await captured(await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true }))).toBeUndefined();
  });

  it('records nothing when fewer choices streamed than n requested', async () => {
    const events = [chunk({ index: 0, delta: { role: 'assistant', content: 'A' }, finish_reason: 'stop' }), answer[2]];
    expect(await captured(await client(events).chat.completions.create({ model: 'gpt-test', messages, stream: true, n: 2 }))).toBeUndefined();
  });

  it('stops reading chunks for capture once the size bound trips', async () => {
    let reads = 0;
    const big = chunk({ index: 0, delta: { role: 'assistant', content: 'y'.repeat(1024 * 1024 + 10) }, finish_reason: null });
    const counted: any = chunk({ index: 0, delta: { content: 'x' }, finish_reason: 'stop' });
    Object.defineProperty(counted, 'probeField', { enumerable: true, get() { reads++; return 1; } });
    const fake = { chat: { completions: { create: async () => (async function* () { yield big; yield counted; })() } } };
    for await (const _c of await (wrapOpenAI(fake as any) as any).chat.completions.create({ model: 'gpt-test', messages, stream: true })) { /* drain */ }
    expect(reads).toBe(0);
  });
});

describe('openai responses streams (F-040 scope)', () => {
  // Not captured in this PR: nothing reads a streamed Responses capture (server grading ignores
  // Responses captures and streamed spans are never replayed), so it would only add span weight.
  it('records no capture for a streamed response', async () => {
    const events = [
      { type: 'response.output_text.delta', sequence_number: 0, item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Paris.' },
      { type: 'response.completed', sequence_number: 1, response: completedResponse },
    ];
    const stream = await client(events).responses.create({ model: 'gpt-test', input: 'Capital of France?', stream: true });
    expect(await captured(stream as any)).toBeUndefined();
  });
});
