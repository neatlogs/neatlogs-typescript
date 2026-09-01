import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import { wrapAzureOpenAI } from '../../src/azure-openai.js';
import { wrapVertexAI } from '../../src/vertex-ai.js';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { wrapBedrock, traceTool as traceToolBedrock } from '../../src/bedrock.js';
import { wrapClaudeAgentSDK } from '../../src/claude-agent-sdk.js';
import { wrapOpenRouterAgent } from '../../src/openrouter-agent.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';
import { discardPendingMedia } from '../../src/core/media.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;

let prevAutoRoot: string | undefined;

beforeAll(() => {
  // Attribute-mapping tests on bare wrappers. Auto-root would add a WORKFLOW
  // parent span; disable it so span counts reflect the wrapper alone.
  prevAutoRoot = process.env.NEATLOGS_AUTO_ROOT;
  process.env.NEATLOGS_AUTO_ROOT = 'false';
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});

afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
  if (prevAutoRoot === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
  else process.env.NEATLOGS_AUTO_ROOT = prevAutoRoot;
});

beforeEach(() => {
  exporter.reset();
});

function getSpans(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}
function attr(span: ReadableSpan, key: string): any {
  return span.attributes[key];
}

// ---------------------------------------------------------------------------
// Azure OpenAI
// ---------------------------------------------------------------------------

