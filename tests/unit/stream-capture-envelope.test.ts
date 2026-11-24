import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { z } from 'zod';
import { getProviderTracer } from '../../src/core/auto-root.js';
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { wrapOpenAI } from '../../src/openai.js';
import { MODEL_CAPTURE_ATTRIBUTE, prepareProviderCapture, readProviderCapture } from '../../src/replay/provider-capture.js';
import { replayRecordingFromCase } from '../../src/replay/frozen-case.js';
import { useSpans } from './failed-calls/harness.js';

// F-040 review M1: a streamed capture must say so in the capture itself, inside the digest, so that
// readers which do not know the flag (older CLIs, the server's strict schema) reject it instead of
// replaying a streamed answer into a non-streamed call.
const { only, spans } = useSpans();
const request = { model: 'gemini-2.5-flash', contents: 'Plan the trip' };
const done = [{ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Streamed answer' }] }, finishReason: 'STOP' }] }];

// The recording schema readers before this change used (origin/main src/replay/provider-capture.ts).
const mainRecording = z.object({
  version: z.literal(1), operation: z.string(), input: z.json(), output: z.json(), digest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

async function googleStreamCapture() {
  const client = wrapGoogleGenAI({ models: { generateContentStream: async () => (async function* () { yield* done; })() } } as any) as any;
  for await (const _chunk of await client.models.generateContentStream(structuredClone(request))) { /* drain */ }
  return only();
}

describe('streamed capture envelope (F-040 review M1)', () => {
  it('marks a streamed Google capture with stream: true and reads it back', async () => {
    const raw = (await googleStreamCapture()).attributes[MODEL_CAPTURE_ATTRIBUTE] as string;
    expect(JSON.parse(raw).stream).toBe(true);
    expect(readProviderCapture(raw).stream).toBe(true);
  });

  it('puts the marker inside the digest: removing it invalidates the capture', async () => {
    const saved = JSON.parse((await googleStreamCapture()).attributes[MODEL_CAPTURE_ATTRIBUTE] as string);
    delete saved.stream;
    expect(() => readProviderCapture(JSON.stringify(saved))).toThrow();
  });

  it('is rejected by the strict recording schema older readers use', async () => {
    const raw = (await googleStreamCapture()).attributes[MODEL_CAPTURE_ATTRIBUTE] as string;
    expect(mainRecording.safeParse(JSON.parse(raw)).success).toBe(false);
  });

  it('leaves non-streamed captures in the old format', () => {
    const span = getProviderTracer('envelope-test').startSpan('provider');
    const output = { id: 'x', object: 'chat.completion', created: 1, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'A' } }] };
    prepareProviderCapture(span, 'openai.chat.completions.create', { model: 'm', messages: [] }, true)!(output);
    span.end();
    const raw = only().attributes[MODEL_CAPTURE_ATTRIBUTE] as string;
    expect(JSON.parse(raw)).not.toHaveProperty('stream');
    expect(mainRecording.safeParse(JSON.parse(raw)).success).toBe(true);
    expect(readProviderCapture(raw).stream).toBe(false);
  });

  it('is never imported for replay, even when the span lost its streaming flag', async () => {
    const span = await googleStreamCapture();
    const { 'neatlogs.llm.is_streaming': _flag, ...attributes } = span.attributes;
    const { recording } = replayRecordingFromCase({ source: { traceId: 't' }, context: { spans: [
      { span_id: span.spanContext().spanId, span_type: 'LLM', semantic: {}, status: 'OK', attributes },
    ] } });
    expect(recording.entries).toHaveLength(0);
  });

  it.each([
    ['true', { 'neatlogs.llm.is_streaming': true }, {}],
    ['"true"', { 'neatlogs.llm.is_streaming': 'true' }, {}],
    ['"1"', { 'neatlogs.llm.is_streaming': '1' }, {}],
    ['column 1', {}, { is_streaming: 1 }],
  ])('also skips an unmarked capture on a span flagged as streaming (%s), as older captures are', (_label, attrs, extra) => {
    const span = getProviderTracer('envelope-test').startSpan('provider');
    const output = { id: 'x', object: 'chat.completion', created: 1, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'A' } }] };
    prepareProviderCapture(span, 'openai.chat.completions.create', { model: 'm', messages: [] }, true)!(output);
    span.end();
    const saved = only();
    const { recording } = replayRecordingFromCase({ source: { traceId: 't' }, context: { spans: [
      { span_id: saved.spanContext().spanId, span_type: 'LLM', semantic: {}, status: 'OK', attributes: { ...saved.attributes, ...attrs }, ...extra },
    ] } });
    expect(recording.entries).toHaveLength(0);
  });

  it('marks a streamed OpenAI chat capture too', async () => {
    const chunk = (choice: object, extra: object = {}) => ({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'gpt-test', choices: [choice], ...extra });
    const events = [chunk({ index: 0, delta: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }), { id: 'c', object: 'chat.completion.chunk', created: 1, model: 'gpt-test', choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }];
    const sse = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
    const client = wrapOpenAI(new OpenAI({ apiKey: 'fake-local-only', maxRetries: 0, fetch: async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }) }));
    for await (const _c of await client.chat.completions.create({ model: 'gpt-test', messages: [{ role: 'user', content: 'q' }], stream: true })) { /* drain */ }
    await new Promise((r) => setTimeout(r, 20));
    const raw = spans().at(-1)!.attributes[MODEL_CAPTURE_ATTRIBUTE] as string;
    expect(readProviderCapture(raw).stream).toBe(true);
  });
});

describe('capture is not prepared when it cannot happen (F-040 review)', () => {
  it('returns no capture function for an unsupported call or a non-JSON request', () => {
    const span = getProviderTracer('envelope-test').startSpan('provider');
    expect(prepareProviderCapture(span, 'openai.chat.completions.create', { model: 'm' }, false)).toBeUndefined();
    expect(prepareProviderCapture(span, 'openai.chat.completions.create', { model: 'm', when: new Date() }, true)).toBeUndefined();
    span.end();
  });

  it('does not assemble a stream whose capture is impossible', async () => {
    let reads = 0;
    const counted = (c: any) => { Object.defineProperty(c, 'probeField', { enumerable: true, get() { reads++; return 1; } }); return c; };
    const g = { models: { generateContentStream: async () => (async function* () { yield counted({ candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] }); })() } };
    for await (const _c of await (wrapGoogleGenAI(g as any) as any).models.generateContentStream({ model: 'm', contents: 'q', config: { tools: [{ callTool: async () => [] }] } })) { /* drain */ }
    const o = { chat: { completions: { create: async () => (async function* () { yield counted({ id: 'x', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: 'stop' }] }); })() } } };
    for await (const _c of await (wrapOpenAI(o as any) as any).chat.completions.create({ model: 'm', messages: [], stream: true }, { signal: new AbortController().signal })) { /* drain */ }
    expect(reads).toBe(0);
  });
});
