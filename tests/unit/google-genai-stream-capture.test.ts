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
    // until_span replays model calls (tools_only never does), so this exercises the real path.
    await client.models.generateContent(structuredClone({ ...request, contents: 'checkpoint' }));
    const checkpoint = spans().at(-1)!;
    const full = replayRecordingFromCase({ source: { traceId: 't' }, context: { spans: [
      { span_id: span.spanContext().spanId, span_type: 'LLM', semantic: {}, status: 'OK', attributes: span.attributes },
      { span_id: checkpoint.spanContext().spanId, span_type: 'LLM', semantic: {}, status: 'OK', attributes: checkpoint.attributes },
    ] } }).recording;
    expect(full.entries).toHaveLength(1);
    const session = new ReplaySession(full, { mode: 'until_span', untilSpan: checkpoint.spanContext().spanId });
    const answer = await session.run(async () => (await client.models.generateContent(structuredClone(request))).candidates[0].content.parts[0].text);
    expect(answer).toBe('live');
  });

  it.each([
    ['attribute as string', { 'neatlogs.llm.is_streaming': 'true' }, {}],
    ['stored column as 1', {}, { is_streaming: 1 }],
    ['attribute as "1"', { 'neatlogs.llm.is_streaming': '1' }, {}],
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
    const chunks = [
      { candidates: [{ content: { parts: [{ text: 'A' }] } }, { content: { parts: [{ text: 'B' }] } }] },
      { candidates: [{ content: { parts: [{ text: '.' }] }, finishReason: 'STOP' }] },
    ];
    expect(await drain(wrapGoogleGenAI, chunks)).toBeUndefined();
  });
});

describe('google-genai streamed capture: review round 2 (F-040)', () => {
  const wrap = wrapGoogleGenAI;
  const fin = (parts: unknown[], extra: object = {}) => ({ candidates: [{ index: 0, content: { role: 'model', parts }, finishReason: 'STOP', ...extra }] });
  const mid = (parts: unknown[], extra: object = {}) => ({ candidates: [{ index: 0, content: { role: 'model', parts }, ...extra }] });

  it.each([
    ['per-chunk logprobs', [mid([{ text: 'A' }], { logprobsResult: { chosenCandidates: [{ token: 'A' }] }, avgLogprobs: -0.1 }), fin([{ text: 'B' }], { logprobsResult: { chosenCandidates: [{ token: 'B' }] }, avgLogprobs: -0.2 })]],
    ['an unknown candidate field', [fin([{ text: 'A' }], { someNewField: { x: 1 } })]],
    ['streamed function-call arguments', [mid([{ functionCall: { name: 'f', partialArgs: [{ jsonPath: '$.a', stringValue: 'x' }], willContinue: true } }]), fin([{ functionCall: { partialArgs: [{ jsonPath: '$.a', stringValue: 'y' }], willContinue: false } }])]],
    ['a merged text part with extra keys', [mid([{ text: 'A' }]), fin([{ text: 'B', partMetadata: { k: 1 } }])]],
  ])('records nothing for %s', async (_label, chunks) => {
    expect(await drain(wrap, chunks as any[])).toBeUndefined();
  });

  it('keeps last-value-safe candidate fields', async () => {
    const chunks = [mid([{ text: 'A' }], { safetyRatings: [{ category: 'X', probability: 'LOW' }] }), fin([{ text: 'B' }], { safetyRatings: [{ category: 'X', probability: 'NEGLIGIBLE' }], groundingMetadata: { webSearchQueries: ['q'] } })];
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates[0].safetyRatings[0].probability).toBe('NEGLIGIBLE');
    expect(output.candidates[0].groundingMetadata).toEqual({ webSearchQueries: ['q'] });
  });

  it('starts a new part after a thought signature', async () => {
    const chunks = [mid([{ text: 'Ans', thoughtSignature: 'c2ln' }]), mid([{ text: 'wer' }]), fin([{ text: '' }])];
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates[0].content.parts).toEqual([{ text: 'Ans', thoughtSignature: 'c2ln' }, { text: 'wer' }]);
  });

  it('drops an empty trailing text part that follows a signed part', async () => {
    const chunks = [mid([{ text: 'Answer', thoughtSignature: 'c2ln' }]), fin([{ text: '' }])];
    const { output } = readProviderCapture(await drain(wrap, chunks)) as { output: any };
    expect(output.candidates[0].content.parts).toEqual([{ text: 'Answer', thoughtSignature: 'c2ln' }]);
  });

  it('records nothing when fewer candidates streamed than were requested', async () => {
    const client = wrap(streamingClient([fin([{ text: 'A' }])]) as any) as any;
    for await (const _c of await client.models.generateContentStream({ ...structuredClone(request), config: { candidateCount: 2 } })) { /* drain */ }
    expect(only().attributes[MODEL_CAPTURE_ATTRIBUTE]).toBeUndefined();
  });

  it('never serves a non-streamed recording to a streamed call', async () => {
    let liveStreams = 0;
    const client = wrap({ models: {
      generateContentStream: async () => { liveStreams++; return (async function* () { yield* answerChunks; })(); },
      generateContent: async () => ({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'RECORDED' }] }, finishReason: 'STOP' }] }),
    } } as any) as any;
    await client.models.generateContent(structuredClone(request));
    const recorded = spans().at(-1)!;
    await client.models.generateContent(structuredClone({ ...request, contents: 'checkpoint' }));
    const checkpoint = spans().at(-1)!;
    const { recording } = replayRecordingFromCase({ source: { traceId: 't' }, context: { spans: [recorded, checkpoint].map((s) => (
      { span_id: s.spanContext().spanId, span_type: 'LLM', semantic: {}, status: 'OK', attributes: s.attributes })) } });
    const session = new ReplaySession(recording, { mode: 'until_span', untilSpan: checkpoint.spanContext().spanId });
    const text = await session.run(async () => {
      let t = '';
      for await (const c of await client.models.generateContentStream(structuredClone(request))) t += c.candidates[0].content.parts[0].text;
      return t;
    });
    expect(text).toBe('The capital of France is Paris.');
    expect(liveStreams).toBe(1);
  });

  it('stops reading chunks for capture once the size bound trips', async () => {
    let reads = 0;
    const counted: any = mid([{ text: 'x' }]);
    Object.defineProperty(counted, 'probeField', { enumerable: true, get() { reads++; return 1; } });
    await drain(wrap, [mid([{ text: 'y'.repeat(1024 * 1024 + 10) }]), counted, fin([{ text: '.' }])]);
    expect(reads).toBe(0);
  });
});

