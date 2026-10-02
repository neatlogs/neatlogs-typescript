import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { _setNeatlogsProvider } from '../../src/core/provider.js';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { wrapVertexAI } from '../../src/vertex-ai.js';

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;
let previousAutoRoot: string | undefined;
beforeAll(() => {
  previousAutoRoot = process.env.NEATLOGS_AUTO_ROOT;
  process.env.NEATLOGS_AUTO_ROOT = 'false';
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});
beforeEach(() => exporter.reset());
afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
  if (previousAutoRoot === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
  else process.env.NEATLOGS_AUTO_ROOT = previousAutoRoot;
});

it.each([
  ['google', wrapGoogleGenAI],
  ['vertex', wrapVertexAI],
] as const)('%s ends an errored span when early stream cleanup rejects', async (name, wrap) => {
  const error = new Error('provider cleanup failed');
  const original = (async function* () {
    try {
      yield { candidates: [{ content: { parts: [{ text: 'partial answer' }] } }] };
    } finally {
      throw error;
    }
  })();
  const client = wrap({ models: { generateContentStream: async () => original } });
  const stream = await client.models.generateContentStream({ model: 'gemini-test', contents: 'hello' });
  let caught: unknown;
  try {
    for await (const _chunk of stream) break;
  } catch (err) {
    caught = err;
  }
  console.log(name, 'same cleanup error:', caught === error, 'exported spans:', exporter.getFinishedSpans().length);
  expect(caught).toBe(error);
  expect(exporter.getFinishedSpans()).toHaveLength(1);
  const span = exporter.getFinishedSpans()[0];
  expect(span.status.code).toBe(2);
  expect(span.status.message).toBe(error.message);
  expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
  expect(span.events.some((event) => event.name === 'exception')).toBe(true);
});
