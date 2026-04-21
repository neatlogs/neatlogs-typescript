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
  'neatlogs.llm.model_name': 'gpt-4o',
  'neatlogs.llm.token_count.total': 100,
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

describe('NeatlogsSpanProcessor', () => {
  let processor: NeatlogsSpanProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalize.mockReturnValue({
      'neatlogs.span.kind': 'llm',
      'neatlogs.llm.model_name': 'gpt-4o',
      'neatlogs.llm.token_count.total': 100,
    });
    processor = new NeatlogsSpanProcessor({ sampleRate: 1.0, debug: false });
  });

  afterEach(async () => {
    await processor.shutdown();
  });

  // ── onEnd normalizes attributes ───────────────────────

  describe('onEnd', () => {
    it('should call normalize and write back attributes', () => {
      const span = makeMockSpan({
        name: 'openai.chat',
        attributes: { 'openinference.span.kind': 'LLM' },
      });

      processor.onEnd(span);

      expect(mockNormalize).toHaveBeenCalledTimes(1);
      // The normalize call receives a SpanDict
      const arg = mockNormalize.mock.calls[0][0];
      expect(arg.name).toBe('openai.chat');

      // Write-back: check that neatlogs.* attributes are set on the span
      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.span.kind']).toBe('llm');
      expect(attrs['neatlogs.llm.model_name']).toBe('gpt-4o');
    });

    it('should increment spansProcessed and spansExported', () => {
      const span = makeMockSpan();
      processor.onEnd(span);

      expect(processor._perfStats.spansProcessed).toBe(1);
      expect(processor._perfStats.spansExported).toBe(1);
    });
  });

  // ── Skip neatlogs.trace.complete spans ────────────────

  describe('neatlogs.trace.complete spans', () => {
    it('should skip internal completion markers', () => {
      const span = makeMockSpan({ name: 'neatlogs.trace.complete' });
      processor.onEnd(span);

      expect(mockNormalize).not.toHaveBeenCalled();
      expect(processor._perfStats.spansProcessed).toBe(0);
    });
  });

  // ── Sample rate filtering ─────────────────────────────

  describe('sample rate filtering', () => {
    it('should drop spans when sampleRate < 1 and random exceeds rate', () => {
      const sampledProcessor = new NeatlogsSpanProcessor({ sampleRate: 0.0 });
      const span = makeMockSpan();

      // With sampleRate 0.0, Math.random() (0..1) will always be > 0.0
      sampledProcessor.onEnd(span);

      // spansProcessed still incremented, but spansExported should be 0
      expect(sampledProcessor._perfStats.spansProcessed).toBe(1);
      expect(sampledProcessor._perfStats.spansExported).toBe(0);
    });

    it('should process all spans when sampleRate is 1.0', () => {
      const span = makeMockSpan();
      processor.onEnd(span);

      expect(processor._perfStats.spansExported).toBe(1);
    });
  });

  // ── PromptTemplate spans ──────────────────────────────

  describe('PromptTemplate spans', () => {
    it('should set neatlogs.internal = true for PromptTemplate', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'chain',
      });

      const span = makeMockSpan({ name: 'PromptTemplate' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.internal']).toBe(true);
      expect(attrs['neatlogs.span.kind']).toBe('Neatlogs.INTERNAL');
    });
  });

  // ── RETRIEVER dedup ───────────────────────────────────

  describe('RETRIEVER dedup', () => {
    it('should suppress OI retriever when internal retriever child exists', () => {
      // Step 1: Internal retriever child ends first
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'retriever',
        'neatlogs.internal': true,
      });

      const parentId = 'aabbccdd00112233';
      const childSpan = makeMockSpan({
        name: 'neatlogs.retriever',
        spanId: 'child123456789012',
        parentSpanId: parentId,
      });

      processor.onEnd(childSpan);

      // parentId should be in the suppress set now
      expect(processor._suppressedRetrievers.has(parentId)).toBe(true);

      // Step 2: OI parent retriever ends next (its spanId matches parentId)
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'retriever',
      });

      const parentSpan = makeMockSpan({
        name: 'ChromaDB.query',
        spanId: parentId,
      });

      processor.onEnd(parentSpan);

      // parentId should be removed from suppress set
      expect(processor._suppressedRetrievers.has(parentId)).toBe(false);

      // Parent span should be marked as internal
      const attrs = (parentSpan as any).attributes;
      expect(attrs['neatlogs.internal']).toBe(true);
    });
  });

  // ── EMBEDDING/VECTOR_STORE filtering ──────────────────

  describe('EMBEDDING span filtering', () => {
    it('should remove content/message keys from embedding spans', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'embedding',
        'neatlogs.embedding.model': 'text-embedding-ada-002',
        'llm.input_messages.0.content': 'should be removed',
        'gen_ai.prompt.0': 'should be removed',
        'gen_ai.completion.0': 'should be removed',
        'llm.output_messages.0.content': 'should be removed',
        'some.other.content': 'should be removed',
      });

      const span = makeMockSpan({ name: 'embedding' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.embedding.model']).toBe('text-embedding-ada-002');
      // content keys should be removed
      expect(attrs['llm.input_messages.0.content']).toBeUndefined();
      expect(attrs['gen_ai.prompt.0']).toBeUndefined();
      expect(attrs['gen_ai.completion.0']).toBeUndefined();
    });

    it('should additionally remove embedding input/output when skip_output is true', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'embedding',
        'neatlogs._skip_output_value': true,
        'neatlogs.embedding.input': 'big vector data',
        'neatlogs.embedding.output': 'big vector data',
      });

      const span = makeMockSpan({ name: 'embedding' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.embedding.input']).toBeUndefined();
      expect(attrs['neatlogs.embedding.output']).toBeUndefined();
    });
  });

  // ── Prompt template filter for non-LLM spans ─────────

  describe('prompt template filtering for non-LLM spans', () => {
    it('should remove prompt template keys for non-LLM spans', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'tool',
        'neatlogs.llm.prompt_template': 'should be removed',
        'neatlogs.llm.prompt_template_variables': '{}',
        'neatlogs.llm.prompt_template.version': 'v1',
      });

      const span = makeMockSpan({ name: 'some-tool' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.llm.prompt_template']).toBeUndefined();
      expect(attrs['neatlogs.llm.prompt_template_variables']).toBeUndefined();
      expect(attrs['neatlogs.llm.prompt_template.version']).toBeUndefined();
    });

    it('should keep prompt template keys for LLM spans', () => {
      mockNormalize.mockReturnValue({
        'neatlogs.span.kind': 'llm',
        'neatlogs.llm.prompt_template': 'Hello {{name}}',
        'neatlogs.llm.prompt_template_variables': '{"name": "world"}',
        'neatlogs.llm.prompt_template.version': 'v1',
      });

      const span = makeMockSpan({ name: 'openai.chat' });
      processor.onEnd(span);

      const attrs = (span as any).attributes;
      expect(attrs['neatlogs.llm.prompt_template']).toBe('Hello {{name}}');
    });
  });

  // ── Completion marker ─────────────────────────────────

  describe('completion marker', () => {
    it('should emit completion marker for root spans (no parent)', () => {
      const mockStartSpan = vi.fn().mockReturnValue({
        setAttribute: vi.fn(),
        end: vi.fn(),
      });

      const mockTracer = { startSpan: mockStartSpan };
      const getTracerSpy = vi.spyOn(otelTrace, 'getTracer').mockReturnValue(mockTracer as any);

      const span = makeMockSpan({
        name: 'root-span',
        parentSpanId: undefined,
      });

      processor.onEnd(span);

      expect(getTracerSpy).toHaveBeenCalledWith('neatlogs.internal');
      expect(mockStartSpan).toHaveBeenCalledWith(
        'neatlogs.trace.complete',
        undefined,
        expect.anything(),
      );

      const markerSpan = mockStartSpan.mock.results[0].value;
      expect(markerSpan.setAttribute).toHaveBeenCalledWith('neatlogs.trace.complete', true);
      expect(markerSpan.setAttribute).toHaveBeenCalledWith('neatlogs.internal', true);
      expect(markerSpan.setAttribute).toHaveBeenCalledWith(
        'neatlogs.span.kind',
        'Neatlogs.INTERNAL',
      );
      expect(markerSpan.end).toHaveBeenCalled();

      getTracerSpy.mockRestore();
    });

    it('should not emit completion marker for child spans', () => {
      const getTracerSpy = vi.spyOn(otelTrace, 'getTracer');

      const span = makeMockSpan({
        name: 'child-span',
        parentSpanId: 'parent123456789a',
      });

      processor.onEnd(span);

      expect(getTracerSpy).not.toHaveBeenCalled();

      getTracerSpy.mockRestore();
    });

    it('should copy neatlogs.tags from resource to completion marker', () => {
      const mockSetAttribute = vi.fn();
      const mockStartSpan = vi.fn().mockReturnValue({
        setAttribute: mockSetAttribute,
        end: vi.fn(),
      });

      const getTracerSpy = vi
        .spyOn(otelTrace, 'getTracer')
        .mockReturnValue({ startSpan: mockStartSpan } as any);

      const span = makeMockSpan({
        name: 'root-span',
        parentSpanId: undefined,
        resource: {
          attributes: { 'neatlogs.tags': ['prod', 'v2'] },
        },
      });

      processor.onEnd(span);

      expect(mockSetAttribute).toHaveBeenCalledWith('neatlogs.tags', ['prod', 'v2']);

      getTracerSpy.mockRestore();
    });
  });

  // ── Mask applied when logging ─────────────────────────

  describe('mask application', () => {
    it('should call applyMask with the mask function', async () => {
      const { applyMask: mockApplyMask } = await import('../../src/core/mask.js');

      const maskFn = vi.fn((data: Record<string, any>) => {
        const result = { ...data };
        result.attributes = { ...result.attributes, masked: true };
        return result;
      });

      const maskedProcessor = new NeatlogsSpanProcessor({
        mask: maskFn,
      });

      // Enable processed log writing by simulating the stream
      const writeData: string[] = [];
      (maskedProcessor as any)._processedLogStream = {
        destroyed: false,
        write: (data: string) => writeData.push(data),
      };
      (maskedProcessor as any)._logProcessedSpansEnabled = true;

      const span = makeMockSpan();
      maskedProcessor.onEnd(span);

      // applyMask should have been called
      expect(mockApplyMask).toHaveBeenCalled();
      const callArgs = (mockApplyMask as any).mock.calls[0];
      expect(callArgs[1]).toBe(maskFn);
    });
  });

  // ── File logging ──────────────────────────────────────

  describe('file logging', () => {
    it('should write raw spans when raw log stream is open', () => {
      const writeData: string[] = [];
      (processor as any)._rawLogStream = {
        destroyed: false,
        write: (data: string) => writeData.push(data),
      };
      (processor as any)._logRawSpansEnabled = true;

      const span = makeMockSpan({ name: 'test-raw-log' });
      processor.onEnd(span);

      expect(writeData.length).toBe(1);
      const parsed = JSON.parse(writeData[0].trim());
      expect(parsed.name).toBe('test-raw-log');
    });

    it('should write processed spans when processed log stream is open', () => {
      const writeData: string[] = [];
      (processor as any)._processedLogStream = {
        destroyed: false,
        write: (data: string) => writeData.push(data),
      };
      (processor as any)._logProcessedSpansEnabled = true;

      const span = makeMockSpan({ name: 'test-processed-log' });
      processor.onEnd(span);

      expect(writeData.length).toBe(1);
      const parsed = JSON.parse(writeData[0].trim());
      expect(parsed.name).toBe('test-processed-log');
      expect(parsed.attributes).toBeDefined();
    });

    it('should not write when streams are destroyed', () => {
      const writeData: string[] = [];
      (processor as any)._rawLogStream = {
        destroyed: true,
        write: (data: string) => writeData.push(data),
      };

      const span = makeMockSpan();
      processor.onEnd(span);

      expect(writeData.length).toBe(0);
    });
  });

  // ── Self-parenting detection ──────────────────────────

  describe('self-parenting detection', () => {
    it('should set parent_span_id to null when span is self-parented', () => {
      const spanId = 'abcdef0123456789';
      const writeData: string[] = [];
      (processor as any)._processedLogStream = {
        destroyed: false,
        write: (data: string) => writeData.push(data),
      };
      (processor as any)._logProcessedSpansEnabled = true;

      const span = makeMockSpan({
        spanId,
        parentSpanId: spanId, // self-parenting
      });

      processor.onEnd(span);

      expect(writeData.length).toBe(1);
      const parsed = JSON.parse(writeData[0].trim());
      expect(parsed.parent_span_id).toBeNull();
    });
  });

  // ── spanToDict helper ─────────────────────────────────

  describe('spanToDict', () => {
    it('should convert ReadableSpan to a plain dict', () => {
      const span = makeMockSpan({
        name: 'my-span',
        traceId: 'aaaa0000bbbb1111cccc2222dddd3333',
        spanId: 'eeee4444ffff5555',
        parentSpanId: '1111222233334444',
        startTime: makeHrTime(1000, 500_000_000),
        endTime: makeHrTime(1001, 0),
        attributes: { 'test.key': 'value' },
      });

      const dict = spanToDict(span);

      expect(dict.trace_id).toBe('aaaa0000bbbb1111cccc2222dddd3333');
      expect(dict.span_id).toBe('eeee4444ffff5555');
      expect(dict.parent_span_id).toBe('1111222233334444');
      expect(dict.name).toBe('my-span');
      expect(dict.start_time).toBe(1000_500_000_000);
      expect(dict.end_time).toBe(1001_000_000_000);
      expect(dict.attributes['test.key']).toBe('value');
    });

    it('should handle missing parent span id', () => {
      const span = makeMockSpan({ parentSpanId: undefined });
      const dict = spanToDict(span);
      expect(dict.parent_span_id).toBeNull();
    });
  });

  // ── forceFlush / shutdown ─────────────────────────────

  describe('forceFlush', () => {
    it('should resolve immediately', async () => {
      await expect(processor.forceFlush()).resolves.toBeUndefined();
    });
  });

  describe('shutdown', () => {
    it('should close file streams', async () => {
      const rawEnd = vi.fn();
      const processedEnd = vi.fn();

      (processor as any)._rawLogStream = { end: rawEnd };
      (processor as any)._processedLogStream = { end: processedEnd };

      await processor.shutdown();

      expect(rawEnd).toHaveBeenCalled();
      expect(processedEnd).toHaveBeenCalled();
    });
  });

  // ── Framework span name normalization ─────────────────

  describe('_normalizeFrameworkSpanNames', () => {
    it('should rename CrewAI task spans', () => {
      const spans = [
        {
          name: 'Research market trends.task',
          kind: 'task',
          attributes: {
            'neatlogs.crewai.crew_id': 'crew-1',
          },
        },
      ];

      const result = (processor as any)._normalizeFrameworkSpanNames(spans);
      expect(result[0].name).toBe('crewai.task');
      expect(result[0].attributes['neatlogs.task.description']).toBe(
        'Research market trends',
      );
    });

    it('should not rename non-task spans', () => {
      const spans = [
        {
          name: 'some-span',
          kind: 'llm',
          attributes: {},
        },
      ];

      const result = (processor as any)._normalizeFrameworkSpanNames(spans);
      expect(result[0].name).toBe('some-span');
    });
  });

  // ── CrewAI task template injection ────────────────────

  describe('_injectCrewaiTaskTemplates', () => {
    it('should inject template from registry', async () => {
      const { popEntry: mockPopEntry } = await import(
        '../../src/core/crewai-task-registry.js'
      );
      (mockPopEntry as any).mockReturnValueOnce([
        'Research {{topic}}',
        '{"topic": "AI"}',
      ]);

      const spans = [
        {
          name: 'crewai.task',
          kind: 'task',
          attributes: {
            'neatlogs.task.id': 'task-123',
          },
        },
      ];

      const result = (processor as any)._injectCrewaiTaskTemplates(spans);

      expect(result[0].attributes['neatlogs.task.user_prompt_template']).toBe(
        'Research {{topic}}',
      );
      expect(
        result[0].attributes['neatlogs.task.user_prompt_template_variables'],
      ).toBe('{"topic": "AI"}');
      expect(result[0].attributes['neatlogs.span.kind']).toBe('crewai_task');
    });
  });
});
