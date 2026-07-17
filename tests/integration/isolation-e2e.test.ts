/**
 * End-to-end isolation harness.
 *
 * Stands up a *foreign* global OpenTelemetry provider (simulating a co-tenant
 * like Datadog) alongside Neatlogs' private provider, then drives the
 * newly-rewired public surfaces — the `span()`/`trace()` decorators and the
 * LangChain callback handler — while a foreign span is active. Asserts the
 * three isolation guarantees for every surface:
 *
 *   (a) Neatlogs spans never reach the foreign exporter.
 *   (b) Foreign spans never reach the Neatlogs exporter.
 *   (c) Neatlogs spans are never parented to the active foreign span
 *       (distinct trace id; roots stay parentless).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { trace as otelTrace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import { getTracerProvider, init, shutdown } from '../../src/init.js';
import { span, trace } from '../../src/index.js';
import { langchainHandler } from '../../src/langchain.js';

let foreignProvider: NodeTracerProvider;
let foreignExporter: InMemorySpanExporter;
let neatlogsExporter: InMemorySpanExporter;

beforeAll(async () => {
  // Foreign co-tenant owns the process-global provider.
  foreignExporter = new InMemorySpanExporter();
  foreignProvider = new NodeTracerProvider();
  foreignProvider.addSpanProcessor(new SimpleSpanProcessor(foreignExporter));
  foreignProvider.register();

  await init({
    apiKey: 'test-key',
    workflowName: 'isolation-e2e',
    disableExport: true,
    registerShutdownHandlers: false,
  });

  // Attach our own in-memory exporter to the private Neatlogs provider.
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
  const found = spans.find((candidate) => candidate.name === name);
  expect(found, `missing span ${name}`).toBeDefined();
  return found!;
}

/** No Neatlogs span leaked into the foreign exporter, and vice versa. */
function assertNoCrossExport(neatlogsNames: string[]): void {
  const foreignNames = foreignExporter.getFinishedSpans().map((s) => s.name);
  const neatNames = neatlogsExporter.getFinishedSpans().map((s) => s.name);
  // Foreign exporter only ever sees the one foreign span.
  expect(foreignNames).toEqual(['foreign.request']);
  // Neatlogs exporter never sees the foreign span.
  expect(neatNames).not.toContain('foreign.request');
  for (const name of neatlogsNames) {
    expect(neatNames).toContain(name);
    expect(foreignNames).not.toContain(name);
  }
}

