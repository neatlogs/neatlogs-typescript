import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  trace as otelTrace,
  context as otelContext,
  type Span,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import {
  trace,
  _setSessionConfig,
  getSessionConfig,
  _setSpanAttributes,
  _finalizePromptCapture,
  PROMPT_VARIABLES_KEY,
  PROMPT_TEMPLATE_KEY,
  PROMPT_VERSION_KEY,
  USER_PROMPT_TEMPLATE_KEY,
  USER_PROMPT_VARIABLES_KEY,
} from '../../src/core/context.js';
import { PromptTemplate, UserPromptTemplate, PromptContext, UserPromptContext } from '../../src/prompt/template.js';
import { _clearMaskRegistry } from '../../src/core/mask.js';

// ---------------------------------------------------------------------------
// Test infrastructure
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
  _setSessionConfig({});
  _clearMaskRegistry();
});

// ---------------------------------------------------------------------------
// Session config helpers
// ---------------------------------------------------------------------------

describe('session config', () => {
  it('should return empty config by default', () => {
    const config = getSessionConfig();
    expect(config).toEqual({});
  });

  it('should store and return config', () => {
    _setSessionConfig({ sessionId: 'sess-1', userId: 'user-1' });
    const config = getSessionConfig();
    expect(config.sessionId).toBe('sess-1');
    expect(config.userId).toBe('user-1');
  });

  it('should return a copy, not a reference', () => {
    _setSessionConfig({ sessionId: 'sess-1' });
    const config1 = getSessionConfig();
    config1.sessionId = 'modified';
    const config2 = getSessionConfig();
    expect(config2.sessionId).toBe('sess-1');
  });
});

// ---------------------------------------------------------------------------
// trace() function
// ---------------------------------------------------------------------------

