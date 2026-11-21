import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { _setNeatlogsProvider, getActiveNeatlogsSpan, getNeatlogsTracer, getNeatlogsParentContext, withNeatlogsSpan } from '../../src/core/provider.js';
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
beforeAll(() => { _setNeatlogsProvider(provider); process.env.NEATLOGS_AUTO_ROOT = 'false'; });
beforeEach(() => exporter.reset());
afterAll(async () => { vi.unstubAllGlobals(); await provider.shutdown(); });
import { wrapGoogleGenAI } from '../../src/google-genai.js';
import { wrapVertexAI } from '../../src/vertex-ai.js';
import { GoogleGenAI } from '@google/genai';
const chunk = {candidates:[{content:{role:'model',parts:[{text:'answer'}]},finishReason:'STOP'}]};
it('captures direct next on the real Google SDK generator offline', async () => {
  let calls = 0;
  vi.stubGlobal('fetch', async () => { calls++; return new Response('data: '+JSON.stringify(chunk)+'\n\n', {headers:{'content-type':'text/event-stream'}}); });
  const client = wrapGoogleGenAI(new GoogleGenAI({apiKey:'offline'}));
  const stream = await client.models.generateContentStream({model:'gemini-demo',contents:'hi',config:{automaticFunctionCalling:{disable:true}}});
  expect((await stream.next()).value?.candidates?.[0].content?.parts?.[0].text).toBe('answer');
  expect((await stream.next()).done).toBe(true);
  expect(calls).toBe(1);
  expect(exporter.getFinishedSpans()).toHaveLength(1);
});
for (const providerName of ['google','vertex']) {
  function call(stream: any) {
    return providerName === 'google'
      ? wrapGoogleGenAI({models:{generateContentStream:async()=>stream}}).models.generateContentStream({model:'demo',contents:'hi'})
      : wrapVertexAI({models:{generateContentStream:async()=>stream}}).models.generateContentStream({model:'demo',contents:'hi'});
  }
  describe(providerName, () => {
    it('supports direct async-generator next and mixed iteration exactly once', async () => {
      async function* chunks(){yield chunk;yield chunk;}
      const stream = await call(chunks());
      expect((await stream.next()).value).toBe(chunk);
      let remaining = 0;
      for await(const _ of stream) remaining++;
      expect(remaining).toBe(1);
      expect(exporter.getFinishedSpans()).toHaveLength(1);
    });
    it('supports direct return and runs generator cleanup', async () => {
      let cleaned = false;
      async function* chunks(){try{yield chunk;}finally{cleaned=true;}}
      const stream = await call(chunks());
      await stream.next();
      expect((await stream.return('stop')).done).toBe(true);
      expect(cleaned).toBe(true);
      expect(exporter.getFinishedSpans()).toHaveLength(1);
      expect(exporter.getFinishedSpans()[0].attributes['neatlogs.stream.cancelled']).toBe(true);
    });
    it('supports direct throw and exports the error', async () => {
      async function* chunks(){yield chunk;}
      const stream = await call(chunks());
      await stream.next();
      const error = new Error('reader failed');
      await expect(stream.throw(error)).rejects.toBe(error);
      expect(exporter.getFinishedSpans()).toHaveLength(1);
      expect(exporter.getFinishedSpans()[0].status.code).toBe(2);
    });
    it('keeps iterator self-iterability and forwards next arguments', async () => {
      let received;
      async function* chunks(){received=yield chunk;}
      const stream = await call(chunks());
      const iterator = stream[Symbol.asyncIterator]();
      expect(iterator[Symbol.asyncIterator]()).toBe(iterator);
      await iterator.next();
      await iterator.next('sent');
      expect(received).toBe('sent');
      expect(exporter.getFinishedSpans()).toHaveLength(1);
    });
  });
}
