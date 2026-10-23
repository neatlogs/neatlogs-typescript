import { describe, expect, it } from 'vitest';
import * as aiV7 from 'ai';
import * as aiV6 from 'ai-v6';
import { MockLanguageModelV4 } from 'ai/test';
import { MockLanguageModelV3 } from 'ai-v6/test';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { wrapAISDK } from '../../../src/ai-sdk.js';
import { ERROR, UNSET, abortError, exceptionOf, tick, useSpans } from './harness.js';

const { spans } = useSpans();

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const opening = (text: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: '1' },
  { type: 'text-delta', id: '1', delta: text },
];
const closing = (reason = 'stop') => [
  { type: 'text-end', id: '1' },
  { type: 'finish', finishReason: { unified: reason, raw: reason }, usage },
];

type Ending = 'close' | 'hang' | { error: unknown };

/** A provider stream that hands out `parts` one read at a time, then ends as told. */
function providerStream(parts: unknown[], ending: Ending, abortSignal?: AbortSignal) {
  let next = 0;
  return new ReadableStream({
    async pull(controller) {
      if (next < parts.length) return controller.enqueue(parts[next++]);
      if (ending === 'close') return controller.close();
      if (typeof ending === 'object') return controller.error(ending.error);
      await new Promise((resolve) => {
        if (abortSignal?.aborted) resolve(undefined);
        else abortSignal?.addEventListener('abort', resolve, { once: true });
      });
      controller.error(abortError());
    },
  });
}

/** The span the wrapper opens, as opposed to the AI SDK's own telemetry spans. */
function wrapperSpans(name: string): ReadableSpan[] {
  return spans().filter(
    (span) =>
      span.name === name &&
      span.attributes['openinference.span.kind'] !== undefined &&
      span.attributes['operation.name'] === undefined &&
      span.attributes['ai.operationId'] === undefined,
  );
}

function wrapperSpan(name: string): ReadableSpan {
  const found = wrapperSpans(name);
  expect(found, `wrapper ${name} span must end exactly once`).toHaveLength(1);
  return found[0];
}

describe.each([
  ['v6', aiV6, MockLanguageModelV3],
  ['v7', aiV7, MockLanguageModelV4],
] as const)('wrapAISDK streamText on AI SDK %s', (_version, module, MockModel) => {
  const { streamText } = wrapAISDK(module as any) as any;
  const model = (parts: unknown[], ending: Ending) =>
    new (MockModel as any)({
      doStream: async ({ abortSignal }: { abortSignal?: AbortSignal }) => ({
        stream: providerStream(parts, ending, abortSignal),
      }),
    });
  async function read(result: any, breakAfter?: number): Promise<string> {
    let seen = 0;
    try {
      for await (const _text of result.textStream) {
        seen += 1;
        if (breakAfter !== undefined && seen >= breakAfter) break;
      }
      return 'completed';
    } catch (err) {
      return `threw ${(err as Error).message}`;
    }
  }

  it('records a normal finish with its output and calls the caller onFinish', async () => {
    const calls: string[] = [];
    const result = streamText({
      model: model([...opening('hello'), ...closing()], 'close'),
      prompt: 'hi',
      onFinish: () => void calls.push('onFinish'),
    });
    expect(await read(result)).toBe('completed');
    await tick(50);

    const span = wrapperSpan('ai.streamText');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['output.value']).toBe('hello');
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('stop');
    expect(span.attributes['neatlogs.stream.cancelled']).toBeUndefined();
    expect(calls).toEqual(['onFinish']);
  });

  it('records a provider stream that breaks mid-way as an error', async () => {
    const result = streamText({
      model: model(opening('partial'), { error: new Error('socket hang up') }),
      prompt: 'hi',
    });
    expect(await read(result)).toBe('threw socket hang up');
    await tick(50);

    const span = wrapperSpan('ai.streamText');
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('socket hang up');
    expect(exceptionOf(span)).toBeDefined();
    expect(span.attributes['output.value']).toBe('partial');
  });

  it('records a broken provider stream as an error when read through consumeStream()', async () => {
    const result = streamText({
      model: model(opening('partial'), { error: new Error('socket hang up') }),
      prompt: 'hi',
    });
    await result.consumeStream({ onError: () => undefined });
    await tick(50);

    expect(wrapperSpan('ai.streamText').status.code).toBe(ERROR);
  });

  it('records an in-stream error part as an error and still calls the caller onError', async () => {
    const calls: string[] = [];
    const result = streamText({
      model: model(
        [...opening('partial'), { type: 'error', error: new Error('provider overloaded') }, ...closing('error')],
        'close',
      ),
      prompt: 'hi',
      onError: () => void calls.push('onError'),
    });
    expect(await read(result)).toBe('completed');
    await tick(50);

    const span = wrapperSpan('ai.streamText');
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('provider overloaded');
    expect(calls).toEqual(['onError']);
  });

  it('records a caller abort as cancelled and calls the caller onAbort', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const result = streamText({
      model: model(opening('partial'), 'hang'),
      prompt: 'hi',
      abortSignal: controller.signal,
      onAbort: () => void calls.push('onAbort'),
    });
    setTimeout(() => controller.abort(), 30);
    await read(result);
    await tick(50);

    const span = wrapperSpan('ai.streamText');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(exceptionOf(span)).toBeUndefined();
    expect(span.attributes['output.value']).toBe('partial');
    expect(calls).toEqual(['onAbort']);
  });

  it('records a consumer that stops reading as cancelled', async () => {
    const result = streamText({
      model: model([...opening('partial'), { type: 'text-delta', id: '1', delta: ' more' }], 'hang'),
      prompt: 'hi',
    });
    expect(await read(result, 1)).toBe('completed');
    await tick(50);

    const span = wrapperSpan('ai.streamText');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  });
});

