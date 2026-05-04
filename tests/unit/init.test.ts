import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the OTel libraries to prevent real network/provider setup
vi.mock('@opentelemetry/sdk-trace-node', () => {
  const addSpanProcessor = vi.fn();
  const register = vi.fn();
  const forceFlush = vi.fn().mockResolvedValue(undefined);
  const shutdownFn = vi.fn().mockResolvedValue(undefined);
  return {
    NodeTracerProvider: vi.fn().mockImplementation(() => ({
      addSpanProcessor,
      register,
      forceFlush,
      shutdown: shutdownFn,
    })),
  };
});

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn().mockImplementation((attrs: any) => ({ attributes: attrs })),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
}));

vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    trace: { ...actual.trace, setGlobalTracerProvider: vi.fn() },
    metrics: { ...actual.metrics, setGlobalMeterProvider: vi.fn() },
  };
});

vi.mock('@opentelemetry/api-logs', () => ({
  logs: { setGlobalLoggerProvider: vi.fn() },
}));

vi.mock('@opentelemetry/sdk-metrics', () => {
  const forceFlush = vi.fn().mockResolvedValue(undefined);
  const shutdownFn = vi.fn().mockResolvedValue(undefined);
  return {
    MeterProvider: vi.fn().mockImplementation(() => ({
      forceFlush,
      shutdown: shutdownFn,
    })),
  };
});

vi.mock('@opentelemetry/sdk-logs', () => {
  const getLoggerFn = vi.fn().mockReturnValue({ emit: vi.fn() });
  const addLogRecordProcessor = vi.fn();
  const forceFlush = vi.fn().mockResolvedValue(undefined);
  const shutdownFn = vi.fn().mockResolvedValue(undefined);
  return {
    LoggerProvider: vi.fn().mockImplementation(() => ({
      getLogger: getLoggerFn,
      addLogRecordProcessor,
      forceFlush,
      shutdown: shutdownFn,
    })),
    SimpleLogRecordProcessor: vi.fn().mockImplementation(() => ({})),
  };
});

