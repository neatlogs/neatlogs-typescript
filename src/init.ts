/**
 * Neatlogs SDK initialisation, flush, and shutdown.
 *
 * Port of Python neatlogs/init.py to TypeScript.
 *
 * `init()` sets up the OTel TracerProvider, MeterProvider, LoggerProvider,
 * span processors, exporters, and instrumentation.
 * `flush()` and `shutdown()` handle graceful cleanup.
 */

import { randomBytes } from 'node:crypto';
import * as path from 'node:path';

import { trace, metrics } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

import { NeatlogsSpanProcessor } from './core/span-processor.js';
import { FilteringExporter } from './core/filtering-exporter.js';
import { NeatlogsExporter } from './core/exporter.js';
import { NeatlogsLogExporter } from './core/log-exporter.js';
import { _setOtelLogger } from './core/log.js';
import { _setSessionConfig, getSessionConfig } from './core/context.js';
import { getLogger, enableDebugLogging } from './core/logger.js';
import { InstrumentationManager } from './instrumentation/manager.js';
import { PromptClient, setSharedClient } from './prompt/client.js';
import { __version__ } from './version.js';
import type { InitOptions } from './types.js';

const logger = getLogger();

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _initialized = false;
let _tracerProvider: NodeTracerProvider | null = null;
let _meterProvider: MeterProvider | null = null;
let _logProvider: LoggerProvider | null = null;
let _logSpanExporter: NeatlogsExporter | null = null;
let _spanProcessor: NeatlogsSpanProcessor | null = null;
let _debugMode = false;