describe.each([
  ['v6', aiV6, MockLanguageModelV3],
  ['v7', aiV7, MockLanguageModelV4],
] as const)('wrapAISDK streamObject on AI SDK %s', (_version, module, MockModel) => {
  const { streamObject } = wrapAISDK(module as any) as any;
  const run = (parts: unknown[], ending: Ending, extra: Record<string, unknown> = {}) =>
    streamObject({
      model: new (MockModel as any)({
        doStream: async ({ abortSignal }: { abortSignal?: AbortSignal }) => ({
          stream: providerStream(parts, ending, abortSignal),
        }),
      }),
      output: 'no-schema',
      prompt: 'hi',
      onError: () => undefined,
      ...extra,
    });
  async function read(result: any, breakAfter?: number): Promise<string> {
    let seen = 0;
    try {
      for await (const _text of result.textStream) {
        seen += 1;
        if (breakAfter !== undefined && seen >= breakAfter) break;
      }
      return 'completed';
    } catch (err) {
      return `threw ${(err as Error).message}`;
    }
  }

  it('records a normal finish with its output and calls the caller onFinish', async () => {
    const calls: string[] = [];
    const result = run([...opening('{"a":1}'), ...closing()], 'close', {
      onFinish: () => void calls.push('onFinish'),
    });
    expect(await read(result)).toBe('completed');
    await tick(50);

    const span = wrapperSpan('ai.streamObject');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['output.value']).toBe('{"a":1}');
    expect(calls).toEqual(['onFinish']);
  });

  it('records a provider stream that breaks mid-way as an error', async () => {
    const result = run(opening('{"a":'), { error: new Error('socket hang up') });
    expect(await read(result)).toBe('threw socket hang up');
    await tick(50);

    const span = wrapperSpan('ai.streamObject');
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toBeDefined();
  });

  it('records a caller abort as cancelled, not as an error', async () => {
    const controller = new AbortController();
    const result = run(opening('{"a":'), 'hang', { abortSignal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    await read(result);
    await tick(50);

    const span = wrapperSpan('ai.streamObject');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(exceptionOf(span)).toBeUndefined();
  });

  it('records a consumer that stops reading as cancelled', async () => {
    const result = run([...opening('{"a":'), { type: 'text-delta', id: '1', delta: '1' }], 'hang');
    expect(await read(result, 1)).toBe('completed');
    await tick(50);

    const span = wrapperSpan('ai.streamObject');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  });
});

describe('wrapAISDK streamText on AI SDK v7 only', () => {
  const { streamText } = wrapAISDK(aiV7 as any) as any;

  it('ends the span when the caller uses onEnd instead of the deprecated onFinish', async () => {
    const calls: string[] = [];
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({ stream: providerStream([...opening('hello'), ...closing()], 'close') }),
      } as any),
      prompt: 'hi',
      onEnd: () => void calls.push('onEnd'),
    });
    for await (const _text of result.textStream) void _text;
    await tick(50);

    const span = wrapperSpan('ai.streamText');
    expect(span.attributes['output.value']).toBe('hello');
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('stop');
    expect(calls).toEqual(['onEnd']);
  });

  it('does not record an error for a provider error that a stream retry recovers from', async () => {
    let attempt = 0;
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream:
            attempt++ === 0
              ? providerStream(
                  [{ type: 'stream-start', warnings: [] }, { type: 'error', error: new Error('provider overloaded') }],
                  'close',
                )
              : providerStream([...opening('recovered'), ...closing()], 'close'),
        }),
      } as any),
      prompt: 'hi',
      streamRetries: 1,
    });
    for await (const _text of result.textStream) void _text;
    await tick(50);

    expect(attempt).toBe(2);
    const span = wrapperSpan('ai.streamText');
    expect(span.status.code).toBe(UNSET);
    expect(exceptionOf(span)).toBeUndefined();
    expect(span.attributes['output.value']).toBe('recovered');
  });
});