// Mock core modules
vi.mock('../../src/core/span-processor.js', () => ({
  NeatlogsSpanProcessor: vi.fn().mockImplementation(() => ({
    onStart: vi.fn(),
    onEnd: vi.fn(),
    forceFlush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/core/exporter.js', () => ({
  NeatlogsExporter: vi.fn().mockImplementation(() => ({
    export: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/core/log-exporter.js', () => ({
  NeatlogsLogExporter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/core/log.js', () => ({
  _setOtelLogger: vi.fn(),
}));

vi.mock('../../src/instrumentation/manager.js', () => ({
  InstrumentationManager: vi.fn().mockImplementation(() => ({
    instrumentHttp: vi.fn().mockResolvedValue(undefined),
    instrument: vi.fn().mockResolvedValue(undefined),
    instrumented: [],
  })),
}));

import { init, flush, shutdown, isDebugEnabled, getSessionConfig } from '../../src/init.js';
import { _setSessionConfig } from '../../src/core/context.js';

describe('init()', () => {
  beforeEach(() => {
    // Clean env to avoid interference
    delete process.env.NEATLOGS_API_KEY;
    delete process.env.NEATLOGS_DISABLE_EXPORT;
  });

  afterEach(async () => {
    await shutdown();
  });

  it('sets _initialized flag and does not throw', async () => {
    await init({ apiKey: 'test-key', disableExport: true });
    // Calling init again should be a no-op (no error)
    await init({ apiKey: 'test-key', disableExport: true });
  });

  it('with no API key disables export', async () => {
    // No apiKey passed and no env var
    await init({ disableExport: false });
    const config = getSessionConfig();
    // The resolved key should be "disabled"
    expect(config._apiKey).toBe('disabled');
  });

  it('double init() is a no-op (no error)', async () => {
    await init({ apiKey: 'key1', disableExport: true });
    // Second call should silently skip
    await expect(init({ apiKey: 'key2', disableExport: true })).resolves.not.toThrow();
  });

  it('with disableExport: true skips OTLP exporter', async () => {
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');

    // Clear call counts
    (OTLPTraceExporter as any).mockClear();
    (BatchSpanProcessor as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true });

    expect(OTLPTraceExporter).not.toHaveBeenCalled();
    expect(BatchSpanProcessor).not.toHaveBeenCalled();
  });

  it('with autoSession generates session ID', async () => {
    await init({ apiKey: 'test-key', disableExport: true, autoSession: true });
    const config = getSessionConfig();
    expect(config.sessionId).toBeDefined();
    expect(config.sessionId).toMatch(/^session_\d+_[a-f0-9]+$/);
  });

  it('with explicit sessionId uses that ID', async () => {
    await init({ apiKey: 'test-key', disableExport: true, sessionId: 'my-session-123' });
    const config = getSessionConfig();
    expect(config.sessionId).toBe('my-session-123');
  });

  it('with invalid tags throws', async () => {
    await expect(
      init({ apiKey: 'test-key', disableExport: true, tags: [1 as any, 2 as any] }),
    ).rejects.toThrow('tags must be a list of strings');
  });

  it('with valid tags stores comma-separated in resource', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      tags: ['prod', 'api-v2'],
    });

    // Resource should have been called with attrs containing neatlogs.tags
    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['neatlogs.tags']).toBe('prod,api-v2');
  });

  it('resolves workflow name from options', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      workflowName: 'my-workflow',
    });
    const config = getSessionConfig();
    expect(config.workflowName).toBe('my-workflow');
  });

  it('sets debug mode when debug: true', async () => {
    expect(isDebugEnabled()).toBe(false);
    await init({ apiKey: 'test-key', disableExport: true, debug: true });
    expect(isDebugEnabled()).toBe(true);
  });

  it('reads API key from env var', async () => {
    process.env.NEATLOGS_API_KEY = 'env-key';
    await init({ disableExport: true });
    const config = getSessionConfig();
    expect(config._apiKey).toBe('env-key');
  });

  it('reads disable export from env var', async () => {
    process.env.NEATLOGS_DISABLE_EXPORT = 'true';
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
    (OTLPTraceExporter as any).mockClear();

    await init({ apiKey: 'test-key' });

    expect(OTLPTraceExporter).not.toHaveBeenCalled();
  });

  it('sets up OTLP exporter when export enabled', async () => {
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');

    (OTLPTraceExporter as any).mockClear();
    (BatchSpanProcessor as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: false });

    expect(OTLPTraceExporter).toHaveBeenCalledTimes(1);
    expect(BatchSpanProcessor).toHaveBeenCalledTimes(1);
  });

  it('with baseUrl only derives trace, log, and prompt endpoints from that base URL', async () => {
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
    const { NeatlogsExporter } = await import('../../src/core/exporter.js');
    const { getSharedClient } = await import('../../src/prompt/client.js');

    (OTLPTraceExporter as any).mockClear();
    (NeatlogsExporter as any).mockClear();

    await init({
      apiKey: 'test-key',
      baseUrl: 'https://app.neatlogs.com/',
      captureLogs: true,
    });

    const config = getSessionConfig();
    expect(config._baseUrl).toBe('https://app.neatlogs.com');

    expect(OTLPTraceExporter).toHaveBeenCalledTimes(1);
    expect((OTLPTraceExporter as any).mock.calls[0][0].url).toBe(
      'https://app.neatlogs.com/v1/traces',
    );

    expect(NeatlogsExporter).toHaveBeenCalledTimes(1);
    expect((NeatlogsExporter as any).mock.calls[0][0]).toMatchObject({
      baseUrl: 'https://app.neatlogs.com',
      apiKey: 'test-key',
    });

    const client = getSharedClient();
    expect((client as any).baseUrl).toBe('https://app.neatlogs.com');
  });

  it('sets up log provider when captureLogs: true', async () => {
    const { LoggerProvider } = await import('@opentelemetry/sdk-logs');
    const { NeatlogsExporter } = await import('../../src/core/exporter.js');
    const { _setOtelLogger } = await import('../../src/core/log.js');

    (LoggerProvider as any).mockClear();
    (NeatlogsExporter as any).mockClear();
    (_setOtelLogger as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true, captureLogs: true });

    expect(LoggerProvider).toHaveBeenCalledTimes(1);
    expect(NeatlogsExporter).toHaveBeenCalledTimes(1);
    expect(_setOtelLogger).toHaveBeenCalledTimes(1);
  });
});