// Track signal handlers so we can remove them in shutdown()
let _sigHandlersRegistered = false;
const _shutdownOnSignal = () => {
  shutdown().catch(() => {});
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a non-empty workflow name; derive from process.argv when omitted.
 */
function _resolveWorkflowName(workflowName?: string): string {
  const provided = (workflowName ?? '').trim();
  if (provided) return provided;

  const argv1 = process.argv[1] ?? '';
  const base = path.basename(argv1, path.extname(argv1));
  const slug = base
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  if (slug && !['node', 'ts-node', 'tsx', 'npx', '-e'].includes(slug)) {
    return slug;
  }

  return 'neatlogs-app';
}

/**
 * Generate a short random hex string.
 */
function _randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

/**
 * Initialise the Neatlogs SDK.
 *
 * Sets up OTel TracerProvider, MeterProvider, LoggerProvider, span processors,
 * exporters and auto-instrumentation. Returns a Promise because library
 * instrumentation uses dynamic `import()`.
 */
export async function init(options: InitOptions = {}): Promise<void> {
  // 1. Guard double-init
  if (_initialized) {
    logger.warn('Neatlogs already initialized, skipping re-initialization');
    return;
  }

  // 2. Resolve API key
  let resolvedKey: string;
  if (options.apiKey && options.apiKey.trim()) {
    resolvedKey = options.apiKey.trim();
  } else {
    resolvedKey = (process.env.NEATLOGS_API_KEY ?? '').trim();
  }

  // 3. Resolve disableExport
  let disableExportResolved =
    !!options.disableExport ||
    ['true', '1', 'yes'].includes(
      (process.env.NEATLOGS_DISABLE_EXPORT ?? '').toLowerCase(),
    );

  if (!resolvedKey) {
    disableExportResolved = true;
    resolvedKey = 'disabled';
    if (options.debug) {
      logger.warn(
        'No NEATLOGS_API_KEY set; HTTP export disabled. ' +
          'Set NEATLOGS_API_KEY (or pass apiKey) to send spans to the backend.',
      );
    }
  }

  // 4. Debug mode
  if (options.debug) {
    enableDebugLogging();
  }
  _debugMode = options.debug ?? false;

  // 5. Resolve workflow name
  const resolvedWorkflowName = _resolveWorkflowName(options.workflowName);

  // 6. Resolve session ID
  let sessionId: string | undefined = options.sessionId;
  if (!sessionId && options.autoSession) {
    sessionId = `session_${Date.now()}_${_randomHex(4)}`;
    if (options.debug) {
      logger.debug(`Auto-generated session_id: ${sessionId}`);
    }
  }

  // 7. Parse base URL from endpoint
  const endpoint =
    options.endpoint ??
    'https://staging-cloud.neatlogs.com/api/data/v4/batch';
  const baseUrl = new URL(endpoint).origin;

  // 8. Set session config
  _setSessionConfig({
    sessionId,
    userId: options.userId,
    workflowName: resolvedWorkflowName,
    _apiKey: resolvedKey,
    _baseUrl: baseUrl,
  });

  // 8b. Initialize shared PromptClient so module-level helpers work after init()
  if (resolvedKey && resolvedKey !== 'disabled') {
    setSharedClient(new PromptClient({ baseUrl, apiKey: resolvedKey }));
  }

  // 9. Build OTel Resource
  const resourceAttrs: Record<string, string | number | boolean> = {
    [ATTR_SERVICE_NAME]: options.workflowName || 'neatlogs-app',
    'service.version': __version__,
    'neatlogs.workflow_name': resolvedWorkflowName,
  };
  if (sessionId) resourceAttrs['session.id'] = sessionId;
  if (options.userId) resourceAttrs['user.id'] = options.userId;

  const tags = options.tags;
  if (tags !== undefined) {
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) {
      throw new Error('tags must be a list of strings');
    }
    resourceAttrs['neatlogs.tags'] = tags.join(',');
  }

  if (options.pii !== undefined) {
    resourceAttrs['neatlogs.pii.enabled'] =
      options.pii === false ? 'false' : 'true';
  }

  if (options.piiSpanTypes !== undefined) {
    resourceAttrs['neatlogs.pii.span_types'] = options.piiSpanTypes.join(',');
  }

  const resource = new Resource(resourceAttrs);

  // 10. Create TracerProvider
  const provider = new NodeTracerProvider({
    resource,
    spanLimits: { attributeCountLimit: 10_000 },
  });

  // 11. Add NeatlogsSpanProcessor
  _spanProcessor = new NeatlogsSpanProcessor({
    sampleRate: options.sampleRate ?? 1.0,
    debug: options.debug ?? false,
    mask: options.mask,
  });
  provider.addSpanProcessor(_spanProcessor);

  // 12. Add BatchSpanProcessor + OTLPSpanExporter (if export enabled)
  if (!disableExportResolved) {
    const tracesEndpoint = endpoint.endsWith('/v1/traces')
      ? endpoint
      : `${baseUrl}/v1/traces`;

    const otlpExporter = new FilteringExporter(
      new OTLPTraceExporter({
        url: tracesEndpoint,
        headers: { 'x-api-key': resolvedKey },
      }),
    );

    const batchProcessor = new BatchSpanProcessor(otlpExporter, {
      maxExportBatchSize: options.batchSize ?? 100,
      scheduledDelayMillis: (options.flushInterval ?? 5) * 1000,
    });
    provider.addSpanProcessor(batchProcessor);

    if (options.debug) {
      logger.debug(`OTLP trace exporter configured: ${tracesEndpoint}`);
    }
  } else if (options.debug) {
    logger.debug('Export disabled — spans will not be sent to backend');
  }

  // 13. Register provider globally
  provider.register();
  _tracerProvider = provider;

  if (options.debug) {
    logger.debug('Neatlogs tracer provider initialized');
  }

  // 14. Set up MeterProvider
  try {
    _meterProvider = new MeterProvider({ resource });
    metrics.setGlobalMeterProvider(_meterProvider);
    if (options.debug) {
      logger.debug('Neatlogs meter provider initialized');
    }
  } catch {
    // MeterProvider is optional — skip gracefully
    if (options.debug) {
      logger.debug('MeterProvider not available — skipping');
    }
  }

  // 15. Set up LoggerProvider (if captureLogs)
  const captureLogs = options.captureLogs ?? false;
  if (captureLogs) {
    _logSpanExporter = new NeatlogsExporter({
      baseUrl,
      apiKey: resolvedKey,
      batchSize: options.batchSize ?? 100,
      flushIntervalMs: (options.flushInterval ?? 5) * 1000,
      disableExport: disableExportResolved,
    });

    _logProvider = new LoggerProvider({ resource });
    _logProvider.addLogRecordProcessor(
      new SimpleLogRecordProcessor(new NeatlogsLogExporter(_logSpanExporter)),
    );
    logs.setGlobalLoggerProvider(_logProvider);

    // Wire the OTel logger for neatlogs.log() function
    const otelLogger = _logProvider.getLogger('neatlogs');
    _setOtelLogger(otelLogger, options.debug ?? false);

    if (options.debug) {
      logger.debug(`Neatlogs log capture enabled (endpoint: ${baseUrl}/api/data/v4/batch)`);
    }
  } else if (options.debug) {
    logger.debug('Log capture disabled (pass captureLogs: true to enable)');
  }

  // 16. Instrument libraries
  const manager = new InstrumentationManager({
    provider,
    debug: options.debug,
    excludedUrls: [baseUrl, endpoint].filter(Boolean) as string[],
  });

  await manager.instrumentHttp();

  if (options.instrumentations?.length) {
    await manager.instrument(options.instrumentations);
    if (options.debug) {
      logger.debug(`Instrumented libraries: ${manager.instrumented.join(', ')}`);
    }
  }

  // 17. Register shutdown handlers
  if (!_sigHandlersRegistered) {
    process.on('beforeExit', _shutdownOnSignal);
    process.on('SIGTERM', _shutdownOnSignal);
    process.on('SIGINT', _shutdownOnSignal);
    _sigHandlersRegistered = true;
  }

  // 18. Mark as initialised
  _initialized = true;

  if (options.debug) {
    logger.info('Neatlogs SDK initialized successfully');
    logger.info(`Endpoint: ${endpoint}`);
    logger.info(`Workflow: ${resolvedWorkflowName}`);
    logger.info(`Session: ${sessionId ?? '(none)'}`);
    logger.info(`User: ${options.userId ?? '(none)'}`);
    logger.info(`Tags: ${tags ?? []}`);
    logger.info(`Instrumentations: ${manager.instrumented.join(', ') || '(none)'}`);
    logger.info(`Sample Rate: ${options.sampleRate ?? 1.0}`);
  }
}

