import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { wrapVertexAI } from '../../src/vertex-ai.js';
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
afterAll(() => {
  if (prevAutoRoot === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
  else process.env.NEATLOGS_AUTO_ROOT = prevAutoRoot;
});
beforeEach(() => exporter.reset());

function attr(span: ReadableSpan, key: string) {
  return span.attributes[key];
}

describe('google thinking accumulation', () => {
  it.each([['google-genai', wrapGoogleGenAI], ['vertex', wrapVertexAI]] as const)('%s: streamed thinking parts should ALL land on the span (py and go concatenate)', async (_name, wrap) => {
    async function* chunks() {
      yield { candidates: [{ content: { parts: [{ text: 'reasoning step one, ', thought: true }] } }] };
      yield { candidates: [{ content: { parts: [{ text: 'reasoning step two, ', thought: true }] } }] };
      yield { candidates: [{ content: { parts: [{ text: 'reasoning step three', thought: true }] } }] };
      yield { candidates: [{ content: { parts: [{ text: 'final answer' }] } }] , usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 } };
    }
    const wrapped = wrap({
      models: { generateContentStream: async () => chunks() },
    } as any);
    const stream = await (wrapped as any).models.generateContentStream({ model: 'gemini-2.5-flash', contents: 'hi' });
    for await (const _ of stream) { /* drain */ }

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const thinking = attr(spans[0], 'neatlogs.llm.output_messages.0.thinking');
    expect(thinking).toBe('reasoning step one, reasoning step two, reasoning step three');
  });
  it.each([['google-genai', wrapGoogleGenAI], ['vertex', wrapVertexAI]] as const)('%s: non-stream response with multiple thought parts keeps ALL parts concatenated', async (_name, wrap) => {
    const response = {
      candidates: [{ content: { parts: [
        { text: 'reasoning step one, ', thought: true },
        { text: 'reasoning step two, ', thought: true },
        { text: 'reasoning step three', thought: true },
        { text: 'final answer' },
      ] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    };
    const wrapped = wrap({
      models: { generateContent: async () => response },
    } as any);
    await (wrapped as any).models.generateContent({ model: 'gemini-2.5-flash', contents: 'hi' });
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const thinking = attr(spans[0], 'neatlogs.llm.output_messages.0.thinking');
    expect(thinking).toBe('reasoning step one, reasoning step two, reasoning step three');
  });
});
