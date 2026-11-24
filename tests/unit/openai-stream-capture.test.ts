import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { wrapOpenAI } from '../../src/openai.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';
import { MODEL_CAPTURE_ATTRIBUTE, readProviderCapture } from '../../src/replay/provider-capture.js';

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

describe('openai responses streamed capture (F-040)', () => {
  it('records the completed response with its output text', async () => {
    const events = [
      { type: 'response.created', sequence_number: 0, response: { ...completedResponse, status: 'in_progress', output: [] } },
      { type: 'response.output_text.delta', sequence_number: 1, item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Paris.' },
      { type: 'response.completed', sequence_number: 2, response: completedResponse },
    ];
    const stream = await client(events).responses.create({ model: 'gpt-test', input: 'Capital of France?', stream: true });
    const capture = readProviderCapture(await captured(stream as any));
    expect(capture.name).toBe('openai.responses.create');
    expect(capture.input).toEqual({ model: 'gpt-test', input: 'Capital of France?', stream: true });
    expect(capture.output).toEqual({ ...completedResponse, output_text: 'Paris.' });
  });

  it.each([
    ['failed', [{ type: 'response.failed', sequence_number: 0, response: { ...completedResponse, status: 'failed' } }]],
    ['error event', [{ type: 'response.completed', sequence_number: 0, response: completedResponse }, { type: 'error', sequence_number: 1, code: 'server_error', message: 'boom', param: null }]],
  ])('records nothing when the stream ends %s', async (_label, events) => {
    const stream = await client(events as unknown[]).responses.create({ model: 'gpt-test', input: 'Capital of France?', stream: true });
    try { expect(await captured(stream as any)).toBeUndefined(); }
    catch (error) { if (!String(error).includes('boom')) throw error; expect(exporter.getFinishedSpans()[0]?.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined(); }
  });

  it('records nothing when the response ends incomplete', async () => {
    const events = [
      { type: 'response.output_text.delta', sequence_number: 0, item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Par' },
      { type: 'response.incomplete', sequence_number: 1, response: { ...completedResponse, status: 'incomplete' } },
    ];
    const stream = await client(events).responses.create({ model: 'gpt-test', input: 'Capital of France?', stream: true });
    expect(await captured(stream as any)).toBeUndefined();
  });
});
