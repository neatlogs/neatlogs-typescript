import { describe, expect, it } from 'vitest';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { MODEL_CAPTURE_ATTRIBUTE, readProviderCapture } from '../../src/replay/provider-capture.js';
import { useSpans } from './failed-calls/harness.js';

// F-040: a streamed Gemini call (generateContentStream) must leave the same raw model capture as a
// non-streamed one, assembled from the chunks, so A/B grading with trace evidence can read it.
const { only } = useSpans();
const request = { model: 'gemini-2.5-flash-lite', contents: 'What is the capital of France?', config: { temperature: 0 } };
const usage = { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 };

function streamingClient(chunks: unknown[], failAfter?: number) {
  return {
    models: {
      generateContentStream: async () => (async function* () {
        for (let i = 0; i < chunks.length; i++) {
          if (failAfter === i) throw new Error('connection reset');
          yield chunks[i];
        }
      })(),
    },
  };
}

async function drain(wrap: typeof wrapGoogleGenAI, chunks: unknown[], options: { stopAfter?: number; failAfter?: number } = {}) {
  const client = wrap(streamingClient(chunks, options.failAfter) as any) as any;
  const stream = await client.models.generateContentStream(structuredClone(request));
  let seen = 0;
  try {
    for await (const _chunk of stream) {
      seen++;
      if (options.stopAfter !== undefined && seen >= options.stopAfter) break;
    }
  } catch {
    // the stream failure itself is asserted through the missing capture
  }
  return only().attributes[MODEL_CAPTURE_ATTRIBUTE];
}

const answerChunks = [
  { candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'The capital ' }] } }] },
  { candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'of France is ' }] } }] },
  { candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Paris.' }] }, finishReason: 'STOP' }], usageMetadata: usage, modelVersion: 'gemini-2.5-flash-lite' },
];

describe('google-genai streamed call capture (F-040)', () => {
  const wrap = wrapGoogleGenAI;
  it('records the streamed answer as one complete response with the original request', async () => {
    const capture = readProviderCapture(await drain(wrap, answerChunks));
    expect(capture.name).toBe('google_genai.models.generate_content');
    expect(capture.input).toEqual(request);
    expect(capture.output).toEqual({
      candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'The capital of France is Paris.' }] }, finishReason: 'STOP' }],
      usageMetadata: usage,
      modelVersion: 'gemini-2.5-flash-lite',
    });
  });

  it('keeps thought summaries as separate thought parts, in order', async () => {
    const chunks = [
      { candidates: [{ content: { parts: [{ text: 'Recall ', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'the capital.', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Paris.' }] }, finishReason: 'STOP' }] },
    ];
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates[0].content.parts).toEqual([{ text: 'Recall the capital.', thought: true }, { text: 'Paris.' }]);
  });

  it('keeps function calls and a trailing thought signature', async () => {
    const chunks = [
      { candidates: [{ content: { parts: [{ functionCall: { name: 'lookup', args: { city: 'Paris' } } }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Done.', thoughtSignature: 'c2lnbmF0dXJl' }] }, finishReason: 'STOP' }] },
    ];
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates[0].content.parts).toEqual([
      { functionCall: { name: 'lookup', args: { city: 'Paris' } } },
      { text: 'Done.', thoughtSignature: 'c2lnbmF0dXJl' },
    ]);
  });

  it('records nothing when the consumer stops reading early', async () => {
    expect(await drain(wrap, answerChunks, { stopAfter: 1 })).toBeUndefined();
  });

  it('records nothing when the stream ends without a finish reason (truncated)', async () => {
    expect(await drain(wrap, answerChunks.slice(0, 2))).toBeUndefined();
  });

  it('records nothing when the stream fails part way', async () => {
    expect(await drain(wrap, answerChunks, { failAfter: 2 })).toBeUndefined();
  });

  it('records nothing for a stream with no candidates', async () => {
    expect(await drain(wrap, [{ promptFeedback: { blockReason: 'SAFETY' } }])).toBeUndefined();
  });

  it('records nothing when the streamed response is larger than the capture limit', async () => {
    const big = 'x'.repeat(300 * 1024);
    const chunks = [0, 1, 2, 3].map(() => ({ candidates: [{ content: { parts: [{ text: big }] } }] }));
    chunks.push({ candidates: [{ content: { parts: [{ text: '.' }] }, finishReason: 'STOP' }] } as any);
    expect(await drain(wrap, chunks)).toBeUndefined();
  });
});
