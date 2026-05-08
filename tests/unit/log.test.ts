import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, captureStdout, _setOtelLogger } from '../../src/core/log.js';

// Mock @opentelemetry/api
vi.mock('@opentelemetry/api', () => {
  const mockSpanContext = {
    traceId: 'trace-123',
    spanId: 'span-456',
    traceFlags: 1,
  };
  const mockSpan = {
    spanContext: () => mockSpanContext,
  };
  return {
    context: {
      active: () => ({}),
    },
    trace: {
      getSpan: () => mockSpan,
    },
  };
});

describe('log()', () => {
  let mockOtelLogger: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOtelLogger = { emit: vi.fn() };
    _setOtelLogger(mockOtelLogger, false);
  });

  afterEach(() => {
    _setOtelLogger(null, false);
  });

  it('should emit an OTel log record with rendered message', () => {
    log('Processing query: {query}', { query: 'What is TypeScript?' });

    expect(mockOtelLogger.emit).toHaveBeenCalledTimes(1);
    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.body).toBe('Processing query: What is TypeScript?');
    expect(call.attributes['log.template']).toBe('Processing query: {query}');
    expect(call.attributes['log.level']).toBe('info');
    expect(call.attributes['log.query']).toBe('What is TypeScript?');
  });

  it('should use default level "info" when not specified', () => {
    log('test message');

    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.attributes['log.level']).toBe('info');
  });

  it('should accept custom level', () => {
    log('error occurred', { level: 'error' });

    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.attributes['log.level']).toBe('error');
  });

  it('should replace multiple template variables', () => {
    log('Found {count} results in {time}ms', { count: 42, time: 150 });

    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.body).toBe('Found 42 results in 150ms');
    expect(call.attributes['log.count']).toBe('42');
    expect(call.attributes['log.time']).toBe('150');
  });

  it('should handle template with no variables', () => {
    log('Simple message');

    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.body).toBe('Simple message');
  });

  it('should handle missing template variables gracefully', () => {
    log('Hello {name}', {}); // no 'name' in options

    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.body).toBe('Hello {name}');
  });

  it('should include spanContext when active span exists', () => {
    log('test');

    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.spanContext).toEqual({
      traceId: 'trace-123',
      spanId: 'span-456',
      traceFlags: 1,
    });
  });

  it('should not emit when otelLogger is not set', () => {
    _setOtelLogger(null, false);
    log('test');
    expect(mockOtelLogger.emit).not.toHaveBeenCalled();
  });

  it('should echo to console when debug mode is enabled', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    _setOtelLogger(mockOtelLogger, true);

    log('debug test: {val}', { val: 123 });

    expect(consoleSpy).toHaveBeenCalledWith('[neatlogs:log] debug test: 123');
    consoleSpy.mockRestore();
  });

  it('should not echo to console when debug mode is disabled', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    _setOtelLogger(mockOtelLogger, false);

    log('quiet test');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should handle emit errors gracefully', () => {
    mockOtelLogger.emit.mockImplementation(() => {
      throw new Error('Emit failed');
    });

    // Should not throw
    expect(() => log('test')).not.toThrow();
  });

  it('should replace all occurrences of the same placeholder', () => {
    log('{x} + {x} = {result}', { x: 2, result: 4 });

    const call = mockOtelLogger.emit.mock.calls[0][0];
    expect(call.body).toBe('2 + 2 = 4');
  });
});

describe('captureStdout()', () => {
  let mockOtelLogger: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOtelLogger = { emit: vi.fn() };
    _setOtelLogger(mockOtelLogger, false);
  });

  afterEach(() => {
    _setOtelLogger(null, false);
  });

  it('should capture console.log calls and emit as OTel log records', async () => {
    const originalLog = console.log;

    const result = await captureStdout(() => {
      console.log('captured message');
      return 42;
    });

    expect(result).toBe(42);
    // Verify OTel logger received the captured message
    expect(mockOtelLogger.emit).toHaveBeenCalled();
    const emittedCalls = mockOtelLogger.emit.mock.calls;
    const captured = emittedCalls.find(
      (c: any[]) => c[0].body === 'captured message',
    );
    expect(captured).toBeDefined();
    expect(captured![0].attributes['log.source']).toBe('stdout');

    // Verify console.log is restored
    expect(console.log).toBe(originalLog);
  });

  it('should restore console.log even if fn throws', async () => {
    const originalLog = console.log;

    await expect(
      captureStdout(() => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');

    expect(console.log).toBe(originalLog);
  });

  it('should pass through return value from sync fn', async () => {
    const result = await captureStdout(() => 'hello');
    expect(result).toBe('hello');
  });

  it('should pass through return value from async fn', async () => {
    const result = await captureStdout(async () => {
      return 'async-hello';
    });
    expect(result).toBe('async-hello');
  });

  it('should run fn directly when otelLogger is not set', async () => {
    _setOtelLogger(null, false);

    const result = await captureStdout(() => 'no-capture');
    expect(result).toBe('no-capture');
  });

  it('should stringify non-string console.log arguments', async () => {
    await captureStdout(() => {
      console.log('count:', 42, { key: 'val' });
    });

    const captured = mockOtelLogger.emit.mock.calls.find(
      (c: any[]) => c[0].attributes?.['log.source'] === 'stdout',
    );
    expect(captured).toBeDefined();
    expect(captured![0].body).toBe('count: 42 {"key":"val"}');
  });

  it('should handle OTel emit errors silently during capture', async () => {
    mockOtelLogger.emit.mockImplementation(() => {
      throw new Error('emit error');
    });

    // Should not throw even if emit fails
    const result = await captureStdout(() => {
      console.log('test');
      return 'ok';
    });
    expect(result).toBe('ok');
  });
});
