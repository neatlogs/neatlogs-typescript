/**
 * End-to-end isolation harness — direct-provider wrappers + framework handlers.
 *
 * Companion to isolation-e2e.test.ts (which covers the decorators and the
 * LangChain handler). Stands up a foreign global OpenTelemetry provider
 * (simulating Datadog/Braintrust) alongside Neatlogs' private provider and
 * drives every remaining rewired surface *while a foreign span is active*,
 * asserting the same three isolation guarantees each time:
 *
 *   (a) Neatlogs spans never reach the foreign exporter.
 *   (b) The foreign span never reaches the Neatlogs exporter.
 *   (c) Neatlogs spans get their own trace id (never parented to the foreign
 *       active span) and each run has exactly one parentless root.
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
import { wrapOpenAI } from '../../src/openai.js';
import { wrapAnthropic } from '../../src/anthropic.js';
import { wrapAzureOpenAI } from '../../src/azure-openai.js';
import { wrapVertexAI } from '../../src/vertex-ai.js';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { wrapBedrock } from '../../src/bedrock.js';
import { wrapOpenRouterAgent } from '../../src/openrouter-agent.js';
import { wrapClaudeAgentSDK } from '../../src/claude-agent-sdk.js';
import { wrapAISDK } from '../../src/ai-sdk.js';
import { openaiAgentsProcessor } from '../../src/openai-agents.js';
import { piAgentHooks } from '../../src/pi-agent.js';

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
    workflowName: 'isolation-integrations-e2e',
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

/**
 * Run `drive` inside an active foreign span and assert the three isolation
 * guarantees. `drive` should exercise a single Neatlogs surface and produce at
 * least one Neatlogs span.
 */
async function assertIsolated(drive: () => Promise<void> | void): Promise<void> {
  const foreignTracer = otelTrace.getTracer('foreign-observability');
  await foreignTracer.startActiveSpan('foreign.request', async (fspan) => {
    try {
      await drive();
    } finally {
      fspan.end();
    }
  });

  const foreignSpans = foreignExporter.getFinishedSpans();
  const neatlogsSpans = neatlogsExporter.getFinishedSpans();

  // (a) foreign exporter only ever sees the foreign span.
  expect(foreignSpans.map((s) => s.name)).toEqual(['foreign.request']);
  // (b) neatlogs exporter never sees the foreign span.
  expect(neatlogsSpans.map((s) => s.name)).not.toContain('foreign.request');
  // Sanity: the surface actually produced Neatlogs spans.
  expect(neatlogsSpans.length).toBeGreaterThan(0);

  const foreignTraceId = foreignSpans[0].spanContext().traceId;
  const neatTraceIds = new Set(
    neatlogsSpans.map((s) => s.spanContext().traceId),
  );
  // (c) Neatlogs spans never share the foreign trace; each run has exactly one
  // parentless root, and every child parents within the Neatlogs trace.
  expect(neatTraceIds.has(foreignTraceId)).toBe(false);
  const neatSpanIds = new Set(
    neatlogsSpans.map((s) => s.spanContext().spanId),
  );
  const roots = neatlogsSpans.filter((s) => !parentId(s));
  expect(roots.length).toBe(1);
  for (const s of neatlogsSpans) {
    const pid = parentId(s);
    if (pid) {
      // A parent must be another Neatlogs span, never the foreign span.
      expect(neatSpanIds.has(pid)).toBe(true);
    }
  }
}

function parentId(span: ReadableSpan): string | undefined {
  // OTel renamed `parentSpanId` → `parentSpanContext.spanId` across versions.
  return (
    (span as any).parentSpanId ??
    (span as any).parentSpanContext?.spanId
  );
}

// ---------------------------------------------------------------------------
// Direct-provider wrappers
// ---------------------------------------------------------------------------

