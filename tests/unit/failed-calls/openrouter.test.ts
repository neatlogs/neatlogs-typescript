import { describe, expect, it } from 'vitest';
import { wrapOpenRouterAgent } from '../../../src/openrouter-agent.js';
import { ERROR, OK, UNSET, drain, exceptionOf, streamOf, useSpans } from './harness.js';

const { only, spans } = useSpans();

const response = {
  id: 'resp_1',
  model: 'openai/gpt-test',
  status: 'completed',
  usage: { inputTokens: 4, outputTokens: 2 },
};

function client(result: Record<string, unknown>) {
  return wrapOpenRouterAgent({ callModel: () => result }) as any;
}

describe('wrapOpenRouterAgent stream consumers', () => {
  it('ends the span with text and usage when only getTextStream() is consumed', async () => {
    const result = client({
      getTextStream: () => streamOf(['par', 'tial']),
      getResponse: async () => response,
    }).callModel({ model: 'openai/gpt-test', input: 'hi' });
    expect(await drain(result.getTextStream())).toBe('completed');

    const span = only();
    expect(span.status.code).toBe(OK);
    expect(span.attributes['output.value']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(4);
    expect(span.attributes['neatlogs.llm.response_id']).toBe('resp_1');
  });

  it.each([
    'getFullResponsesStream',
    'getItemsStream',
    'getNewMessagesStream',
    'getReasoningStream',
    'getToolStream',
    'getToolCallsStream',
  ])('ends the span when only %s() is consumed', async (method) => {
    const result = client({
      [method]: () => streamOf([{ type: 'event' }]),
      getResponse: async () => response,
    }).callModel({ model: 'openai/gpt-test', input: 'hi' });
    await drain(result[method]());

    expect(only().status.code).toBe(OK);
  });

  it('records a stream that breaks mid-way as an error and keeps the text so far', async () => {
    const result = client({
      getTextStream: () => streamOf(['par', 'tial'], new Error('socket hang up')),
      getResponse: async () => response,
    }).callModel({ model: 'openai/gpt-test', input: 'hi' });
    expect(await drain(result.getTextStream())).toBe('threw socket hang up');

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({ 'exception.message': 'socket hang up' });
    expect(span.attributes['output.value']).toBe('partial');
  });

  it('records a response the API reports as failed as an error', async () => {
    // getTextStream() just ends on response.failed; getResponse() is what rejects.
    const result = client({
      getTextStream: () => streamOf(['partial']),
      getResponse: async () => {
        throw new Error('Response failed: {"code":"server_error"}');
      },
    }).callModel({ model: 'openai/gpt-test', input: 'hi' });
    expect(await drain(result.getTextStream())).toBe('completed');

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(span.attributes['output.value']).toBe('partial');
  });

  it('records a consumer that stops reading as cancelled', async () => {
    const result = client({
      getTextStream: () => streamOf(['par', 'tial', 'more']),
      getResponse: async () => response,
    }).callModel({ model: 'openai/gpt-test', input: 'hi' });
    await drain(result.getTextStream(), 1);

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['output.value']).toBe('par');
  });

  it('ends the span once when a stream and getText() are both used', async () => {
    const result = client({
      getTextStream: () => streamOf(['partial']),
      getText: async () => 'partial',
      getResponse: async () => response,
    }).callModel({ model: 'openai/gpt-test', input: 'hi' });
    await drain(result.getTextStream());
    expect(await result.getText()).toBe('partial');

    expect(spans()).toHaveLength(1);
  });

  it('records why an incomplete response stopped', async () => {
    const result = client({
      getResponse: async () => ({
        ...response,
        status: 'incomplete',
        incompleteDetails: { reason: 'max_output_tokens' },
      }),
    }).callModel({ model: 'openai/gpt-test', input: 'hi' });
    await result.getResponse();

    const span = only();
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('max_output_tokens');
  });
});
