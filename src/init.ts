/**
 * Neatlogs SDK initialisation, flush, and shutdown.
 *
 * Port of Python neatlogs/init.py to TypeScript.
 *
 * `init()` sets up the OTel TracerProvider, MeterProvider, LoggerProvider,
 * span processors, exporters, and instrumentation.
 * `flush()` and `shutdown()` handle graceful cleanup.
 */

import * as path from 'node:path';

import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  BatchSpanProcessor,
  type BasicTracerProvider,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';

import { NeatlogsSpanProcessor } from './core/span-processor.js';
import { FilteringExporter } from './core/filtering-exporter.js';
import { _setOtelLogger } from './core/log.js';
import { _setSessionConfig } from './core/context.js';
import { _setNeatlogsProvider } from './core/provider.js';
import { getLogger, enableDebugLogging } from './core/logger.js';
import {
  InstrumentationManager,
  assertInstrumentationsIsolationSafe,
} from './instrumentation/manager.js';
import { PromptClient, setSharedClient } from './prompt/client.js';
import { _resetMastraCache } from './mastra.js';
import { __version__ } from './version.js';
import type { InitOptions } from './types.js';

const logger = getLogger();

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _initialized = false;
let _tracerProvider: BasicTracerProvider | null = null;
let _ownsTracerProvider = false;
let _logProvider: LoggerProvider | null = null;
let _spanProcessor: NeatlogsSpanProcessor | null = null;
let _debugMode = false;
// Retained so shutdown() can disable the instrumentors it installed; otherwise a
// stale instrumentor stays bound to the shut-down provider after reinit.
let _instrumentationManager: InstrumentationManager | null = null;

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

  // 1b. Validate the requested instrumentations against the isolation policy
  // BEFORE touching any module state (debug flag, session config, provider, …).
  // The check is a pure function of the registry + the requested set, so failing
  // here keeps init() atomic: a rejected init leaves no half-installed provider
  // or stale state behind, and the next init() starts clean. Neatlogs always
  // uses a private provider, so this rejects any instrumentor that would drive
  // the global OTel context.
  if (options.instrumentations?.length) {
    assertInstrumentationsIsolationSafe(options.instrumentations);
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

  // 6. Parse base URL from endpoint
  const endpoint =
    options.endpoint ??
    'https://ingest.neatlogs.com';
  const baseUrl = new URL(endpoint).origin;

  // 7. Set session config. Session & end-user identity are PER-REQUEST (set via
  // trace()/span() or identify()), never on init() — only the operator userId
  // and workflow/transport config live here.
  _setSessionConfig({
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
  // Operator identity only — whoever RUNS the SDK. Session & end-user identity
  // are per-request (trace()/span()/identify()), never resource attributes.
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

  // 10. Create or adopt a PRIVATE TracerProvider. Neatlogs never reads,
  // registers onto, or shuts down a foreign global provider, so Datadog,
  // Braintrust, and other co-tenants can neither export nor parent our spans
  // (and vice versa).
  const provider =
    options.tracerProvider ??
    new NodeTracerProvider({
      resource,
      spanLimits: { attributeCountLimit: 10_000 },
    });
  _ownsTracerProvider = options.tracerProvider === undefined;

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

  // 13. Store privately. Neatlogs never registers an OTel provider globally.
  _tracerProvider = provider;
  _setNeatlogsProvider(provider);

  if (options.debug) {
    logger.debug('Neatlogs tracer provider initialized');
  }

  // 14. Never replace the process-global meter provider.
  if (options.debug) {
    logger.debug('Global meter provider left unchanged');
  }

  // 15. Set up LoggerProvider (if captureLogs)
  const captureLogs = options.captureLogs ?? false;
  if (captureLogs) {
    const logRecordProcessors: BatchLogRecordProcessor[] = [];

    // OTLP log export to /v1/logs (same pattern as Python SDK)
    if (!disableExportResolved) {
      const logsEndpoint = endpoint.endsWith('/v1/logs')
        ? endpoint
        : `${baseUrl}/v1/logs`;
      const otlpLogExporter = new OTLPLogExporter({
        url: logsEndpoint,
        headers: resolvedKey ? { 'x-api-key': resolvedKey } : undefined,
      });
      logRecordProcessors.push(
        new BatchLogRecordProcessor(otlpLogExporter, {
          maxExportBatchSize: options.batchSize ?? 100,
          scheduledDelayMillis: (options.flushInterval ?? 5) * 1000,
        }),
      );
      if (options.debug) {
        logger.debug(`OTLP log exporter configured: ${logsEndpoint}`);
      }
    }

    // sdk-logs >= 0.200 configures processors in the constructor and removed
    // addLogRecordProcessor(). Retain the older path so Neatlogs stays
    // compatible with applications that still resolve sdk-logs 0.57.
    const supportsDynamicProcessors =
      typeof LoggerProvider.prototype.addLogRecordProcessor === 'function';
    _logProvider = supportsDynamicProcessors
      ? new LoggerProvider({ resource })
      : new LoggerProvider({
          resource,
          processors: logRecordProcessors,
        } as ConstructorParameters<typeof LoggerProvider>[0]);
    if (supportsDynamicProcessors) {
      for (const processor of logRecordProcessors) {
        _logProvider.addLogRecordProcessor(processor);
      }
    }

    // Wire the OTel logger for neatlogs.log() function
    const otelLogger = _logProvider.getLogger('neatlogs');
    _setOtelLogger(otelLogger, options.debug ?? false);

    if (options.debug) {
      logger.debug(`Neatlogs log capture enabled (endpoint: ${baseUrl}/v1/logs)`);
    }
  } else if (options.debug) {
    logger.debug('Log capture disabled (pass captureLogs: true to enable)');
  }

  // 16. Instrument libraries. Retained in module state so shutdown() can disable
  // the instrumentors it installed. The manager rejects any requested library
  // whose auto-instrumentor drives the global OTel context.
  _instrumentationManager = new InstrumentationManager({
    provider,
    debug: options.debug,
  });

  if (options.instrumentations?.length) {
    await _instrumentationManager.instrument(options.instrumentations);
    if (options.debug) {
      logger.debug(
        `Instrumented libraries: ${_instrumentationManager.instrumented.join(', ')}`,
      );
    }
  }

  // 17. Register shutdown handlers. Default to flushing on exit whenever we own
  // the private provider so standalone scripts drain their spans;
  // only a caller-supplied provider defaults off (its owner controls shutdown).
  const registerShutdownHandlers =
    options.registerShutdownHandlers ?? _ownsTracerProvider;
  if (registerShutdownHandlers && !_sigHandlersRegistered) {
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
    logger.info(`User: ${options.userId ?? '(none)'}`);
    logger.info(`Tags: ${tags ?? []}`);
    logger.info(
      `Instrumentations: ${_instrumentationManager.instrumented.join(', ') || '(none)'}`,
    );
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

  // Flush regardless of ownership: our processors are attached to the provider
  // (owned or caller-supplied), so draining them is always ours to do. Shutdown
  // is what's ownership-gated — we never shut down a provider we didn't create.
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

  if (_logProvider) {
    try {
      logger.debug('Flushing log provider...');
      await _logProvider.forceFlush();
      logger.debug('Log provider flushed successfully');
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

  // Disable instrumentors BEFORE tearing down the provider so they stop emitting
  // spans against it, and clear the Mastra bridge cache so a subsequent init()
  // rebinds to the fresh provider instead of a stale one.
  _instrumentationManager?.disable();
  _instrumentationManager = null;
  _resetMastraCache();

  // Only shut down a provider we created. A caller-supplied provider is flushed
  // (above / in flush()) but never shut down — its owner controls its lifecycle,
  // per the tracerProvider contract in InitOptions. Flush it here so a caller
  // that shuts down right after us doesn't lose our still-buffered spans.
  if (_tracerProvider && _ownsTracerProvider) {
    try {
      logger.debug('Shutting down tracer provider...');
      await _tracerProvider.shutdown();
      logger.debug('Tracer provider shut down successfully');
    } catch (e) {
      logger.error(`Error shutting down tracer provider: ${e}`);
      success = false;
    }
  } else if (_tracerProvider) {
    try {
      logger.debug('Flushing caller-owned tracer provider (not shutting down)...');
      await _tracerProvider.forceFlush();
    } catch (e) {
      logger.error(`Error flushing caller-owned tracer provider: ${e}`);
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

  // Reset all module-level state
  _initialized = false;
  _tracerProvider = null;
  _ownsTracerProvider = false;
  _setNeatlogsProvider(null);
  _logProvider = null;
  _spanProcessor = null;
  _debugMode = false;

  // Reset session config
  _setSessionConfig({});

  logger.info('Neatlogs SDK shutdown complete');
  return success;
}

// ---------------------------------------------------------------------------
// getTracerProvider()
// ---------------------------------------------------------------------------

/**
 * Return the active TracerProvider. Throws if init() has not been called.
 */
export function getTracerProvider(): BasicTracerProvider {
  if (!_tracerProvider) {
    throw new Error(
      'Neatlogs is not initialized. Call init() before accessing the TracerProvider.',
    );
  }
  return _tracerProvider;
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
