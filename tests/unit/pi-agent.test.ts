import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import { getTracerProvider, init, shutdown } from '../../src/init.js';
import { piAgentHooks, tracePiStream } from '../../src/pi-agent.js';

let exporter: InMemorySpanExporter;

beforeAll(async () => {
  await init({
    apiKey: 'test-key',
    workflowName: 'pi-agent-unit',
    disableExport: true,
    registerShutdownHandlers: false,
  });
  exporter = new InMemorySpanExporter();
  getTracerProvider().addSpanProcessor(new SimpleSpanProcessor(exporter));
});

afterAll(async () => {
  await shutdown();
});

beforeEach(() => exporter.reset());

function spans(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}

function piSpans(): ReadableSpan[] {
  return spans().filter((span) => span.name.startsWith('pi_agent.'));
}

function kind(span: ReadableSpan): string {
  return String(span.attributes['neatlogs.span.kind'] ?? '').toUpperCase();
}

function byName(name: string): ReadableSpan {
  const span = spans().find((candidate) => candidate.name === name);
  expect(span, `missing span ${name}`).toBeDefined();
  return span!;
}

function assistant(text = 'hello') {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'gpt-test',
    provider: 'test',
    timestamp: Date.now() - 25,
    stopReason: 'stop',
    usage: {
      input: 10,
      output: 3,
      totalTokens: 13,
      cost: { input: 0.001, output: 0.002, total: 0.003 },
    },
  };
}

describe('Pi Agent event instrumentation', () => {
  it('creates the complete AGENT → CHAIN → LLM/TOOL tree', () => {
    let listener: ((event: any) => void) | undefined;
    const agent: any = {
      state: { messages: [] },
      subscribe(fn: (event: any) => void) {
        listener = fn;
        return () => undefined;
      },
    };
    expect(piAgentHooks(agent)).toBe(agent);
    expect(piAgentHooks(agent)).toBe(agent);

    const user = { role: 'user', content: [{ type: 'text', text: 'Use the tool.' }] };
    const reply = assistant('done');
    listener?.({ type: 'agent_start' });
    listener?.({ type: 'turn_start' });
    listener?.({ type: 'message_start', message: user });
    listener?.({ type: 'message_end', message: user });
    listener?.({ type: 'message_start', message: reply });
    listener?.({ type: 'message_update', message: reply, assistantMessageEvent: { type: 'text_delta' } });
    listener?.({ type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'lookup', args: { id: 1 } });
    listener?.({ type: 'tool_execution_update', toolCallId: 'call-1', partialResult: { progress: 50 } });
    listener?.({ type: 'tool_execution_end', toolCallId: 'call-1', result: { value: 'ok' }, isError: false });
    listener?.({ type: 'message_end', message: reply });
    listener?.({ type: 'turn_end', message: reply, toolResults: [{ value: 'ok' }] });
    listener?.({ type: 'agent_end', messages: [user, reply] });

    expect(piSpans()).toHaveLength(4);
    const root = byName('pi_agent.run');
    const turn = byName('pi_agent.turn.1');
    const llm = byName('pi_agent.llm.gpt-test');
    const tool = byName('pi_agent.tool.lookup');
    expect(turn.parentSpanId).toBe(root.spanContext().spanId);
    expect(llm.parentSpanId).toBe(turn.spanContext().spanId);
    expect(tool.parentSpanId).toBe(turn.spanContext().spanId);
    expect(root.attributes['input.value']).toBe('Use the tool.');
    expect(root.attributes['output.value']).toBe('done');
    expect(llm.attributes['neatlogs.llm.is_streaming']).toBe(true);
    expect(llm.attributes['neatlogs.llm.metrics.ttft_ms']).toBeTypeOf('number');
    expect(llm.attributes['neatlogs.llm.cost_usd']).toBe(0.003);
    expect(tool.attributes['neatlogs.tool.is_streaming']).toBe(true);
  });

  it('supports StreamFn returning Promise<EventStream> and observes consumed chunks', async () => {
    const reply = assistant('async stream complete');
    let resolveResult!: (message: ReturnType<typeof assistant>) => void;
    const resultPromise = new Promise<ReturnType<typeof assistant>>((resolve) => {
      resolveResult = resolve;
    });
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { type: 'text_delta', delta: 'async' };
        resolveResult(reply);
      },
      result: () => resultPromise,
    };
    const traced = tracePiStream(async () => stream);
    const returned = await traced(
      { id: 'gpt-test', provider: 'test' },
      { systemPrompt: 'system', messages: [{ role: 'user', content: 'hello' }] },
    );
    for await (const _chunk of returned) {
      void _chunk;
    }
    await returned.result();
    await Promise.resolve();

    expect(piSpans()).toHaveLength(2);
    const root = byName('pi_agent.stream');
    const llm = byName('pi_agent.llm.gpt-test');
    expect(llm.parentSpanId).toBe(root.spanContext().spanId);
    expect(llm.attributes['neatlogs.llm.is_streaming']).toBe(true);
    expect(llm.attributes['neatlogs.llm.metrics.ttft_ms']).toBeTypeOf('number');
    expect(root.attributes['output.value']).toBe('async stream complete');
  });

  it('closes spans when an async StreamFn factory rejects', async () => {
    const traced = tracePiStream(async () => {
      throw new Error('factory failed');
    });
    await expect(traced({ id: 'gpt-test' }, { messages: [] })).rejects.toThrow('factory failed');
    expect(piSpans()).toHaveLength(2);
    expect(byName('pi_agent.stream').attributes['output.value']).toContain('factory failed');
    expect(byName('pi_agent.llm.gpt-test').attributes['output.value']).toContain('factory failed');
  });
});

