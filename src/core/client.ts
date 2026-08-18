/**
 * Independent, context-scoped Neatlogs clients.
 *
 * Port of Python `neatlogs.Client` (neatlogs/client.py).
 *
 * `init()` remains the process-wide default and is unchanged. `Client` is
 * additive: inside `client.activate(...)` only, Neatlogs spans and structured
 * logs use the client's private credentials and exporters. This is what lets
 * one process run several independent features — a copilot and a nightly
 * summarizer, say — under different API keys, workflow names, and tags, which
 * a single-shot `init()` cannot express.
 */

import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  BatchSpanProcessor,
  type BasicTracerProvider,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import type { Tracer } from '@opentelemetry/api';

import { NeatlogsSpanProcessor } from './span-processor.js';
import { FilteringExporter } from './filtering-exporter.js';
import { runWithClient } from './active-client.js';
import { getLogger } from './logger.js';
import { __version__ } from '../version.js';
import type { MaskFunction } from '../types.js';

const logger = getLogger();

const DEFAULT_ENDPOINT = 'https://ingest.neatlogs.com';

export interface ClientOptions {
  /** Neatlogs API key for THIS pipeline. Required unless `disableExport`. */
  apiKey?: string;
  /**
   * Logical name for this pipeline. Required — it is what separates this
   * client's traces from the `init()` pipeline's in the dashboard.
   */
  workflowName: string;
  /** Ingest base URL. Defaults to https://ingest.neatlogs.com. */
  endpoint?: string;
  /** Tags attached to every span from this client. */
  tags?: string[];
  /** Capture structured logs and export them to /v1/logs. Defaults to false. */
  captureLogs?: boolean;
  /** Max spans per export batch. Defaults to 100. */
  batchSize?: number;
  /** Seconds between batch flushes. Defaults to 5. */
  flushInterval?: number;
  /** Build the pipeline but never transmit. Useful in tests. */
  disableExport?: boolean;
  /** Redact span data before export. Per-span masks still take precedence. */
  mask?: MaskFunction;
  /** Sampling rate 0.0-1.0. Defaults to 1.0. */
  sampleRate?: number;
  /** Emit debug diagnostics for this client's pipeline. */
  debug?: boolean;
  /**
   * Caller-owned private provider. Neatlogs adds its processors and flushes it
   * but never registers it globally and never shuts it down.
   */
  tracerProvider?: BasicTracerProvider;
}

/** An independent Neatlogs export pipeline, activated per execution context. */
export class Client {
  readonly workflowName: string;
  readonly tracerProvider: BasicTracerProvider;
  readonly logProvider: LoggerProvider | null = null;

  private readonly _ownsProvider: boolean;
  private readonly _spanProcessor: NeatlogsSpanProcessor;
  private readonly _tracers = new Map<string, Tracer>();
  private _closed = false;

  constructor(options: ClientOptions) {
    const key = (options.apiKey ?? '').trim();
    const name = (options.workflowName ?? '').trim();
    const disableExport = options.disableExport ?? false;

    if (!key && !disableExport) {
      throw new Error('apiKey is required unless disableExport is true');
    }
    if (!name) {
      throw new Error('workflowName is required');
    }
    if (
      options.tags !== undefined &&
      (!Array.isArray(options.tags) ||
        !options.tags.every((t) => typeof t === 'string'))
    ) {
      throw new Error('tags must be a list of strings');
    }

    this.workflowName = name;
    this._ownsProvider = options.tracerProvider === undefined;

    const resourceAttrs: Record<string, string | number | boolean> = {
      [ATTR_SERVICE_NAME]: name,
      'service.version': __version__,
      'neatlogs.workflow_name': name,
    };
    if (options.tags?.length) {
      resourceAttrs['neatlogs.tags'] = options.tags.join(',');
    }
    const resource = new Resource(resourceAttrs);

    this.tracerProvider =
      options.tracerProvider ??
      new NodeTracerProvider({
        resource,
        spanLimits: { attributeCountLimit: 10_000 },
      });

    this._spanProcessor = new NeatlogsSpanProcessor({
      sampleRate: options.sampleRate ?? 1.0,
      debug: options.debug ?? false,
      mask: options.mask,
    });
    this.tracerProvider.addSpanProcessor(this._spanProcessor);

    const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    const baseUrl = new URL(endpoint).origin;

    if (!disableExport) {
      const tracesEndpoint = endpoint.endsWith('/v1/traces')
        ? endpoint
        : `${baseUrl}/v1/traces`;

      const exporter = new FilteringExporter(
        new OTLPTraceExporter({
          url: tracesEndpoint,
          headers: { 'x-api-key': key },
        }),
      );

      this.tracerProvider.addSpanProcessor(
        new BatchSpanProcessor(exporter, {
          maxExportBatchSize: options.batchSize ?? 100,
          scheduledDelayMillis: (options.flushInterval ?? 5) * 1000,
        }),
      );

      if (options.debug) {
        logger.debug(
          `[Client:${name}] OTLP trace exporter configured: ${tracesEndpoint}`,
        );
      }
    }

    if (options.captureLogs) {
      const logProcessors: BatchLogRecordProcessor[] = [];
      if (!disableExport) {
        const logsEndpoint = endpoint.endsWith('/v1/logs')
          ? endpoint
          : `${baseUrl}/v1/logs`;
        logProcessors.push(
          new BatchLogRecordProcessor(
            new OTLPLogExporter({
              url: logsEndpoint,
              headers: { 'x-api-key': key },
            }),
            {
              maxExportBatchSize: options.batchSize ?? 100,
              scheduledDelayMillis: (options.flushInterval ?? 5) * 1000,
            },
          ),
        );
      }

      // sdk-logs >= 0.200 takes processors in the constructor and dropped
      // addLogRecordProcessor(). Support both, matching init().
      const supportsDynamicProcessors =
        typeof LoggerProvider.prototype.addLogRecordProcessor === 'function';
      this.logProvider = supportsDynamicProcessors
        ? new LoggerProvider({ resource })
        : new LoggerProvider({
            resource,
            processors: logProcessors,
          } as ConstructorParameters<typeof LoggerProvider>[0]);
      if (supportsDynamicProcessors) {
        for (const processor of logProcessors) {
          this.logProvider.addLogRecordProcessor(processor);
        }
      }
    }
  }

