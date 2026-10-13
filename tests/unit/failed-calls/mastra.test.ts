import { describe, expect, it } from 'vitest';
import { wrapMastra } from '../../../src/mastra-wrap.js';
import { ERROR, OK, UNSET, abortError, exceptionOf, tick, useSpans } from './harness.js';

const { only } = useSpans();

/** A promise that rejects without tripping the unhandled-rejection check. */
function rejected(error: unknown): Promise<never> {
  const promise = Promise.reject(error);
  promise.catch(() => undefined);
  return promise;
}

/** An agent whose stream() drives the (patched) model's doStream to the end. */
function agentWithModel(parts: unknown[], ending: 'close' | 'cancel' | { error: unknown } = 'close') {
  let next = 0;
  const model = {
    modelId: 'stream-model',
    provider: 'test',
    doStream: async () => ({
      stream: new ReadableStream({
        pull(controller) {
          if (next < parts.length) return controller.enqueue(parts[next++]);
          if (typeof ending === 'object') return controller.error(ending.error);
          if (ending === 'close') controller.close();
        },
      }),
    }),
  };
  return wrapMastra({
    name: 'streamer',
    getLLM: async () => model,
    generate: async () => ({}),
    async stream(this: any) {
      const llm = await this.getLLM();
      const reader = (await llm.doStream({ prompt: [] })).stream.getReader();
      try {
        for (let read = 0; ; read += 1) {
          if (ending === 'cancel' && read >= parts.length) {
            await reader.cancel();
            break;
          }
          if ((await reader.read()).done) break;
        }
      } catch {
        /* the model span records the failure */
      }
      return undefined;
    },
  } as any) as any;
}

describe('wrapMastra agent.stream()', () => {
  const failingOutput = (error: unknown) => ({
    text: rejected(error),
    usage: rejected(error),
    finishReason: rejected(error),
    error,
  });

  it('records a stream whose result promises reject as an error', async () => {
    const agent = wrapMastra({
      name: 'planner',
      generate: async () => ({}),
      stream: async () => failingOutput(new Error('provider exploded')),
    } as any) as any;
    await agent.stream('hi');
    await tick();

    const span = only('mastra.agent.planner');
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('provider exploded');
    expect(exceptionOf(span)).toBeDefined();
    expect(span.attributes['output.value']).not.toContain('completed');
  });

  it('keeps the text and usage that did arrive when the stream reports an error', async () => {
    const agent = wrapMastra({
      name: 'planner',
      generate: async () => ({}),
      stream: async () => ({
        text: Promise.resolve('partial answer'),
        usage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
        finishReason: Promise.resolve('error'),
        error: new Error('provider exploded'),
      }),
    } as any) as any;
    await agent.stream('hi');
    await tick();

    const span = only('mastra.agent.planner');
    expect(span.status.code).toBe(ERROR);
    expect(span.attributes['output.value']).toBe('partial answer');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(3);
    expect(span.attributes['neatlogs.llm.stop_reason']).toBe('error');
  });

  it('does not treat an aborted stream as an error', async () => {
    const agent = wrapMastra({
      name: 'planner',
      generate: async () => ({}),
      stream: async () => failingOutput(abortError()),
    } as any) as any;
    await agent.stream('hi');
    await tick();

    const span = only('mastra.agent.planner');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  });

  it('still records a successful stream as OK', async () => {
    const agent = wrapMastra({
      name: 'planner',
      generate: async () => ({}),
      stream: async () => ({
        text: Promise.resolve('all good'),
        usage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
        finishReason: Promise.resolve('stop'),
      }),
    } as any) as any;
    await agent.stream('hi');
    await tick();

    const span = only('mastra.agent.planner');
    expect(span.status.code).toBe(OK);
    expect(span.attributes['output.value']).toBe('all good');
  });
});

describe('wrapMastra model doStream', () => {
  const delta = { type: 'text-delta', delta: 'partial' };
  const finish = (finishReason: string) => ({
    type: 'finish',
    finishReason,
    usage: { inputTokens: 3, outputTokens: 1 },
  });

  it('records an in-stream error part as an error and keeps the partial output', async () => {
    await agentWithModel([delta, { type: 'error', error: new Error('provider overloaded') }, finish('error')]).stream('hi');
    await tick();

    const span = only('mastra.llm.stream-model.doStream');
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('provider overloaded');
    expect(exceptionOf(span)).toBeDefined();
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['output.value']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(3);
  });

  it('keeps the partial output when the stream breaks mid-way', async () => {
    await agentWithModel([delta], { error: new Error('socket hang up') }).stream('hi');
    await tick();

    const span = only('mastra.llm.stream-model.doStream');
    expect(span.status.code).toBe(ERROR);
    expect(span.attributes['output.value']).toBe('partial');
  });

  it('records a cancelled stream as cancelled and keeps the partial output', async () => {
    await agentWithModel([delta], 'cancel').stream('hi');
    await tick();

    const span = only('mastra.llm.stream-model.doStream');
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['output.value']).toBe('partial');
  });

  it('still records a completed stream as OK', async () => {
    await agentWithModel([delta, finish('stop')]).stream('hi');
    await tick();

    expect(only('mastra.llm.stream-model.doStream').status.code).toBe(OK);
  });
});

describe('wrapMastra workflow run', () => {
  const workflow = (result: unknown) =>
    wrapMastra({ name: 'pipeline', createRun: async () => ({ start: async () => result }) } as any) as any;

  it('records a run that resolves with status "failed" as an error', async () => {
    const result = await (await workflow({ status: 'failed', error: new Error('step blew up') }).createRun()).start({
      inputData: {},
    });
    expect(result.status).toBe('failed');

    const span = only('mastra.workflow.pipeline');
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('step blew up');
    expect(exceptionOf(span)).toBeDefined();
  });

  it('records a serialized failure (no Error instance) with its message', async () => {
    await (await workflow({ status: 'failed', error: { name: 'StepError', message: 'step blew up' } }).createRun()).start({});

    const span = only('mastra.workflow.pipeline');
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({
      'exception.type': 'StepError',
      'exception.message': 'step blew up',
    });
  });

  it('still records a successful run as OK', async () => {
    await (await workflow({ status: 'success', result: { ok: true } }).createRun()).start({});

    expect(only('mastra.workflow.pipeline').status.code).toBe(OK);
  });
});