describe('maintained Pi AgentHarness operations', () => {
  function harness() {
    const listeners = new Set<(event: any) => void>();
    return {
      subscribe(fn: (event: any) => void) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      getModel: () => ({ id: 'gpt-test', provider: 'test' }),
      compact: async () => ({
        summary: 'conversation compacted',
        usage: { input: 100, output: 10, totalTokens: 110, cost: { total: 0.01 } },
      }),
      navigateTree: async (_target: string, options?: { summarize?: boolean }) =>
        options?.summarize
          ? {
              cancelled: false,
              summaryEntry: {
                summary: 'branch summarized',
                usage: { input: 20, output: 4, totalTokens: 24, cost: { total: 0.002 } },
              },
            }
          : { cancelled: false },
      emit: (event: any) => listeners.forEach((listener) => listener(event)),
    };
  }

  it('traces compact and summarizing navigateTree model calls', async () => {
    const agent = piAgentHooks(harness());
    await agent.compact('keep decisions');
    await agent.navigateTree('entry-1', { summarize: true });

    expect(piSpans().filter((span) => kind(span) === 'LLM')).toHaveLength(2);
    expect(piSpans().filter((span) => kind(span) === 'CHAIN')).toHaveLength(2);
    expect(piSpans().filter((span) => kind(span) === 'WORKFLOW')).toHaveLength(2);
    expect(byName('pi_agent.harness.compact').attributes['output.value']).toContain('conversation compacted');
    const llmCosts = spans()
      .filter((span) => kind(span) === 'LLM')
      .map((span) => span.attributes['neatlogs.llm.cost_usd']);
    expect(llmCosts).toEqual(expect.arrayContaining([0.01, 0.002]));
  });

  it('records non-summarizing navigateTree as a CHAIN without inventing an LLM call', async () => {
    const agent = piAgentHooks(harness());
    await agent.navigateTree('entry-1', { summarize: false });
    expect(piSpans().filter((span) => kind(span) === 'LLM')).toHaveLength(0);
    expect(piSpans().filter((span) => kind(span) === 'CHAIN')).toHaveLength(1);
  });

  it('does not invent an LLM span when a harness hook supplies compaction', async () => {
    const listeners = new Set<(event: any) => void>();
    const hooked: any = {
      subscribe(listener: (event: any) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getModel: () => ({ id: 'gpt-test', provider: 'test' }),
      compact: async () => {
        listeners.forEach((listener) =>
          listener({ type: 'session_compact', fromHook: true }),
        );
        return { summary: 'provided by hook', tokensBefore: 20 };
      },
      navigateTree: async () => ({ cancelled: false }),
    };

    await piAgentHooks(hooked).compact();
    expect(piSpans().filter((span) => kind(span) === 'LLM')).toHaveLength(0);
    expect(piSpans().filter((span) => kind(span) === 'CHAIN')).toHaveLength(1);
  });
});
