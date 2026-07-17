import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { _setNeatlogsProvider } from '../../src/core/provider.js';
import { wrapMastra } from '../../src/mastra-wrap.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;

beforeAll(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});

afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
});

describe('Mastra private context propagation', () => {
  it('nests model and tool spans without registering a global provider', async () => {
    const model = {
      modelId: 'private-model',
      doGenerate: async () => ({ text: 'complete' }),
    };
    const tool = {
      id: 'private-tool',
      execute: async () => ({ value: 1 }),
    };
    const llm = { getModel: () => model };
    const agent = wrapMastra({
      name: 'private-agent',
      getLLM: async () => llm,
      listTools: () => ({ tool }),
      generate: async function () {
        const resolved = await this.getLLM();
        await resolved.getModel().doGenerate({ prompt: 'run' });
        await this.listTools().tool.execute({});
        return { text: 'complete' };
      },
    });

    await agent.generate('run');

    const spans = exporter.getFinishedSpans();
    const agentSpan = spans.find(
      (span) => span.name === 'mastra.agent.private-agent',
    )!;
    const childSpans = spans.filter((span) => span !== agentSpan);
    expect(agentSpan.parentSpanId).toBeUndefined();
    expect(childSpans).toHaveLength(2);
    expect(
      childSpans.map((span) => ({
        name: span.name,
        parentSpanId: span.parentSpanId,
        traceId: span.spanContext().traceId,
      })),
    ).toEqual([
      {
        name: 'mastra.llm.private-model.doGenerate',
        parentSpanId: agentSpan.spanContext().spanId,
        traceId: agentSpan.spanContext().traceId,
      },
      {
        name: 'mastra.tool.private-tool',
        parentSpanId: agentSpan.spanContext().spanId,
        traceId: agentSpan.spanContext().traceId,
      },
    ]);
  });

  it('preserves ReadableStream.getReader on wrapped Mastra stream output', async () => {
    const output = {
      fullStream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta', payload: { text: 'ok' } });
          controller.close();
        },
      }),
    };
    const agent = wrapMastra({
      name: 'stream-agent',
      stream: async () => output,
    });

    const wrappedOutput = await agent.stream('run');
    const reader = wrappedOutput.fullStream.getReader();
    expect(await reader.read()).toEqual({
      done: false,
      value: { type: 'text-delta', payload: { text: 'ok' } },
    });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    reader.releaseLock();
  });

  it('rescans lazily materialized workspace tools on every invocation', async () => {
    exporter.reset();
    const first = {
      id: 'first-skill-tool',
      execute: async () => 'first',
    };
    const second = {
      id: 'second-skill-tool',
      execute: async () => 'second',
    };
    let current = first;
    const agent = wrapMastra({
      name: 'lazy-tools-agent',
      listTools: () => ({ current }),
      generate: async function () {
        await this.listTools().current.execute({});
        return { text: 'done' };
      },
    });

    await agent.generate('first');
    current = second;
    await agent.generate('second');

    expect(
      exporter
        .getFinishedSpans()
        .filter((span) => span.name.startsWith('mastra.tool.'))
        .map((span) => span.name),
    ).toEqual([
      'mastra.tool.first-skill-tool',
      'mastra.tool.second-skill-tool',
    ]);
  });
});
