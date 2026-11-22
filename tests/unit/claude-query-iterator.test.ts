import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { _setNeatlogsProvider } from '../../src/core/provider.js';
import { wrapClaudeAgentSDK } from '../../src/claude-agent-sdk.js';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
beforeAll(() => _setNeatlogsProvider(provider));
beforeEach(() => exporter.reset());
afterAll(async () => { _setNeatlogsProvider(null); await provider.shutdown(); });

const message = { type: 'assistant', message: { model: 'claude-test', content: [{ type: 'text', text: 'answer' }] } };
const roots = () => exporter.getFinishedSpans().filter(s => s.name === 'claude_agent.query');

// The vendor Query forwards these methods to sdkMessages and exposes that
// generator from Symbol.asyncIterator. No subprocess or provider call is used.
class QueryFixture {
  constructor(public sdkMessages: AsyncGenerator<unknown, void, unknown>) {}
  next(...args: [] | [unknown]) { return this.sdkMessages.next(...args); }
  return(value: void) { return this.sdkMessages.return(value); }
  throw(error: unknown) { return this.sdkMessages.throw(error); }
  [Symbol.asyncIterator]() { return this.sdkMessages; }
  interrupt() { return 'interrupted'; }
}

for (const shape of ['vendor-query', 'async-generator'] as const) {
  const makeQuery = (source = async function* () { yield message; }) => {
    const sdk = wrapClaudeAgentSDK({ query: () => shape === 'vendor-query' ? new QueryFixture(source()) : source() });
    return sdk.query({ prompt: 'hello' } as never) as any;
  };

  it(`${shape}: direct next captures output and finishes once`, async () => {
    const query = makeQuery();
    expect(await query.next()).toEqual({ done: false, value: message });
    expect((await query.next()).done).toBe(true);
    expect(roots()).toHaveLength(1);
    expect(roots()[0].attributes['output.value']).toBe('answer');
  });
  it(`${shape}: direct return finalizes cancellation and source cleanup`, async () => {
    let closed = false;
    const query = makeQuery(async function* () { try { yield message; yield message; } finally { closed = true; } });
    await query.next();
    await query.return();
    expect(closed).toBe(true);
    expect(roots()).toHaveLength(1);
    expect(roots()[0].attributes['neatlogs.stream.cancelled']).toBe(true);
  });
  it(`${shape}: direct throw preserves the error and exports the run`, async () => {
    const query = makeQuery();
    await query.next();
    const failure = new Error('consumer failed');
    await expect(query.throw(failure)).rejects.toBe(failure);
    expect(roots()).toHaveLength(1);
    expect(roots()[0].status.code).toBe(2);
  });
  it(`${shape}: mixed direct and iterable reads capture the first message`, async () => {
    const query = makeQuery();
    expect((await query.next()).value).toBe(message);
    const rest = [];
    for await (const value of query) rest.push(value);
    expect(rest).toEqual([]);
    expect(roots()).toHaveLength(1);
    expect(roots()[0].attributes['output.value']).toBe('answer');
  });
  it(`${shape}: ordinary iteration remains unchanged`, async () => {
    const values = [];
    for await (const value of makeQuery()) values.push(value);
    expect(values).toEqual([message]);
    expect(roots()).toHaveLength(1);
    expect(roots()[0].attributes['output.value']).toBe('answer');
  });
  it(`${shape}: preserves query control methods`, async () => {
    const query = makeQuery();
    if (shape === 'vendor-query') expect(query.interrupt()).toBe('interrupted');
    for await (const _ of query) { /* drain */ }
    expect(roots()).toHaveLength(1);
  });
}