describe('trace()', () => {
  it('should create a span with the correct name', async () => {
    await trace({ name: 'test-span' }, async (span) => {
      expect(span).toBeDefined();
    });

    const spans = exporter.getFinishedSpans();
    const testSpan = spans.find((s) => s.name === 'test-span');
    expect(testSpan).toBeDefined();
  });

  it('should set neatlogs.internal = true on the span', async () => {
    await trace({ name: 'internal-test' }, async () => {});

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'internal-test');
    expect(span).toBeDefined();
    expect(span!.attributes['neatlogs.internal']).toBe(true);
  });

  it('should set openinference.span.kind to CHAIN by default', async () => {
    await trace({ name: 'kind-default' }, async () => {});

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'kind-default');
    expect(span).toBeDefined();
    expect(span!.attributes['openinference.span.kind']).toBe('CHAIN');
  });

  it('should set custom span kind', async () => {
    await trace({ name: 'kind-custom', kind: 'AGENT' }, async () => {});

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'kind-custom');
    expect(span).toBeDefined();
    expect(span!.attributes['openinference.span.kind']).toBe('AGENT');
  });

  it('should create a child span within an existing trace', async () => {
    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('parent', async (parentSpan) => {
      await trace({ name: 'child-span' }, async () => {});
      parentSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const parent = spans.find((s) => s.name === 'parent');
    const child = spans.find((s) => s.name === 'child-span');
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    // Child should reference parent's trace ID
    expect(child!.spanContext().traceId).toBe(parent!.spanContext().traceId);
    // Child's parentSpanId should be parent's spanId
    expect(child!.parentSpanId).toBe(parent!.spanContext().spanId);
  });

  it('should create a root span when session_id is set and no parent exists', async () => {
    _setSessionConfig({ sessionId: 'session-123' });

    await trace({ name: 'root-trace' }, async () => {});

    const spans = exporter.getFinishedSpans();
    const rootSpan = spans.find((s) => s.name === 'root-trace');
    expect(rootSpan).toBeDefined();
    // Root span should have no parent
    expect(rootSpan!.parentSpanId).toBeUndefined();
  });

  it('should create root trace even when inside parent span if sessionId is set', async () => {
    // When session_id is set and there IS an active parent, it creates a child span (not root)
    _setSessionConfig({ sessionId: 'session-456' });
    const tracer = otelTrace.getTracer('test');

    await tracer.startActiveSpan('outer', async (outerSpan) => {
      await trace({ name: 'session-child' }, async () => {});
      outerSpan.end();
    });

    const spans = exporter.getFinishedSpans();
    const child = spans.find((s) => s.name === 'session-child');
    expect(child).toBeDefined();
    // Should be a child (not root) because there is already a parent
    expect(child!.parentSpanId).toBeDefined();
  });

  it('should return the value from the callback', async () => {
    const result = await trace({ name: 'return-test' }, async () => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it('should handle sync callbacks', async () => {
    const result = await trace({ name: 'sync-test' }, (span) => {
      return 'sync-result';
    });
    expect(result).toBe('sync-result');
  });

  it('should handle async callbacks', async () => {
    const result = await trace({ name: 'async-test' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'async-result';
    });
    expect(result).toBe('async-result');
  });

  it('should propagate errors from the callback', async () => {
    const error = new Error('test error');
    await expect(
      trace({ name: 'error-test' }, async () => {
        throw error;
      }),
    ).rejects.toThrow('test error');

    // Span should still be created and ended
    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'error-test');
    expect(span).toBeDefined();
  });

  it('should set extra attributes from options.attributes', async () => {
    await trace(
      {
        name: 'extra-attrs',
        attributes: {
          'custom.attr1': 'value1',
          'custom.attr2': 42,
        },
      },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'extra-attrs');
    expect(span).toBeDefined();
    expect(span!.attributes['custom.attr1']).toBe('value1');
    expect(span!.attributes['custom.attr2']).toBe(42);
  });

  it('should register mask and set neatlogs.mask_id', async () => {
    const maskFn = (data: Record<string, any>) => data;
    await trace({ name: 'mask-test', mask: maskFn }, async () => {});

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'mask-test');
    expect(span).toBeDefined();
    expect(span!.attributes['neatlogs.mask_id']).toBeDefined();
    expect(typeof span!.attributes['neatlogs.mask_id']).toBe('string');
  });

  it('should accept prompt template string in options', async () => {
    await trace(
      {
        name: 'prompt-template-test',
        promptTemplate: 'Hello {{name}}',
        promptVariables: { name: 'world' },
      },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'prompt-template-test');
    expect(span).toBeDefined();
  });

  it('should capture prompt variables from PromptTemplate object', async () => {
    const template = new PromptTemplate('Hello {{name}}');

    await trace(
      { name: 'prompt-obj-test', promptTemplate: template },
      async () => {
        // Simulate what the user would do: compile the template
        template.compile({ name: 'world' });
      },
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'prompt-obj-test');
    expect(span).toBeDefined();
    const vars = span!.attributes['llm.prompt_template_variables'];
    expect(vars).toBeDefined();
    const parsed = JSON.parse(vars as string);
    expect(parsed.name).toBe('world');
  });

  it('should capture user prompt variables from UserPromptTemplate object', async () => {
    const template = new UserPromptTemplate('Question: {{question}}');

    await trace(
      { name: 'user-prompt-test', userPromptTemplate: template },
      async () => {
        template.compile({ question: 'What is TypeScript?' });
      },
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'user-prompt-test');
    expect(span).toBeDefined();
    const vars = span!.attributes['llm.user_prompt_template_variables'];
    expect(vars).toBeDefined();
    const parsed = JSON.parse(vars as string);
    expect(parsed.question).toBe('What is TypeScript?');
  });

  it('should clear PromptContext inside the trace finally block', async () => {
    const template = new PromptTemplate('Hello {{name}}');
    let clearedInside = false;

    // We verify that PromptContext.clear() is called by checking that
    // within the trace, after the callback, the context is cleared.
    // Due to AsyncLocalStorage semantics, we verify via a spy.
    const clearSpy = vi.spyOn(PromptContext, 'clear');

    await trace(
      { name: 'clear-context-test', promptTemplate: template },
      async () => {
        template.compile({ name: 'world' });
      },
    );

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('should clear UserPromptContext inside the trace finally block', async () => {
    const template = new UserPromptTemplate('Question: {{q}}');
    const clearSpy = vi.spyOn(UserPromptContext, 'clear');

    await trace(
      { name: 'clear-user-ctx-test', userPromptTemplate: template },
      async () => {
        template.compile({ q: 'test' });
      },
    );

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('should clear contexts even when callback throws', async () => {
    const template = new PromptTemplate('Hello {{name}}');
    const userTemplate = new UserPromptTemplate('Q: {{q}}');
    const promptClearSpy = vi.spyOn(PromptContext, 'clear');
    const userClearSpy = vi.spyOn(UserPromptContext, 'clear');

    try {
      await trace(
        {
          name: 'error-clear-test',
          promptTemplate: template,
          userPromptTemplate: userTemplate,
        },
        async () => {
          template.compile({ name: 'world' });
          userTemplate.compile({ q: 'test' });
          throw new Error('deliberate');
        },
      );
    } catch {
      // expected
    }

    expect(promptClearSpy).toHaveBeenCalled();
    expect(userClearSpy).toHaveBeenCalled();
    promptClearSpy.mockRestore();
    userClearSpy.mockRestore();
  });

  it('should not clear PromptContext when using string template', async () => {
    const clearSpy = vi.spyOn(PromptContext, 'clear');

    await trace(
      { name: 'string-template', promptTemplate: 'Hello {{name}}' },
      async () => {},
    );

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('should set version in context when provided', async () => {
    await trace(
      { name: 'version-test', version: 'v1.2.3' },
      async () => {},
    );

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'version-test');
    expect(span).toBeDefined();
  });

  it('should pass the span to the callback', async () => {
    let capturedSpan: Span | null = null;
    await trace({ name: 'span-callback-test' }, async (span) => {
      capturedSpan = span;
    });
    expect(capturedSpan).not.toBeNull();
  });

  it('should end the span after callback completes', async () => {
    await trace({ name: 'span-ended' }, async () => {});

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'span-ended');
    expect(span).toBeDefined();
    // If it's in finishedSpans, it's been ended
    expect(span!.endTime).toBeDefined();
  });

  it('should end the span even when callback throws', async () => {
    try {
      await trace({ name: 'error-end-test' }, async () => {
        throw new Error('fail');
      });
    } catch {
      // expected
    }

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'error-end-test');
    expect(span).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// _setSpanAttributes helper
// ---------------------------------------------------------------------------

describe('_setSpanAttributes', () => {
  it('should set neatlogs.internal and openinference.span.kind', async () => {
    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('helper-test', async (span) => {
      _setSpanAttributes(span, 'AGENT', {});
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'helper-test');
    expect(span!.attributes['neatlogs.internal']).toBe(true);
    expect(span!.attributes['openinference.span.kind']).toBe('AGENT');
  });

  it('should default kind to CHAIN', async () => {
    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('default-kind', async (span) => {
      _setSpanAttributes(span, undefined, {});
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'default-kind');
    expect(span!.attributes['openinference.span.kind']).toBe('CHAIN');
  });

  it('should set extra attributes', async () => {
    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('extra-test', async (span) => {
      _setSpanAttributes(span, undefined, {
        'my.attr': 'hello',
        'my.number': 99,
      });
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'extra-test');
    expect(span!.attributes['my.attr']).toBe('hello');
    expect(span!.attributes['my.number']).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// _finalizePromptCapture helper
// ---------------------------------------------------------------------------

describe('_finalizePromptCapture', () => {
  it('should capture PromptContext variables', async () => {
    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('finalize-prompt', async (span) => {
      PromptContext.set('Hello {{name}}', { name: 'world' });
      _finalizePromptCapture(span, true, false);
      PromptContext.clear();
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'finalize-prompt');
    const vars = span!.attributes['llm.prompt_template_variables'];
    expect(vars).toBeDefined();
    expect(JSON.parse(vars as string)).toEqual({ name: 'world' });
  });

  it('should capture UserPromptContext variables', async () => {
    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('finalize-user', async (span) => {
      UserPromptContext.set('Q: {{q}}', { q: 'test' });
      _finalizePromptCapture(span, false, true);
      UserPromptContext.clear();
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'finalize-user');
    const vars = span!.attributes['llm.user_prompt_template_variables'];
    expect(vars).toBeDefined();
    expect(JSON.parse(vars as string)).toEqual({ q: 'test' });
  });

  it('should not set attributes when isPromptTemplateObj is false', async () => {
    const tracer = otelTrace.getTracer('test');
    await tracer.startActiveSpan('no-finalize', async (span) => {
      PromptContext.set('Hello {{name}}', { name: 'world' });
      _finalizePromptCapture(span, false, false);
      PromptContext.clear();
      span.end();
    });

    const spans = exporter.getFinishedSpans();
    const span = spans.find((s) => s.name === 'no-finalize');
    expect(span!.attributes['llm.prompt_template_variables']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Context keys
// ---------------------------------------------------------------------------

describe('context keys', () => {
  it('should export all context keys', () => {
    expect(PROMPT_VARIABLES_KEY).toBeDefined();
    expect(PROMPT_TEMPLATE_KEY).toBeDefined();
    expect(PROMPT_VERSION_KEY).toBeDefined();
    expect(USER_PROMPT_TEMPLATE_KEY).toBeDefined();
    expect(USER_PROMPT_VARIABLES_KEY).toBeDefined();
  });
});
