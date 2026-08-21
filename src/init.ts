/**
 * Neatlogs SDK initialisation, flush, and shutdown.
 *
 * Port of Python neatlogs/init.py to TypeScript.
 *
 * `init()` sets up the OTel TracerProvider, MeterProvider, LoggerProvider,
 * span processors, and exporters.
 * `flush()` and `shutdown()` handle graceful cleanup.
 */

import * as path from 'node:path';

import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type BasicTracerProvider,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';

import { CompletionMarkerSpanProcessor, NeatlogsSpanProcessor } from './core/span-processor.js';
import { addVerificationMarkerResourceAttribute } from './core/resource.js';
import { getRegisteredClients } from './core/client-registry.js';
import { FilteringExporter } from './core/filtering-exporter.js';
import { _setOtelLogger } from './core/log.js';
import { _setSessionConfig } from './core/context.js';
import { _setNeatlogsProvider } from './core/provider.js';
import { getLogger, enableDebugLogging } from './core/logger.js';
import { PromptClient, setSharedClient } from './prompt/client.js';
import { _resetMastraCache } from './mastra.js';
import { __version__ } from './version.js';
import { NeatlogsConfigurationError } from './errors.js';
import type { InitOptions } from './types.js';

const logger = getLogger();

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _initialized = false;
type LifecycleState = 'uninitialized' | 'initializing' | 'running' | 'closing';
let _lifecycleState: LifecycleState = 'uninitialized';
let _initPromise: Promise<void> | null = null;
let _tracerProvider: BasicTracerProvider | null = null;
let _ownsTracerProvider = false;
let _logProvider: LoggerProvider | null = null;
let _spanProcessor: NeatlogsSpanProcessor | null = null;
let _transportSpanProcessors: SpanProcessor[] = [];
let _completionProcessor: CompletionMarkerSpanProcessor | null = null;
let _debugMode = false;

// Track signal handlers so we can remove them in shutdown()
let _sigHandlersRegistered = false;
let _signalShutdownStarted = false;
let _shutdownPromise: Promise<boolean> | null = null;
const _shutdownBeforeExit = () => {
  void shutdown('beforeExit').catch((error) => {
    logger.error(`Error shutting down before exit: ${error}`);
  });
};
const _shutdownOnSignal = (signal: NodeJS.Signals) => {
  if (_signalShutdownStarted) return;
  _signalShutdownStarted = true;
  // Node delivered this original signal to every registered listener. If the
  // host has one, it owns termination; re-sending would look like a second
  // signal. Only restore default signal semantics when Neatlogs was alone.
  const hostOwnsSignal = process
    .listeners(signal)
    .some((listener) => listener !== _shutdownOnSignal);
  void shutdown(signal)
    .catch((error) => {
      logger.error(`Error shutting down after ${signal}: ${error}`);
    })
    .finally(() => {
      if (hostOwnsSignal || process.listenerCount(signal) > 0) return;
      try {
        process.kill(process.pid, signal);
      } catch {
        process.exitCode = signal === 'SIGINT' ? 130 : 143;
      }
    });
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

const INIT_OPTION_KEYS = new Set<keyof InitOptions>([
  'apiKey',
  'workflowName',
  'userId',
  'tags',
  'metadata',
  'debug',
  'disableExport',
  'tracerProvider',
  'registerShutdownHandlers',
  'mask',
  'sampleRate',
  'captureLogs',
  'pii',
  'version',
  'endpoint',
  'batchSize',
  'flushInterval',
  'piiEnabled',
  'piiSpanTypes',
]);

function validateInitOptions(options: InitOptions): void {
  const raw = options as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(raw, 'instrumentations')) {
    throw new NeatlogsConfigurationError(
      'UNSUPPORTED_INSTRUMENTATIONS',
      'instrumentations',
      'The instrumentations option was removed. Use an explicit Neatlogs wrapper, handler, hook, processor, or plugin for the library instance.',
    );
  }
  const unknown = Object.keys(raw).find(
    (key) => !INIT_OPTION_KEYS.has(key as keyof InitOptions),
  );
  if (unknown) {
    throw new NeatlogsConfigurationError(
      'UNKNOWN_INIT_OPTION',
      unknown,
      `Unknown Neatlogs init option: ${unknown}`,
    );
  }
}

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

