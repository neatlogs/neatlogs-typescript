import { describe, expect, it } from 'vitest';
import { wrapGoogleGenAI } from '../../../src/google-genai.js';
import { wrapVertexAI } from '../../../src/vertex-ai.js';
import { ERROR, OK, UNSET, abortError, drain, exceptionOf, streamOf, useSpans } from './harness.js';

const { only } = useSpans();

const chunk = {
  candidates: [{ content: { parts: [{ text: 'partial' }] } }],
  usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
};
const blocked = {
  promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: 'unsafe prompt' },
  usageMetadata: { promptTokenCount: 3 },
};

describe.each([
  ['google', wrapGoogleGenAI],
  ['vertex', wrapVertexAI],
] as const)('%s generateContentStream', (_name, wrap) => {
  const streamed = (source: unknown) =>
    (wrap({ models: { generateContentStream: async () => source } }) as any).models.generateContentStream({
      model: 'gemini-test',
      contents: 'hi',
    });

  it('keeps the partial reply when the stream breaks mid-way', async () => {
    expect(await drain(await streamed(streamOf([chunk], new Error('socket hang up'))))).toBe(
      'threw socket hang up',
    );

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(exceptionOf(span)).toMatchObject({ 'exception.message': 'socket hang up' });
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
    expect(span.attributes['neatlogs.llm.token_count.prompt']).toBe(3);
  });

  it('does not treat a caller abort as an error', async () => {
    await drain(await streamed(streamOf([chunk], abortError())));

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(exceptionOf(span)).toBeUndefined();
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('does not treat a deliberate break as an error or as a clean finish', async () => {
    await drain(await streamed(streamOf([chunk, chunk])), 1);

    const span = only();
    expect(span.status.code).toBe(UNSET);
    expect(span.attributes['neatlogs.stream.cancelled']).toBe(true);
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });

  it('records a blocked prompt as an error with the block reason', async () => {
    expect(await drain(await streamed(streamOf([blocked])))).toBe('completed');

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('Prompt blocked: SAFETY (unsafe prompt)');
    expect(exceptionOf(span)).toMatchObject({
      'exception.type': 'BlockedPrompt',
      'exception.message': 'Prompt blocked: SAFETY (unsafe prompt)',
    });
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('SAFETY');
  });

  it('keeps a reply that stops for SAFETY with content as OK', async () => {
    const safety = {
      candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'SAFETY' }],
    };
    await drain(await streamed(streamOf([safety])));

    const span = only();
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('SAFETY');
    expect(span.attributes['neatlogs.llm.output_messages.0.content']).toBe('partial');
  });
});

describe.each([
  ['google', wrapGoogleGenAI],
  ['vertex', wrapVertexAI],
] as const)('%s generateContent', (_name, wrap) => {
  const generate = (response: unknown) =>
    (wrap({ models: { generateContent: async () => response } }) as any).models.generateContent({
      model: 'gemini-test',
      contents: 'hi',
    });

  it('records a blocked prompt as an error with the block reason', async () => {
    await generate({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } });

    const span = only();
    expect(span.status.code).toBe(ERROR);
    expect(span.status.message).toBe('Prompt blocked: PROHIBITED_CONTENT');
    expect(exceptionOf(span)).toMatchObject({ 'exception.type': 'BlockedPrompt' });
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('PROHIBITED_CONTENT');
  });

  it('keeps a normal reply OK', async () => {
    await generate({ candidates: [{ content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' }] });

    const span = only();
    expect(span.status.code).toBe(OK);
    expect(span.attributes['neatlogs.llm.finish_reason']).toBe('STOP');
  });
});
