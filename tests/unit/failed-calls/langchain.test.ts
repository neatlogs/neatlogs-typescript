import { describe, expect, it } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { RunnableLambda } from '@langchain/core/runnables';
import { langchainHandler } from '../../../src/langchain.js';
import { ERROR, OK, UNSET, abortError, exceptionOf, tick, useSpans } from './harness.js';

const { only, spans } = useSpans();

describe('langchainHandler', () => {
  it('closes a model call whose stream the parent run stopped reading', async () => {
    // LangChain fires no end/error callback for the abandoned model run.
    const chain = RunnableLambda.from(async (_input: string, config: any) => {
      const model = new FakeListChatModel({ responses: ['abcdefghij'], sleep: 5 });
      let seen = 0;
      for await (const _chunk of await model.stream('hi', config)) {
        if (++seen >= 3) break;
      }
      return 'done';
    });
    await chain.invoke('x', { callbacks: [langchainHandler()] });
    await tick(100);

    const llm = only('langchain.chat_model');
    expect(llm.status.code).toBe(UNSET);
    expect(llm.attributes['neatlogs.stream.cancelled']).toBe(true);
    // Token callbacks run in the background, so the exact count read is timing-dependent.
    const streamed = String(llm.attributes['neatlogs.llm.output_messages.0.content'] ?? '');
    expect(streamed.length).toBeGreaterThan(0);
    expect('abcdefghij'.startsWith(streamed)).toBe(true);
    const parent = spans().find((span) => span.name.startsWith('langchain.chain.'));
    expect(parent?.status.code).toBe(OK);
    expect(llm.parentSpanId).toBe(parent?.spanContext().spanId);
  });

  it('keeps the streamed tokens of a model call that fails', async () => {
    const handler = langchainHandler();
    await handler.handleChatModelStart({ name: 'gpt-test' }, [[{ role: 'user', content: 'hi' }]], 'run-1');
    await handler.handleLLMNewToken('par', {}, 'run-1');
    await handler.handleLLMNewToken('tial', {}, 'run-1');
    await handler.handleLLMError(new Error('socket hang up'), 'run-1');

    const llm = only('langchain.chat_model');
    expect(llm.status.code).toBe(ERROR);
    expect(exceptionOf(llm)).toMatchObject({ 'exception.message': 'socket hang up' });
    expect(llm.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('does not treat a provider abort as an error', async () => {
    const handler = langchainHandler();
    await handler.handleChatModelStart({ name: 'gpt-test' }, [[{ role: 'user', content: 'hi' }]], 'run-1');
    await handler.handleLLMError(abortError(), 'run-1');

    const llm = only('langchain.chat_model');
    expect(llm.status.code).toBe(UNSET);
    expect(llm.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(exceptionOf(llm)).toBeUndefined();
  });

  it('still records a chain that throws as an error', async () => {
    const chain = RunnableLambda.from(async () => {
      throw new Error('step failed');
    });
    await expect(chain.invoke('x', { callbacks: [langchainHandler()] })).rejects.toThrow('step failed');
    await tick(50);

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('step failed');
  });
});
