import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the OTel libraries to prevent real network/provider setup
vi.mock('@opentelemetry/sdk-trace-node', () => {
  const addSpanProcessor = vi.fn();
  const register = vi.fn();
  const forceFlush = vi.fn().mockResolvedValue(undefined);
  const shutdownFn = vi.fn().mockResolvedValue(undefined);
  const getTracer = vi.fn().mockReturnValue({ startSpan: vi.fn() });
  return {
    NodeTracerProvider: vi.fn().mockImplementation(() => ({
      addSpanProcessor,
      register,
      getTracer,
      forceFlush,
      shutdown: shutdownFn,
    })),
  };
});

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: vi.fn().mockImplementation(() => ({})),
  ParentBasedSampler: vi.fn().mockImplementation((options) => ({ options })),
  TraceIdRatioBasedSampler: vi.fn().mockImplementation((rate) => ({ rate })),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@opentelemetry/exporter-logs-otlp-proto', () => ({
  OTLPLogExporter: vi.fn().mockImplementation(() => ({})),
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
    BatchLogRecordProcessor: vi.fn().mockImplementation(() => ({})),
  };
});

// Mock core modules
vi.mock('../../src/core/span-processor.js', () => ({
  CompletionMarkerSpanProcessor: vi.fn().mockImplementation(() => ({
    onStart: vi.fn(),
    onEnd: vi.fn(),
    beginShutdown: vi.fn(),
    emitDeferred: vi.fn(),
    forceFlush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
  NeatlogsSpanProcessor: vi.fn().mockImplementation(() => ({
    onStart: vi.fn(),
    onEnd: vi.fn(),
    beginShutdown: vi.fn().mockReturnValue('shutdown'),
    endActiveSpans: vi.fn().mockReturnValue(0),
    forceFlush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/core/log.js', () => ({
  _setOtelLogger: vi.fn(),
}));

import { init, flush, shutdown, isDebugEnabled, getSessionConfig } from '../../src/init.js';
import { _setSessionConfig } from '../../src/core/context.js';
import { NeatlogsConfigurationError } from '../../src/errors.js';

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

  it('rejects the removed instrumentations option with a typed error', async () => {
    await expect(
      init({ instrumentations: ['openai'] } as any),
    ).rejects.toMatchObject({
      name: 'NeatlogsConfigurationError',
      code: 'UNSUPPORTED_INSTRUMENTATIONS',
      option: 'instrumentations',
    });
    await expect(init({ instrumentations: [] } as any)).rejects.toBeInstanceOf(
      NeatlogsConfigurationError,
    );
  });

  it('rejects unknown init options instead of silently ignoring typos', async () => {
    await expect(init({ sampleRtae: 0.5 } as any)).rejects.toMatchObject({
      code: 'UNKNOWN_INIT_OPTION',
      option: 'sampleRtae',
    });
  });

  it('does not register its tracer or meter globally', async () => {
    const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
    const { metrics } = await import('@opentelemetry/api');
    const previousProvider = (NodeTracerProvider as any).mock.results.at(-1)?.value;
    previousProvider?.register.mockClear();
    (NodeTracerProvider as any).mockClear();
    (metrics.setGlobalMeterProvider as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      registerShutdownHandlers: false,
    });

    const provider = (NodeTracerProvider as any).mock.results[0].value;
    expect(provider.register).not.toHaveBeenCalled();
    expect(metrics.setGlobalMeterProvider).not.toHaveBeenCalled();
  });

  it('with no API key disables export', async () => {
    // No apiKey passed and no env var
    await init({ disableExport: false });
    const config = getSessionConfig();
    // The resolved key should be "disabled"
    expect(config._apiKey).toBe('disabled');
  });

  it('rejects conflicting initialization with a stable typed error', async () => {
    await init({ apiKey: 'key1', disableExport: true });
    await expect(init({ apiKey: 'key2', disableExport: true })).rejects.toMatchObject({
      name: 'NeatlogsConfigurationError',
      code: 'CONFLICTING_INIT',
      option: 'init',
    });
  });

  it('coalesces overlapping initialization calls', async () => {
    const first = init({ apiKey: 'key1', disableExport: true });
    const second = init({ apiKey: 'key1', disableExport: true });
    expect(second).toBe(first);
    await first;
    expect(getSessionConfig()._apiKey).toBe('key1');
  });

  it('rejects conflicting overlapping initialization', async () => {
    const first = init({ apiKey: 'key1', disableExport: true });
    await expect(init({ apiKey: 'key2', disableExport: true })).rejects.toMatchObject({
      code: 'CONFLICTING_INIT',
    });
    await first;
  });

  it('returns rejected Promises for unsupported or unsafe metadata identities', async () => {
    const circular: Record<string, any> = {};
    circular.self = circular;
    const throwing: Record<string, any> = {};
    Object.defineProperty(throwing, 'secret', {
      enumerable: true,
      get() {
        throw new Error('getter failed');
      },
    });

    for (const metadata of [circular, { value: 1n }, throwing]) {
      const pending = init({ apiKey: 'key1', disableExport: true, metadata });
      expect(pending).toBeInstanceOf(Promise);
      await expect(pending).rejects.toThrow();
    }
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

  it('does not put session identity on the session config (per-request only)', async () => {
    await init({ apiKey: 'test-key', disableExport: true });
    const config = getSessionConfig();
    expect(config.sessionId).toBeUndefined();
  });

  it('with invalid tags throws', async () => {
    await expect(
      init({
        apiKey: 'test-key',
        disableExport: true,
        tags: [1 as any, 2 as any],
      }),
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

  it('uses the normal trace route with the versioned Doctor marker', async () => {
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
    (OTLPTraceExporter as any).mockClear();

    await init({
      apiKey: 'project-key',
      endpoint: 'https://ingest.example.test',
      doctorProbe: true,
    });

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'https://ingest.example.test/v1/traces',
      headers: {
        'x-api-key': 'project-key',
        'x-neatlogs-doctor': 'v1',
      },
    });
  });

  it('sets up OTLP log export when captureLogs: true', async () => {
    const { LoggerProvider, BatchLogRecordProcessor, SimpleLogRecordProcessor } =
      await import('@opentelemetry/sdk-logs');
    const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-proto');
    const { _setOtelLogger } = await import('../../src/core/log.js');

    (LoggerProvider as any).mockClear();
    (BatchLogRecordProcessor as any).mockClear();
    (SimpleLogRecordProcessor as any).mockClear();
    (OTLPLogExporter as any).mockClear();
    (_setOtelLogger as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: false, captureLogs: true });

    expect(LoggerProvider).toHaveBeenCalledTimes(1);
    expect(OTLPLogExporter).toHaveBeenCalledWith({
      url: 'https://ingest.neatlogs.com/v1/logs',
      headers: { 'x-api-key': 'test-key' },
      compression: 'gzip',
    });
    expect(BatchLogRecordProcessor).toHaveBeenCalledTimes(1);
    expect(SimpleLogRecordProcessor).not.toHaveBeenCalled();
    expect((LoggerProvider as any).mock.calls[0][0].processors).toEqual([
      (BatchLogRecordProcessor as any).mock.results[0].value,
    ]);
    expect(_setOtelLogger).toHaveBeenCalledTimes(1);
  });

  it('keeps the log provider local when captureLogs is enabled but export is disabled', async () => {
    const { LoggerProvider, BatchLogRecordProcessor, SimpleLogRecordProcessor } =
      await import('@opentelemetry/sdk-logs');
    const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-proto');
    const { _setOtelLogger } = await import('../../src/core/log.js');

    (LoggerProvider as any).mockClear();
    (BatchLogRecordProcessor as any).mockClear();
    (SimpleLogRecordProcessor as any).mockClear();
    (OTLPLogExporter as any).mockClear();
    (_setOtelLogger as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true, captureLogs: true });

    expect(LoggerProvider).toHaveBeenCalledTimes(1);
    expect(OTLPLogExporter).not.toHaveBeenCalled();
    expect(BatchLogRecordProcessor).not.toHaveBeenCalled();
    expect(SimpleLogRecordProcessor).not.toHaveBeenCalled();
    expect((LoggerProvider as any).mock.calls[0][0].processors).toEqual([]);
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

  it('flushes the log provider when captureLogs is enabled', async () => {
    const { LoggerProvider } = await import('@opentelemetry/sdk-logs');
    (LoggerProvider as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true, captureLogs: true });

    const loggerProvider = (LoggerProvider as any).mock.results[0].value;
    const result = await flush();

    expect(result).toBe(true);
    expect(loggerProvider.forceFlush).toHaveBeenCalledTimes(1);
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

  it('queues immediate reinitialization behind an active shutdown', async () => {
    await init({ apiKey: 'first', disableExport: true });
    const closing = shutdown();
    const restarting = init({ apiKey: 'second', disableExport: true });

    await closing;
    await restarting;
    expect(getSessionConfig()._apiKey).toBe('second');
    await shutdown();
  });

  it('returns true on successful shutdown', async () => {
    await init({ apiKey: 'test-key', disableExport: true });
    const result = await shutdown();
    expect(result).toBe(true);
  });

  it('is idempotent while shutdown is in progress and forwards the reason', async () => {
    const { NeatlogsSpanProcessor } = await import('../../src/core/span-processor.js');
    await init({ apiKey: 'test-key', disableExport: true });
    const spanProcessor = (NeatlogsSpanProcessor as any).mock.results.at(-1).value;

    const first = shutdown('SIGTERM');
    const second = shutdown('ignored-second-reason');

    expect(second).toBe(first);
    await expect(first).resolves.toBe(true);
    expect(spanProcessor.endActiveSpans).toHaveBeenCalledTimes(1);
    expect(spanProcessor.endActiveSpans).toHaveBeenCalledWith('SIGTERM');
  });

  it('shares the installed promise when onEnd re-enters shutdown', async () => {
    const { NeatlogsSpanProcessor } = await import('../../src/core/span-processor.js');
    await init({ apiKey: 'test-key', disableExport: true });
    const spanProcessor = (NeatlogsSpanProcessor as any).mock.results.at(-1).value;
    let nested: Promise<boolean> | undefined;
    spanProcessor.endActiveSpans.mockImplementationOnce(() => {
      nested = shutdown('onEnd-reentry');
      return 0;
    });

    const first = shutdown('SIGTERM');
    await expect(first).resolves.toBe(true);
    expect(nested).toBe(first);
    expect(spanProcessor.endActiveSpans).toHaveBeenCalledTimes(1);
  });

  it('wraps SIGTERM with one graceful shutdown before re-delivery', async () => {
    const { NeatlogsSpanProcessor } = await import('../../src/core/span-processor.js');
    const listenersBefore = new Set(process.listeners('SIGTERM'));
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);

    await init({
      apiKey: 'test-key',
      disableExport: true,
      registerShutdownHandlers: true,
    });
    const spanProcessor = (NeatlogsSpanProcessor as any).mock.results.at(-1).value;
    const handler = process.listeners('SIGTERM').find((listener) => !listenersBefore.has(listener));
    expect(handler).toBeDefined();

    (handler as (signal: NodeJS.Signals) => void)('SIGTERM');
    await vi.waitFor(() => {
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    });
    expect(spanProcessor.endActiveSpans).toHaveBeenCalledTimes(1);
    expect(spanProcessor.endActiveSpans).toHaveBeenCalledWith('SIGTERM');
    kill.mockRestore();
  });

  it('does not re-deliver a signal owned by a host listener', async () => {
    const listenersBefore = new Set(process.listeners('SIGTERM'));
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const hostHandler = vi.fn();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      registerShutdownHandlers: true,
    });
    process.on('SIGTERM', hostHandler);
    const handler = process
      .listeners('SIGTERM')
      .find((listener) => !listenersBefore.has(listener) && listener !== hostHandler);
    expect(handler).toBeDefined();

    try {
      (handler as (signal: NodeJS.Signals) => void)('SIGTERM');
      await vi.waitFor(() => expect(getSessionConfig().workflowName).toBeUndefined());
      expect(kill).not.toHaveBeenCalled();
    } finally {
      process.removeListener('SIGTERM', hostHandler);
      kill.mockRestore();
    }
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
      userId: 'user-1',
      workflowName: 'wf',
    });
    const before = getSessionConfig();
    expect(before.userId).toBe('user-1');
    expect(before.workflowName).toBe('wf');

    await shutdown();
    const after = getSessionConfig();
    expect(after.userId).toBeUndefined();
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
      userId: 'user-7',
      workflowName: 'test-wf',
    });

    const config = getSessionConfig();
    expect(config.userId).toBe('user-7');
    expect(config.workflowName).toBe('test-wf');
    expect(config._apiKey).toBe('test-key');
  });

  it('returns copy (mutations do not affect internal state)', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      userId: 'user-100',
    });

    const config1 = getSessionConfig();
    config1.userId = 'hacked';

    const config2 = getSessionConfig();
    expect(config2.userId).toBe('user-100');
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
