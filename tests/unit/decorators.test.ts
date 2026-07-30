import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  safeJsonDumps,
  serializeObj,
  shouldCaptureContent,
  setCommonSpanAttrs,
  decorateSpan,
} from '../../src/decorators/base.js';
import { span, Span, retrieverPostprocessor } from '../../src/decorators/orchestration.js';
import type { SpanOptions } from '../../src/types.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

// ─── Mock OpenTelemetry ────────────────────────────────────────────────────────

function createMockSpan() {
  return {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
    _attrs: {} as Record<string, any>,
  };
}

let mockSpan = createMockSpan();

vi.mock('@opentelemetry/api', () => {
  const rootContext = {
    getValue: () => undefined,
    setValue: () => rootContext,
    deleteValue: () => rootContext,
  };
  const tracer = {
    startSpan: (_name: string) => mockSpan,
    startActiveSpan: (name: string, fn: (span: any) => any) => fn(mockSpan),
  };
  return {
    createContextKey: (name: string) => Symbol.for(name),
    trace: {
      // Shared mode resolves the tracer via the global provider.
      getTracerProvider: () => ({ getTracer: () => tracer }),
      getTracer: () => tracer,
      // isRootSpan() reads the active span; no active span → decorated fn is root.
      getSpan: () => undefined,
      setSpan: (ctx: any, _span: any) => ctx,
    },
    context: {
      active: () => rootContext,
      with: (_ctx: any, fn: () => any) => fn(),
    },
    ROOT_CONTEXT: rootContext,
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
  };
});

beforeEach(() => {
  _setNeatlogsProvider({
    getTracer: () => ({
      startSpan: () => mockSpan,
      startActiveSpan: (_name: string, fn: (span: any) => any) => fn(mockSpan),
    }),
  } as any);
});

afterEach(() => {
  _setNeatlogsProvider(null);
});

// ─── safeJsonDumps ─────────────────────────────────────────────────────────────

describe('safeJsonDumps', () => {
  it('should serialize primitives', () => {
    expect(safeJsonDumps('hello')).toBe('"hello"');
    expect(safeJsonDumps(42)).toBe('42');
    expect(safeJsonDumps(true)).toBe('true');
    expect(safeJsonDumps(null)).toBe('null');
  });

  it('should serialize objects and arrays', () => {
    expect(safeJsonDumps({ a: 1 })).toBe('{"a":1}');
    expect(safeJsonDumps([1, 2, 3])).toBe('[1,2,3]');
  });

  it('should handle bigint values', () => {
    const result = safeJsonDumps({ big: BigInt(999) });
    expect(result).toBe('{"big":"999"}');
  });

  it('should handle Error objects', () => {
    const err = new Error('test error');
    const result = JSON.parse(safeJsonDumps(err));
    expect(result.message).toBe('test error');
    expect(result.name).toBe('Error');
  });

  it('should handle functions', () => {
    function myFunc() {}
    const result = safeJsonDumps(myFunc);
    expect(result).toBe('"[Function: myFunc]"');
  });

  it('should handle anonymous functions', () => {
    const result = safeJsonDumps(() => {});
    expect(result).toContain('[Function:');
  });

  it('should fallback to String for circular references', () => {
    const obj: any = {};
    obj.self = obj;
    const result = safeJsonDumps(obj);
    expect(typeof result).toBe('string');
  });
});

// ─── serializeObj ──────────────────────────────────────────────────────────────

describe('serializeObj', () => {
  it('should return primitives as-is', () => {
    expect(serializeObj(null)).toBeNull();
    expect(serializeObj(undefined)).toBeUndefined();
    expect(serializeObj('test')).toBe('test');
    expect(serializeObj(42)).toBe(42);
    expect(serializeObj(true)).toBe(true);
  });

  it('should call toJSON() if available', () => {
    const obj = {
      toJSON: () => ({ serialized: true }),
    };
    expect(serializeObj(obj)).toEqual({ serialized: true });
  });

  it('should recursively serialize arrays', () => {
    const result = serializeObj([1, 'a', { b: 2 }]);
    expect(result).toEqual([1, 'a', { b: 2 }]);
  });

  it('should recursively serialize objects', () => {
    const result = serializeObj({ a: 1, b: { c: 2 } });
    expect(result).toEqual({ a: 1, b: { c: 2 } });
  });

  it('should stringify other types', () => {
    const sym = Symbol('test');
    expect(typeof serializeObj(sym)).toBe('string');
  });
});

// ─── shouldCaptureContent ──────────────────────────────────────────────────────

