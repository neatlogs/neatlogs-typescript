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
import Anthropic from '@anthropic-ai/sdk';
import { wrapAnthropic } from '../../src/anthropic.js';
const response = {id:'msg_offline',type:'message',role:'assistant',model:'demo',content:[{type:'text',text:'answer'}],usage:{input_tokens:3,output_tokens:2}};
it.each(['regular','beta'])('traces real %s messages.create', async (namespace) => {
  let calls = 0;
  const client = wrapAnthropic(new Anthropic({apiKey:'offline', fetch: async () => { calls++; return new Response(JSON.stringify(response), {headers:{'content-type':'application/json'}}); }}));
  const messages = namespace === 'beta' ? client.beta.messages : client.messages;
  const result = await messages.create({model:'demo',max_tokens:10,messages:[]});
  expect(result.content).toEqual(response.content);
  expect(calls).toBe(1);
  expect(exporter.getFinishedSpans()).toHaveLength(1);
  expect(exporter.getFinishedSpans()[0].attributes['neatlogs.llm.token_count.prompt']).toBe(3);
});
it('traces beta rejection without changing the error', async () => {
  const error = new Error('offline failure');
  const client = wrapAnthropic({beta:{messages:{create:()=>Promise.reject(error)}}});
  await expect(client.beta.messages.create({model:'demo'})).rejects.toBe(error);
  expect(exporter.getFinishedSpans()).toHaveLength(1);
  expect(exporter.getFinishedSpans()[0].status.code).toBe(2);
});
it('traces beta stream:true and preserves chunk identity', async () => {
  const chunk = {type:'message_start',message:{model:'demo',usage:{input_tokens:3},content:[]}};
  const client = wrapAnthropic({beta:{messages:{create:async()=> (async function*(){yield chunk;yield {type:'message_stop'};})()}}});
  const seen = [];
  for await(const event of await client.beta.messages.create({model:'demo',stream:true})) seen.push(event);
  expect(seen[0]).toBe(chunk);
  expect(exporter.getFinishedSpans()).toHaveLength(1);
});
it('does not instrument beta token counting as a completion', async () => {
  const client = wrapAnthropic({beta:{messages:{countTokens:async()=>({input_tokens:3})}}});
  expect(await client.beta.messages.countTokens()).toEqual({input_tokens:3});
  expect(exporter.getFinishedSpans()).toHaveLength(0);
});