// ---------------------------------------------------------------------------
// flush()
// ---------------------------------------------------------------------------

/**
 * Flush all pending spans, metrics, and log records.
 *
 * @returns true if all providers flushed successfully
 */
export async function flush(): Promise<boolean> {
  let success = true;

  if (_tracerProvider) {
    try {
      logger.debug('Flushing tracer provider...');
      await _tracerProvider.forceFlush();
      logger.debug('Tracer provider flushed successfully');
    } catch (e) {
      logger.error(`Error flushing spans: ${e}`);
      success = false;
    }
  }

  if (_meterProvider) {
    try {
      logger.debug('Flushing meter provider...');
      await _meterProvider.forceFlush();
      logger.debug('Meter provider flushed successfully');
    } catch (e) {
      logger.error(`Error flushing metrics: ${e}`);
      success = false;
    }
  }

  if (_logSpanExporter) {
    try {
      logger.debug('Flushing log span exporter...');
      await _logSpanExporter.flush();
      logger.debug('Log span exporter flushed successfully');
    } catch (e) {
      logger.error(`Error flushing logs: ${e}`);
      success = false;
    }
  }

  return success;
}

// ---------------------------------------------------------------------------
// shutdown()
// ---------------------------------------------------------------------------

/**
 * Shutdown the SDK and flush all pending spans, metrics, and log records.
 *
 * Resets all module-level state so `init()` can be called again.
 *
 * @returns true if all providers shut down successfully
 */
export async function shutdown(): Promise<boolean> {
  // Remove signal handlers
  if (_sigHandlersRegistered) {
    process.removeListener('beforeExit', _shutdownOnSignal);
    process.removeListener('SIGTERM', _shutdownOnSignal);
    process.removeListener('SIGINT', _shutdownOnSignal);
    _sigHandlersRegistered = false;
  }

  let success = true;

  if (_tracerProvider) {
    try {
      logger.debug('Shutting down tracer provider...');
      await _tracerProvider.shutdown();
      logger.debug('Tracer provider shut down successfully');
    } catch (e) {
      logger.error(`Error shutting down tracer provider: ${e}`);
      success = false;
    }
  }

  if (_meterProvider) {
    try {
      logger.debug('Shutting down meter provider...');
      await _meterProvider.shutdown();
      logger.debug('Meter provider shut down successfully');
    } catch (e) {
      logger.error(`Error shutting down meter provider: ${e}`);
      success = false;
    }
  }

  if (_logProvider) {
    try {
      logger.debug('Shutting down log provider...');
      await _logProvider.shutdown();
      logger.debug('Log provider shut down successfully');
    } catch (e) {
      logger.error(`Error shutting down log provider: ${e}`);
      success = false;
    }
  }

  if (_logSpanExporter) {
    try {
      logger.debug('Shutting down log span exporter...');
      await _logSpanExporter.shutdown();
      logger.debug('Log span exporter shut down successfully');
    } catch (e) {
      logger.error(`Error shutting down log span exporter: ${e}`);
      success = false;
    }
  }

  // Reset all module-level state
  _initialized = false;
  _tracerProvider = null;
  _meterProvider = null;
  _logProvider = null;
  _logSpanExporter = null;
  _spanProcessor = null;
  _debugMode = false;

  // Reset session config
  _setSessionConfig({});

  logger.info('Neatlogs SDK shutdown complete');
  return success;
}

// ---------------------------------------------------------------------------
// isDebugEnabled()
// ---------------------------------------------------------------------------

/**
 * Return true if neatlogs was initialised with `debug: true`.
 */
export function isDebugEnabled(): boolean {
  return _debugMode;
}

// ---------------------------------------------------------------------------
// Re-export getSessionConfig from context
// ---------------------------------------------------------------------------

export { getSessionConfig } from './core/context.js';
