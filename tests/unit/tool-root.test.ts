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
import { traceTool as openaiTool } from '../../src/openai.js';
import { traceTool as anthropicTool } from '../../src/anthropic.js';
import { traceTool as azureTool } from '../../src/azure-openai.js';
import { traceTool as googleTool } from '../../src/google-genai.js';
import { traceTool as vertexTool } from '../../src/vertex-ai.js';
import { traceTool as bedrockTool } from '../../src/bedrock.js';
for (const [name, tool] of Object.entries({openaiTool, anthropicTool, azureTool, googleTool, vertexTool, bedrockTool})) {
  describe(name, () => {
    it('adds and closes a workflow root on success', async () => {
      process.env.NEATLOGS_AUTO_ROOT = 'true';
      expect(await tool('lookup', async (args: any) => args.value)({value: 42})).toBe(42);
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(2);
      const root = spans.find(s => s.attributes['neatlogs.auto_root'] === true)!;
      const child = spans.find(s => s.attributes['neatlogs.span.kind'] === 'TOOL')!;
      expect(root.parentSpanId).toBeUndefined();
      expect(child.parentSpanId).toBe(root.spanContext().spanId);
      expect(child.spanContext().traceId).toBe(root.spanContext().traceId);
    });
    it('closes the root when the tool rejects', async () => {
      process.env.NEATLOGS_AUTO_ROOT = 'true';
      const failure = new Error('tool failed');
      await expect(tool('lookup', async () => {throw failure;})({})).rejects.toBe(failure);
      expect(exporter.getFinishedSpans()).toHaveLength(2);
      expect(exporter.getFinishedSpans().find(s=>s.attributes['neatlogs.span.kind']==='TOOL')?.status.code).toBe(2);
    });
    it('does not create another root inside an existing span', async () => {
      process.env.NEATLOGS_AUTO_ROOT = 'true';
      const parent = getNeatlogsTracer('test').startSpan('workflow');
      await withNeatlogsSpan(parent, () => tool('lookup', async () => 'ok')({}));
      parent.end();
      expect(exporter.getFinishedSpans()).toHaveLength(2);
      expect(exporter.getFinishedSpans().some(s=>s.attributes['neatlogs.auto_root'])).toBe(false);
    });
    it('honors the auto-root opt-out', async () => {
      process.env.NEATLOGS_AUTO_ROOT = 'false';
      await tool('lookup', async () => 'ok')({});
      expect(exporter.getFinishedSpans()).toHaveLength(1);
    });
  });
}
