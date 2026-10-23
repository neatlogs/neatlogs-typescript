import { describe, expect, it } from 'vitest';
import { Stream } from 'openai/core/streaming';
import { wrapOpenAI } from '../../../src/openai.js';
import { wrapAzureOpenAI } from '../../../src/azure-openai.js';
import { ERROR, OK, UNSET, abortError, drain, exceptionOf, streamOf, useSpans } from './harness.js';

const { only, spans } = useSpans();

const textDelta = { type: 'response.output_text.delta', delta: 'partial' };
const functionCall = {
  type: 'function_call',
  id: 'fc_1',
  call_id: 'call_1',
  name: 'get_weather',
  arguments: '{"city":"Pune"}',
};

function responsesClient(wrap: (client: any) => any, result: unknown) {
  return wrap({ responses: { create: async () => result } });
}

describe.each([
  ['openai', wrapOpenAI, 'openai.responses.create'],
  ['azure', wrapAzureOpenAI, 'azure_openai.responses.create'],
] as const)('%s Responses API', (_name, wrap, spanName) => {
  const streamed = (events: unknown[], thenThrow?: unknown) =>
    responsesClient(wrap, streamOf(events, thenThrow)).responses.create({
      model: 'gpt-test',
      input: 'hi',
      stream: true,
    });

  it('records a stream that ends with response.failed as an error', async () => {
    const stream = await streamed([
      textDelta,
      {
        type: 'response.failed',
        response: {
          status: 'failed',
          error: { code: 'server_error', message: 'The model crashed' },
          usage: { input_tokens: 5, output_tokens: 1 },
        },
      },
    ]);
    expect(await drain(stream)).toBe('completed');

    const span = only(spanName);
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('The model crashed');
    expect(exceptionOf(span)).toMatchObject({
      'exception.type': 'server_error',
      'exception.message': 'The model crashed',
    });
    // What arrived before the failure is kept.
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(5);
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('failed');
  });

  it('records an in-stream error event as an error', async () => {
    const stream = await streamed([
      textDelta,
      { type: 'error', code: 'rate_limit_exceeded', message: 'Slow down', param: null },
    ]);
    expect(await drain(stream)).toBe('completed');

    const span = only(spanName);
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({
      'exception.type': 'rate_limit_exceeded',
      'exception.message': 'Slow down',
    });
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('keeps an incomplete response OK and records why it stopped', async () => {
    const stream = await streamed([
      textDelta,
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          usage: { input_tokens: 5, output_tokens: 9 },
        },
      },
    ]);
    await drain(stream);

    const span = only(spanName);
    expect(span.status.code).toBe(OK);
    expect(exceptionOf(span)).toBeUndefined();
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('max_output_tokens');
    expect(span.attributes['neatlogs.llm.token_count.completion']).toBe(9);
  });

  it('records output, finish reason and function calls of a completed stream', async () => {
    const stream = await streamed([
      textDelta,
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          model: 'gpt-test-2026',
          output: [functionCall],
          usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 },
        },
      },
    ]);
    await drain(stream);

    const span = only(spanName);
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.llm.is_streaming']).toBe(true);
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('completed');
    expect(span.attributes['neatlogs.llm.token_count.total']).toBe(12);
    expect(span.attributes['neatlogs.llm.tool_calls.0.id']).toBe('call_1');
    expect(span.attributes['neatlogs.llm.tool_calls.0.type']).toBe('function');
    expect(span.attributes['neatlogs.llm.tool_calls.0.name']).toBe('get_weather');
    expect(span.attributes['neatlogs.llm.tool_calls.0.arguments']).toBe('{"city":"Pune"}');
  });

  it('keeps text and finished function calls when the stream breaks mid-reply', async () => {
    const stream = await streamed(
      [textDelta, { type: 'response.output_item.done', item: functionCall }],
      new Error('socket hang up'),
    );
    expect(await drain(stream)).toBe('threw socket hang up');

    const span = only(spanName);
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({ 'exception.message': 'socket hang up' });
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['neatlogs.llm.tool_calls.0.name']).toBe('get_weather');
  });

  it('does not treat a deliberate break as an error', async () => {
    const stream = await streamed([textDelta, textDelta, textDelta]);
    await drain(stream, 1);

    const span = only(spanName);
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('does not treat a caller abort as an error', async () => {
    const stream = await streamed([textDelta], abortError());
    await drain(stream);

    const span = only(spanName);
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(exceptionOf(span)).toBeUndefined();
  });

  it('records a non-streamed response with status "failed" as an error', async () => {
    await responsesClient(wrap, {
      status: 'failed',
      error: { code: 'server_error', message: 'The model crashed' },
      output: [],
    }).responses.create({ model: 'gpt-test', input: 'hi' });

    const span = only(spanName);
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({ 'exception.message': 'The model crashed' });
  });

  it('records finish reason and function calls of a non-streamed response', async () => {
    await responsesClient(wrap, {
      status: 'incomplete',
      incomplete_details: { reason: 'content_filter' },
      output: [functionCall],
      usage: { input_tokens: 3, output_tokens: 4 },
    }).responses.create({ model: 'gpt-test', input: 'hi' });

    const span = only(spanName);
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('content_filter');
    expect(span.attributes['neatlogs.llm.tool_calls.0.name']).toBe('get_weather');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(3);
  });
});

