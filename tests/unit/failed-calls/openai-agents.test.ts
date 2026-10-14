import { describe, expect, it } from 'vitest';
import { openaiAgentsProcessor } from '../../../src/openai-agents.js';
import { ERROR, OK, exceptionOf, useSpans } from './harness.js';

const { only, spans } = useSpans();
const roots = () => spans().filter((span) => span.name === 'openai_agents.trace');

/** The Agents SDK reports a span failure as `{ message, data }`, never as an Error. */
const sdkError = (message: string) => ({ message, data: { detail: 'x' } });

function run(processor: any, traceId: string, spans: Array<Record<string, unknown>>) {
  processor.onTraceStart({ traceId, name: 'workflow' });
  // Starts in order, ends innermost-first, as the SDK does.
  for (const span of spans) processor.onSpanStart({ traceId, ...span });
  for (const span of [...spans].reverse()) processor.onSpanEnd({ traceId, ...span });
  processor.onTraceEnd({ traceId, name: 'workflow' });
}

describe('openaiAgentsProcessor root span', () => {
  it('is an error when the agent run failed, with the real message', () => {
    run(openaiAgentsProcessor(), 't1', [
      { spanId: 'agent', spanData: { type: 'agent', name: 'Planner' }, error: sdkError('Max turns (3) exceeded') },
    ]);

    const agent = only('openai_agents.agent.Planner');
    expect(agent.status.code).toBe(ERROR);
    expect(agent.status.message).toBe('Max turns (3) exceeded');

    const root = only('openai_agents.trace');
    expect(root.status.code).toBe(ERROR);
    expect(root.status.message).toBe('Max turns (3) exceeded');
    expect(exceptionOf(root)).toMatchObject({ 'exception.message': 'Max turns (3) exceeded' });
  });

  it('is an error when a model call failed', () => {
    run(openaiAgentsProcessor(), 't1', [
      { spanId: 'agent', spanData: { type: 'agent', name: 'Planner' } },
      { spanId: 'llm', parentId: 'agent', spanData: { type: 'response' }, error: sdkError('Error streaming response') },
    ]);

    expect(only('openai_agents.trace').status.code).toBe(ERROR);
    expect(only('openai_agents.trace').status.message).toBe('Error streaming response');
  });

  it('keeps the first run-ending error', () => {
    run(openaiAgentsProcessor(), 't1', [
      { spanId: 'agent', spanData: { type: 'agent', name: 'Planner' }, error: sdkError('agent failed') },
      { spanId: 'llm', parentId: 'agent', spanData: { type: 'response' }, error: sdkError('model failed') },
    ]);

    expect(only('openai_agents.trace').status.message).toBe('model failed');
  });

  it('stays OK when only a tool failed, because the run carries on', () => {
    run(openaiAgentsProcessor(), 't1', [
      { spanId: 'agent', spanData: { type: 'agent', name: 'Planner' } },
      { spanId: 'tool', parentId: 'agent', spanData: { type: 'function', name: 'lookup' }, error: sdkError('tool failed') },
      // Work done inside the tool, e.g. a nested agent-as-tool model call.
      { spanId: 'nested', parentId: 'tool', spanData: { type: 'response' }, error: sdkError('nested failed') },
    ]);

    expect(only('openai_agents.tool.lookup').status.code).toBe(ERROR);
    expect(only('openai_agents.trace').status.code).toBe(OK);
  });

  it('stays OK when only a handoff failed', () => {
    run(openaiAgentsProcessor(), 't1', [
      { spanId: 'agent', spanData: { type: 'agent', name: 'Planner' } },
      { spanId: 'handoff', parentId: 'agent', spanData: { type: 'handoff' }, error: sdkError('handoff failed') },
    ]);

    expect(only('openai_agents.trace').status.code).toBe(OK);
  });

  it('does not carry an error over to the next trace', () => {
    const processor = openaiAgentsProcessor();
    run(processor, 't1', [
      { spanId: 'a1', spanData: { type: 'agent', name: 'Planner' }, error: sdkError('agent failed') },
    ]);
    run(processor, 't2', [{ spanId: 'a2', spanData: { type: 'agent', name: 'Writer' } }]);

    expect(roots().map((root) => root.status.code)).toEqual([ERROR, OK]);
  });

  it('ends the root when run() throws and the SDK never calls onTraceEnd', () => {
    const processor = openaiAgentsProcessor();
    const traceId = 't-throw';
    processor.onTraceStart({ traceId, name: 'workflow' });
    const spans = [
      { spanId: 'task', spanData: { type: 'task', name: 'Agent workflow' } },
      { spanId: 'agent', parentId: 'task', spanData: { type: 'agent', name: 'Planner' } },
      { spanId: 'turn', parentId: 'agent', spanData: { type: 'turn' } },
    ];
    for (const span of spans) processor.onSpanStart({ traceId, ...span });
    const failure = { message: 'Error in agent run', data: { error: 'Error: model down' } };
    processor.onSpanEnd({ traceId, ...spans[2], error: failure });
    processor.onSpanEnd({ traceId, ...spans[1], error: failure });
    processor.onSpanEnd({ traceId, ...spans[0], error: failure });
    // No onTraceEnd: run() threw.

    const root = only('openai_agents.trace');
    expect(root.status.code).toBe(ERROR);
    expect(root.status.message).toBe('Error: model down');
    expect(roots()).toHaveLength(1);
  });

  it('uses the cause in data.error as the message, not the generic one', () => {
    run(openaiAgentsProcessor(), 't-cause', [
      {
        spanId: 'agent',
        spanData: { type: 'agent', name: 'Planner' },
        error: { message: 'Error in agent run', data: { error: 'Error: model down' } },
      },
    ]);

    expect(only('openai_agents.agent.Planner').status.message).toBe('Error: model down');
  });

  it('ends the root once when onTraceEnd follows the failed task span', () => {
    const processor = openaiAgentsProcessor();
    processor.onTraceStart({ traceId: 't-both', name: 'workflow' });
    processor.onSpanStart({ traceId: 't-both', spanId: 'task', spanData: { type: 'task' } });
    processor.onSpanEnd({ traceId: 't-both', spanId: 'task', spanData: { type: 'task' }, error: { message: 'boom' } });
    processor.onTraceEnd({ traceId: 't-both', name: 'workflow' });

    expect(roots()).toHaveLength(1);
    expect(only('openai_agents.trace').status.code).toBe(ERROR);
  });
});