  /** Cached tracer bound to THIS client's private provider. */
  getTracer(scope: string): Tracer {
    let tracer = this._tracers.get(scope);
    if (tracer === undefined) {
      tracer = this.tracerProvider.getTracer(scope);
      this._tracers.set(scope, tracer);
    }
    return tracer;
  }

  /**
   * Run `fn` with this client selected as the active pipeline.
   *
   * Callback form rather than Python's `with client.activate():` — that is what
   * `AsyncLocalStorage` requires to propagate across `await` boundaries. The
   * return value is passed straight through, so awaiting the call awaits `fn`.
   *
   *     await client.activate(async () => {
   *       await openai.chat.completions.create({ ... });
   *     });
   */
  activate<T>(fn: () => T): T {
    if (this._closed) {
      throw new Error('Client is closed');
    }
    return runWithClient(this, fn);
  }

  /**
   * Wrap a supported integration so its spans route to this client.
   *
   * NOTE: `wrap()` patches the target's CLASS, which is process-global. Wrapping
   * inside one client therefore also instruments that class for every other
   * client — the routing (which pipeline receives the spans) is what stays
   * per-context. Same behaviour as the Python SDK.
   */
  wrap<T>(target: T, workflowAttributes?: Record<string, unknown>): T {
    return this.activate(() => {
      // Resolved lazily: index.ts imports this module, so a static import would
      // close a require cycle.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const neatlogs = require('../index.js');
      return neatlogs.wrap(target, workflowAttributes) as T;
    });
  }

  /** Drain this client's pending spans and logs. */
  async flush(): Promise<boolean> {
    let success = true;

    // Logs BEFORE traces: the trace batch carries neatlogs.trace.complete, which
    // triggers server-side finalisation. Draining logs first guarantees LOG
    // records land before the finaliser runs. (Matches Python's flush order.)
    if (this.logProvider) {
      try {
        await this.logProvider.forceFlush();
      } catch (e) {
        logger.error(`[Client:${this.workflowName}] Error flushing logs: ${e}`);
        success = false;
      }
    }

    try {
      await this.tracerProvider.forceFlush();
    } catch (e) {
      logger.error(`[Client:${this.workflowName}] Error flushing spans: ${e}`);
      success = false;
    }

    return success;
  }

  /**
   * Flush, then tear down this client's pipeline. The process-wide `init()`
   * pipeline is untouched. A caller-supplied `tracerProvider` is flushed but
   * never shut down — its owner controls that lifecycle.
   */
  async shutdown(): Promise<boolean> {
    if (this._closed) return true;

    let success = await this.flush();
    this._closed = true;

    if (this.logProvider) {
      try {
        await this.logProvider.shutdown();
      } catch (e) {
        logger.error(
          `[Client:${this.workflowName}] Error shutting down logs: ${e}`,
        );
        success = false;
      }
    }

    if (this._ownsProvider) {
      try {
        await this.tracerProvider.shutdown();
      } catch (e) {
        logger.error(
          `[Client:${this.workflowName}] Error shutting down provider: ${e}`,
        );
        success = false;
      }
    }

    this._tracers.clear();
    return success;
  }

  /** Alias for `shutdown()`, mirroring Python's `Client.close`. */
  async close(): Promise<boolean> {
    return this.shutdown();
  }
}