describe('azure Responses API streaming', () => {
  it('keeps the span open until the stream is consumed', async () => {
    const client = responsesClient(wrapAzureOpenAI, streamOf([textDelta]));
    const stream = await client.responses.create({ model: 'gpt-test', input: 'hi', stream: true });
    expect(spans()).toHaveLength(0);
    await drain(stream);
    expect(spans()).toHaveLength(1);
  });
});

describe.each([
  ['openai', wrapOpenAI, 'openai.chat.completions.create'],
  ['azure', wrapAzureOpenAI, 'azure_openai.chat.completions.create'],
] as const)('%s chat completions stream', (_name, wrap, spanName) => {
  const chunk = (content: string, finishReason: string | null = null) => ({
    id: 'chatcmpl-1',
    model: 'gpt-test',
    choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: finishReason }],
  });

  /** The real SDK Stream over an SSE body that never finishes until aborted. */
  function sdkStream(chunks: unknown[], controller: AbortController) {
    const encoder = new TextEncoder();
    let sent = 0;
    const body = new ReadableStream({
      async pull(c) {
        if (sent < chunks.length) {
          c.enqueue(encoder.encode(`data: ${JSON.stringify(chunks[sent++])}\n\n`));
          return;
        }
        if (!controller.signal.aborted) {
          await new Promise((resolve) =>
            controller.signal.addEventListener('abort', resolve, { once: true }),
          );
        }
        c.error(abortError());
      },
    });
    return Stream.fromSSEResponse(new Response(body), controller);
  }

  it('marks an abort that the SDK swallows as cancelled, not as a clean finish', async () => {
    const controller = new AbortController();
    const client = wrap({
      chat: { completions: { create: async () => sdkStream([chunk('par'), chunk('tial')], controller) } },
    });
    const stream = await client.chat.completions.create({ model: 'gpt-test', messages: [], stream: true });
    setTimeout(() => controller.abort(), 20);
    // The SDK ends the iterator without throwing.
    expect(await drain(stream)).toBe('completed');

    const span = only(spanName);
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('keeps a reply that finished before the abort as OK', async () => {
    const controller = new AbortController();
    const client = wrap({
      chat: {
        completions: { create: async () => sdkStream([chunk('done', 'stop')], controller) },
      },
    });
    const stream = await client.chat.completions.create({ model: 'gpt-test', messages: [], stream: true });
    setTimeout(() => controller.abort(), 20);
    await drain(stream);

    const span = only(spanName);
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.stream.cancelled']).toBeUndefined();
  });

  it('records a request aborted before it answers as cancelled', async () => {
    class APIUserAbortError extends Error {}
    const client = wrap({
      chat: {
        completions: {
          create: async () => {
            throw new APIUserAbortError('Request was aborted.');
          },
        },
      },
    });
    await expect(
      client.chat.completions.create({ model: 'gpt-test', messages: [] }),
    ).rejects.toThrow('Request was aborted.');

    const span = only(spanName);
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  });

  it('still records a stream that throws mid-reply as an error with its partial output', async () => {
    const client = wrap({
      chat: {
        completions: {
          create: async () => streamOf([chunk('par'), chunk('tial')], new Error('socket hang up')),
        },
      },
    });
    const stream = await client.chat.completions.create({ model: 'gpt-test', messages: [], stream: true });
    expect(await drain(stream)).toBe('threw socket hang up');

    const span = only(spanName);
    expect(span.status.code).toBe(ERROR);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });
});
