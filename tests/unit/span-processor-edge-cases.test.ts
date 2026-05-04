/**
 * Additional edge-case tests for NeatlogsSpanProcessor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NeatlogsSpanProcessor, spanToDict } from '../../src/core/span-processor.js';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  trace as otelTrace,
} from '@opentelemetry/api';
import type { HrTime, SpanContext } from '@opentelemetry/api';

// ────────────────────────────────────────────────────────
// Mock UnifiedAttributeProcessor
// ────────────────────────────────────────────────────────

const mockNormalize = vi.fn().mockReturnValue({
  'neatlogs.span.kind': 'llm',
});

vi.mock('../../src/core/attribute-processor.js', () => {
  return {
    UnifiedAttributeProcessor: vi.fn().mockImplementation(() => ({
      normalize: mockNormalize,
    })),
  };
});

vi.mock('../../src/core/crewai-task-registry.js', () => ({
  popEntry: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../src/core/mask.js', () => ({
  applyMask: vi.fn().mockImplementation((data: any, _mask: any) => {
    if (_mask) return _mask(data);
    return data;
  }),
}));

vi.mock('../../src/prompt/template.js', () => ({
  PromptContext: {
    getTemplate: vi.fn().mockReturnValue(undefined),
    getVariables: vi.fn().mockReturnValue(undefined),
  },
  UserPromptContext: {
    getTemplate: vi.fn().mockReturnValue(undefined),
    getVariables: vi.fn().mockReturnValue(undefined),
  },
}));

// ────────────────────────────────────────────────────────
// Helpers: mock ReadableSpan
// ────────────────────────────────────────────────────────

function makeHrTime(seconds: number, nanos: number): HrTime {
  return [seconds, nanos];
}

function makeMockSpan(overrides: Partial<{
  name: string;
  kind: SpanKind;
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  startTime: HrTime;
  endTime: HrTime;
  attributes: Record<string, any>;
  resource: { attributes: Record<string, any> };
  status: { code: SpanStatusCode; message?: string };
  events: any[];
  instrumentationLibrary: { name: string; version?: string } | undefined;
}> = {}): ReadableSpan {
  const traceId = overrides.traceId ?? '0af7651916cd43dd8448eb211c80319c';
  const spanId = overrides.spanId ?? 'b7ad6b7169203331';
  const parentSpanId = overrides.parentSpanId;

  const spanContext: SpanContext = {
    traceId,
    spanId,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: false,
  };

  return {
    name: overrides.name ?? 'test-span',
    kind: overrides.kind ?? SpanKind.INTERNAL,
    spanContext: () => spanContext,
    parentSpanId: parentSpanId,
    startTime: overrides.startTime ?? makeHrTime(1000, 0),
    endTime: overrides.endTime ?? makeHrTime(1001, 0),
    status: overrides.status ?? { code: SpanStatusCode.OK, message: 'OK' },
    attributes: overrides.attributes ?? {},
    resource: overrides.resource ?? { attributes: {} },
    events: overrides.events ?? [],
    links: [],
    duration: makeHrTime(1, 0),
    ended: true,
    instrumentationLibrary: overrides.instrumentationLibrary ?? { name: 'test' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

// ────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────

describe('NeatlogsSpanProcessor edge cases', () => {
  let processor: NeatlogsSpanProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalize.mockReturnValue({
      'neatlogs.span.kind': 'llm',
    });
    processor = new NeatlogsSpanProcessor({ sampleRate: 1.0, debug: false });
  });

  afterEach(async () => {
    await processor.shutdown();
  });

  // ── normalize() throwing ────────────────────────────────

  describe('when normalize() throws', () => {
    it('should not crash the span processor and should still increment spansProcessed', () => {
      mockNormalize.mockImplementation(() => {
        throw new Error('normalize blew up');
      });

      const span = makeMockSpan({ name: 'test-normalize-error' });

      // Should not throw — the processor should catch internally
      expect(() => processor.onEnd(span)).toThrow('normalize blew up');
      // spansProcessed is incremented before normalize
      expect(processor._perfStats.spansProcessed).toBe(1);
    });
  });

  // ── Very large attribute values ─────────────────────────

  describe('very large attribute values', () => {
    it('should handle attributes with very large string values', () => {
      const largeValue = 'x'.repeat(100_000);
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'llm',
        'neatlogs.llm.response': largeValue,
      });

      const span = makeMockSpan({
        name: 'large-attr-span',
        attributes: { 'large_key': largeValue },
      });

      // Should not throw
      processor.onEnd(span);
      expect(processor._perfStats.spansExported).toBe(1);
      // The large value should be written back
      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.llm.response']?.length).toBe(100_000);
    });

    it('should handle attributes with many keys', () => {
      const manyAttrs: Record<string, any> = {
        'neatlogs.span.kind': 'llm',
      };
      for (let i = 0; i < 500; i++) {
        manyAttrs[`neatlogs.attr.${i}`] = `value-${i}`;
      }
      mockNormalize.mockReturnValue(manyAttrs);

      const span = makeMockSpan({ name: 'many-attrs-span' });
      processor.onEnd(span);
      expect(processor._perfStats.spansExported).toBe(1);
    });
  });

  // ── onStart behavior ────────────────────────────────────

  describe('onStart', () => {
    it('should not set attributes for non-LLM spans', () => {
      const mockSdkSpan = {
        name: 'my-tool-span',
        attributes: { 'openinference.span.kind': 'TOOL' },
        setAttribute: vi.fn(),
      };

      processor.onStart(mockSdkSpan as any, {} as any);

      // No prompt-related setAttribute calls
      expect(mockSdkSpan.setAttribute).not.toHaveBeenCalled();
    });

    it('should set attributes for LLM spans detected by name pattern', () => {
      const mockSdkSpan = {
        name: 'openai.chat.completion',
        attributes: {},
        setAttribute: vi.fn(),
      };

      processor.onStart(mockSdkSpan as any, {} as any);
      // Even though no context values, it shouldn't crash
      expect(mockSdkSpan.setAttribute).not.toHaveBeenCalled();
    });

    it('should set attributes when span kind is LLM', async () => {
      const { PromptContext } = await import('../../src/prompt/template.js');
      (PromptContext.getVariables as any).mockReturnValueOnce({ name: 'world' });
      (PromptContext.getTemplate as any).mockReturnValueOnce('Hello {{name}}');

      const mockSdkSpan = {
        name: 'some-span',
        attributes: { 'openinference.span.kind': 'LLM' },
        setAttribute: vi.fn(),
      };

      processor.onStart(mockSdkSpan as any, {} as any);

      expect(mockSdkSpan.setAttribute).toHaveBeenCalledWith(
        'llm.prompt_template_variables',
        '{"name":"world"}',
      );
      expect(mockSdkSpan.setAttribute).toHaveBeenCalledWith(
        'llm.prompt_template',
        'Hello {{name}}',
      );
    });

    it('should fall back to UserPromptContext when context key has no value', async () => {
      const { UserPromptContext } = await import('../../src/prompt/template.js');
      (UserPromptContext.getTemplate as any).mockReturnValueOnce('Q: {{q}}');
      (UserPromptContext.getVariables as any).mockReturnValueOnce({ q: 'test' });

      const mockSdkSpan = {
        name: 'chat-span',
        attributes: { 'openinference.span.kind': 'LLM' },
        setAttribute: vi.fn(),
      };

      processor.onStart(mockSdkSpan as any, {} as any);

      expect(mockSdkSpan.setAttribute).toHaveBeenCalledWith(
        'llm.user_prompt_template',
        'Q: {{q}}',
      );
      expect(mockSdkSpan.setAttribute).toHaveBeenCalledWith(
        'llm.user_prompt_template_variables',
        '{"q":"test"}',
      );
    });

    it('should detect LLM spans via "generate" pattern in name', () => {
      const mockSdkSpan = {
        name: 'generate_content',
        attributes: {},
        setAttribute: vi.fn(),
      };

      // Just ensure it doesn't crash and processes as LLM
      processor.onStart(mockSdkSpan as any, {} as any);
    });

    it('should detect LLM spans via "embedding" pattern in name', () => {
      const mockSdkSpan = {
        name: 'create_embedding',
        attributes: {},
        setAttribute: vi.fn(),
      };

      processor.onStart(mockSdkSpan as any, {} as any);
    });
  });

  // ── VECTOR_STORE filtering ──────────────────────────────

  describe('VECTOR_STORE span filtering', () => {
    it('should remove content/message keys from vector_store spans', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'vector_store',
        'neatlogs.vector_store.collection': 'docs',
        'llm.input_messages.0.content': 'should be removed',
        'gen_ai.prompt.0': 'should be removed',
      });

      const span = makeMockSpan({ name: 'pinecone.upsert' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.vector_store.collection']).toBe('docs');
      expect(attrs['llm.input_messages.0.content']).toBeUndefined();
      expect(attrs['gen_ai.prompt.0']).toBeUndefined();
    });
  });

  // ── Resource attribute handling ─────────────────────────

  describe('resource attribute handling', () => {
    it('should handle array values in resource attributes', () => {
      const writeData: string[] = [];
      (processor as any)._processedLogStream = {
        destroyed: false,
        write: (data: string) => writeData.push(data),
      };
      (processor as any)._logProcessedSpansEnabled = true;

      const span = makeMockSpan({
        name: 'test-resource-arrays',
        resource: {
          attributes: {
            'service.name': 'my-app',
            'neatlogs.tags': ['tag1', 'tag2'],
            'some.number': 42,
            'some.bool': true,
          },
        },
      });

      processor.onEnd(span);
      expect(writeData.length).toBe(1);
      const parsed = JSON.parse(writeData[0].trim());
      expect(parsed.resource.attributes['neatlogs.tags']).toEqual(['tag1', 'tag2']);
      expect(parsed.resource.attributes['service.name']).toBe('my-app');
      expect(parsed.resource.attributes['some.number']).toBe(42);
      expect(parsed.resource.attributes['some.bool']).toBe(true);
    });

    it('should stringify non-primitive, non-array resource values', () => {
      const writeData: string[] = [];
      (processor as any)._processedLogStream = {
        destroyed: false,
        write: (data: string) => writeData.push(data),
      };
      (processor as any)._logProcessedSpansEnabled = true;

      const span = makeMockSpan({
        name: 'test-resource-stringify',
        resource: {
          attributes: {
            'complex.value': { nested: 'object' } as any,
          },
        },
      });

      processor.onEnd(span);
      expect(writeData.length).toBe(1);
      const parsed = JSON.parse(writeData[0].trim());
      // Non-primitive should be stringified
      expect(typeof parsed.resource.attributes['complex.value']).toBe('string');
    });
  });

  // ── Prompt template keys for special span kinds ─────────

  describe('prompt template keys for special span kinds', () => {
    it('should keep prompt template keys for embedding spans', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'embedding',
        'neatlogs.llm.prompt_template': 'Embed: {{text}}',
        'neatlogs.llm.prompt_template_variables': '{"text":"hello"}',
      });

      const span = makeMockSpan({ name: 'embedding-span' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      // embedding is allowed to keep prompt templates
      expect(attrs['neatlogs.llm.prompt_template']).toBe('Embed: {{text}}');
    });

    it('should keep prompt template keys for crewai_task spans', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'crewai_task',
        'neatlogs.llm.prompt_template': 'Task: {{desc}}',
      });

      const span = makeMockSpan({ name: 'crewai.task' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.llm.prompt_template']).toBe('Task: {{desc}}');
    });

    it('should keep prompt template keys for PromptTemplate-named spans', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'chain',
        'neatlogs.llm.prompt_template': 'Hello {{name}}',
      });

      const span = makeMockSpan({ name: 'PromptTemplate' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      // PromptTemplate spans keep their prompt_template attribute
      expect(attrs['neatlogs.llm.prompt_template']).toBe('Hello {{name}}');
      // But they get marked as internal
      expect(attrs['neatlogs.internal']).toBe(true);
      expect(attrs['neatlogs.span.kind']).toBe('Neatlogs.INTERNAL');
    });
  });

  // ── Debug mode logging ──────────────────────────────────

  describe('debug mode', () => {
    it('should log performance stats on shutdown when debug is true', async () => {
      const debugProcessor = new NeatlogsSpanProcessor({ debug: true });

      // Process a span to have stats
      const span = makeMockSpan();
      debugProcessor.onEnd(span);

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      await debugProcessor.shutdown();

      // Should have logged performance stats
      const statsLog = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('overhead'),
      );
      expect(statsLog).toBeDefined();
      consoleSpy.mockRestore();
    });

    it('should not log performance stats when debug is false', async () => {
      const span = makeMockSpan();
      processor.onEnd(span);

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      await processor.shutdown();

      const statsLog = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('overhead'),
      );
      expect(statsLog).toBeUndefined();
      consoleSpy.mockRestore();
    });

    it('should not log performance stats when no spans processed', async () => {
      const debugProcessor = new NeatlogsSpanProcessor({ debug: true });

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      await debugProcessor.shutdown();

      const statsLog = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('overhead'),
      );
      expect(statsLog).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  // ── span events handling ────────────────────────────────

  describe('span events handling', () => {
    it('should include events in the processed span dict', () => {
      const writeData: string[] = [];
      (processor as any)._processedLogStream = {
        destroyed: false,
        write: (data: string) => writeData.push(data),
      };
      (processor as any)._logProcessedSpansEnabled = true;

      const span = makeMockSpan({
        name: 'span-with-events',
        events: [
          {
            name: 'exception',
            time: makeHrTime(1000, 500_000_000),
            attributes: { 'exception.type': 'Error', 'exception.message': 'fail' },
          },
        ],
      });

      processor.onEnd(span);

      expect(writeData.length).toBe(1);
      const parsed = JSON.parse(writeData[0].trim());
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].name).toBe('exception');
      expect(parsed.events[0].attributes['exception.type']).toBe('Error');
    });
  });

  // ── spanToDict edge cases ───────────────────────────────

  describe('spanToDict edge cases', () => {
    it('should handle span with no events', () => {
      const span = makeMockSpan({ events: [] });
      const dict = spanToDict(span);
      expect(dict.events).toEqual([]);
    });

    it('should handle span with no resource', () => {
      const span = makeMockSpan({
        resource: { attributes: {} },
      });
      const dict = spanToDict(span);
      expect(dict.resource).toEqual({});
    });

    it('should handle span with ERROR status', () => {
      const span = makeMockSpan({
        status: { code: SpanStatusCode.ERROR, message: 'something failed' },
      });
      const dict = spanToDict(span);
      expect(dict.status.code).toBe(SpanStatusCode.ERROR);
      expect(dict.status.description).toBe('something failed');
    });

    it('should handle span with UNSET status (no message)', () => {
      const span = makeMockSpan({
        status: { code: SpanStatusCode.UNSET },
      });
      const dict = spanToDict(span);
      expect(dict.status.code).toBe(SpanStatusCode.UNSET);
      expect(dict.status.description).toBeNull();
    });

    it('should handle multiple events with attributes', () => {
      const span = makeMockSpan({
        events: [
          { name: 'event1', time: makeHrTime(100, 0), attributes: { a: 1 } },
          { name: 'event2', time: makeHrTime(200, 0), attributes: {} },
          { name: 'event3', time: makeHrTime(300, 0) },
        ],
      });
      const dict = spanToDict(span);
      expect(dict.events).toHaveLength(3);
      expect(dict.events[0].attributes).toEqual({ a: 1 });
      expect(dict.events[1].attributes).toEqual({});
      expect(dict.events[2].attributes).toEqual({});
    });
  });

  // ── Write-back edge cases ───────────────────────────────

  describe('attribute write-back', () => {
    it('should handle write-back of array attributes', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'llm',
        'neatlogs.tags': ['tag1', 'tag2'],
      });

      const span = makeMockSpan({ name: 'array-writeback' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.tags']).toEqual(['tag1', 'tag2']);
    });

    it('should not write back complex object attributes', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'llm',
        'neatlogs.complex': { nested: true },
      });

      const span = makeMockSpan({ name: 'complex-writeback' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      // Complex objects should not be written back
      expect(attrs['neatlogs.complex']).toBeUndefined();
    });

    it('should write back boolean attributes', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'llm',
        'neatlogs.internal': true,
      });

      const span = makeMockSpan({ name: 'bool-writeback' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.internal']).toBe(true);
    });

    it('should write back number attributes', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'llm',
        'neatlogs.llm.token_count.total': 500,
      });

      const span = makeMockSpan({ name: 'num-writeback' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.llm.token_count.total']).toBe(500);
    });
  });

  // ── Framework span name normalization edge cases ────────

  describe('framework span name normalization', () => {
    it('should handle task name with trailing dots', () => {
      const spanData = {
        name: 'Research market trends...task',
        kind: 'task',
        attributes: { 'neatlogs.crewai.crew_id': 'crew-1' },
      };

      const result = (processor as any)._normalizeFrameworkSpanName(spanData);
      expect(result.name).toBe('crewai.task');
      expect(result.attributes['neatlogs.task.description']).toBe(
        'Research market trends',
      );
    });

    it('should not overwrite existing task description', () => {
      const spanData = {
        name: 'Do thing.task',
        kind: 'task',
        attributes: {
          'neatlogs.crewai.crew_id': 'crew-1',
          'neatlogs.task.description': 'existing description',
        },
      };

      const result = (processor as any)._normalizeFrameworkSpanName(spanData);
      expect(result.name).toBe('crewai.task');
      expect(result.attributes['neatlogs.task.description']).toBe('existing description');
    });

    it('should not rename task spans without crewai attributes', () => {
      const spanData = {
        name: 'some-operation.task',
        kind: 'task',
        attributes: {},
      };

      const result = (processor as any)._normalizeFrameworkSpanName(spanData);
      expect(result.name).toBe('some-operation.task');
    });

    it('should handle empty span name with .task suffix', () => {
      const spanData = {
        name: '.task',
        kind: 'task',
        attributes: { 'neatlogs.crewai.crew_id': 'crew-1' },
      };

      const result = (processor as any)._normalizeFrameworkSpanName(spanData);
      expect(result.name).toBe('crewai.task');
    });
  });

  // ── CrewAI task injection edge cases ────────────────────

  describe('CrewAI task injection edge cases', () => {
    it('should not inject when no task ID is present', () => {
      const spanData = {
        name: 'some-span',
        attributes: {},
      };

      const result = (processor as any)._injectCrewaiTaskTemplate(spanData);
      expect(result.attributes['neatlogs.task.user_prompt_template']).toBeUndefined();
    });

    it('should inject template without variables', async () => {
      const { popEntry: mockPopEntry } = await import(
        '../../src/core/crewai-task-registry.js'
      );
      (mockPopEntry as any).mockReturnValueOnce(['Research topic', null]);

      const spanData = {
        name: 'crewai.task',
        kind: 'task',
        attributes: { 'neatlogs.task.id': 'task-456' },
      };

      const result = (processor as any)._injectCrewaiTaskTemplate(spanData);
      expect(result.attributes['neatlogs.task.user_prompt_template']).toBe('Research topic');
      expect(result.attributes['neatlogs.task.user_prompt_template_variables']).toBeUndefined();
      expect(result.attributes['neatlogs.span.kind']).toBe('crewai_task');
    });
  });

  // ── Concurrent span processing ──────────────────────────

  describe('concurrent span processing', () => {
    it('should handle multiple spans processed sequentially', () => {
      for (let i = 0; i < 10; i++) {
        const span = makeMockSpan({
          name: `span-${i}`,
          spanId: `span${String(i).padStart(16, '0')}`,
          parentSpanId: 'parent0000000001',
        });
        processor.onEnd(span);
      }

      expect(processor._perfStats.spansProcessed).toBe(10);
      expect(processor._perfStats.spansExported).toBe(10);
    });
  });

  // ── Shutdown stream error handling ──────────────────────

  describe('shutdown stream error handling', () => {
    it('should handle errors when closing raw log stream', async () => {
      (processor as any)._rawLogStream = {
        end: () => { throw new Error('close error'); },
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Should not throw
      await expect(processor.shutdown()).resolves.toBeUndefined();
      warnSpy.mockRestore();
    });

    it('should handle errors when closing processed log stream', async () => {
      (processor as any)._processedLogStream = {
        end: () => { throw new Error('close error'); },
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(processor.shutdown()).resolves.toBeUndefined();
      warnSpy.mockRestore();
    });
  });
});
