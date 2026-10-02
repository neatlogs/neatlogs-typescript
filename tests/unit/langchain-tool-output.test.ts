import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { tool } from '@langchain/core/tools';
import { langchainHandler } from '../../src/langchain.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;
let prevAutoRoot: string | undefined;

beforeAll(() => {
  prevAutoRoot = process.env.NEATLOGS_AUTO_ROOT;
  process.env.NEATLOGS_AUTO_ROOT = 'false';
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});

afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
  if (prevAutoRoot === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
  else process.env.NEATLOGS_AUTO_ROOT = prevAutoRoot;
});

beforeEach(() => exporter.reset());

const schema = { type: 'object', properties: { a: { type: 'number' } } } as any;
const toolCall = { type: 'tool_call', id: 'c1', name: 'calc', args: { a: 1 } } as any;

function toolOutput(): unknown {
  const span = exporter.getFinishedSpans().find((s) => s.name.startsWith('langchain.tool'));
  expect(span).toBeDefined();
  return span!.attributes['output.value'];
}

describe('langchainHandler tool output', () => {
  it('records the tool result when LangChain passes a ToolMessage (object result)', async () => {
    const t = tool(async ({ a }: any) => ({ sum: a + 1 }), { name: 'calc', description: 'x', schema });
    await t.invoke(toolCall, { callbacks: [langchainHandler()] });
    expect(JSON.parse(toolOutput() as string)).toEqual({ sum: 2 });
  });

  it('records the tool result when LangChain passes a ToolMessage (string result)', async () => {
    const t = tool(async ({ a }: any) => `sum is ${a + 1}`, { name: 'calc', description: 'x', schema });
    await t.invoke(toolCall, { callbacks: [langchainHandler()] });
    expect(toolOutput()).toBe('sum is 2');
  });

  it('records a plain object result on direct invoke', async () => {
    const t = tool(async ({ a }: any) => ({ sum: a + 1 }), { name: 'calc', description: 'x', schema });
    await t.invoke({ a: 1 }, { callbacks: [langchainHandler()] });
    expect(JSON.parse(toolOutput() as string)).toEqual({ sum: 2 });
  });

  it('keeps plain string output unchanged', async () => {
    const t = tool(async () => 'plain', { name: 'calc', description: 'x', schema });
    await t.invoke({ a: 1 }, { callbacks: [langchainHandler()] });
    expect(toolOutput()).toBe('plain');
  });

  it('serializes content blocks and survives circular objects', async () => {
    const h: any = langchainHandler();
    await h.handleToolStart({ name: 'calc' }, '{}', 'r1');
    await h.handleToolEnd({ content: [{ type: 'text', text: 'hi' }] }, 'r1');
    const circ: any = {};
    circ.self = circ;
    await h.handleToolStart({ name: 'calc' }, '{}', 'r2');
    await h.handleToolEnd(circ, 'r2');
    const vals = exporter.getFinishedSpans().map((s) => s.attributes['output.value']);
    expect(JSON.parse(vals[0] as string)).toEqual([{ type: 'text', text: 'hi' }]);
    expect(vals[1]).not.toBe('[object Object]');
  });

  it('keeps inline base64 and credential urls out of structured tool output', async () => {
    const b64 = 'A'.repeat(200000);
    const signed = 'https://user:hunter2@cdn.example.com/a.png?X-Amz-Signature=sekret123&X-Amz-Credential=AKIAEXAMPLE';
    const h: any = langchainHandler();
    await h.handleToolStart({ name: 'calc' }, '{}', 'r1');
    await h.handleToolEnd(
      {
        content: [
          { type: 'text', text: 'done' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          { type: 'image_url', image_url: { url: signed } },
        ],
      },
      'r1',
    );
    const value = String(toolOutput());
    expect(value).toContain('done');
    expect(value).not.toContain(b64.slice(0, 200));
    expect(value).not.toContain('hunter2');
    expect(value).not.toContain('sekret123');
  });
});
