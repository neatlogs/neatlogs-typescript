import { describe, expect, it } from 'vitest';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { MODEL_CAPTURE_ATTRIBUTE, readProviderCapture } from '../../src/replay/provider-capture.js';
import { replayRecordingFromCase } from '../../src/replay/frozen-case.js';
import { ReplaySession } from '../../src/replay/session.js';
import { diag, DiagLogLevel } from '@opentelemetry/api';
import { useSpans } from './failed-calls/harness.js';

// F-040: a streamed Gemini call (generateContentStream) must leave the same raw model capture as a
// non-streamed one, assembled from the chunks, so A/B grading with trace evidence can read it.
const { only, spans } = useSpans();
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
        if (failAfter === chunks.length) throw new Error('connection reset after the last chunk');
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

describe('google-genai streamed capture: review fixes (F-040)', () => {
  const wrap = wrapGoogleGenAI;
  it('never replays a streamed capture into a later non-streamed call', async () => {
    const client = wrap({ models: {
      generateContentStream: async () => (async function* () { yield* answerChunks; })(),
      generateContent: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: 'live' }] }, finishReason: 'STOP' }] }),
    } } as any) as any;
    for await (const _chunk of await client.models.generateContentStream(structuredClone(request))) { /* drain */ }
    const span = only();
    expect(span.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeDefined();
    const { recording } = replayRecordingFromCase({ source: { traceId: 't' }, context: { spans: [
      { span_id: span.spanContext().spanId, span_type: 'LLM', semantic: {}, status: 'OK', attributes: span.attributes },
    ] } });
    expect(recording.entries).toHaveLength(0);
    const session = new ReplaySession(recording, { mode: 'tools_only' });
    const answer = await session.run(async () => (await client.models.generateContent(structuredClone(request))).candidates[0].content.parts[0].text);
    expect(answer).toBe('live');
  });

  it.each([
    ['attribute as string', { 'neatlogs.llm.is_streaming': 'true' }, {}],
    ['stored column as 1', {}, { is_streaming: 1 }],
  ])('skips a streamed span whose marker is stored as %s', async (_label, extraAttributes, extraSpan) => {
    for await (const _chunk of await (wrap(streamingClient(answerChunks) as any) as any).models.generateContentStream(structuredClone(request))) { /* drain */ }
    const span = only();
    const { 'neatlogs.llm.is_streaming': _flag, ...attributes } = span.attributes;
    const { recording } = replayRecordingFromCase({ source: { traceId: 't' }, context: { spans: [
      { span_id: span.spanContext().spanId, span_type: 'LLM', semantic: {}, status: 'OK', attributes: { ...attributes, ...extraAttributes }, ...extraSpan },
    ] } });
    expect(recording.entries).toHaveLength(0);
  });

  it('treats a candidate without an index as candidate 0 (proto3 omits zero)', async () => {
    const chunks = [
      { candidates: [{ index: 1, content: { parts: [{ text: 'B-' }] } }, { content: { parts: [{ text: 'A-' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'A.' }] }, finishReason: 'STOP' }, { index: 1, content: { parts: [{ text: 'B.' }] }, finishReason: 'STOP' }] },
    ];
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates.map((c: any) => c.content.parts[0].text)).toEqual(['A-A.', 'B-B.']);
  });

  it('keeps citations from every chunk', async () => {
    const chunks = [
      { candidates: [{ content: { parts: [{ text: 'One. ' }] }, citationMetadata: { citations: [{ startIndex: 0, endIndex: 4, uri: 'https://a' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Two.' }] }, citationMetadata: { citations: [{ startIndex: 5, endIndex: 9, uri: 'https://b' }] }, finishReason: 'STOP' }] },
    ];
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates[0].citationMetadata.citations.map((c: any) => c.uri)).toEqual(['https://a', 'https://b']);
  });

  it('never lets a capture failure reach the caller, and passes chunks through unchanged', async () => {
    const evil: any = { candidates: [{ index: 0, content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] };
    Object.defineProperty(evil, 'lazyField', { enumerable: true, get() { throw new Error('getter boom'); } });
    const client = wrap(streamingClient([answerChunks[0], evil]) as any) as any;
    const seen: unknown[] = [];
    for await (const chunk of await client.models.generateContentStream(structuredClone(request))) seen.push(chunk);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(answerChunks[0]);
    expect(seen[1]).toBe(evil);
    expect(spans().at(-1)!.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined();
  });

  it('records nothing when the stream fails after its last chunk', async () => {
    expect(await drain(wrap, answerChunks, { failAfter: answerChunks.length })).toBeUndefined();
  });

  it('captures a long answer made of many small chunks', async () => {
    const chunks: any[] = Array.from({ length: 30000 }, () => ({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: ' word' }] } }], usageMetadata: usage, modelVersion: 'gemini-2.5-flash-lite' }));
    chunks.push({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: '.' }] }, finishReason: 'STOP' }] });
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates[0].content.parts[0].text).toHaveLength(30000 * 5 + 1);
  });

  it('records nothing when the caller returns early and then calls next() again', async () => {
    const warnings: string[] = [];
    diag.setLogger({ error: (m: string) => warnings.push(m), warn: (m: string) => warnings.push(m), info() {}, debug() {}, verbose() {} }, DiagLogLevel.WARN);
    try {
      const finishedFirst = [answerChunks[2], { usageMetadata: usage }];
      const client = wrapGoogleGenAI(streamingClient(finishedFirst) as any) as any;
      const it = (await client.models.generateContentStream(structuredClone(request)))[Symbol.asyncIterator]();
      await it.next();
      await it.return();
      while (!(await it.next()).done) { /* drain the rest */ }
      expect(spans().at(-1)!.attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined();
      expect(warnings.filter((m) => m.includes('ended Span'))).toEqual([]);
    } finally { diag.disable(); }
  });

  it('records nothing when two candidates in one chunk claim the same index', async () => {
    const chunks = [{ candidates: [{ content: { parts: [{ text: 'A' }] }, finishReason: 'STOP' }, { content: { parts: [{ text: 'B' }] }, finishReason: 'STOP' }] }];
    expect(await drain(wrapGoogleGenAI, chunks)).toBeUndefined();
  });
});
