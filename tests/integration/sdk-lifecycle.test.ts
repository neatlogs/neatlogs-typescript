/**
 * Integration tests for the full SDK lifecycle:
 * span() / trace() → span shapes, error handling, nesting, kind validation
 *
 * Uses a single shared NodeTracerProvider registered once for the suite
 * (provider.register() cannot be called repeatedly — shutdown() prevents
 * re-registration). The exporter is reset between tests.
 *
 * NOTE: span() and trace() use otelTrace.getTracer() (global), so the
 * provider must be the active global provider when they execute.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NeatlogsSpanProcessor } from '../../src/core/span-processor.js';
import { span } from '../../src/decorators/orchestration.js';
import { trace, _setSessionConfig } from '../../src/core/context.js';
import { SpanStatusCode } from '@opentelemetry/api';

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

beforeAll(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new NeatlogsSpanProcessor({ debug: false }));
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register(); // register ONCE for the entire suite
});

afterAll(async () => {
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
  _setSessionConfig({});
});

describe('SDK lifecycle integration', () => {

  // ─── TC-LIFE-1: span() wraps async function and records result ───────────
  it('TC-LIFE-1: span() wraps async function and captures input/output', async () => {
    const add = span({ kind: 'TOOL', name: 'add' }, async (a: number, b: number) => a + b);

    const result = await add(3, 4);
    expect(result).toBe(7);

    const spans = exporter.getFinishedSpans();
    const addSpan = spans.find(s => s.name === 'add');
    expect(addSpan).toBeDefined();
    expect(addSpan!.attributes['openinference.span.kind']).toBe('TOOL');
    expect(addSpan!.attributes['input.value']).toBeDefined();
    expect(addSpan!.attributes['output.value']).toBeDefined();
    const output = JSON.parse(addSpan!.attributes['output.value'] as string);
    expect(output).toBe(7);
  });

  // ─── TC-LIFE-2: span() sets ERROR status when function throws ────────────
  it('TC-LIFE-2: span() records exception and sets ERROR status on throw', async () => {
    const failing = span({ kind: 'CHAIN', name: 'failing-chain' }, async () => {
      throw new Error('chain exploded');
    });

    await expect(failing()).rejects.toThrow('chain exploded');

    const spans = exporter.getFinishedSpans();
    const s = spans.find(sp => sp.name === 'failing-chain');
    expect(s).toBeDefined();
    expect(s!.status.code).toBe(SpanStatusCode.ERROR);
    expect(s!.status.message).toBe('chain exploded');
    const exEvent = s!.events.find(e => e.name === 'exception');
    expect(exEvent).toBeDefined();
    expect(exEvent!.attributes!['exception.message']).toBe('chain exploded');
  });

  // ─── TC-LIFE-3: trace() creates a span with correct kind attribute ────────
  it('TC-LIFE-3: trace() creates a span with correct kind attribute', async () => {
    await trace({ name: 'my-workflow', kind: 'WORKFLOW' }, async (s) => {
      s.setAttribute('custom.attr', 'hello');
    });

    const spans = exporter.getFinishedSpans();
    const wf = spans.find(s => s.name === 'my-workflow');
    expect(wf).toBeDefined();
    expect(wf!.attributes['openinference.span.kind']).toBe('WORKFLOW');
    expect(wf!.attributes['custom.attr']).toBe('hello');
    expect(wf!.attributes['neatlogs.internal']).toBe(true);
  });

  // ─── TC-LIFE-4: trace() always ends span, even when callback throws ───────
  it('TC-LIFE-4: trace() always ends span even when callback throws', async () => {
    await expect(
      trace({ name: 'throwing-trace' }, async () => {
        throw new Error('trace error');
      })
    ).rejects.toThrow('trace error');

    const spans = exporter.getFinishedSpans();
    const s = spans.find(sp => sp.name === 'throwing-trace');
    expect(s).toBeDefined();
    expect(s!.endTime[0]).toBeGreaterThan(0);
    expect(s!.status.code).toBe(SpanStatusCode.ERROR);
  });

  // ─── TC-LIFE-5: Nested spans form correct parent-child hierarchy ──────────
  it('TC-LIFE-5: nested span() calls form correct parent-child hierarchy', async () => {
    const inner = span({ kind: 'TOOL', name: 'inner-tool' }, async () => 'inner-result');
    const outer = span({ kind: 'WORKFLOW', name: 'outer-workflow' }, async () => {
      return await inner();
    });

    await outer();

    const spans = exporter.getFinishedSpans();
    const outerSpan = spans.find(s => s.name === 'outer-workflow');
    const innerSpan = spans.find(s => s.name === 'inner-tool');

    expect(outerSpan).toBeDefined();
    expect(innerSpan).toBeDefined();
    expect(innerSpan!.parentSpanId).toBe(outerSpan!.spanContext().spanId);
    expect(outerSpan!.parentSpanId).toBeUndefined();
  });

  // ─── TC-LIFE-6: span kind validation rejects invalid kinds ────────────────
  it('TC-LIFE-6: span() throws on invalid kind', () => {
    expect(() => {
      span({ kind: 'INVALID_KIND' as any, name: 'test' }, async () => {});
    }).toThrow(/Invalid span kind/);
  });

  // ─── TC-LIFE-7: trace() with sessionId creates independent root traces ────
  it('TC-LIFE-7: trace() with sessionId creates independent root traces', async () => {
    _setSessionConfig({ sessionId: 'test-session-123' });

    await trace({ name: 'root-trace-1' }, async () => 'r1');
    await trace({ name: 'root-trace-2' }, async () => 'r2');

    const spans = exporter.getFinishedSpans();
    const s1 = spans.find(s => s.name === 'root-trace-1');
    const s2 = spans.find(s => s.name === 'root-trace-2');

    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    // Each root trace has its own traceId (independent traces per sessionId semantics)
    expect(s1!.spanContext().traceId).not.toBe(s2!.spanContext().traceId);
    expect(s1!.parentSpanId).toBeUndefined();
    expect(s2!.parentSpanId).toBeUndefined();
  });

  // ─── TC-LIFE-8: span() with captureInput:false omits input attribute ──────
  it('TC-LIFE-8: span() with captureInput:false omits input.value', async () => {
    const fn = span({ kind: 'CHAIN', name: 'no-capture', captureInput: false }, async (x: string) => x);
    await fn('secret-data');

    const spans = exporter.getFinishedSpans();
    const s = spans.find(sp => sp.name === 'no-capture');
    expect(s).toBeDefined();
    expect(s!.attributes['input.value']).toBeUndefined();
    expect(s!.attributes['output.value']).toBeDefined(); // output still captured
  });

  // ─── TC-LIFE-9: AGENT span gets role/goal attributes ─────────────────────
  it('TC-LIFE-9: AGENT span gets role and goal attributes', async () => {
    const agent = span({
      kind: 'AGENT',
      name: 'my-agent',
      role: 'Researcher',
      goal: 'Find information',
    }, async () => ({ answer: 42 }));

    await agent();

    const spans = exporter.getFinishedSpans();
    const s = spans.find(sp => sp.name === 'my-agent');
    expect(s).toBeDefined();
    expect(s!.attributes['openinference.span.kind']).toBe('AGENT');
    expect(s!.attributes['neatlogs.agent.role']).toBe('Researcher');
    expect(s!.attributes['neatlogs.agent.goal']).toBe('Find information');
  });

  // ─── TC-LIFE-10: span() return value passes through correctly ────────────
  it('TC-LIFE-10: span() return value passes through (sync-in-async)', async () => {
    const greet = span({ kind: 'CHAIN', name: 'greeter' }, async (name: string) => `Hello, ${name}!`);
    const result = await greet('World');
    expect(result).toBe('Hello, World!');
  });
});
