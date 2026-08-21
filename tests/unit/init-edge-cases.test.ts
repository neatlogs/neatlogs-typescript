/**
 * Additional edge-case tests for init.ts.
 * Covers: pii options, piiSpanTypes, endpoint parsing, userId, 
 * batchSize/flushInterval, NEATLOGS_DISABLE_EXPORT env values,
 * workflow name resolution, and captureLogs: false.
 */
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
    BatchLogRecordProcessor: vi.fn().mockImplementation(() => ({})),
  };
});

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

vi.mock('../../src/instrumentation/manager.js', () => ({
  InstrumentationManager: vi.fn().mockImplementation(() => ({
    instrumentHttp: vi.fn().mockResolvedValue(undefined),
    instrument: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn(),
    instrumented: [],
  })),
  // Pre-flight isolation gate init() calls before touching module state. Mocked
  // to a no-op so these tests exercise the instrument() call path directly.
  assertInstrumentationsIsolationSafe: vi.fn(),
}));

import { init, flush, shutdown, isDebugEnabled, getSessionConfig } from '../../src/init.js';

describe('init() edge cases', () => {
  beforeEach(() => {
    delete process.env.NEATLOGS_API_KEY;
    delete process.env.NEATLOGS_DISABLE_EXPORT;
  });

  afterEach(async () => {
    await shutdown();
  });

  it('with pii: "redact" sets neatlogs.pii.enabled to true', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true, pii: 'redact' });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['neatlogs.pii.enabled']).toBe('true');
  });

  it('with pii: "hash" sets neatlogs.pii.enabled to true', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true, pii: 'hash' });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['neatlogs.pii.enabled']).toBe('true');
  });

  it('with pii: false sets neatlogs.pii.enabled to false', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true, pii: false });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['neatlogs.pii.enabled']).toBe('false');
  });

  it('with piiSpanTypes sets neatlogs.pii.span_types', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      piiSpanTypes: ['llm', 'embedding'],
    });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['neatlogs.pii.span_types']).toBe('llm,embedding');
  });

  it('with userId stores it in session config', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      userId: 'user-abc',
    });

    const config = getSessionConfig();
    expect(config.userId).toBe('user-abc');
  });

  it('with userId includes it in resource attributes', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      userId: 'user-xyz',
    });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['user.id']).toBe('user-xyz');
  });

  it('with custom endpoint parses base URL correctly', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      endpoint: 'https://custom.neatlogs.com/api/data/v4/batch',
    });

    const config = getSessionConfig();
    expect(config._baseUrl).toBe('https://custom.neatlogs.com');
  });

  it('with custom batchSize and flushInterval passes to BatchSpanProcessor', async () => {
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    (BatchSpanProcessor as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: false,
      batchSize: 200,
      flushInterval: 10,
    });

    expect(BatchSpanProcessor).toHaveBeenCalledTimes(1);
    const options = (BatchSpanProcessor as any).mock.calls[0][1];
    expect(options.maxExportBatchSize).toBe(200);
    expect(options.scheduledDelayMillis).toBe(10_000);
  });

  it('with custom endpoint routes captured logs to normalized /v1/logs', async () => {
    const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-proto');
    const { BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');

    (OTLPLogExporter as any).mockClear();
    (BatchLogRecordProcessor as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: false,
      captureLogs: true,
      endpoint: 'https://custom.neatlogs.com/api/data/v4/batch',
      batchSize: 25,
      flushInterval: 3,
    });

    expect(OTLPLogExporter).toHaveBeenCalledWith({
      url: 'https://custom.neatlogs.com/v1/logs',
      headers: { 'x-api-key': 'test-key' },
    });
    expect(BatchLogRecordProcessor).toHaveBeenCalledTimes(1);
    const options = (BatchLogRecordProcessor as any).mock.calls[0][1];
    expect(options.maxExportBatchSize).toBe(25);
    expect(options.scheduledDelayMillis).toBe(3000);
  });

  it('with NEATLOGS_DISABLE_EXPORT="1" disables export', async () => {
    process.env.NEATLOGS_DISABLE_EXPORT = '1';
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
    (OTLPTraceExporter as any).mockClear();

    await init({ apiKey: 'test-key' });

    expect(OTLPTraceExporter).not.toHaveBeenCalled();
  });

  it('with NEATLOGS_DISABLE_EXPORT="yes" disables export', async () => {
    process.env.NEATLOGS_DISABLE_EXPORT = 'yes';
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
    (OTLPTraceExporter as any).mockClear();

    await init({ apiKey: 'test-key' });

    expect(OTLPTraceExporter).not.toHaveBeenCalled();
  });

  it('with workflowName as empty string resolves to default', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      workflowName: '',
    });

    const config = getSessionConfig();
    // Should be resolved to something (not empty)
    expect(config.workflowName).toBeTruthy();
  });

  it('with whitespace-only workflowName resolves to default', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      workflowName: '   ',
    });

    const config = getSessionConfig();
    expect(config.workflowName).toBeTruthy();
    expect(config.workflowName.trim()).toBeTruthy();
  });

  it('with captureLogs: false does not create LoggerProvider', async () => {
    const { LoggerProvider } = await import('@opentelemetry/sdk-logs');
    (LoggerProvider as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      captureLogs: false,
    });

    expect(LoggerProvider).not.toHaveBeenCalled();
  });

  it('with default options (no captureLogs) does not create LoggerProvider', async () => {
    const { LoggerProvider } = await import('@opentelemetry/sdk-logs');
    (LoggerProvider as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true });

    // Default is captureLogs: false
    expect(LoggerProvider).not.toHaveBeenCalled();
  });

  it('with apiKey whitespace gets trimmed', async () => {
    await init({ apiKey: '  trimmed-key  ', disableExport: true });

    const config = getSessionConfig();
    expect(config._apiKey).toBe('trimmed-key');
  });

  it('includes service.version in resource attributes', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['service.version']).toBeDefined();
    expect(typeof resourceCall['service.version']).toBe('string');
  });

  it('includes neatlogs.workflow_name in resource attributes', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      workflowName: 'my-flow',
    });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['neatlogs.workflow_name']).toBe('my-flow');
  });

  it('never includes session.id in resource attributes (per-request only)', async () => {
    const { Resource } = await import('@opentelemetry/resources');
    (Resource as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true });

    const resourceCall = (Resource as any).mock.calls[0][0];
    expect(resourceCall['session.id']).toBeUndefined();
  });

  it('creates NeatlogsSpanProcessor with sampleRate', async () => {
    const { NeatlogsSpanProcessor } = await import('../../src/core/span-processor.js');
    (NeatlogsSpanProcessor as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      sampleRate: 0.5,
    });

    expect(NeatlogsSpanProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 0.5 }),
    );
  });

  it('creates NeatlogsSpanProcessor with mask function', async () => {
    const { NeatlogsSpanProcessor } = await import('../../src/core/span-processor.js');
    (NeatlogsSpanProcessor as any).mockClear();

    const maskFn = (data: Record<string, any>) => data;
    await init({
      apiKey: 'test-key',
      disableExport: true,
      mask: maskFn,
    });

    expect(NeatlogsSpanProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ mask: maskFn }),
    );
  });

  it('calls InstrumentationManager.instrument when instrumentations provided', async () => {
    const { InstrumentationManager } = await import('../../src/instrumentation/manager.js');
    (InstrumentationManager as any).mockClear();

    await init({
      apiKey: 'test-key',
      disableExport: true,
      instrumentations: ['openai', 'anthropic'],
    });

    const instance = (InstrumentationManager as any).mock.results[0].value;
    expect(instance.instrument).toHaveBeenCalledWith(['openai', 'anthropic']);
  });

  it('does not call instrument when no instrumentations provided', async () => {
    const { InstrumentationManager } = await import('../../src/instrumentation/manager.js');
    (InstrumentationManager as any).mockClear();

    await init({ apiKey: 'test-key', disableExport: true });

    const instance = (InstrumentationManager as any).mock.results[0].value;
    expect(instance.instrument).not.toHaveBeenCalled();
  });
});

describe('flush() edge cases', () => {
  afterEach(async () => {
    await shutdown();
  });

  it('returns true when called without init', async () => {
    const result = await flush();
    expect(result).toBe(true);
  });

  it('returns true on successful flush with captureLogs', async () => {
    await init({
      apiKey: 'test-key',
      disableExport: true,
      captureLogs: true,
    });
    const result = await flush();
    expect(result).toBe(true);
  });
});

describe('shutdown() edge cases', () => {
  it('returns true when called without init', async () => {
    const result = await shutdown();
    expect(result).toBe(true);
  });

  it('can be called multiple times without error', async () => {
    await init({ apiKey: 'test-key', disableExport: true });
    const r1 = await shutdown();
    const r2 = await shutdown();
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  it('allows re-init after shutdown', async () => {
    await init({
      apiKey: 'key-1',
      disableExport: true,
      workflowName: 'wf-first',
    });

    await shutdown();
    expect(getSessionConfig().workflowName).toBeUndefined();

    await init({
      apiKey: 'key-2',
      disableExport: true,
      workflowName: 'wf-second',
    });

    expect(getSessionConfig().workflowName).toBe('wf-second');
    await shutdown();
  });
});
