import {beforeAll, beforeEach, afterAll, describe, it, expect} from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {NodeTracerProvider} from '@opentelemetry/sdk-trace-node';
import {SimpleSpanProcessor, InMemorySpanExporter} from '@opentelemetry/sdk-trace-base';
import {wrapAnthropic} from '../../src/anthropic.js';
import {_setNeatlogsProvider} from '../../src/core/provider.js';
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const previous = process.env.NEATLOGS_AUTO_ROOT;
beforeAll(()=>{process.env.NEATLOGS_AUTO_ROOT='false';provider.addSpanProcessor(new SimpleSpanProcessor(exporter));_setNeatlogsProvider(provider);});
beforeEach(()=>exporter.reset());
afterAll(async()=>{_setNeatlogsProvider(null);await provider.shutdown();if(previous===undefined)delete process.env.NEATLOGS_AUTO_ROOT;else process.env.NEATLOGS_AUTO_ROOT=previous;});
const opts={model:'claude-test',max_tokens:8,messages:[{role:'user' as const,content:'hi'}]};
const message={id:'msg_local',type:'message',role:'assistant',content:[{type:'text',text:'hello'}],model:'claude-test',stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:1,output_tokens:1}};
function create(status=200){let calls=0;const response=new Response(JSON.stringify(status===200?message:{type:'error',error:{type:'authentication_error',message:'local failure'}}),{status,headers:{'content-type':'application/json','request-id':'req-local'}});const client=new Anthropic({apiKey:'fake-local-only',maxRetries:0,fetch:async()=>{calls++;return response;}});return {client:wrapAnthropic(client),response,calls:()=>calls};}
describe('Anthropic APIPromise helpers',()=>{
 it('keeps withResponse data, response identity and request id',async()=>{const c=create();const result=await c.client.messages.create(opts).withResponse();expect(result.data.content).toEqual(message.content);expect(result.response).toBe(c.response);expect(result.request_id).toBe('req-local');expect(c.calls()).toBe(1);expect(exporter.getFinishedSpans()).toHaveLength(1);});
 it('keeps asResponse and leaves the response readable',async()=>{const c=create();const pending=c.client.messages.create(opts);const response=await pending.asResponse();expect(response).toBe(c.response);expect(await response.json()).toEqual(message);expect(c.calls()).toBe(1);await new Promise(r=>setTimeout(r,20));expect(exporter.getFinishedSpans()).toHaveLength(1);});
 it('shares one request and one span across helpers and await',async()=>{const c=create();const pending=c.client.messages.create(opts);const [a,b,response]=await Promise.all([pending,pending.withResponse(),pending.asResponse()]);expect(a).toBe(b.data);expect(response).toBe(b.response);expect(c.calls()).toBe(1);expect(exporter.getFinishedSpans()).toHaveLength(1);});
 it('keeps ordinary await',async()=>{const c=create();expect((await c.client.messages.create(opts)).content).toEqual(message.content);expect(exporter.getFinishedSpans()).toHaveLength(1);});
 it('withResponse rejects on API errors and ends the error span',async()=>{const c=create(401);await expect(c.client.messages.create(opts).withResponse()).rejects.toThrow('local failure');expect(exporter.getFinishedSpans()).toHaveLength(1);expect(exporter.getFinishedSpans()[0].status.code).toBe(2);});
 it('keeps catch and finally',async()=>{const c=create(401);let done=0;const result=await c.client.messages.create(opts).catch(()=> 'caught').finally(()=>done++);expect(result).toBe('caught');expect(done).toBe(1);expect(exporter.getFinishedSpans()).toHaveLength(1);});
 it('asResponse preserves API error rejection',async()=>{const c=create(401);await expect(c.client.messages.create(opts).asResponse()).rejects.toThrow('local failure');expect(exporter.getFinishedSpans()).toHaveLength(1);expect(exporter.getFinishedSpans()[0].status.code).toBe(2);});

 it('keeps parsed output when asResponse is awaited before the promise',async()=>{const c=create();const pending=c.client.messages.create(opts);await pending.asResponse();const data=await pending;expect(data.content).toEqual(message.content);await new Promise(r=>setTimeout(r,20));const spans=exporter.getFinishedSpans();expect(spans).toHaveLength(1);expect(spans[0].attributes['neatlogs.llm.output_messages.0.content']).toBeTruthy();expect(c.calls()).toBe(1);});
 it('records output when only asResponse is used',async()=>{const c=create();const response=await c.client.messages.create(opts).asResponse();expect(await response.json()).toEqual(message);await new Promise(r=>setTimeout(r,20));const spans=exporter.getFinishedSpans();expect(spans).toHaveLength(1);expect(spans[0].attributes['neatlogs.llm.output_messages.0.content']).toBeTruthy();});
});