describe('shouldCaptureContent', () => {
  const origEnv = process.env.NEATLOGS_TRACE_CONTENT;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.NEATLOGS_TRACE_CONTENT;
    } else {
      process.env.NEATLOGS_TRACE_CONTENT = origEnv;
    }
  });

  it('should return true when env var is not set', () => {
    delete process.env.NEATLOGS_TRACE_CONTENT;
    expect(shouldCaptureContent()).toBe(true);
  });

  it('should return true when env var is empty', () => {
    process.env.NEATLOGS_TRACE_CONTENT = '';
    expect(shouldCaptureContent()).toBe(true);
  });

  it('should return false when env var is "false"', () => {
    process.env.NEATLOGS_TRACE_CONTENT = 'false';
    expect(shouldCaptureContent()).toBe(false);
  });

  it('should return false when env var is "0"', () => {
    process.env.NEATLOGS_TRACE_CONTENT = '0';
    expect(shouldCaptureContent()).toBe(false);
  });

  it('should return false when env var is "FALSE"', () => {
    process.env.NEATLOGS_TRACE_CONTENT = 'FALSE';
    expect(shouldCaptureContent()).toBe(false);
  });

  it('should return true when env var is "true"', () => {
    process.env.NEATLOGS_TRACE_CONTENT = 'true';
    expect(shouldCaptureContent()).toBe(true);
  });
});

// ─── setCommonSpanAttrs ────────────────────────────────────────────────────────

describe('setCommonSpanAttrs', () => {
  let spanObj: ReturnType<typeof createMockSpan>;

  beforeEach(() => {
    spanObj = createMockSpan();
  });

  it('should set openinference.span.kind', () => {
    setCommonSpanAttrs(spanObj as any, { kind: 'WORKFLOW' });
    expect(spanObj.setAttribute).toHaveBeenCalledWith('openinference.span.kind', 'WORKFLOW');
  });

  it('should set neatlogs.internal when internal is true', () => {
    setCommonSpanAttrs(spanObj as any, { kind: 'CHAIN', internal: true });
    expect(spanObj.setAttribute).toHaveBeenCalledWith('neatlogs.internal', true);
  });

  it('should set neatlogs.description when description is provided', () => {
    setCommonSpanAttrs(spanObj as any, { kind: 'CHAIN', description: 'Summarizes documents' });
    expect(spanObj.setAttribute).toHaveBeenCalledWith('neatlogs.description', 'Summarizes documents');
  });

  it('should not set neatlogs.description when not provided', () => {
    setCommonSpanAttrs(spanObj as any, { kind: 'CHAIN' });
    expect(spanObj.setAttribute).not.toHaveBeenCalledWith('neatlogs.description', expect.anything());
  });

  it('should register mask and set neatlogs.mask_id', () => {
    const maskFn = (data: Record<string, any>) => data;
    setCommonSpanAttrs(spanObj as any, { kind: 'CHAIN', mask: maskFn });
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'neatlogs.mask_id',
      expect.any(String),
    );
  });
});

// ─── decorateSpan ──────────────────────────────────────────────────────────────

