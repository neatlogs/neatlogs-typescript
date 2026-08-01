/**
 * Additional edge-case tests for trace() from core/context.ts.
 * Covers: nested traces, duck-typed template objects, extra option keys,
 * structural prompt templates, and edge cases.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  trace as otelTrace,
  type Span,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';

import {
  trace,
  _setSessionConfig,
  _setSpanAttributes,
} from '../../src/core/context.js';
import { PromptTemplate, UserPromptTemplate, PromptContext, UserPromptContext } from '../../src/prompt/template.js';
import { _clearMaskRegistry } from '../../src/core/mask.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;

beforeAll(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});

afterAll(async () => {
  _setNeatlogsProvider(null);
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
  _setSessionConfig({});
  _clearMaskRegistry();
});

// ---------------------------------------------------------------------------
// Nested trace() calls
// ---------------------------------------------------------------------------

describe('nested trace() calls', () => {
  it('should create proper parent-child relationships for nested traces', async () => {
    await trace({ name: 'outer' }, async () => {
      await trace({ name: 'middle' }, async () => {
        await trace({ name: 'inner' }, async () => {
          return 'deep';
        });
      });
    });

    const spans = exporter.getFinishedSpans();
    const outer = spans.find((s) => s.name === 'outer');
    const middle = spans.find((s) => s.name === 'middle');
    const inner = spans.find((s) => s.name === 'inner');

    expect(outer).toBeDefined();
    expect(middle).toBeDefined();
    expect(inner).toBeDefined();

    // All should share the same trace ID
    expect(middle!.spanContext().traceId).toBe(outer!.spanContext().traceId);
    expect(inner!.spanContext().traceId).toBe(outer!.spanContext().traceId);

    // Verify parent-child chain
    expect(middle!.parentSpanId).toBe(outer!.spanContext().spanId);
    expect(inner!.parentSpanId).toBe(middle!.spanContext().spanId);
  });

  it('should handle parallel nested traces', async () => {
    await trace({ name: 'parent' }, async () => {
      const [r1, r2] = await Promise.all([
        trace({ name: 'child-1' }, async () => 'result-1'),
        trace({ name: 'child-2' }, async () => 'result-2'),
      ]);
      expect(r1).toBe('result-1');
      expect(r2).toBe('result-2');
    });

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((s) => s.name === 'parent');
    const child1 = spans.find((s) => s.name === 'child-1');
    const child2 = spans.find((s) => s.name === 'child-2');

    expect(parent).toBeDefined();
    expect(child1).toBeDefined();
    expect(child2).toBeDefined();

    // Both children should share the same trace ID as parent
    expect(child1!.spanContext().traceId).toBe(parent!.spanContext().traceId);
    expect(child2!.spanContext().traceId).toBe(parent!.spanContext().traceId);
  });

  it('should create separate root traces with session ID when no parent', async () => {
    _setSessionConfig({ sessionId: 'multi-turn-session' });

    // First trace (no parent)
    await trace({ name: 'turn-1' }, async () => 'hello');
    // Second trace (no parent, since first ended)
    await trace({ name: 'turn-2' }, async () => 'world');

    const spans = exporter.getFinishedSpans();
    const turn1 = spans.find((s) => s.name === 'turn-1');
    const turn2 = spans.find((s) => s.name === 'turn-2');

    expect(turn1).toBeDefined();
    expect(turn2).toBeDefined();

    // Both should be root spans (no parent)
    expect(turn1!.parentSpanId).toBeUndefined();
    expect(turn2!.parentSpanId).toBeUndefined();

    // They should have different trace IDs (separate root traces)
    expect(turn1!.spanContext().traceId).not.toBe(turn2!.spanContext().traceId);
  });
});

// ---------------------------------------------------------------------------
// Duck-typed template objects
// ---------------------------------------------------------------------------

describe('trace() with structural/duck-typed template objects', () => {
  it('should accept a plain object with template and variables as promptTemplate', async () => {
    const structuralTemplate = {
      template: 'Hello {{name}}',
      variables: ['name'],
    };

    await trace(
      { name: 'duck-type-test', promptTemplate: structuralTemplate as any },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'duck-type-test');
    expect(span).toBeDefined();
  });

  it('should accept a plain object as userPromptTemplate', async () => {
    const structuralUserTemplate = {
      template: 'Question: {{q}}',
      variables: ['q'],
    };

    await trace(
      { name: 'duck-type-user', userPromptTemplate: structuralUserTemplate as any },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'duck-type-user');
    expect(span).toBeDefined();
  });

  it('should handle PromptMessage array template in duck-typed object', async () => {
    const structuralTemplate = {
      template: [
        { role: 'system', content: 'You are {{role}}' },
        { role: 'user', content: '{{question}}' },
      ],
      variables: ['role', 'question'],
    };

    await trace(
      { name: 'msg-array-duck', promptTemplate: structuralTemplate as any },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'msg-array-duck');
    expect(span).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Extra option keys forwarded as attributes
// ---------------------------------------------------------------------------

describe('trace() extra option keys', () => {
  it('should forward non-standard option keys as span attributes', async () => {
    await trace(
      {
        name: 'extra-keys',
        kind: 'CHAIN',
        custom_key: 'custom_value',
        another_key: 42,
      } as any,
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'extra-keys');
    expect(span).toBeDefined();
    expect(span!.attributes['custom_key']).toBe('custom_value');
    expect(span!.attributes['another_key']).toBe(42);
  });

  it('should not forward known option keys as extra attributes', async () => {
    await trace(
      {
        name: 'no-forward',
        kind: 'WORKFLOW',
        version: 'v1',
      },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'no-forward');
    expect(span).toBeDefined();
    // Known keys should not appear as extra attributes
    expect(span!.attributes['version']).toBeUndefined();
  });

  it('should merge explicit attributes with extra option keys', async () => {
    await trace(
      {
        name: 'merge-test',
        attributes: { 'explicit.attr': 'explicit_val' },
        extra_attr: 'extra_val',
      } as any,
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'merge-test');
    expect(span).toBeDefined();
    expect(span!.attributes['explicit.attr']).toBe('explicit_val');
    expect(span!.attributes['extra_attr']).toBe('extra_val');
  });
});

// ---------------------------------------------------------------------------
// trace() with various span kinds
// ---------------------------------------------------------------------------

describe('trace() with various span kinds', () => {
  const spanKinds = ['WORKFLOW', 'AGENT', 'CHAIN', 'TOOL', 'RETRIEVER', 'EMBEDDING', 'MCP_TOOL', 'GUARDRAIL'] as const;

  for (const kind of spanKinds) {
    it(`should set openinference.span.kind to ${kind}`, async () => {
      await trace({ name: `kind-${kind}`, kind }, async () => {});

      const spans = exporter.getFinishedSpans();
      const span = spans.find((s) => s.name === `kind-${kind}`);
      expect(span).toBeDefined();
      expect(span!.attributes['openinference.span.kind']).toBe(kind);
    });
  }
});

// ---------------------------------------------------------------------------
// trace() return value propagation
// ---------------------------------------------------------------------------

describe('trace() return value propagation', () => {
  it('should return complex objects from callback', async () => {
    const result = await trace({ name: 'complex-return' }, async () => {
      return { data: [1, 2, 3], nested: { key: 'value' } };
    });
    expect(result).toEqual({ data: [1, 2, 3], nested: { key: 'value' } });
  });

  it('should return null from callback', async () => {
    const result = await trace({ name: 'null-return' }, async () => null);
    expect(result).toBeNull();
  });

  it('should return undefined from callback', async () => {
    const result = await trace({ name: 'undefined-return' }, async () => undefined);
    expect(result).toBeUndefined();
  });

  it('should return array from callback', async () => {
    const result = await trace({ name: 'array-return' }, async () => [1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// trace() with mask
// ---------------------------------------------------------------------------

describe('trace() with mask function', () => {
  it('should register mask and set mask_id attribute', async () => {
    const maskFn = (data: Record<string, any>) => {
      const copy = { ...data };
      delete copy.secret;
      return copy;
    };

    await trace({ name: 'mask-trace', mask: maskFn }, async () => {});

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'mask-trace');
    expect(span).toBeDefined();
    expect(span!.attributes['neatlogs.mask_id']).toBeDefined();
    expect(typeof span!.attributes['neatlogs.mask_id']).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// trace() prompt template with version
// ---------------------------------------------------------------------------

describe('trace() with prompt template and version', () => {
  it('should accept promptVariables without template', async () => {
    await trace(
      {
        name: 'vars-only',
        promptVariables: { key: 'value' },
      },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'vars-only');
    expect(span).toBeDefined();
  });

  it('should accept userPromptVariables without template', async () => {
    await trace(
      {
        name: 'user-vars-only',
        userPromptVariables: { question: 'test' },
      },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'user-vars-only');
    expect(span).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// _setSpanAttributes edge cases
// ---------------------------------------------------------------------------

describe('_setSpanAttributes edge cases', () => {
  it('should handle empty attributes object', async () => {
    const tracer = provider.getTracer('test');
    await tracer.startActiveSpan('empty-attrs', async (span) => {
      _setSpanAttributes(span, 'CHAIN', {});
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'empty-attrs');
    expect(span).toBeDefined();
    expect(span!.attributes['neatlogs.internal']).toBeUndefined();
    expect(span!.attributes['openinference.span.kind']).toBe('CHAIN');
  });

  it('should handle large number of extra attributes', async () => {
    const tracer = provider.getTracer('test');
    const largeAttrs: Record<string, any> = {};
    for (let i = 0; i < 100; i++) {
      largeAttrs[`custom.attr.${i}`] = `value-${i}`;
    }

    await tracer.startActiveSpan('many-attrs', async (span) => {
      _setSpanAttributes(span, 'WORKFLOW', largeAttrs);
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'many-attrs');
    expect(span).toBeDefined();
    expect(span!.attributes['custom.attr.0']).toBe('value-0');
    expect(span!.attributes['custom.attr.99']).toBe('value-99');
  });
});
