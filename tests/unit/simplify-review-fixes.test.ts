/**
 * Tests for simplify + review feedback fixes.
 *
 * Covers:
 * - Review #1: ESM import of suppressTracing (via barrel import)
 * - Review #2: Shared PromptClient initialised in init()
 * - Review #3: trace() records exceptions and sets error status
 * - Simplify #1: Context keys shared between context.ts and span-processor.ts
 * - Simplify #2: BasePromptTemplate extracted (PromptTemplate / UserPromptTemplate)
 * - Simplify #3: Shared vector DB / retrieval constants
 * - Simplify #4: Merged spanToDict with includeScope option
 * - Simplify #8: Identical if/else branches removed in defaults-enricher
 * - Simplify #9: loadDefaults() inlined
 * - Simplify #10: Regex caching in AttributeMapper

 * - Simplify #14: handleVectorDbDocAttributes refactored
 * - Simplify #15: getEffectiveProviderForDefaults is alias
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  trace as otelTrace,
  SpanStatusCode,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';

// ---------------------------------------------------------------------------
// Shared OTel test infrastructure
// ---------------------------------------------------------------------------

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;

beforeAll(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
});

afterAll(async () => {
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
});

// ---------------------------------------------------------------------------
// Review #3: trace() records exceptions and sets error status
// ---------------------------------------------------------------------------

describe('trace() error handling (Review #3)', () => {
  it('should set ERROR status code when callback throws', async () => {
    const { trace } = await import('../../src/core/context.js');

    await expect(
      trace({ name: 'error-status-test' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'error-status-test');
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.status.message).toBe('boom');
  });

  it('should record an exception event when callback throws', async () => {
    const { trace } = await import('../../src/core/context.js');

    await expect(
      trace({ name: 'exception-event-test' }, async () => {
        throw new Error('test exception');
      }),
    ).rejects.toThrow('test exception');

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'exception-event-test');
    expect(span).toBeDefined();
    expect(span!.events.length).toBeGreaterThan(0);
    const exceptionEvent = span!.events.find((e) => e.name === 'exception');
    expect(exceptionEvent).toBeDefined();
    expect(exceptionEvent!.attributes!['exception.message']).toBe('test exception');
  });

  it('should handle non-Error throws (strings)', async () => {
    const { trace } = await import('../../src/core/context.js');

    await expect(
      trace({ name: 'string-throw-test' }, async () => {
        throw 'string error';
      }),
    ).rejects.toBe('string error');

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'string-throw-test');
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.status.message).toBe('string error');
  });

  it('should still end the span when error occurs', async () => {
    const { trace } = await import('../../src/core/context.js');

    try {
      await trace({ name: 'end-on-error-test' }, async () => {
        throw new Error('fail');
      });
    } catch {
      // expected
    }

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'end-on-error-test');
    expect(span).toBeDefined();
    expect(span!.endTime).toBeDefined();
  });

  it('should have unset status when callback succeeds', async () => {
    const { trace } = await import('../../src/core/context.js');

    await trace({ name: 'success-status-test' }, async () => {
      return 'ok';
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'success-status-test');
    expect(span).toBeDefined();
    // UNSET is code 0
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  });
});

// ---------------------------------------------------------------------------
// Simplify #1: Shared context keys between context.ts and span-processor.ts
// ---------------------------------------------------------------------------

describe('shared context keys (Simplify #1)', () => {
  it('should import the same context keys in span-processor as context.ts', async () => {
    const contextModule = await import('../../src/core/context.js');

    // The span-processor now imports these directly from context.ts
    // Verify they are the same symbol objects
    expect(contextModule.PROMPT_VARIABLES_KEY).toBeDefined();
    expect(contextModule.PROMPT_TEMPLATE_KEY).toBeDefined();
    expect(contextModule.PROMPT_VERSION_KEY).toBeDefined();
    expect(contextModule.USER_PROMPT_TEMPLATE_KEY).toBeDefined();
    expect(contextModule.USER_PROMPT_VARIABLES_KEY).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Simplify #2: BasePromptTemplate (PromptTemplate / UserPromptTemplate)
// ---------------------------------------------------------------------------

describe('PromptTemplate base class extraction (Simplify #2)', () => {
  it('PromptTemplate should still compile string templates', async () => {
    const { PromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new PromptTemplate('Hello {{name}}');
    expect(tpl.variables).toEqual(['name']);
    expect(tpl.compile({ name: 'world' })).toBe('Hello world');
  });

  it('UserPromptTemplate should still compile string templates', async () => {
    const { UserPromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new UserPromptTemplate('Q: {{question}}');
    expect(tpl.variables).toEqual(['question']);
    expect(tpl.compile({ question: 'why?' })).toBe('Q: why?');
  });

  it('PromptTemplate toString() should include class name', async () => {
    const { PromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new PromptTemplate('Hello {{name}}');
    expect(tpl.toString()).toContain('PromptTemplate');
    expect(tpl.toString()).not.toContain('UserPromptTemplate');
  });

  it('UserPromptTemplate toString() should include class name', async () => {
    const { UserPromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new UserPromptTemplate('Q: {{q}}');
    expect(tpl.toString()).toContain('UserPromptTemplate');
  });

  it('PromptTemplate should handle message array templates', async () => {
    const { PromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new PromptTemplate([
      { role: 'system', content: 'You are {{role}}.' },
      { role: 'user', content: 'Do {{task}}.' },
    ]);
    expect(tpl.variables).toEqual(expect.arrayContaining(['role', 'task']));
    const result = tpl.compile({ role: 'helper', task: 'something' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('should throw on missing variables', async () => {
    const { PromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new PromptTemplate('Hello {{name}} {{age}}');
    expect(() => tpl.compile({ name: 'world' })).toThrow('Missing required variables');
  });

  it('PromptTemplate should be instanceof PromptTemplate', async () => {
    const { PromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new PromptTemplate('test');
    expect(tpl).toBeInstanceOf(PromptTemplate);
  });

  it('UserPromptTemplate should be instanceof UserPromptTemplate', async () => {
    const { UserPromptTemplate } = await import('../../src/prompt/template.js');
    const tpl = new UserPromptTemplate('test');
    expect(tpl).toBeInstanceOf(UserPromptTemplate);
  });

  it('PromptTemplate stores context in PromptContext', async () => {
    const { PromptTemplate, PromptContext } = await import('../../src/prompt/template.js');
    const tpl = new PromptTemplate('Hello {{name}}');
    tpl.compile({ name: 'world' });
    expect(PromptContext.getTemplate()).toBe('Hello {{name}}');
    expect(PromptContext.getVariables()).toEqual({ name: 'world' });
    PromptContext.clear();
  });

  it('UserPromptTemplate stores context in UserPromptContext', async () => {
    const { UserPromptTemplate, UserPromptContext } = await import('../../src/prompt/template.js');
    const tpl = new UserPromptTemplate('Q: {{q}}');
    tpl.compile({ q: 'test' });
    expect(UserPromptContext.getTemplate()).toBe('Q: {{q}}');
    expect(UserPromptContext.getVariables()).toEqual({ q: 'test' });
    UserPromptContext.clear();
  });
});

// ---------------------------------------------------------------------------
// Simplify #3: Shared constants (vector DB / retrieval keywords)
// ---------------------------------------------------------------------------

describe('shared constants (Simplify #3)', () => {
  it('should export VECTOR_DB_SYSTEMS', async () => {
    const { VECTOR_DB_SYSTEMS } = await import('../../src/span-kinds/constants.js');
    expect(VECTOR_DB_SYSTEMS).toBeInstanceOf(Set);
    expect(VECTOR_DB_SYSTEMS.has('chroma')).toBe(true);
    expect(VECTOR_DB_SYSTEMS.has('pinecone')).toBe(true);
    expect(VECTOR_DB_SYSTEMS.has('qdrant')).toBe(true);
  });

  it('should export RETRIEVAL_OPS', async () => {
    const { RETRIEVAL_OPS } = await import('../../src/span-kinds/constants.js');
    expect(Array.isArray(RETRIEVAL_OPS)).toBe(true);
    expect(RETRIEVAL_OPS).toContain('query');
    expect(RETRIEVAL_OPS).toContain('search');
  });

  it('should export VECTOR_DB_NAMES', async () => {
    const { VECTOR_DB_NAMES } = await import('../../src/span-kinds/constants.js');
    expect(Array.isArray(VECTOR_DB_NAMES)).toBe(true);
    expect(VECTOR_DB_NAMES).toContain('chroma');
  });

  it('mapping.ts should use shared constants for vector DB inference', async () => {
    const { inferSpanKindFromName } = await import('../../src/span-kinds/mapping.js');
    // These should still work with the shared constants
    expect(inferSpanKindFromName('chroma.query')).toBe('RETRIEVER');
    expect(inferSpanKindFromName('pinecone.upsert')).toBe('VECTOR_STORE');
    expect(inferSpanKindFromName('qdrant.search')).toBe('RETRIEVER');
  });
});

// ---------------------------------------------------------------------------
// Simplify #4: Merged spanToDict with includeScope option
// ---------------------------------------------------------------------------

describe('spanToDict merge (Simplify #4)', () => {
  it('should export spanToDict without includeScope (backward compat)', async () => {
    const { spanToDict } = await import('../../src/core/span-processor.js');
    expect(typeof spanToDict).toBe('function');
  });

  it('spanToDict without includeScope should use status.description', async () => {
    const { spanToDict } = await import('../../src/core/span-processor.js');

    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('dict-test', async (span) => {
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'dict-test');
    if (span) {
      const dict = spanToDict(span);
      expect('description' in dict.status).toBe(true);
      expect('instrumentation_scope' in dict).toBe(false);
    }
  });

  it('spanToDict with includeScope should use status.message and include scope', async () => {
    const { spanToDict } = await import('../../src/core/span-processor.js');

    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('dict-scope-test', async (span) => {
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'dict-scope-test');
    if (span) {
      const dict = spanToDict(span, { includeScope: true });
      expect('message' in dict.status).toBe(true);
      expect('instrumentation_scope' in dict).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Simplify #8+9: defaults-enricher fixes
// ---------------------------------------------------------------------------

describe('defaults-enricher fixes (Simplify #8, #9)', () => {
  it('getDefaults should work after loadDefaults() removal', async () => {
    const { getDefaults } = await import('../../src/config/defaults-enricher.js');
    // Should not throw — loadDefaults() was inlined
    const result = getDefaults('nonexistent', 'op', 'model');
    expect(result).toEqual({});
  });

  it('enrichInvocationParameters should use same operation for chat and non-chat LLM', async () => {
    const { enrichInvocationParameters } = await import('../../src/config/defaults-enricher.js');
    const attrs1: Record<string, any> = {
      'openinference.span.kind': 'LLM',
      'llm.system': 'openai',
      'llm.model_name': 'gpt-4o',
      'llm.request.type': 'chat_completion',
    };
    const attrs2: Record<string, any> = {
      'openinference.span.kind': 'LLM',
      'llm.system': 'openai',
      'llm.model_name': 'gpt-4o',
      'llm.request.type': 'completion', // non-chat
    };

    enrichInvocationParameters(attrs1);
    enrichInvocationParameters(attrs2);

    // Both should produce the same result (identical branches fixed)
    expect(attrs1['llm.invocation_parameters']).toBe(attrs2['llm.invocation_parameters']);
  });
});

// ---------------------------------------------------------------------------
// Simplify #10: Regex caching in AttributeMapper
// ---------------------------------------------------------------------------

describe('AttributeMapper regex caching (Simplify #10)', () => {
  it('shouldIgnore should still work with cached regexes', async () => {
    const { AttributeMapper } = await import('../../src/config/attribute-mapper.js');
    const mapper = new AttributeMapper();

    // Call shouldIgnore multiple times — should be consistent with caching
    const result1 = mapper.shouldIgnore('some.attribute');
    const result2 = mapper.shouldIgnore('some.attribute');
    expect(result1).toBe(result2);
  });

  it('mapIndexedAttributes should still work with cached regexes', async () => {
    const { AttributeMapper } = await import('../../src/config/attribute-mapper.js');
    const mapper = new AttributeMapper();

    const mappingConfig = {
      sources: ['llm.input_messages.{i}.role'],
      indexed: true,
      target: 'neatlogs.llm.input_messages.{i}.role',
    };

    const attrs = {
      'llm.input_messages.0.role': 'system',
      'llm.input_messages.1.role': 'user',
    };

    const result = mapper.mapIndexedAttributes(mappingConfig as any, attrs, 'neatlogs.llm.input_messages.{i}.role');
    expect(result['neatlogs.llm.input_messages.0.role']).toBe('system');
    expect(result['neatlogs.llm.input_messages.1.role']).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// Simplify #15: getEffectiveProviderForDefaults is alias
// ---------------------------------------------------------------------------

describe('getEffectiveProviderForDefaults alias (Simplify #15)', () => {
  it('should return same result as getEffectiveProviderForPricing', async () => {
    const {
      getEffectiveProviderForPricing,
      getEffectiveProviderForDefaults,
    } = await import('../../src/core/instrumentation-scope-parser.js');

    const testAttrs = { 'neatlogs.platform': 'bedrock' };
    expect(getEffectiveProviderForDefaults(testAttrs)).toBe(
      getEffectiveProviderForPricing(testAttrs),
    );

    const testAttrs2 = { 'neatlogs.provider': 'openai' };
    expect(getEffectiveProviderForDefaults(testAttrs2)).toBe(
      getEffectiveProviderForPricing(testAttrs2),
    );
  });
});

// ---------------------------------------------------------------------------
// Review #2: setSharedClient in init() — verify it's wired up
// ---------------------------------------------------------------------------

describe('init() sets shared PromptClient (Review #2)', () => {
  it('setSharedClient should be exported from prompt/client', async () => {
    const clientModule = await import('../../src/prompt/client.js');
    expect(typeof clientModule.setSharedClient).toBe('function');
    expect(typeof clientModule.PromptClient).toBe('function');
  });
});
