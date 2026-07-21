import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { trace as otelTrace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import { getTracerProvider, init, shutdown } from '../../src/init.js';
import { wrapMastra } from '../../src/mastra-wrap.js';

let foreignProvider: NodeTracerProvider;
let foreignExporter: InMemorySpanExporter;
let neatlogsExporter: InMemorySpanExporter;

beforeAll(async () => {
  foreignExporter = new InMemorySpanExporter();
  foreignProvider = new NodeTracerProvider();
  foreignProvider.addSpanProcessor(new SimpleSpanProcessor(foreignExporter));
  foreignProvider.register();

  await init({
    apiKey: 'test-key',
    disableExport: true,
    registerShutdownHandlers: false,
  });

  neatlogsExporter = new InMemorySpanExporter();
  getTracerProvider().addSpanProcessor(
    new SimpleSpanProcessor(neatlogsExporter),
  );
});

afterAll(async () => {
  await shutdown();
  await foreignProvider.shutdown();
});

beforeEach(() => {
  foreignExporter.reset();
  neatlogsExporter.reset();
});

function findSpan(spans: ReadableSpan[], name: string): ReadableSpan {
  const span = spans.find((candidate) => candidate.name === name);
  expect(span, `missing span ${name}`).toBeDefined();
  return span!;
}

describe('Mastra provider isolation', () => {
  it('keeps the Neatlogs agent tree separate from an active foreign trace', async () => {
    const model = {
      modelId: 'test-model',
      provider: 'test-provider',
      doGenerate: async () => ({
        text: 'done',
        usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
      }),
    };
    const llm = { getModel: () => model };
    const agent = wrapMastra({
      name: 'isolated-agent',
      model,
      getLLM: async () => llm,
      generate: async function () {
        const resolved = await this.getLLM();
        return resolved.getModel().doGenerate({
          prompt: [{ role: 'user', content: 'run' }],
        });
      },
    });

    const foreignTracer = otelTrace.getTracer('foreign-observability');
    await foreignTracer.startActiveSpan('foreign.request', async (span) => {
      await agent.generate('run');
      span.end();
    });

    const foreignSpans = foreignExporter.getFinishedSpans();
    expect(foreignSpans.map((span) => span.name)).toEqual(['foreign.request']);

    const neatlogsSpans = neatlogsExporter.getFinishedSpans();
    const agentSpan = findSpan(
      neatlogsSpans,
      'mastra.agent.isolated-agent',
    );
    const llmSpan = findSpan(
      neatlogsSpans,
      'mastra.llm.test-model.doGenerate',
    );

    expect(agentSpan.parentSpanId).toBeUndefined();
    expect(llmSpan.parentSpanId).toBe(agentSpan.spanContext().spanId);
    expect(agentSpan.spanContext().traceId).not.toBe(
      foreignSpans[0].spanContext().traceId,
    );
  });

  it('flattens the model prompt into indexed input_messages (system first)', async () => {
    const model = {
      modelId: 'test-model',
      provider: 'test-provider',
      doGenerate: async () => ({ text: 'ok' }),
    };
    const llm = { getModel: () => model };
    const agent = wrapMastra({
      name: 'prompt-agent',
      model,
      instructions: 'You are Ari.',
      getLLM: async () => llm,
      generate: async function () {
        const resolved = await this.getLLM();
        return resolved.getModel().doGenerate({
          prompt: [
            { role: 'system', content: 'You are Ari.' },
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
          ],
        });
      },
    });

    await agent.generate('hello');

    const llmSpan = findSpan(
      neatlogsExporter.getFinishedSpans(),
      'mastra.llm.test-model.doGenerate',
    );
    const attrs = llmSpan.attributes;
    expect(attrs['neatlogs.llm.input_messages.0.role']).toBe('system');
    expect(attrs['neatlogs.llm.input_messages.0.content']).toBe('You are Ari.');
    expect(attrs['neatlogs.llm.input_messages.1.role']).toBe('user');
    expect(attrs['neatlogs.llm.input_messages.1.content']).toBe('hello');
  });

  it('captures tools supplied dynamically through stream options', async () => {
    const dynamicTool = {
      id: 'org-search',
      execute: async (input: unknown) => ({ input, matches: 2 }),
    };
    const agent = wrapMastra({
      name: 'dynamic-tool-agent',
      generate: async (_input: unknown, options?: any) =>
        options.toolsets.org.search.execute({ query: 'forecast' }),
    });

    await agent.generate('search', {
      toolsets: { org: { search: dynamicTool } },
    });

    const spans = neatlogsExporter.getFinishedSpans();
    const agentSpan = findSpan(spans, 'mastra.agent.dynamic-tool-agent');
    const toolSpan = findSpan(spans, 'mastra.tool.org-search');
    expect(toolSpan.parentSpanId).toBe(agentSpan.spanContext().spanId);
  });
});