describe('End-to-end provider isolation', () => {
  it('span() decorators stay isolated from an active foreign trace', async () => {
    const inner = span({ kind: 'TOOL', name: 'inner-tool' }, async (x: number) => x + 1);
    const outer = span({ kind: 'WORKFLOW', name: 'outer-flow' }, async () => {
      return inner(41);
    });

    const foreignTracer = otelTrace.getTracer('foreign-observability');
    let result: number | undefined;
    await foreignTracer.startActiveSpan('foreign.request', async (fspan) => {
      result = await outer();
      fspan.end();
    });

    expect(result).toBe(42);

    const neatlogsSpans = neatlogsExporter.getFinishedSpans();
    const outerSpan = findSpan(neatlogsSpans, 'outer-flow');
    const innerSpan = findSpan(neatlogsSpans, 'inner-tool');
    const foreignSpan = foreignExporter.getFinishedSpans()[0];

    // (c) root parentless; child nests under the neatlogs root, not the foreign span.
    expect(outerSpan.parentSpanId).toBeUndefined();
    expect(innerSpan.parentSpanId).toBe(outerSpan.spanContext().spanId);
    expect(outerSpan.spanContext().traceId).not.toBe(
      foreignSpan.spanContext().traceId,
    );
    expect(innerSpan.spanContext().traceId).toBe(
      outerSpan.spanContext().traceId,
    );

    // (a) + (b)
    assertNoCrossExport(['outer-flow', 'inner-tool']);
  });

  it('trace() blocks stay isolated from an active foreign trace', async () => {
    const foreignTracer = otelTrace.getTracer('foreign-observability');
    await foreignTracer.startActiveSpan('foreign.request', async (fspan) => {
      await trace({ name: 'manual-trace', kind: 'CHAIN' }, async () => {
        await span({ kind: 'TOOL', name: 'nested-tool' }, async () => 'ok')();
      });
      fspan.end();
    });

    const neatlogsSpans = neatlogsExporter.getFinishedSpans();
    const traceSpan = findSpan(neatlogsSpans, 'manual-trace');
    const toolSpan = findSpan(neatlogsSpans, 'nested-tool');
    const foreignSpan = foreignExporter.getFinishedSpans()[0];

    expect(traceSpan.parentSpanId).toBeUndefined();
    expect(toolSpan.parentSpanId).toBe(traceSpan.spanContext().spanId);
    expect(traceSpan.spanContext().traceId).not.toBe(
      foreignSpan.spanContext().traceId,
    );

    assertNoCrossExport(['manual-trace', 'nested-tool']);
  });

  it('trace({ kind: LLM, promptTemplate }) stamps prompt-template attrs on the trace span itself', async () => {
    // Many repo examples use trace() AS the LLM span. The processor classifies
    // LLM spans in onStart (fired by startSpan, before the callback sets the
    // kind), so the kind must be seeded at creation or the prompt attributes are
    // dropped. This is the isolated-mode path: values ride the private context.
    await trace(
      {
        name: 'llm-trace',
        kind: 'LLM' as any,
        promptTemplate: 'Answer as {{persona}}: {{q}}',
        promptVariables: { persona: 'pirate', q: 'why is the sea salty?' },
        version: 'v7',
      },
      async () => 'arrr, minerals',
    );

    const traceSpan = findSpan(neatlogsExporter.getFinishedSpans(), 'llm-trace');
    expect(traceSpan.attributes['openinference.span.kind']).toBe('LLM');
    expect(traceSpan.attributes['llm.prompt_template']).toBe(
      'Answer as {{persona}}: {{q}}',
    );
    expect(traceSpan.attributes['llm.prompt_template_variables']).toBe(
      JSON.stringify({ persona: 'pirate', q: 'why is the sea salty?' }),
    );
    expect(traceSpan.attributes['llm.prompt_template.version']).toBe('v7');
  });

  it('LangChain handler auto-roots and stays isolated from a foreign trace', async () => {
    const handler = langchainHandler();

    const foreignTracer = otelTrace.getTracer('foreign-observability');
    await foreignTracer.startActiveSpan('foreign.request', async (fspan) => {
      // A chain run with a nested chat-model call (chain is root-eligible → no auto-root).
      await handler.handleChainStart({ name: 'graph' }, { q: 'hi' }, 'run-chain');
      await handler.handleChatModelStart(
        { kwargs: { model: 'gpt-4o' } },
        [[{ content: 'hi', _getType: () => 'human' }]],
        'run-llm',
        'run-chain',
      );
      await handler.handleLLMEnd(
        { generations: [[{ message: { content: 'hello' } }]] },
        'run-llm',
      );
      await handler.handleChainEnd({ a: 1 }, 'run-chain');
      fspan.end();
    });

    const neatlogsSpans = neatlogsExporter.getFinishedSpans();
    const chainSpan = findSpan(neatlogsSpans, 'langchain.chain.graph');
    const llmSpan = findSpan(neatlogsSpans, 'langchain.chat_model');
    const foreignSpan = foreignExporter.getFinishedSpans()[0];

    expect(chainSpan.parentSpanId).toBeUndefined();
    expect(llmSpan.parentSpanId).toBe(chainSpan.spanContext().spanId);
    expect(chainSpan.spanContext().traceId).not.toBe(
      foreignSpan.spanContext().traceId,
    );

    assertNoCrossExport(['langchain.chain.graph', 'langchain.chat_model']);
  });

  it('LangChain bare LLM run opens an isolated auto-root WORKFLOW', async () => {
    const handler = langchainHandler();

    const foreignTracer = otelTrace.getTracer('foreign-observability');
    await foreignTracer.startActiveSpan('foreign.request', async (fspan) => {
      // No chain above → LLM is parentless & non-root → auto-root fires.
      await handler.handleChatModelStart(
        { kwargs: { model: 'gpt-4o' } },
        [[{ content: 'hi', _getType: () => 'human' }]],
        'run-bare-llm',
      );
      await handler.handleLLMEnd(
        { generations: [[{ message: { content: 'hello' } }]] },
        'run-bare-llm',
      );
      fspan.end();
    });

    const neatlogsSpans = neatlogsExporter.getFinishedSpans();
    // Auto-root uses the configured workflowName.
    const rootSpan = findSpan(neatlogsSpans, 'isolation-e2e');
    const llmSpan = findSpan(neatlogsSpans, 'langchain.chat_model');
    const foreignSpan = foreignExporter.getFinishedSpans()[0];

    expect(rootSpan.attributes['neatlogs.auto_root']).toBe(true);
    expect(rootSpan.parentSpanId).toBeUndefined();
    expect(llmSpan.parentSpanId).toBe(rootSpan.spanContext().spanId);
    expect(rootSpan.spanContext().traceId).not.toBe(
      foreignSpan.spanContext().traceId,
    );

    assertNoCrossExport(['isolation-e2e', 'langchain.chat_model']);
  });

  it('LangChain handler nests under an enclosing Neatlogs trace (High-4), not the foreign span', async () => {
    const handler = langchainHandler();

    const foreignTracer = otelTrace.getTracer('foreign-observability');
    await foreignTracer.startActiveSpan('foreign.request', async (fspan) => {
      // A Neatlogs trace() encloses the handler run. The handler threads its own
      // parent linkage via getNeatlogsBaseContext(), which now returns the ACTIVE
      // private context — so the bare LLM run must nest under THIS trace instead of
      // opening its own auto-root, while still ignoring the active foreign span.
      await trace({ kind: 'WORKFLOW', name: 'enclosing-trace' }, async () => {
        await handler.handleChatModelStart(
          { kwargs: { model: 'gpt-4o' } },
          [[{ content: 'hi', _getType: () => 'human' }]],
          'run-enclosed-llm',
        );
        await handler.handleLLMEnd(
          { generations: [[{ message: { content: 'hello' } }]] },
          'run-enclosed-llm',
        );
      });
      fspan.end();
    });

    const neatlogsSpans = neatlogsExporter.getFinishedSpans();
    const traceSpan = findSpan(neatlogsSpans, 'enclosing-trace');
    const llmSpan = findSpan(neatlogsSpans, 'langchain.chat_model');
    const foreignSpan = foreignExporter.getFinishedSpans()[0];

    // No auto-root: the LLM run nested under the enclosing Neatlogs trace instead.
    expect(
      neatlogsSpans.some((s) => s.name === 'isolation-e2e'),
    ).toBe(false);
    expect(traceSpan.parentSpanId).toBeUndefined();
    expect(llmSpan.parentSpanId).toBe(traceSpan.spanContext().spanId);
    // Same Neatlogs trace, and never the foreign trace.
    expect(llmSpan.spanContext().traceId).toBe(traceSpan.spanContext().traceId);
    expect(traceSpan.spanContext().traceId).not.toBe(
      foreignSpan.spanContext().traceId,
    );

    assertNoCrossExport(['enclosing-trace', 'langchain.chat_model']);
  });
});