describe('decorateSpan', () => {
  beforeEach(() => {
    mockSpan = createMockSpan();
    delete process.env.NEATLOGS_TRACE_CONTENT;
  });

  it('should wrap a sync function and capture input/output', () => {
    const fn = (x: number) => x * 2;
    const wrapped = decorateSpan({ kind: 'CHAIN' }, fn);
    const result = wrapped(5);
    // sync functions return promises from decorateSpan
    expect(result).toBe(10);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('input.value', '5');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('output.value', '10');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should wrap an async function and capture input/output', async () => {
    const fn = async (x: number) => x * 3;
    const wrapped = decorateSpan({ kind: 'CHAIN' }, fn);
    const result = await wrapped(7);
    expect(result).toBe(21);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('input.value', '7');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('output.value', '21');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should handle sync function errors', () => {
    const fn = () => {
      throw new Error('boom');
    };
    const wrapped = decorateSpan({ kind: 'CHAIN' }, fn);
    expect(() => wrapped()).toThrow('boom');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2, // ERROR
      message: 'boom',
    });
    expect(mockSpan.recordException).toHaveBeenCalled();
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should handle async function errors', async () => {
    const fn = async () => {
      throw new Error('async boom');
    };
    const wrapped = decorateSpan({ kind: 'CHAIN' }, fn);
    await expect(wrapped()).rejects.toThrow('async boom');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'async boom',
    });
    expect(mockSpan.recordException).toHaveBeenCalled();
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should respect captureInput: false', () => {
    const fn = (x: number) => x;
    const wrapped = decorateSpan({ kind: 'CHAIN', captureInput: false }, fn);
    wrapped(5);
    const inputCalls = mockSpan.setAttribute.mock.calls.filter(
      ([key]: [string]) => key === 'input.value',
    );
    expect(inputCalls).toHaveLength(0);
  });

  it('should respect captureOutput: false', () => {
    const fn = (x: number) => x;
    const wrapped = decorateSpan({ kind: 'CHAIN', captureOutput: false }, fn);
    wrapped(5);
    const outputCalls = mockSpan.setAttribute.mock.calls.filter(
      ([key]: [string]) => key === 'output.value',
    );
    expect(outputCalls).toHaveLength(0);
  });

  it('should not capture input when args are empty', () => {
    const fn = () => 'ok';
    const wrapped = decorateSpan({ kind: 'CHAIN' }, fn);
    wrapped();
    const inputCalls = mockSpan.setAttribute.mock.calls.filter(
      ([key]: [string]) => key === 'input.value',
    );
    expect(inputCalls).toHaveLength(0);
  });

  it('should serialize multiple args as array', () => {
    const fn = (a: number, b: string) => `${a}-${b}`;
    const wrapped = decorateSpan({ kind: 'CHAIN' }, fn);
    wrapped(1, 'two');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('input.value', '[1,"two"]');
  });

  it('should preserve function name', () => {
    function myNamedFn() {
      return 42;
    }
    const wrapped = decorateSpan({ kind: 'CHAIN' }, myNamedFn);
    expect(wrapped.name).toBe('myNamedFn');
  });

  it('should use spanName override if provided', () => {
    const fn = () => 42;
    const wrapped = decorateSpan({ kind: 'CHAIN', spanName: 'custom-name' }, fn);
    expect(wrapped.name).toBe('custom-name');
  });

  it('should call postprocessResult on sync success', () => {
    const postprocess = vi.fn();
    const fn = (x: number) => x + 1;
    const wrapped = decorateSpan(
      { kind: 'CHAIN', postprocessResult: postprocess },
      fn,
    );
    wrapped(5);
    expect(postprocess).toHaveBeenCalledWith(mockSpan, 6, expect.any(Object));
  });

  it('should call postprocessResult on async success', async () => {
    const postprocess = vi.fn();
    const fn = async (x: number) => x + 1;
    const wrapped = decorateSpan(
      { kind: 'CHAIN', postprocessResult: postprocess },
      fn,
    );
    await wrapped(5);
    expect(postprocess).toHaveBeenCalledWith(mockSpan, 6, expect.any(Object));
  });

  it('should not fail if postprocessResult throws', () => {
    const postprocess = vi.fn().mockImplementation(() => {
      throw new Error('postprocess error');
    });
    const fn = () => 'ok';
    const wrapped = decorateSpan(
      { kind: 'CHAIN', postprocessResult: postprocess },
      fn,
    );
    // Should not throw
    expect(() => wrapped()).not.toThrow();
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // Still OK
  });
});

// ─── span() orchestration ──────────────────────────────────────────────────────

describe('span()', () => {
  beforeEach(() => {
    mockSpan = createMockSpan();
    delete process.env.NEATLOGS_TRACE_CONTENT;
  });

  it('should throw for invalid span kind', () => {
    expect(() => span({ kind: 'INVALID' as any }, () => {})).toThrow(
      /Invalid span kind/,
    );
  });

  it('should wrap a WORKFLOW function', () => {
    const fn = () => 'result';
    const wrapped = span({ kind: 'WORKFLOW' }, fn);
    const result = wrapped();
    expect(result).toBe('result');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'openinference.span.kind',
      'WORKFLOW',
    );
  });

  it('should set AGENT attributes', () => {
    const fn = () => 'agent result';
    const wrapped = span({ kind: 'AGENT', role: 'researcher', goal: 'find papers' }, fn);
    wrapped();
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('neatlogs.agent.role', 'researcher');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('neatlogs.agent.goal', 'find papers');
  });

  it('should set TOOL attributes', () => {
    const fn = () => 'tool result';
    const wrapped = span(
      { kind: 'TOOL', toolName: 'search', parameters: { q: 'string' } },
      fn,
    );
    wrapped();
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.name', 'search');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'tool.parameters',
      '{"q":"string"}',
    );
  });

  it('should set EMBEDDING attributes', () => {
    const fn = () => [0.1, 0.2];
    const wrapped = span(
      { kind: 'EMBEDDING', model: 'text-embedding-ada-002', dimension: 1536 },
      fn,
    );
    wrapped();
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'embedding.model_name',
      'text-embedding-ada-002',
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('embedding.dimension', 1536);
  });

  it('should handle CHAIN kind', () => {
    const fn = () => 'chain result';
    const wrapped = span({ kind: 'CHAIN' }, fn);
    const result = wrapped();
    expect(result).toBe('chain result');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'openinference.span.kind',
      'CHAIN',
    );
  });

  it('should handle GUARDRAIL kind', () => {
    const fn = () => ({ allowed: true });
    const wrapped = span({ kind: 'GUARDRAIL' }, fn);
    const result = wrapped();
    expect(result).toEqual({ allowed: true });
  });

  it('should set MCP_TOOL attributes', () => {
    const fn = () => 'mcp result';
    const wrapped = span(
      { kind: 'MCP_TOOL', toolName: 'add_numbers', parameters: { a: 1, b: 2 } },
      fn,
    );
    wrapped();
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('mcp.tool.name', 'add_numbers');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.name', 'add_numbers');
    // String result should be wrapped
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'output.value',
      '{"result":"mcp result"}',
    );
  });

  it('should handle async functions', async () => {
    const fn = async (query: string) => `result for ${query}`;
    const wrapped = span({ kind: 'WORKFLOW' }, fn);
    const result = await wrapped('test');
    expect(result).toBe('result for test');
  });
});