/**
 * Initialise the Neatlogs SDK.
 *
 * Sets up OTel TracerProvider, MeterProvider, LoggerProvider, span processors,
 * and exporters. It returns a Promise so initialization remains lifecycle-safe
 * across concurrent callers and future asynchronous transports.
 */
export function init(options: InitOptions = {}): Promise<void> {
  try {
    validateInitOptions(options);
  } catch (error) {
    return Promise.reject(error);
  }
  if (_lifecycleState === 'initializing' && _initPromise) return _initPromise;
  if (_lifecycleState === 'closing' && _shutdownPromise) {
    return _shutdownPromise.then(() => init(options));
  }
  if (_lifecycleState === 'running' || _initialized) {
    logger.warn('Neatlogs already initialized, skipping re-initialization');
    return Promise.resolve();
  }

  _lifecycleState = 'initializing';
  const current = Promise.resolve().then(() => _performInit(options));
  _initPromise = current;
  void current.then(
    () => {
      if (_initPromise === current) _initPromise = null;
      if (_lifecycleState === 'initializing') _lifecycleState = 'running';
    },
    () => {
      if (_initPromise === current) _initPromise = null;
      if (_lifecycleState === 'initializing') _lifecycleState = 'uninitialized';
    },
  );
  return current;
}

async function _performInit(options: InitOptions): Promise<void> {
  const sampleRate = options.sampleRate ?? 1.0;
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new RangeError('sampleRate must be a finite number between 0 and 1.');
  }
  if (options.tracerProvider && options.sampleRate !== undefined) {
    throw new Error(
      'sampleRate cannot configure a caller-owned tracerProvider; configure its sampler directly.',
    );
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
    ['true', '1', 'yes'].includes((process.env.NEATLOGS_DISABLE_EXPORT ?? '').toLowerCase());

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
  const endpoint = options.endpoint ?? 'https://ingest.neatlogs.com';
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
  addVerificationMarkerResourceAttribute(resourceAttrs);
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
    resourceAttrs['neatlogs.pii.enabled'] = options.pii === false ? 'false' : 'true';
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
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(sampleRate),
      }),
    });
  _ownsTracerProvider = options.tracerProvider === undefined;

  // 11. Add NeatlogsSpanProcessor
  _spanProcessor = new NeatlogsSpanProcessor({
    debug: options.debug ?? false,
    mask: options.mask,
    emitCompletionMarkers: false,
    ownAllSpans: _ownsTracerProvider,
  });
  provider.addSpanProcessor(_spanProcessor);

  // 12. Add BatchSpanProcessor + OTLPSpanExporter (if export enabled)
  if (!disableExportResolved) {
    const tracesEndpoint = endpoint.endsWith('/v1/traces') ? endpoint : `${baseUrl}/v1/traces`;

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
    const completionProcessor = new CompletionMarkerSpanProcessor(
      _spanProcessor,
      provider.getTracer('neatlogs.internal'),
    );
    provider.addSpanProcessor(batchProcessor);
    provider.addSpanProcessor(completionProcessor);
    _transportSpanProcessors = [batchProcessor, completionProcessor];
    _completionProcessor = completionProcessor;

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
      const logsEndpoint = endpoint.endsWith('/v1/logs') ? endpoint : `${baseUrl}/v1/logs`;
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

  // 16. Register shutdown handlers. Default to flushing on exit whenever we own
  // the private provider so standalone scripts drain their spans;
  // only a caller-supplied provider defaults off (its owner controls shutdown).
  const registerShutdownHandlers = options.registerShutdownHandlers ?? _ownsTracerProvider;
  if (registerShutdownHandlers && !_sigHandlersRegistered) {
    process.on('beforeExit', _shutdownBeforeExit);
    // Run before pre-existing one-shot host listeners so ownership is observed
    // before EventEmitter removes them for their invocation.
    process.prependListener('SIGTERM', _shutdownOnSignal);
    process.prependListener('SIGINT', _shutdownOnSignal);
    _sigHandlersRegistered = true;
  }

  // 17. Mark as initialised
  _initialized = true;

  if (options.debug) {
    logger.info('Neatlogs SDK initialized successfully');
    logger.info(`Endpoint: ${endpoint}`);
    logger.info(`Workflow: ${resolvedWorkflowName}`);
    logger.info(`User: ${options.userId ?? '(none)'}`);
    logger.info(`Tags: ${tags ?? []}`);
    logger.info(`Sample Rate: ${sampleRate}`);
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
  // Logs must drain before spans: the trace flush can export the root and its
  // completion marker, which may make the backend finalize the trace.
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

  try {
    await _spanProcessor?.forceFlush();
    await _completionProcessor?.forceFlush();
  } catch (e) {
    logger.error(`Error completing span masking/finalization: ${e}`);
    success = false;
  }

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

  return success;
}

/**
 * Flush the module-level SDK pipeline and every live Neatlogs `Client` in this
 * process. Foreign OpenTelemetry providers are never discovered or flushed.
 */
export async function flushAll(): Promise<boolean> {
  const results = await Promise.allSettled([
    flush(),
    ...getRegisteredClients().map((client) => client.flush()),
  ]);
  return results.every((result) => result.status === 'fulfilled' && result.value === true);
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
export function shutdown(terminationReason = 'shutdown'): Promise<boolean> {
  if (_shutdownPromise) return _shutdownPromise;

  const initialization = _lifecycleState === 'initializing' ? _initPromise : null;
  _lifecycleState = 'closing';
  _completionProcessor?.beginShutdown();
  _spanProcessor?.beginShutdown(terminationReason);
  _setOtelLogger(null, false);

  // Defer all shutdown work until the shared promise has been installed.
  // endActiveSpans() synchronously invokes onEnd(), and a host processor may
  // re-enter shutdown() from there.
  const currentShutdown = Promise.resolve().then(async () => {
    if (initialization) {
      try {
        await initialization;
      } catch {
        // Teardown any partial state left by a failed initialization.
      }
    }
    return _performShutdown(terminationReason);
  });
  _shutdownPromise = currentShutdown;
  const clearCurrentShutdown = () => {
    if (_shutdownPromise === currentShutdown) {
      _shutdownPromise = null;
      _lifecycleState = 'uninitialized';
    }
  };
  void currentShutdown.then(clearCurrentShutdown, clearCurrentShutdown);
  return currentShutdown;
}

async function _performShutdown(terminationReason: string): Promise<boolean> {
  // Remove signal handlers
  if (_sigHandlersRegistered) {
    process.removeListener('beforeExit', _shutdownBeforeExit);
    process.removeListener('SIGTERM', _shutdownOnSignal);
    process.removeListener('SIGINT', _shutdownOnSignal);
    _sigHandlersRegistered = false;
  }

  let success = true;

  // Clear the Mastra bridge cache so a subsequent init() rebinds to the fresh
  // provider instead of a stale one.
  _resetMastraCache();

  // LOG records must drain before trace completion. The trace provider carries
  // neatlogs.trace.complete, which can trigger server-side finalization.
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

  // Ending the root creates the trace-completion marker. Do this only after
  // buffered logs have drained so finalization cannot overtake them.
  if (_spanProcessor) {
    const ended = _spanProcessor.endActiveSpans(terminationReason);
    if (ended > 0) {
      logger.info(`Ended ${ended} active Neatlogs span(s) during ${terminationReason}`);
    }
  }
  _completionProcessor?.emitDeferred();
  try {
    await _spanProcessor?.forceFlush();
    await _completionProcessor?.forceFlush();
  } catch (e) {
    logger.error(`Error completing span masking/finalization: ${e}`);
    success = false;
  }

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
    // The provider is caller-owned, but these processors/exporters are ours.
    // SDKs cannot detach processors in OTel JS 1.x; shut every instance down
    // independently so one exporter failure cannot leave another active.
    const transportResults = await Promise.allSettled(
      [..._transportSpanProcessors].reverse().map((processor) => processor.shutdown()),
    );
    if (transportResults.some((result) => result.status === 'rejected')) {
      logger.error('One or more Neatlogs transport processors failed to shut down');
      success = false;
    }
    try {
      await _spanProcessor?.shutdown();
    } catch (e) {
      logger.error(`Error disabling Neatlogs span processor: ${e}`);
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
  _transportSpanProcessors = [];
  _completionProcessor = null;
  _debugMode = false;
  _signalShutdownStarted = false;

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
