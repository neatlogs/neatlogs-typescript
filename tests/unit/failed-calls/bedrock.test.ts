import { describe, expect, it } from 'vitest';
import { wrapBedrock } from '../../../src/bedrock.js';
import { ERROR, UNSET, abortError, drain, exceptionOf, streamOf, useSpans } from './harness.js';

const { only } = useSpans();

class ConverseStreamCommand {
  constructor(public input: unknown) {}
}
class InvokeModelWithResponseStreamCommand {
  constructor(public input: unknown) {}
}

const converseEvents = [
  { contentBlockStart: { start: { toolUse: { toolUseId: 'tool_1', name: 'get_weather' } }, contentBlockIndex: 1 } },
  { contentBlockDelta: { delta: { toolUse: { input: '{"city":"Pune"}' } }, contentBlockIndex: 1 } },
  { contentBlockDelta: { delta: { text: 'partial' }, contentBlockIndex: 0 } },
  { metadata: { usage: { inputTokens: 4, outputTokens: 2 } } },
];
const invokeChunk = (data: unknown) => ({
  chunk: { bytes: new TextEncoder().encode(JSON.stringify(data)) },
});
const invokeEvents = [
  invokeChunk({ type: 'content_block_delta', delta: { text: 'partial' } }),
  invokeChunk({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }),
];

describe.each([
  [
    'ConverseStream',
    (source: unknown) => ({ command: new ConverseStreamCommand({ modelId: 'anthropic.claude-test', messages: [] }), response: { stream: source }, key: 'stream' }),
    converseEvents,
  ],
  [
    'InvokeModelWithResponseStream',
    (source: unknown) => ({ command: new InvokeModelWithResponseStreamCommand({ modelId: 'anthropic.claude-test', body: '{}' }), response: { body: source }, key: 'body' }),
    invokeEvents,
  ],
] as const)('bedrock %s', (name, setup, events) => {
  async function streamed(source: unknown): Promise<AsyncIterable<unknown>> {
    const { command, response, key } = setup(source);
    const client = wrapBedrock({ send: async () => response }) as any;
    return (await client.send(command))[key];
  }

  it('keeps the partial reply when the stream breaks mid-way', async () => {
    expect(await drain(await streamed(streamOf([...events], new Error('modelStreamErrorException'))))).toBe(
      'threw modelStreamErrorException',
    );

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({ 'exception.message': 'modelStreamErrorException' });
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.completion']).toBe(2);
    if (name === 'ConverseStream') {
      expect(span.attributes['neatlogs.llm.tool_calls.0.name']).toBe('get_weather');
      expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(4);
    }
  });

  it('does not treat a caller abort as an error', async () => {
    await drain(await streamed(streamOf([...events], abortError())));

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(exceptionOf(span)).toBeUndefined();
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('does not treat a deliberate break as an error or as a clean finish', async () => {
    await drain(await streamed(streamOf([...events])), events.length - 1);

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  });
});
