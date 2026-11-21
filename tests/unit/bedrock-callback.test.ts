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
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand, ConverseStreamCommand, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { wrapBedrock } from '../../src/bedrock.js';
it.each([false,true])('supports real AWS callback overload, options=%s', async (options) => {
  let requests = 0;
  const client = wrapBedrock(new BedrockRuntimeClient({region:'us-east-1',credentials:{accessKeyId:'offline',secretAccessKey:'offline'},requestHandler:{handle:async()=>{requests++;return {response:{statusCode:200,headers:{'content-type':'application/json'},body:new TextEncoder().encode(JSON.stringify({output:{message:{role:'assistant',content:[{text:'ok'}]}}}))}};}}} as any));
  let returned: any;
  await new Promise<void>((resolve,reject)=>{
    const callback = (err:any,result:any) => {if(err) reject(err); else {expect(result.output.message.content[0].text).toBe('ok');resolve();}};
    const command = new ConverseCommand({modelId:'anthropic.demo',messages:[]});
    returned = options ? client.send(command, {}, callback) : client.send(command, callback);
  });
  expect(returned).toBeUndefined();
  expect(requests).toBe(1);
  expect(exporter.getFinishedSpans()).toHaveLength(1);
});
for(const Command of [ConverseCommand, InvokeModelCommand, ConverseStreamCommand, InvokeModelWithResponseStreamCommand]) {
  describe(Command.name, () => {
    function output(){return Command.name.includes('Stream') ? {[Command.name.startsWith('Converse')?'stream':'body']:(async function*(){})()} : Command.name.startsWith('Converse') ? {output:{message:{content:[{text:'ok'}]}}} : {body:new TextEncoder().encode('{"content":[{"text":"ok"}]}')};}
    it('finishes callback success without changing return value', async () => {
      const response=output();
      const client=wrapBedrock({send(_command:any,...args:any[]){queueMicrotask(()=>args.at(-1)(null,response));return 'sent';}});
      const result=await new Promise<any>(resolve=>expect(client.send(new Command({modelId:'anthropic.demo'} as any),{},(_err:any,r:any)=>resolve(r))).toBe('sent'));
      if(Command.name.includes('Stream')) for await(const _ of (result.stream??result.body)){}
      else expect(result).toBe(response);
      expect(exporter.getFinishedSpans()).toHaveLength(1);
    });
    it('records callback error and preserves the error object', async () => {
      const error=new Error('provider failed');
      const client=wrapBedrock({send(_command:any,callback:any){queueMicrotask(()=>callback(error));}});
      const actual=await new Promise(resolve=>client.send(new Command({modelId:'anthropic.demo'} as any),(err:any)=>resolve(err)));
      expect(actual).toBe(error);
      expect(exporter.getFinishedSpans()).toHaveLength(1);
      expect(exporter.getFinishedSpans()[0].status.code).toBe(2);
    });
    it('keeps promise-style calls working', async () => {
      const client=wrapBedrock({send:async()=>output()});
      const result=await client.send(new Command({modelId:'anthropic.demo'} as any));
      if(Command.name.includes('Stream')) for await(const _ of (result.stream??result.body)){}
      expect(exporter.getFinishedSpans()).toHaveLength(1);
    });
    it('ends the span when send throws synchronously', () => {
      const error=new Error('invalid options');
      const client=wrapBedrock({send(){throw error;}});
      expect(()=>client.send(new Command({modelId:'anthropic.demo'} as any),()=>{})).toThrow(error);
      expect(exporter.getFinishedSpans()).toHaveLength(1);
      expect(exporter.getFinishedSpans()[0].status.code).toBe(2);
    });
  });
                                                          }
