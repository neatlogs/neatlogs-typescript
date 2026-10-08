import { describe, it, expect, beforeAll } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { wrapVertexAI } from '../../src/vertex-ai.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
_setNeatlogsProvider(provider);
process.env.NEATLOGS_AUTO_ROOT = 'false';

const resp2 = {
  candidates: [
    { content: { role: 'model', parts: [{ text: 'answer A' }] }, finishReason: 'STOP' },
    { content: { role: 'model', parts: [{ text: 'answer B' }] }, finishReason: 'MAX_TOKENS' },
  ],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6, totalTokenCount: 11 },
};

describe('google multi-candidate output', () => {
  it.each([['google-genai', wrapGoogleGenAI], ['vertex', wrapVertexAI]] as const)('%s: non-stream 2 candidates produce separate output_messages.0 and .1', async (_name, wrap) => {
    exporter.reset();
    const wrapped = wrap({ models: { generateContent: async () => resp2 } } as any);
    await (wrapped as any).models.generateContent({ model: 'gemini-2.5-flash', contents: 'hi' });
    const s = exporter.getFinishedSpans()[0];
    expect(s.attributes['neatlogs.llm.output_messages.1.content']).toBe('answer B');
  });

  it.each([['google-genai', wrapGoogleGenAI], ['vertex', wrapVertexAI]] as const)('%s: stream 2 candidates produce output_messages.0 AND .1', async (_name, wrap) => {
    exporter.reset();
    async function* chunks() {
      yield { candidates: [
        { content: { role: 'model', parts: [{ text: 'answer A' }] }, finishReason: 'STOP' },
        { content: { role: 'model', parts: [{ text: 'answer B' }] }, finishReason: 'MAX_TOKENS' },
      ] };
      yield { candidates: [], usageMetadata: resp2.usageMetadata };
    }
    const wrapped = wrap({ models: { generateContentStream: async () => chunks() } } as any);
    const stream = await (wrapped as any).models.generateContentStream({ model: 'gemini-2.5-flash', contents: 'hi' });
    for await (const _ of stream) {}
    const s = exporter.getFinishedSpans()[0];
    expect(s.attributes['neatlogs.llm.output_messages.1.content']).toBe('answer B');
  });
});