describe('flush()', () => {
  afterEach(async () => {
    await shutdown();
  });

  it('returns true when providers exist', async () => {
    await init({ apiKey: 'test-key', disableExport: true });
    const result = await flush();
    expect(result).toBe(true);
  });

  it('returns true when no providers exist (before init)', async () => {
    const result = await flush();
    expect(result).toBe(true);
  });
});

describe('shutdown()', () => {
  it('resets state so init() can be called again', async () => {
    await init({ apiKey: 'test-key', disableExport: true });
    await shutdown();

    // After shutdown, we should be able to init again
    await init({ apiKey: 'test-key-2', disableExport: true });
    const config = getSessionConfig();
    expect(config._apiKey).toBe('test-key-2');

    await shutdown();
  });

  it('returns true on successful shutdown', async () => {
    await init({ apiKey: 'test-key', disableExport: true });
    const result = await shutdown();
    expect(result).toBe(true);
  });

  it('clears the shared prompt client after shutdown', async () => {
    const { getSharedClient } = await import('../../src/prompt/client.js');

    await init({ apiKey: 'test-key', disableExport: true });
    expect(() => getSharedClient()).not.toThrow();

    await shutdown();

    expect(() => getSharedClient()).toThrow(/No prompt client available/);
  });

  it('resets debug mode', async () => {
    await init({ apiKey: 'test-key', disableExport: true, debug: true });
    expect(isDebugEnabled()).toBe(true);
    await shutdown();
    expect(isDebugEnabled()).toBe(false);
  });

  it('resets session config', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      sessionId: 'session-1',
      workflowName: 'wf',
    });
    const before = getSessionConfig();
    expect(before.sessionId).toBe('session-1');

    await shutdown();
    const after = getSessionConfig();
    expect(after.sessionId).toBeUndefined();
    expect(after.workflowName).toBeUndefined();
  });
});

describe('getSessionConfig()', () => {
  afterEach(async () => {
    await shutdown();
  });

  it('returns session config after init', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      sessionId: 'sess-42',
      userId: 'user-7',
      workflowName: 'test-wf',
    });

    const config = getSessionConfig();
    expect(config.sessionId).toBe('sess-42');
    expect(config.userId).toBe('user-7');
    expect(config.workflowName).toBe('test-wf');
    expect(config._apiKey).toBe('test-key');
  });

  it('returns copy (mutations do not affect internal state)', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      sessionId: 'sess-100',
    });

    const config1 = getSessionConfig();
    config1.sessionId = 'hacked';

    const config2 = getSessionConfig();
    expect(config2.sessionId).toBe('sess-100');
  });
});

describe('isDebugEnabled()', () => {
  afterEach(async () => {
    await shutdown();
  });

  it('returns false before init', () => {
    expect(isDebugEnabled()).toBe(false);
  });

  it('returns true when debug is enabled', async () => {
    await init({ apiKey: 'test-key', disableExport: true, debug: true });
    expect(isDebugEnabled()).toBe(true);
  });

  it('returns false when debug is not enabled', async () => {
    await init({ apiKey: 'test-key', disableExport: true, debug: false });
    expect(isDebugEnabled()).toBe(false);
  });
});