describe('google-genai streamed capture: review round 3 (F-040)', () => {
  const wrap = wrapGoogleGenAI;
  const fin = (parts: unknown[], extra: object = {}) => ({ candidates: [{ index: 0, content: { role: 'model', parts }, finishReason: 'STOP', ...extra }] });
  const mid = (parts: unknown[], extra: object = {}) => ({ candidates: [{ index: 0, content: { role: 'model', parts }, ...extra }] });

  it('records what the model sent even if the caller later mutates the chunk', async () => {
    const call = { functionCall: { name: 'lookup', args: { city: 'Paris' } } };
    const ratings = [{ category: 'X', probability: 'LOW' }];
    const chunks = [mid([call]), fin([{ text: 'Done.' }], { safetyRatings: ratings, citationMetadata: { citations: [{ uri: 'https://a' }] } })];
    const client = wrap(streamingClient(chunks) as any) as any;
    for await (const c of await client.models.generateContentStream(structuredClone(request))) {
      for (const part of c.candidates[0].content.parts) if (part.functionCall) part.functionCall.args.city = 'MUTATED';
      if (c.candidates[0].safetyRatings) c.candidates[0].safetyRatings[0].probability = 'MUTATED';
      if (c.candidates[0].citationMetadata) c.candidates[0].citationMetadata.citations[0].uri = 'MUTATED';
    }
    const { output } = readProviderCapture(only().attributes[MODEL_CAPTURE_ATTRIBUTE]) as { output: any };
    expect(output.candidates[0].content.parts[0].functionCall.args.city).toBe('Paris');
    expect(output.candidates[0].safetyRatings[0].probability).toBe('LOW');
    expect(output.candidates[0].citationMetadata.citations[0].uri).toBe('https://a');
  });

  it('records nothing when content arrives after a candidate finished', async () => {
    expect(await drain(wrap, [fin([{ text: 'A' }]), mid([{ text: 'B' }])])).toBeUndefined();
  });

  it('treats FINISH_REASON_UNSPECIFIED as not finished', async () => {
    expect(await drain(wrap, [mid([{ text: 'A' }], { finishReason: 'FINISH_REASON_UNSPECIFIED' })])).toBeUndefined();
  });

  it('records nothing for an unknown top-level response field, and keeps the known ones', async () => {
    expect(await drain(wrap, [fin([{ text: 'A' }]), { candidates: [], someNewTopLevel: { x: 1 } }])).toBeUndefined();
  });

  it('keeps known top-level fields', async () => {
    const { output } = readProviderCapture(await drain(wrap, [{ ...fin([{ text: 'A' }]), usageMetadata: usage, modelVersion: 'v', responseId: 'r', createTime: '2026-11-24T00:00:00Z' }])) as { output: any };
    expect(Object.keys(output).sort()).toEqual(['candidates', 'createTime', 'modelVersion', 'responseId', 'usageMetadata']);
  });

  it('keeps modelStatus (sent by @google/genai 1.52+)', async () => {
    const { output } = readProviderCapture(await drain(wrap, [{ ...fin([{ text: 'A' }]), modelStatus: { modelStage: 'STABLE' } }])) as { output: any };
    expect(output.modelStatus).toEqual({ modelStage: 'STABLE' });
  });
});