describe('Direct-provider wrapper isolation', () => {
  it('wrapOpenAI', async () => {
    await assertIsolated(async () => {
      const client = wrapOpenAI({
        chat: {
          completions: {
            create: async () => ({
              model: 'gpt-4o',
              choices: [
                { message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' },
              ],
              usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
            }),
          },
        },
      } as any);
      await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      });
    });
  });

  it('wrapAnthropic', async () => {
    await assertIsolated(async () => {
      const client = wrapAnthropic({
        messages: {
          create: async () => ({
            model: 'claude-sonnet-4',
            content: [{ type: 'text', text: 'hello' }],
            usage: { input_tokens: 5, output_tokens: 2 },
            stop_reason: 'end_turn',
          }),
        },
      } as any);
      await (client as any).messages.create({
        model: 'claude-sonnet-4',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'hi' }],
      });
    });
  });

  it('wrapAzureOpenAI', async () => {
    await assertIsolated(async () => {
      const client = wrapAzureOpenAI({
        chat: {
          completions: {
            create: async () => ({
              model: 'gpt-4o',
              choices: [
                { message: { role: 'assistant', content: 'hi azure' }, finish_reason: 'stop' },
              ],
              usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
            }),
          },
        },
      } as any);
      await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      });
    });
  });

  it('wrapVertexAI', async () => {
    await assertIsolated(async () => {
      const client = wrapVertexAI({
        models: {
          generateContent: async () => ({
            candidates: [
              { content: { parts: [{ text: 'from vertex' }] }, finishReason: 'STOP' },
            ],
            usageMetadata: {
              promptTokenCount: 6,
              candidatesTokenCount: 3,
              totalTokenCount: 9,
            },
          }),
        },
      } as any);
      await (client as any).models.generateContent({
        model: 'gemini-2.0-flash',
        contents: 'hi vertex',
      });
    });
  });

  it('wrapGoogleGenAI', async () => {
    await assertIsolated(async () => {
      const client = wrapGoogleGenAI({
        models: {
          generateContent: async () => ({
            candidates: [
              { content: { parts: [{ text: 'from gemini' }] }, finishReason: 'STOP' },
            ],
            usageMetadata: {
              promptTokenCount: 7,
              candidatesTokenCount: 2,
              totalTokenCount: 9,
            },
          }),
        },
      } as any);
      await (client as any).models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'hi gemini',
      });
    });
  });

  it('wrapBedrock', async () => {
    await assertIsolated(async () => {
      class ConverseCommand {
        input: any;
        constructor(input: any) {
          this.input = input;
        }
      }
      const client = wrapBedrock({
        send: async () => ({
          output: {
            message: { role: 'assistant', content: [{ text: 'from bedrock' }] },
          },
          stopReason: 'end_turn',
          usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
        }),
      } as any);
      await (client as any).send(
        new ConverseCommand({
          modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          messages: [{ role: 'user', content: [{ text: 'hi' }] }],
        }),
      );
    });
  });

  it('wrapOpenRouterAgent', async () => {
    await assertIsolated(async () => {
      const client = wrapOpenRouterAgent({
        callModel: async () => ({ text: 'from openrouter' }),
      } as any);
      const result = await (client as any).callModel({
        model: 'openai/gpt-4o',
        input: 'hi openrouter',
      });
      // Consume the result so the deferred span finalizes.
      if (result && typeof result.then !== 'function') void result.text;
    });
  });
});

// ---------------------------------------------------------------------------
// Framework handlers
// ---------------------------------------------------------------------------

describe('Framework handler isolation', () => {
  it('wrapClaudeAgentSDK', async () => {
    await assertIsolated(async () => {
      async function* fakeQuery() {
        yield { type: 'system', session_id: 'sess-1', model: 'claude-sonnet-4' };
        yield {
          type: 'assistant',
          message: {
            model: 'claude-sonnet-4',
            content: [{ type: 'text', text: 'hello' }],
            usage: { input_tokens: 10, output_tokens: 3 },
          },
        };
        yield {
          type: 'result',
          result: 'hello',
          session_id: 'sess-1',
          usage: { input_tokens: 10, output_tokens: 3 },
        };
      }
      const { query } = wrapClaudeAgentSDK({ query: () => fakeQuery() } as any);
      for await (const _msg of query({ prompt: 'hi' })) {
        void _msg;
      }
    });
  });

  it('openaiAgentsProcessor', async () => {
    await assertIsolated(async () => {
      const proc = openaiAgentsProcessor();
      proc.onTraceStart({ traceId: 't-1', name: 'my-workflow' });
      proc.onSpanStart({
        spanId: 's-1',
        traceId: 't-1',
        spanData: { type: 'agent', name: 'planner' },
      });
      proc.onSpanEnd({
        spanId: 's-1',
        traceId: 't-1',
        spanData: { type: 'agent', name: 'planner', output: 'done' },
      });
      proc.onTraceEnd({ traceId: 't-1' });
    });
  });

  it('piAgentHooks', async () => {
    await assertIsolated(async () => {
      let listener: ((e: any) => void) | undefined;
      const agent = { subscribe: (fn: (e: any) => void) => { listener = fn; } };
      piAgentHooks(agent);
      const emit = (e: any) => listener?.(e);
      emit({ type: 'agent_start' });
      emit({
        type: 'message_end',
        message: {
          role: 'assistant',
          model: 'gpt-4o',
          content: [{ type: 'text', text: 'hello' }],
          usage: { input: 5, output: 2 },
        },
      });
      emit({
        type: 'agent_end',
        messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hello' }] }],
      });
    });
  });

  it('wrapAISDK generateText', async () => {
    await assertIsolated(async () => {
      const { generateText } = wrapAISDK({
        generateText: async () => ({ text: 'hello', finishReason: 'stop' }),
      });
      await (generateText as any)({ prompt: 'hi' });
    });
  });
});
