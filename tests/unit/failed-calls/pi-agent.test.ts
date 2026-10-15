import { describe, expect, it } from 'vitest';
import { piAgentHooks } from '../../../src/pi-agent.js';
import { ERROR, UNSET, exceptionOf, useSpans } from './harness.js';

const { only } = useSpans();

const user = { role: 'user', content: [{ type: 'text', text: 'hello' }] };
const assistant = (stopReason: string, errorMessage?: string) => ({
  role: 'assistant',
  content: [],
  model: 'gpt-test',
  provider: 'test',
  timestamp: Date.now(),
  stopReason,
  errorMessage,
});

/** Drive one single-turn run that ends with `reply`. */
function run(reply: ReturnType<typeof assistant>) {
  let listener: ((event: any) => void) | undefined;
  piAgentHooks({
    state: { messages: [] },
    subscribe(fn: (event: any) => void) {
      listener = fn;
      return () => undefined;
    },
  } as any);
  for (const event of [
    { type: 'agent_start' },
    { type: 'turn_start' },
    { type: 'message_start', message: user },
    { type: 'message_end', message: user },
    { type: 'message_start', message: reply },
    { type: 'message_end', message: reply },
    { type: 'turn_end', message: reply },
    { type: 'agent_end', messages: [user, reply] },
  ]) {
    listener?.(event);
  }
}

describe('piAgentHooks terminal status', () => {
  it('records a run the caller aborted as cancelled, not as an error', () => {
    run(assistant('aborted', 'Request was aborted'));

    for (const name of ['pi_agent.run', 'pi_agent.turn.1', 'pi_agent.llm.gpt-test']) {
      const span = only(name);
      expect(span.status.code, name).toBe(UNSET);
      expect(span.attributes['neatlogs.stream.cancelled'], name).toBe(true);
    }
    // The reason stays visible on the run.
    expect(only('pi_agent.run').attributes['neatlogs.agent.stop_reason']).toBe('aborted');
    expect(only('pi_agent.run').attributes['output.value']).toBe('[aborted] Request was aborted');
  });

  it('still records a provider error as an error, with an exception event', () => {
    run(assistant('error', 'Provider returned 500'));

    for (const name of ['pi_agent.run', 'pi_agent.turn.1', 'pi_agent.llm.gpt-test']) {
      const span = only(name);
      expect(span.status.code, name).toBe(ERROR);
      expect(span.status.message, name).toBe('Provider returned 500');
      expect(exceptionOf(span), name).toMatchObject({ 'exception.message': 'Provider returned 500' });
    }
  });
});
