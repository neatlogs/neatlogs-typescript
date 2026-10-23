import { describe, expect, it } from 'vitest';
import { wrapClaudeAgentSDK } from '../../../src/claude-agent-sdk.js';
import { ERROR, OK, UNSET, abortError, exceptionOf, useSpans } from './harness.js';

const { spans } = useSpans();

const agentSpan = () => {
  const found = spans().filter((span) => span.attributes['neatlogs.span.kind'] === 'AGENT');
  expect(found).toHaveLength(1);
  return found[0];
};
const assistant = (text: string) => ({
  type: 'assistant',
  message: { model: 'claude-test', content: [{ type: 'text', text }] },
});
const query = (source: () => AsyncGenerator<unknown>) =>
  (wrapClaudeAgentSDK({ query: () => source() } as any) as any).query({ prompt: 'hello' });

describe('wrapClaudeAgentSDK run span', () => {
  it('records a consumer that stops before the result as cancelled', async () => {
    for await (const message of query(async function* () {
      yield { type: 'system', session_id: 's1' };
      yield assistant('thinking');
      yield assistant('more');
    })) {
      if ((message as any).type === 'assistant') break;
    }

    const span = agentSpan();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  });

  it('records an aborted run as cancelled, not as an error', async () => {
    await expect(async () => {
      for await (const _message of query(async function* () {
        yield assistant('partial answer');
        throw abortError();
      })) {
        void _message;
      }
    }).rejects.toThrow();

    const span = agentSpan();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(exceptionOf(span)).toBeUndefined();
    expect(span.attributes['output.value']).toBe('partial answer');
  });

  it('keeps the text already produced when the run fails', async () => {
    await expect(async () => {
      for await (const _message of query(async function* () {
        yield assistant('partial answer');
        throw new Error('subprocess crashed');
      })) {
        void _message;
      }
    }).rejects.toThrow('subprocess crashed');

    const span = agentSpan();
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('subprocess crashed');
    expect(span.attributes['output.value']).toBe('partial answer');
  });

  it('still records a completed run as OK even if the consumer stops at the result', async () => {
    for await (const message of query(async function* () {
      yield assistant('done');
      yield { type: 'result', subtype: 'success', result: 'done', is_error: false };
    })) {
      if ((message as any).type === 'result') break;
    }

    const span = agentSpan();
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.stream.cancelled']).toBeUndefined();
  });
});