// ─── retrieverPostprocessor ────────────────────────────────────────────────────

describe('retrieverPostprocessor', () => {
  let spanObj: ReturnType<typeof createMockSpan>;

  beforeEach(() => {
    spanObj = createMockSpan();
  });

  it('should extract query from boundInputs', () => {
    retrieverPostprocessor(spanObj as any, [], { query: 'test query' });
    expect(spanObj.setAttribute).toHaveBeenCalledWith('retrieval.query', 'test query');
  });

  it('should prefer "query" key over "question"', () => {
    retrieverPostprocessor(spanObj as any, [], { query: 'q1', question: 'q2' });
    expect(spanObj.setAttribute).toHaveBeenCalledWith('retrieval.query', 'q1');
  });

  it('should use "question" when "query" is not present', () => {
    retrieverPostprocessor(spanObj as any, [], { question: 'q2' });
    expect(spanObj.setAttribute).toHaveBeenCalledWith('retrieval.query', 'q2');
  });

  it('should use "text" when others are not present', () => {
    retrieverPostprocessor(spanObj as any, [], { text: 'some text' });
    expect(spanObj.setAttribute).toHaveBeenCalledWith('retrieval.query', 'some text');
  });

  it('should handle array of string documents', () => {
    const docs = ['doc1', 'doc2', 'doc3'];
    retrieverPostprocessor(spanObj as any, docs, {});
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.content',
      'doc1',
    );
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.1.document.content',
      'doc2',
    );
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.2.document.content',
      'doc3',
    );
  });

  it('should handle array of document objects', () => {
    const docs = [
      { id: '1', content: 'text1', score: 0.9, metadata: { source: 'web' } },
      { id: '2', page_content: 'text2', score: 0.8 },
      { id: '3', text: 'text3' },
    ];
    retrieverPostprocessor(spanObj as any, docs, {});
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.content',
      'text1',
    );
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.id',
      '1',
    );
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.score',
      0.9,
    );
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.metadata',
      '{"source":"web"}',
    );
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.1.document.content',
      'text2',
    );
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.2.document.content',
      'text3',
    );
  });

  it('should extract documents from dict result with "documents" key', () => {
    const result = { documents: ['doc1'] };
    retrieverPostprocessor(spanObj as any, result, {});
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.content',
      'doc1',
    );
  });

  it('should extract documents from dict result with "docs" key', () => {
    const result = { docs: ['doc1'] };
    retrieverPostprocessor(spanObj as any, result, {});
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.content',
      'doc1',
    );
  });

  it('should extract documents from dict result with "results" key', () => {
    const result = { results: ['doc1'] };
    retrieverPostprocessor(spanObj as any, result, {});
    expect(spanObj.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.content',
      'doc1',
    );
  });

  it('should not fail on null/undefined result', () => {
    expect(() => retrieverPostprocessor(spanObj as any, null, {})).not.toThrow();
    expect(() => retrieverPostprocessor(spanObj as any, undefined, {})).not.toThrow();
  });

  it('should limit documents to 20', () => {
    const docs = Array.from({ length: 25 }, (_, i) => `doc${i}`);
    retrieverPostprocessor(spanObj as any, docs, {});
    const contentCalls = spanObj.setAttribute.mock.calls.filter(
      ([key]: [string]) => typeof key === 'string' && key.endsWith('.content'),
    );
    expect(contentCalls).toHaveLength(20);
  });
});

// ─── RETRIEVER via span() integration ──────────────────────────────────────────

describe('span() with RETRIEVER', () => {
  beforeEach(() => {
    mockSpan = createMockSpan();
    delete process.env.NEATLOGS_TRACE_CONTENT;
  });

  it('should use retrieverPostprocessor for RETRIEVER kind', () => {
    const fn = (query: string) => ['doc1', 'doc2'];
    const wrapped = span({ kind: 'RETRIEVER' }, fn);
    wrapped('my query');
    // retrieverPostprocessor should extract query and set document attrs
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('retrieval.query', 'my query');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'retrieval.documents.0.document.content',
      'doc1',
    );
  });
});
