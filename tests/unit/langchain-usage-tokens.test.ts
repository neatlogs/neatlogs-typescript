import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { AIMessage } from '@langchain/core/messages';
import { langchainHandler } from '../../src/langchain.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;
let prevAutoRoot: string | undefined;

beforeAll(() => {
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

beforeEach(() => exporter.reset());

async function tokensFor(llmOutput: any, message?: AIMessage): Promise<Record<string, unknown>> {
  const h: any = langchainHandler();
  await h.handleChatModelStart({ name: 'ChatAnthropic', kwargs: { model: 'claude-3-5-sonnet' } }, [[]], 'r1');
  const msg = message ?? new AIMessage({ content: 'hi' });
  await h.handleLLMEnd({ generations: [[{ text: '', message: msg }]], llmOutput }, 'r1');
  const attrs = exporter.getFinishedSpans()[0].attributes;
  return {
    prompt: attrs['neatlogs.llm.token_count.prompt'],
    completion: attrs['neatlogs.llm.token_count.completion'],
    total: attrs['neatlogs.llm.token_count.total'],
  };
}

describe('langchainHandler token usage', () => {
  it('reads Anthropic input_tokens/output_tokens from llmOutput.usage', async () => {
    expect(await tokensFor({ usage: { input_tokens: 12, output_tokens: 4 } }))
      .toEqual({ prompt: 12, completion: 4, total: 16 });
  });

  it('falls back to the message usage_metadata when llmOutput has none', async () => {
    const msg = new AIMessage({ content: 'hi', usage_metadata: { input_tokens: 12, output_tokens: 4, total_tokens: 16 } });
    expect(await tokensFor({}, msg)).toEqual({ prompt: 12, completion: 4, total: 16 });
  });

  it('keeps camelCase promptTokens/completionTokens working', async () => {
    expect(await tokensFor({ tokenUsage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 } }))
      .toEqual({ prompt: 7, completion: 3, total: 10 });
  });

  it('keeps snake_case prompt_tokens/completion_tokens working', async () => {
    expect(await tokensFor({ usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }))
      .toEqual({ prompt: 5, completion: 2, total: 7 });
  });
});
