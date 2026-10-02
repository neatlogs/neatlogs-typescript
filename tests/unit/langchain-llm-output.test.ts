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

async function outputContent(content: any): Promise<unknown> {
  const h: any = langchainHandler();
  await h.handleChatModelStart({ name: 'ChatAnthropic', kwargs: { model: 'claude-3-5-sonnet' } }, [[]], 'r1');
  const msg = new AIMessage({ content });
  await h.handleLLMEnd({ generations: [[{ text: '', message: msg }]] }, 'r1');
  return exporter.getFinishedSpans()[0].attributes['neatlogs.llm.output_messages.0.content'];
}

describe('langchainHandler LLM output content', () => {
  it('keeps string content unchanged', async () => {
    expect(await outputContent('hello')).toBe('hello');
  });

  it('serializes content blocks instead of "[object Object]"', async () => {
    const blocks = [
      { type: 'text', text: 'hello there' },
      { type: 'tool_use', id: 't1', name: 'calc', input: { a: 1 } },
    ];
    const value = await outputContent(blocks);
    expect(value).not.toContain('[object Object]');
    expect(JSON.parse(value as string)).toEqual(blocks);
  });

  it('keeps inline base64 and credential urls out of the span attribute', async () => {
    const b64 = 'A'.repeat(200000);
    const signed = 'https://user:hunter2@cdn.example.com/a.png?X-Amz-Signature=sekret123&X-Amz-Credential=AKIAEXAMPLE';
    const blocks = [
      { type: 'text', text: 'here' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      { type: 'image_url', image_url: { url: signed } },
    ];
    const value = String(await outputContent(blocks));
    expect(value).toContain('here');
    expect(value).not.toContain(b64.slice(0, 200));
    expect(value).not.toContain('hunter2');
    expect(value).not.toContain('sekret123');
  });
});