describe('wrapAzureOpenAI', () => {
  it('traces chat.completions.create with provider=azure', async () => {
    const fakeResponse = {
      model: 'gpt-4o',
      choices: [{ message: { role: 'assistant', content: 'Hi from Azure!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
    };
    const fakeClient = {
      chat: { completions: { create: async () => fakeResponse } },
    };

    const wrapped = wrapAzureOpenAI(fakeClient as any);
    const imageBytes = Buffer.from('azure-image');
    const result = await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${imageBytes.toString('base64')}` },
          },
        ],
      }],
      temperature: 0.5,
    } as any);
    expect(result).toEqual(fakeResponse);

    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(attr(spans[0], 'neatlogs.span.kind')).toBe('LLM');
    expect(attr(spans[0], 'neatlogs.llm.provider')).toBe('azure');
    expect(attr(spans[0], 'neatlogs.llm.output_messages.0.content')).toBe('Hi from Azure!');
    expect(attr(spans[0], 'neatlogs.llm.input_messages.0.media.0.mime_type')).toBe('image/png');
    expect(attr(spans[0], 'neatlogs.llm.token_count.prompt')).toBe(11);
    expect(attr(spans[0], 'neatlogs.llm.temperature')).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Vertex AI
// ---------------------------------------------------------------------------

describe('wrapVertexAI', () => {
  it('traces models.generateContent with provider=vertex_ai', async () => {
    const fakeResponse = {
      candidates: [
        {
          content: { parts: [{ text: 'Hello from Vertex' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 14, candidatesTokenCount: 5, totalTokenCount: 19 },
    };
    const fakeClient = {
      models: { generateContent: async () => fakeResponse },
    };

    const wrapped = wrapVertexAI(fakeClient as any);
    const documentBytes = Buffer.from('vertex-document');
    const result = await (wrapped as any).models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [
          { text: 'Hi Vertex' },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: documentBytes.toString('base64'),
            },
          },
        ],
      }],
    });
    expect(result).toEqual(fakeResponse);

    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(attr(spans[0], 'neatlogs.span.kind')).toBe('LLM');
    expect(attr(spans[0], 'neatlogs.llm.provider')).toBe('vertex_ai');
    expect(attr(spans[0], 'neatlogs.llm.system')).toBe('vertexai');
    expect(attr(spans[0], 'neatlogs.llm.model_name')).toBe('gemini-2.0-flash');
    expect(attr(spans[0], 'neatlogs.llm.input_messages.0.content')).toBe('Hi Vertex');
    expect(attr(spans[0], 'neatlogs.llm.input_messages.0.media.0.mime_type')).toBe('application/pdf');
    expect(attr(spans[0], 'neatlogs.llm.output_messages.0.content')).toBe('Hello from Vertex');
    expect(attr(spans[0], 'neatlogs.llm.token_count.prompt')).toBe(14);
    expect(attr(spans[0], 'neatlogs.llm.token_count.total')).toBe(19);
  });

  it('traces embedContent as EMBEDDING', async () => {
    const fakeClient = {
      models: {
        embedContent: async () => ({ embeddings: [{ values: [0.1, 0.2, 0.3] }] }),
      },
    };
    const wrapped = wrapVertexAI(fakeClient as any);
    await (wrapped as any).models.embedContent({ model: 'text-embedding-004', contents: 'hello' });

    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(attr(spans[0], 'neatlogs.span.kind')).toBe('EMBEDDING');
    expect(attr(spans[0], 'neatlogs.embedding.count')).toBe(1);
    expect(attr(spans[0], 'neatlogs.embedding.dimensions')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Google GenAI
// ---------------------------------------------------------------------------

describe('wrapGoogleGenAI', () => {
  it('captures typed inline media without changing the provider response', async () => {
    const response = {
      candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
    };
    const wrapped = wrapGoogleGenAI({
      models: { generateContent: async () => response },
    } as any);
    const imageBytes = Buffer.from('gemini-image');

    await (wrapped as any).models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [{
          inlineData: {
            mimeType: 'image/png',
            data: imageBytes.toString('base64'),
          },
        }],
      }],
    });

    const spans = getSpans();
    expect(spans).toHaveLength(1);
    expect(attr(spans[0], 'neatlogs.llm.provider')).toBe('google');
    expect(attr(spans[0], 'neatlogs.llm.input_messages.0.media.0.mime_type')).toBe('image/png');
  });

  it.each([
    ['google', wrapGoogleGenAI],
    ['vertex_ai', wrapVertexAI],
  ] as const)(
    'captures %s streamed typed media without retaining provider chunks',
    async (expectedProvider, wrapProvider) => {
      const raw = Buffer.alloc(120_000, expectedProvider === 'google' ? 31 : 32);
      const stream = (async function* () {
        yield {
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  mimeType: 'image/png',
                  data: raw.toString('base64'),
                },
              }],
            },
          }],
        };
        yield {
          candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }],
        };
      })();
      const wrapped = wrapProvider({
        models: { generateContentStream: async () => stream },
      } as any);

      const response = await (wrapped as any).models.generateContentStream({
        model: 'gemini-test',
        contents: 'hello',
      });
      for await (const _chunk of response) {
        // Consume the provider stream to finalization.
      }

      const span = getSpans()[0];
      expect(attr(span, 'neatlogs.llm.provider')).toBe(expectedProvider);
      expect(attr(span, 'neatlogs.llm.output_messages.0.media.0.state')).toBe(
        'pending-upload',
      );
      expect(attr(span, 'neatlogs.llm.output_messages.0.content')).toBe('done');
      expect(JSON.stringify(span.attributes)).not.toContain(raw.toString('base64').slice(0, 100));
      discardPendingMedia(span as object);
    },
  );
});

// ---------------------------------------------------------------------------
// Bedrock
// ---------------------------------------------------------------------------

describe('wrapBedrock', () => {
  function fakeBedrockClient(sendImpl: (cmd: any) => any) {
    return { send: sendImpl, _meta: 'bedrock' };
  }

  it('traces a ConverseCommand', async () => {
    class ConverseCommand {
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    }
    const client = fakeBedrockClient(async () => ({
      output: {
        message: {
          role: 'assistant',
          content: [
            { text: 'Hello from Claude on Bedrock' },
            { image: { format: 'png', source: { bytes: Buffer.from('bedrock-image') } } },
          ],
        },
      },
      stopReason: 'end_turn',
      usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
    }));

    const wrapped = wrapBedrock(client as any);
    const result = await (wrapped as any).send(
      new ConverseCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        messages: [{ role: 'user', content: [{ text: 'Hi' }] }],
        inferenceConfig: { temperature: 0.7, maxTokens: 256 },
      }),
    );
    expect(result.stopReason).toBe('end_turn');

    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(attr(spans[0], 'neatlogs.span.kind')).toBe('LLM');
    expect(attr(spans[0], 'neatlogs.llm.provider')).toBe('bedrock');
    expect(attr(spans[0], 'neatlogs.llm.system')).toBe('anthropic');
    expect(attr(spans[0], 'neatlogs.llm.input_messages.0.content')).toBe('Hi');
    expect(attr(spans[0], 'neatlogs.llm.output_messages.0.content')).toBe('Hello from Claude on Bedrock');
    expect(attr(spans[0], 'neatlogs.llm.output_messages.0.media.0.mime_type')).toBe('image/png');
    expect(attr(spans[0], 'neatlogs.llm.token_count.prompt')).toBe(20);
    expect(attr(spans[0], 'neatlogs.llm.token_count.completion')).toBe(8);
    expect(attr(spans[0], 'neatlogs.llm.finish_reason')).toBe('end_turn');
  });

  it('traces an InvokeModelCommand (Claude messages) and preserves the body', async () => {
    class InvokeModelCommand {
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    }
    const respBody = new TextEncoder().encode(
      JSON.stringify({
        content: [{ type: 'text', text: 'Invoke output' }],
        usage: { input_tokens: 12, output_tokens: 6 },
        stop_reason: 'end_turn',
      }),
    );
    const client = fakeBedrockClient(async () => ({ body: respBody }));
    const wrapped = wrapBedrock(client as any);
    const result = await (wrapped as any).send(
      new InvokeModelCommand({
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100 }),
      }),
    );
    // Body still readable downstream.
    expect(JSON.parse(new TextDecoder().decode(result.body)).content[0].text).toBe('Invoke output');

    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(attr(spans[0], 'neatlogs.llm.system')).toBe('anthropic');
    expect(attr(spans[0], 'neatlogs.llm.output_messages.0.content')).toBe('Invoke output');
    expect(attr(spans[0], 'neatlogs.llm.token_count.prompt')).toBe(12);
  });

  it('labels embedding models as EMBEDDING', async () => {
    class InvokeModelCommand {
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    }
    const respBody = new TextEncoder().encode(JSON.stringify({ embedding: [0.1, 0.2], inputTextTokenCount: 3 }));
    const client = fakeBedrockClient(async () => ({ body: respBody }));
    const wrapped = wrapBedrock(client as any);
    await (wrapped as any).send(
      new InvokeModelCommand({ modelId: 'amazon.titan-embed-text-v2:0', body: JSON.stringify({ inputText: 'hi' }) }),
    );

    const spans = getSpans();
    expect(attr(spans[0], 'neatlogs.span.kind')).toBe('EMBEDDING');
    expect(attr(spans[0], 'neatlogs.embedding.dimensions')).toBe(2);
  });

  it('traceTool emits a TOOL span', async () => {
    const getWeather = traceToolBedrock('get_weather', async (a: { city: string }) => `Sunny in ${a.city}`);
    const out = await getWeather({ city: 'NYC' });
    expect(out).toBe('Sunny in NYC');
    const spans = getSpans();
    expect(spans.length).toBe(1);
    expect(attr(spans[0], 'neatlogs.span.kind')).toBe('TOOL');
    expect(attr(spans[0], 'neatlogs.tool.name')).toBe('get_weather');
  });
});

// ---------------------------------------------------------------------------
// Claude Agent SDK
// ---------------------------------------------------------------------------

describe('wrapClaudeAgentSDK', () => {
  it('produces AGENT + LLM + TOOL spans from a query stream', async () => {
    async function* fakeQuery() {
      yield { type: 'system', session_id: 'sess-1', model: 'claude-sonnet-4' };
      yield {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4',
          content: [
            { type: 'text', text: 'Let me check the weather.' },
            { type: 'tool_use', id: 'tu_1', name: 'get_weather', input: { city: 'Paris' } },
          ],
          usage: { input_tokens: 30, output_tokens: 12 },
          stop_reason: 'tool_use',
        },
      };
      yield {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '18C' }] },
      };
      yield {
        type: 'assistant',
        message: { model: 'claude-sonnet-4', content: [{ type: 'text', text: "It's 18C in Paris." }], usage: { input_tokens: 45, output_tokens: 8 } },
      };
      yield {
        type: 'result',
        result: "It's 18C in Paris.",
        session_id: 'sess-1',
        usage: { input_tokens: 75, output_tokens: 20 },
        total_cost_usd: 0.002,
        num_turns: 2,
      };
    }

    const fakeSDK = { query: (_params: any) => fakeQuery() };
    const { query } = wrapClaudeAgentSDK(fakeSDK as any);

    const collected: any[] = [];
    for await (const msg of query({ prompt: 'Weather in Paris?' })) {
      collected.push(msg);
    }
    expect(collected.length).toBe(5);

    const spans = getSpans();
    const kinds = spans.map((s) => s.attributes['neatlogs.span.kind']).sort();
    // 1 AGENT (root orchestrator) + 2 LLM + 1 TOOL — NO WORKFLOW wrapper.
    expect(kinds).toEqual(['AGENT', 'LLM', 'LLM', 'TOOL']);

    // The AGENT is the trace root (no parent).
    const agent = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'AGENT')!;
    expect((agent as any).parentSpanId).toBeUndefined();
    expect(attr(agent, 'neatlogs.workflow.name')).toBeDefined();
    expect(attr(agent, 'neatlogs.conversation.id')).toBe('sess-1');
    expect(attr(agent, 'input.value')).toBe('Weather in Paris?');
    expect(attr(agent, 'output.value')).toBe("It's 18C in Paris.");
    expect(attr(agent, 'neatlogs.llm.token_count.prompt')).toBe(75);

    const tool = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'TOOL')!;
    expect(attr(tool, 'neatlogs.tool.name')).toBe('get_weather');
    expect(attr(tool, 'output.value')).toBe('18C');

    // The first LLM turn (the tool_use one) had text too, so it has input (the
    // user prompt) AND its real assistant text — plus the structured tool call.
    const llmToolTurn = spans.find(
      (s) => s.attributes['neatlogs.span.kind'] === 'LLM' && s.attributes['neatlogs.llm.tool_calls.0.name'],
    )!;
    expect(attr(llmToolTurn, 'neatlogs.llm.provider')).toBe('anthropic');
    expect(attr(llmToolTurn, 'neatlogs.llm.tool_calls.0.name')).toBe('get_weather');
    expect(attr(llmToolTurn, 'neatlogs.llm.input_messages.0.content')).toBe('Weather in Paris?');
    // Output is the EXACT assistant text — not a synthesized tool-call summary.
    expect(attr(llmToolTurn, 'neatlogs.llm.output_messages.0.content')).toBe('Let me check the weather.');

    // The second LLM turn must see the prior conversation (user + tool result)
    // as indexed input messages, not be input-less.
    const llmFinal = spans.find(
      (s) =>
        s.attributes['neatlogs.span.kind'] === 'LLM' &&
        s.attributes['neatlogs.llm.output_messages.0.content'] === "It's 18C in Paris.",
    )!;
    // Input is present BOTH as indexed messages AND the flat input.value blob —
    // per attribute-mapping.json the UI panel renders neatlogs.{kind}.input from
    // input.value, so the LLM Input must never be blank.
    const inputContents = Object.keys(llmFinal.attributes)
      .filter((k) => /^neatlogs\.llm\.input_messages\.\d+\.content$/.test(k))
      .map((k) => String(llmFinal.attributes[k]));
    expect(inputContents.join('\n')).toContain('Weather in Paris?');
    expect(inputContents.join('\n')).toContain('18C');
    const inputBlob = String(attr(llmFinal, 'input.value'));
    expect(inputBlob).toContain('Weather in Paris?');
    expect(inputBlob).toContain('18C');
  });

  it('renders a tool-only turn output as the exact tool call (no blank output)', async () => {
    // A tool-only turn (no text block) has its tool call as the output — shown as
    // the exact name(arguments) the model emitted, plus the structured
    // tool_calls.* for programmatic use. The two are the SAME call (not a
    // mismatched second output), and live on ONE coalesced LLM span.
    async function* fakeQuery() {
      yield { type: 'system', session_id: 's', model: 'claude-sonnet-4-6' };
      yield {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/x' } }],
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      };
      yield { type: 'result', subtype: 'success', result: 'ok', session_id: 's', is_error: false };
    }
    const { query } = wrapClaudeAgentSDK({ query: () => fakeQuery() } as any);
    for await (const m of query({ prompt: 'read x' })) {
      if (m.type === 'result') break;
    }
    const toolTurn = getSpans().find(
      (s) => s.attributes['neatlogs.span.kind'] === 'LLM' && s.attributes['neatlogs.llm.tool_calls.0.name'] === 'Read',
    )!;
    expect(toolTurn).toBeDefined();
    // The structured tool call.
    expect(attr(toolTurn, 'neatlogs.llm.tool_calls.0.name')).toBe('Read');
    expect(attr(toolTurn, 'neatlogs.llm.tool_calls.0.arguments')).toContain('/x');
    // Output is the exact tool call (not blank, not a vague summary).
    expect(attr(toolTurn, 'output.value')).toBe('Read({"file_path":"/x"})');
    expect(attr(toolTurn, 'neatlogs.llm.output_messages.0.content')).toBe('Read({"file_path":"/x"})');
    // Input is still present (the prompt).
    expect(attr(toolTurn, 'neatlogs.llm.input_messages.0.content')).toBe('read x');
  });

  it('coalesces a model turn split across multiple assistant messages into ONE LLM span', async () => {
    // The Claude Agent SDK delivers a single model turn as multiple `assistant`
    // messages (a text block, then a tool_use block) that share token usage.
    // These must collapse into ONE LLM span — not two adjacent LLM spans whose
    // outputs differ (the "last output doesn't match the previous" bug).
    async function* fakeQuery() {
      yield { type: 'system', session_id: 's', model: 'claude-sonnet-4-6' };
      // ONE model turn, delivered as TWO assistant messages with identical usage:
      yield {
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'Let me read it.' }], usage: { input_tokens: 50, output_tokens: 8 } },
      };
      yield {
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/x' } }], usage: { input_tokens: 50, output_tokens: 8 } },
      };
      // Turn boundary: tool result.
      yield { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'contents' }] } };
      // Final turn (one message).
      yield {
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'All done.' }], usage: { input_tokens: 60, output_tokens: 4 } },
      };
      yield { type: 'result', subtype: 'success', result: 'All done.', session_id: 's', is_error: false };
    }

    const { query } = wrapClaudeAgentSDK({ query: () => fakeQuery() } as any);
    for await (const m of query({ prompt: 'read x' })) {
      if (m.type === 'result') break;
    }

    const llmSpans = getSpans().filter((s) => s.attributes['neatlogs.span.kind'] === 'LLM');
    // Two model turns → exactly TWO LLM spans (not three for three assistant msgs).
    expect(llmSpans.length).toBe(2);

    // First LLM span = the coalesced turn: BOTH the text output AND the tool call.
    const turn1 = llmSpans.find((s) => s.attributes['neatlogs.llm.tool_calls.0.name'] === 'Read')!;
    expect(turn1).toBeDefined();
    expect(attr(turn1, 'neatlogs.llm.output_messages.0.content')).toBe('Let me read it.');
    expect(attr(turn1, 'neatlogs.llm.tool_calls.0.name')).toBe('Read');
    // Usage counted once (not doubled across the two assistant messages).
    expect(attr(turn1, 'neatlogs.llm.token_count.prompt')).toBe(50);
    expect(attr(turn1, 'neatlogs.llm.token_count.completion')).toBe(8);

    // Exactly one TOOL span for the single tool call.
    const toolSpans = getSpans().filter((s) => s.attributes['neatlogs.span.kind'] === 'TOOL');
    expect(toolSpans.length).toBe(1);
    expect(attr(toolSpans[0], 'output.value')).toBe('contents');
  });

  it('nests a subagent (Task tool) as a child AGENT span under its Task TOOL span', async () => {
    // The orchestrator calls the Task tool, which spawns a subagent. Subagent
    // messages carry parent_tool_use_id = the Task tool_use_id. The subagent must
    // become its OWN AGENT span nested under that Task TOOL span — not flattened
    // into the orchestrator. This is the wizard's parallel-edit (editorSubagent) case.
    async function* fakeQuery() {
      yield { type: 'system', session_id: 'sess-2', model: 'claude-sonnet-4-6' };
      // Orchestrator turn: dispatches a Task tool call (id = task_1).
      yield {
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', content: [{ type: 'tool_use', id: 'task_1', name: 'Task', input: { description: 'instrument file A' } }], usage: { input_tokens: 20, output_tokens: 5 } },
      };
      // Subagent messages: parent_tool_use_id = task_1.
      yield {
        type: 'assistant',
        parent_tool_use_id: 'task_1',
        subagent_type: 'instrumentor',
        task_description: 'instrument file A',
        message: { model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'Editing file A' }, { type: 'tool_use', id: 'edit_1', name: 'Edit', input: { file: 'A' } }], usage: { input_tokens: 30, output_tokens: 6 } },
      };
      yield {
        type: 'user',
        parent_tool_use_id: 'task_1',
        message: { content: [{ type: 'tool_result', tool_use_id: 'edit_1', content: 'A edited' }] },
      };
      // Task tool returns to the orchestrator.
      yield {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'task_1', content: 'subagent done' }] },
      };
      // Orchestrator final answer.
      yield {
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'All files instrumented.' }], usage: { input_tokens: 40, output_tokens: 4 } },
      };
      yield { type: 'result', subtype: 'success', result: 'All files instrumented.', session_id: 'sess-2', is_error: false };
    }

    const { query } = wrapClaudeAgentSDK({ query: () => fakeQuery() } as any);
    for await (const m of query({ prompt: 'instrument the project' })) {
      if (m.type === 'result') break;
    }

    const spans = getSpans();
    const agents = spans.filter((s) => s.attributes['neatlogs.span.kind'] === 'AGENT');
    // Two AGENT spans: the orchestrator root + the subagent.
    expect(agents.length).toBe(2);

    const root = agents.find((s) => s.name === 'claude_agent.query')!;
    const sub = agents.find((s) => s.name === 'claude_agent.subagent.instrumentor')!;
    expect(root).toBeDefined();
    expect(sub).toBeDefined();
    expect((root as any).parentSpanId).toBeUndefined();
    expect(attr(sub, 'neatlogs.agent.name')).toBe('instrumentor');
    expect(attr(sub, 'input.value')).toBe('instrument file A');
    expect(attr(sub, 'output.value')).toBe('Editing file A');

    // The subagent AGENT nests under the Task TOOL span (id task_1).
    const taskTool = spans.find((s) => s.attributes['neatlogs.tool.name'] === 'Task')!;
    expect((sub as any).parentSpanId).toBe(taskTool.spanContext().spanId);

    // The subagent's own Edit TOOL span nests under the subagent, not the root.
    const editTool = spans.find((s) => s.attributes['neatlogs.tool.name'] === 'Edit')!;
    expect((editTool as any).parentSpanId).toBe(sub.spanContext().spanId);

    // Root output = orchestrator final answer; subagent output = its own text.
    expect(attr(root, 'output.value')).toBe('All files instrumented.');
  });

  it('is idempotent and passes through non-query exports', () => {
    const fakeSDK = { query: () => (async function* () {})(), tool: () => 'tool-def', VERSION: '1' };
    const wrapped = wrapClaudeAgentSDK(fakeSDK as any);
    expect(wrapped.tool()).toBe('tool-def');
    expect(wrapped.VERSION).toBe('1');
    expect(wrapClaudeAgentSDK(wrapped as any)).toBe(wrapped);
  });

  it('captures input on the FIRST LLM span in streaming-input mode (prompt is an async generator)', async () => {
    // The wizard feeds the prompt as an async generator into the SDK; it is NOT
    // echoed back as a `user` output message before the first assistant turn. The
    // input tap must still populate the first LLM span + the AGENT span input.
    async function* promptStream() {
      yield { type: 'user', message: { role: 'user', content: 'Instrument my app' } };
      // Stays open like the wizard's createPromptStream.
      await new Promise((r) => setTimeout(r, 20));
    }
    // query() must consume the prompt before yielding the first assistant turn,
    // so the tap fills before emitAssistantLlmSpan runs.
    function fakeQuery(params: any) {
      return (async function* () {
        const iter = params.prompt[Symbol.asyncIterator]();
        await iter.next(); // SDK pulls the first user message → tap records it
        yield { type: 'system', session_id: 'sess-9', model: 'claude-sonnet-4-6' };
        yield {
          type: 'assistant',
          message: { model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'On it.' }], usage: { input_tokens: 10, output_tokens: 3 } },
        };
        yield { type: 'result', subtype: 'success', result: 'done', session_id: 'sess-9', is_error: false };
      })();
    }

    const { query } = wrapClaudeAgentSDK({ query: fakeQuery } as any);
    for await (const m of query({ prompt: promptStream() })) {
      if (m.type === 'result') break;
    }

    const spans = getSpans();
    const agent = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'AGENT')!;
    const firstLlm = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'LLM')!;
    expect(attr(agent, 'input.value')).toBe('Instrument my app');
    expect(attr(firstLlm, 'neatlogs.llm.input_messages.0.content')).toBe('Instrument my app');
    expect(attr(firstLlm, 'neatlogs.llm.output_messages.0.content')).toBe('On it.');
  });

  it('finalizes the AGENT span on the result message even if iteration stops there (streaming-input mode)', async () => {
    // Mirrors the wizard: the input generator stays open, so the output iterator
    // never reaches `done` — the consumer breaks out of the loop at `result`.
    // The AGENT span must still be ended (and exported) via the result message.
    async function* fakeQuery() {
      yield { type: 'system', session_id: 'sess-7', model: 'claude-sonnet-4-6' };
      yield {
        type: 'assistant',
        message: { model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'working' }], usage: { input_tokens: 20, output_tokens: 6 } },
      };
      yield {
        type: 'result',
        subtype: 'success',
        result: 'Instrumented app.py',
        session_id: 'sess-7',
        usage: { input_tokens: 70, output_tokens: 15 },
        total_cost_usd: 0.003,
        num_turns: 2,
        is_error: false,
      };
      // Input stays open after the result (never reaches iterator `done`).
      await new Promise((r) => setTimeout(r, 30));
    }

    const { query } = wrapClaudeAgentSDK({ query: () => fakeQuery() } as any);
    for await (const m of query({ prompt: 'instrument it' })) {
      if (m.type === 'result') break; // stop here, like the wizard does
    }

    const spans = getSpans();
    const agent = spans.find((s) => s.attributes['neatlogs.span.kind'] === 'AGENT');
    expect(agent).toBeDefined();
    expect(attr(agent!, 'output.value')).toBe('Instrumented app.py');
    expect(attr(agent!, 'neatlogs.conversation.id')).toBe('sess-7');
    expect(attr(agent!, 'neatlogs.llm.token_count.prompt')).toBe(70);
    expect(attr(agent!, 'neatlogs.agent.num_turns')).toBe(2);
    expect(agent!.status.code).not.toBe(2); // not ERROR
  });

  it('finalizes the AGENT span with ERROR status when result.is_error is set', async () => {
    async function* fakeQuery() {
      yield { type: 'system', session_id: 'sess-8' };
      yield { type: 'result', subtype: 'error_max_turns', result: 'hit max turns', session_id: 'sess-8', is_error: true };
      await new Promise((r) => setTimeout(r, 30));
    }
    const { query } = wrapClaudeAgentSDK({ query: () => fakeQuery() } as any);
    for await (const m of query({ prompt: 'x' })) {
      if (m.type === 'result') break;
    }
    const agent = getSpans().find((s) => s.attributes['neatlogs.span.kind'] === 'AGENT');
    expect(agent).toBeDefined();
    expect(agent!.status.code).toBe(2); // ERROR
    expect(attr(agent!, 'neatlogs.agent.is_error')).toBe(true);
  });

  it('records AGENT output when the Claude subprocess fails before emitting a result', async () => {
    async function* failedQuery() {
      throw new Error('spawn EFTYPE');
    }
    const { query } = wrapClaudeAgentSDK({ query: () => failedQuery() } as any);
    await expect(async () => {
      for await (const _message of query({ prompt: 'instrument this project' })) {
        // The generator fails before yielding.
      }
    }).rejects.toThrow('spawn EFTYPE');

    const agent = getSpans().find((s) => s.attributes['neatlogs.span.kind'] === 'AGENT');
    expect(agent).toBeDefined();
    expect(attr(agent!, 'input.value')).toBe('instrument this project');
    expect(attr(agent!, 'output.value')).toBe(
      JSON.stringify({ status: 'error', error: 'spawn EFTYPE' }),
    );
    expect(agent!.status.code).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// OpenRouter Agent
// ---------------------------------------------------------------------------

describe('wrapOpenRouterAgent', () => {
  // Mirrors the real @openrouter/agent ModelResult: getText() → string, and
  // getResponse() → OpenResponsesResult with usage {inputTokens, outputTokens}.
  function makeResult(text: string, usage?: any, model = 'openai/gpt-4o', id = 'gen-123') {
    return {
      getText: async () => text,
      getResponse: async () => ({
        id,
        model,
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
        usage: usage ?? { inputTokens: 9, outputTokens: 3, totalTokens: 12 },
      }),
    };
  }

  it('finalizes an LLM span (output via getText, usage via getResponse) with the real input shape', async () => {
    const client = { callModel: (_opts: any) => makeResult('Hello world') };
    const wrapped = wrapOpenRouterAgent(client as any);

    // Real call shape: callModel(client, { model, input }) — input is a string.
    const result = (wrapped as any).callModel({ model: 'openai/gpt-4o', input: 'Hi there' });

    // No span until the result is consumed.
    expect(getSpans().length).toBe(0);

    const text = await result.getText();
    expect(text).toBe('Hello world');
    // getText fetches usage via getResponse() before finalizing, so the span is
    // complete the moment getText resolves.

    const span = getSpans().find((s) => s.attributes['neatlogs.span.kind'] === 'LLM')!;
    expect(span).toBeDefined();
    expect(attr(span, 'neatlogs.llm.provider')).toBe('openrouter');
    expect(attr(span, 'neatlogs.llm.model_name')).toBe('openai/gpt-4o');
    expect(attr(span, 'neatlogs.llm.input_messages.0.content')).toBe('Hi there');
    expect(attr(span, 'input.value')).toBe('Hi there');
    expect(attr(span, 'neatlogs.llm.output_messages.0.content')).toBe('Hello world');
    // Usage from getResponse() (inputTokens/outputTokens field names).
    expect(attr(span, 'neatlogs.llm.token_count.prompt')).toBe(9);
    expect(attr(span, 'neatlogs.llm.token_count.completion')).toBe(3);
    expect(attr(span, 'neatlogs.llm.token_count.total')).toBe(12);
  });

  it('finalizes from getResponse() directly (text from output[] + usage)', async () => {
    const client = { callModel: (_opts: any) => makeResult('Direct response', { inputTokens: 5, outputTokens: 7 }) };
    const wrapped = wrapOpenRouterAgent(client as any);
    const result = (wrapped as any).callModel({ model: 'anthropic/claude-3.5-sonnet', input: 'Q' });
    await result.getResponse();

    const span = getSpans().find((s) => s.attributes['neatlogs.span.kind'] === 'LLM')!;
    expect(attr(span, 'neatlogs.llm.output_messages.0.content')).toBe('Direct response');
    expect(attr(span, 'neatlogs.llm.token_count.prompt')).toBe(5);
    expect(attr(span, 'neatlogs.llm.token_count.total')).toBe(12);
  });

  it('does not ship a span for an unconsumed result', () => {
    const client = { callModel: (_opts: any) => makeResult('x') };
    const wrapped = wrapOpenRouterAgent(client as any);
    (wrapped as any).callModel({ model: 'm', input: 'hi' });
    expect(getSpans().length).toBe(0);
  });
});
