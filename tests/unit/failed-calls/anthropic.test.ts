import { describe, expect, it } from 'vitest';
import { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';
import { wrapAnthropic } from '../../../src/anthropic.js';
import { ERROR, OK, UNSET, abortError, drain, exceptionOf, streamOf, tick, useSpans } from './harness.js';

const { only, spans } = useSpans();

// Fresh objects per call: the SDK's MessageStream mutates the message it is given.
const opening = () => [
  {
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-test',
      content: [],
      stop_reason: null,
      usage: { input_tokens: 11, output_tokens: 1 },
    },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } },
];
const closing = () => [
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } },
  { type: 'message_stop' },
];

describe('anthropic messages.create({ stream: true })', () => {
  const streamed = (source: unknown) =>
    (wrapAnthropic({ messages: { create: async () => source } }) as any).messages.create({
      model: 'claude-test',
      messages: [],
      stream: true,
    });

  it('keeps the partial reply when the stream breaks mid-way', async () => {
    const stream = await streamed(streamOf(opening(), new Error('socket hang up')));
    expect(await drain(stream)).toBe('threw socket hang up');

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({ 'exception.message': 'socket hang up' });
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(11);
    expect(span.attributes['neatlogs.llm.model_name']).toBe('claude-test');
  });

  it('does not treat a deliberate break as an error or as a clean finish', async () => {
    const stream = await streamed(streamOf([...opening(), ...closing()]));
    await drain(stream, 3);

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('does not treat a caller abort as an error', async () => {
    const stream = await streamed(streamOf(opening(), abortError()));
    await drain(stream);

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('marks an abort that the SDK swallows as cancelled', async () => {
    // The SDK's Stream ends its iterator quietly once its controller is aborted.
    const controller = new AbortController();
    const source = Object.assign(
      (async function* () {
        yield* opening();
        controller.abort();
      })(),
      { controller },
    );
    expect(await drain(await streamed(source))).toBe('completed');

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  });

  it('still records a completed stream as OK', async () => {
    await drain(await streamed(streamOf([...opening(), ...closing()])));

    const span = only();
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.llm.stop_reason']).toBe('end_turn');
    expect(span.attributes['neatlogs.stream.cancelled']).toBeUndefined();
  });
});

describe('anthropic messages.stream()', () => {
  /** The SDK's real MessageStream over a fake transport. */
  function messageStream(events: unknown[], options: { thenThrow?: Error; hang?: boolean } = {}) {
    const api = {
      create: (_params: unknown, requestOptions: { signal: AbortSignal }) => ({
        withResponse: async () => ({
          response: { headers: new Headers() },
          data: Object.assign(
            (async function* () {
              yield* events;
              if (options.thenThrow) throw options.thenThrow;
              if (options.hang && !requestOptions.signal.aborted) {
                // The SDK's own Stream returns quietly on abort.
                await new Promise((resolve) =>
                  requestOptions.signal.addEventListener('abort', resolve, { once: true }),
                );
              }
            })(),
            { controller: { signal: requestOptions.signal } },
          ),
        }),
      }),
    };
    const client = wrapAnthropic({
      messages: {
        stream: (params: any, requestOptions: any) =>
          MessageStream.createMessage(api as any, params, requestOptions),
      },
    }) as any;
    return client.messages.stream({ model: 'claude-test', max_tokens: 16, messages: [] });
  }

  function expectFullReply() {
    const span = only('anthropic.messages.stream');
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(11);
    expect(span.attributes['neatlogs.llm.token_count.completion']).toBe(7);
    expect(span.attributes['neatlogs.llm.stop_reason']).toBe('end_turn');
    expect(span.attributes['neatlogs.llm.model_name']).toBe('claude-test');
  }

  it('records output, usage and stop reason when consumed by iteration', async () => {
    expect(await drain(messageStream([...opening(), ...closing()]))).toBe('completed');
    await tick();
    expectFullReply();
  });

  it('records output, usage and stop reason when consumed by finalMessage()', async () => {
    const message = await messageStream([...opening(), ...closing()]).finalMessage();
    expect(message.content[0].text).toBe('partial');
    await tick();
    expectFullReply();
  });

  it('records output, usage and stop reason when consumed by text events', async () => {
    const stream = messageStream([...opening(), ...closing()]);
    let text = '';
    stream.on('text', (delta: string) => {
      text += delta;
    });
    await stream.done();
    expect(text).toBe('partial');
    await tick();
    expectFullReply();
  });

  it('records a stream that breaks mid-reply as an error and keeps the partial reply', async () => {
    const stream = messageStream(opening(), { thenThrow: new Error('socket hang up') });
    await expect(stream.finalMessage()).rejects.toThrow('socket hang up');
    await tick();

    const span = only('anthropic.messages.stream');
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('socket hang up');
    expect(exceptionOf(span)).toBeDefined();
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(11);
  });

  it('records a consumer that stops early as cancelled and keeps the partial reply', async () => {
    await drain(messageStream(opening(), { hang: true }), 2);
    await tick();

    const span = only('anthropic.messages.stream');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('ends the span when the stream helper itself throws', () => {
    const client = wrapAnthropic({
      messages: {
        stream: () => {
          throw new Error('bad params');
        },
      },
    }) as any;
    expect(() => client.messages.stream({ model: 'claude-test', messages: [] })).toThrow('bad params');
    expect(spans()).toHaveLength(1);
    expect(only().status.code).toBe(ERROR);
  });
});
