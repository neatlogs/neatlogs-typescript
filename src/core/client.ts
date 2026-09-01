import {
  INVALID_SPAN_CONTEXT,
  trace as otelTrace,
  type Context,
  type Span,
  type SpanOptions,
  type Tracer,
} from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type BasicTracerProvider,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";

import { runWithClient } from "./active-client.js";
import { registerClient, unregisterClient } from "./client-registry.js";
import { FilteringExporter } from "./filtering-exporter.js";
import { ByteLimitedSpanExporter } from "./byte-limited-exporter.js";
import { MaskingLogExporter } from "./masking-log-exporter.js";
import { discardPendingMediaOwner } from "./media.js";
import {
  DeliveryDiagnostics,
  type DeliveryDiagnosticsSnapshot,
} from "./delivery-diagnostics.js";
import {
  ObservableBatchLogRecordProcessor,
  ObservableBatchSpanProcessor,
} from "./observable-batch-processors.js";
import { getLogger } from "./logger.js";
import { runWithFreshNeatlogsContext } from "./provider.js";
import { addVerificationMarkerResourceAttribute } from "./resource.js";
import {
  CompletionMarkerSpanProcessor,
  NeatlogsSpanProcessor,
} from "./span-processor.js";
import type { MaskFunction } from "../types.js";
import { __version__ } from "../version.js";
import { DEFAULT_INGEST_ENDPOINT, exportQueueCapacity } from "../constants.js";
import { runByDeadline } from "./deadline.js";
import {
  DisabledUploadAuthority,
  resolveUploadAuthority,
  type UploadAuthorityOption,
} from "./upload-authority.js";

const logger = getLogger();

export interface ClientOptions {
  apiKey?: string;
  workflowName: string;
  endpoint?: string;
  tags?: string[];
  captureLogs?: boolean;
  batchSize?: number;
  flushInterval?: number;
  disableExport?: boolean;
  mask?: MaskFunction;
  sampleRate?: number;
  debug?: boolean;
  /** Optional transport override, primarily for private collectors and tests. */
  spanExporter?: SpanExporter;
  /** Explicitly gate or inject authenticated typed-media/overflow uploads. */
  uploadAuthority?: UploadAuthorityOption;
}

type ClientState = "running" | "closing" | "closed";

const closedTracer: Tracer = {
  startSpan(): Span {
    return otelTrace.wrapSpanContext(INVALID_SPAN_CONTEXT);
  },
  startActiveSpan<F extends (span: Span) => unknown>(
    _name: string,
    arg2?: SpanOptions | Context | F,
    arg3?: Context | F,
    arg4?: F,
  ): ReturnType<F> {
    const fn =
      typeof arg2 === "function"
        ? arg2
        : typeof arg3 === "function"
          ? arg3
          : arg4;
    return fn!(
      otelTrace.wrapSpanContext(INVALID_SPAN_CONTEXT),
    ) as ReturnType<F>;
  },
};

class ClientLifecycleTracer implements Tracer {
  constructor(
    private readonly client: Client,
    private readonly tracer: Tracer,
  ) {}

  private current(): Tracer {
    return this.client.isRunning() ? this.tracer : closedTracer;
  }

  startSpan(name: string, options?: SpanOptions, context?: Context): Span {
    return this.current().startSpan(name, options, context);
  }

  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    arg2?: SpanOptions | Context | F,
    arg3?: Context | F,
    arg4?: F,
  ): ReturnType<F> {
    return (this.current().startActiveSpan as any)(name, arg2, arg3, arg4);
  }
}

/** Independent, execution-context-scoped Neatlogs export pipeline. */
export class Client {
  readonly workflowName: string;
  readonly tracerProvider: BasicTracerProvider;
  readonly logProvider: LoggerProvider | null;

  private readonly spanProcessor: NeatlogsSpanProcessor;
  private readonly completionProcessor: CompletionMarkerSpanProcessor | null;
  private readonly tracers = new Map<string, Tracer>();
  private readonly otelLogger: any | null;
  private state: ClientState = "running";
  private shutdownPromise: Promise<boolean> | null = null;
  private readonly diagnostics = new DeliveryDiagnostics();

  constructor(options: ClientOptions) {
    const apiKey = (options.apiKey ?? "").trim();
    const workflowName = (options.workflowName ?? "").trim();
    const disableExport = options.disableExport ?? false;
    if (!workflowName) throw new Error("workflowName is required");
    if (!apiKey && !disableExport) {
      throw new Error("apiKey is required unless disableExport is true");
    }
    if (
      options.tags !== undefined &&
      (!Array.isArray(options.tags) ||
        !options.tags.every((tag) => typeof tag === "string"))
    ) {
      throw new Error("tags must be a list of strings");
    }
    const sampleRate = options.sampleRate ?? 1;
    if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
      throw new RangeError(
        "sampleRate must be a finite number between 0 and 1.",
      );
    }

    this.workflowName = workflowName;
    const resourceAttributes: Record<string, string | number | boolean> = {
      [ATTR_SERVICE_NAME]: workflowName,
      "service.version": __version__,
      "neatlogs.workflow_name": workflowName,
    };
    if (options.tags?.length) {
      resourceAttributes["neatlogs.tags"] = options.tags.join(",");
    }
    addVerificationMarkerResourceAttribute(resourceAttributes);
    const resource = new Resource(resourceAttributes);

    this.tracerProvider = new NodeTracerProvider({
      resource,
      spanLimits: { attributeCountLimit: 10_000 },
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(sampleRate),
      }),
    });
    this.spanProcessor = new NeatlogsSpanProcessor({
      debug: options.debug ?? false,
      mask: options.mask,
      emitCompletionMarkers: false,
      ownAllSpans: true,
    });
    this.tracerProvider.addSpanProcessor(this.spanProcessor);
    this.completionProcessor = null;

    const endpoint = options.endpoint ?? DEFAULT_INGEST_ENDPOINT;
    const baseUrl = new URL(endpoint).origin;
    const uploadAuthority = disableExport
      ? new DisabledUploadAuthority("export_disabled")
      : resolveUploadAuthority(
          options.uploadAuthority,
          process.env.NEATLOGS_UPLOADS_ENABLED,
          baseUrl,
          apiKey,
        );
    this.diagnostics.configureUploadAuthority(
      uploadAuthority.available,
      uploadAuthority.unavailableReason,
    );
    if (!disableExport) {
      const traceUrl = endpoint.endsWith("/v1/traces")
        ? endpoint
        : `${baseUrl}/v1/traces`;
      const exporter = new FilteringExporter(
        new ByteLimitedSpanExporter(
          options.spanExporter ??
            new OTLPTraceExporter({
              url: traceUrl,
              headers: { "x-api-key": apiKey },
              compression: CompressionAlgorithm.GZIP,
            }),
          undefined,
          this.diagnostics,
          uploadAuthority,
        ),
        this.diagnostics,
        uploadAuthority,
      );
      const batchSize = options.batchSize ?? 100;
      this.tracerProvider.addSpanProcessor(
        new ObservableBatchSpanProcessor(
          exporter,
          {
            maxExportBatchSize: batchSize,
            maxQueueSize: exportQueueCapacity(batchSize),
            scheduledDelayMillis: (options.flushInterval ?? 5) * 1000,
          },
          this.diagnostics,
        ),
      );
      const completionProcessor = new CompletionMarkerSpanProcessor(
        this.spanProcessor,
        this.tracerProvider.getTracer("neatlogs.internal"),
      );
      this.tracerProvider.addSpanProcessor(completionProcessor);
      this.completionProcessor = completionProcessor;
    }

    const logProcessors = !disableExport
      ? [
          new ObservableBatchLogRecordProcessor(
            new MaskingLogExporter(
              new OTLPLogExporter({
                url: `${baseUrl}/v1/logs`,
                headers: { "x-api-key": apiKey },
                compression: CompressionAlgorithm.GZIP,
              }),
              options.mask,
              undefined,
              this.diagnostics,
            ),
            {
              maxExportBatchSize: options.batchSize ?? 100,
              maxQueueSize: exportQueueCapacity(options.batchSize ?? 100),
              scheduledDelayMillis: (options.flushInterval ?? 5) * 1000,
            },
            this.diagnostics,
          ),
        ]
      : [];
    if (options.captureLogs) {
      const supportsDynamicProcessors =
        typeof LoggerProvider.prototype.addLogRecordProcessor === "function";
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
    } else {
      this.logProvider = null;
    }
    this.otelLogger = this.logProvider?.getLogger("neatlogs") ?? null;
    registerClient(this);
  }

  isRunning(): boolean {
    return this.state === "running";
  }

  getTracer(scope: string): Tracer {
    let tracer = this.tracers.get(scope);
    if (!tracer) {
      tracer = new ClientLifecycleTracer(
        this,
        this.tracerProvider.getTracer(scope),
      );
      this.tracers.set(scope, tracer);
    }
    return tracer;
  }

  getLogger(): any | null {
    return this.state === "running" ? this.otelLogger : null;
  }

  getDeliveryDiagnostics(): DeliveryDiagnosticsSnapshot {
    return this.diagnostics.snapshot();
  }

  activate<T>(fn: () => T): T {
    if (!this.isRunning()) throw new Error("Client is closing or closed");
    return runWithClient(this, () => runWithFreshNeatlogsContext(fn));
  }

  async flush(): Promise<boolean> {
    if (this.state === "closed") return true;
    if (this.state === "closing") return this.shutdownPromise ?? false;
    let success = true;
    if (this.logProvider) {
      try {
        await this.logProvider.forceFlush();
      } catch (error) {
        logger.error(
          `[Client:${this.workflowName}] Error flushing logs: ${error}`,
        );
        success = false;
      }
    }
    try {
      await this.spanProcessor.forceFlush();
      await this.completionProcessor?.forceFlush();
    } catch (error) {
      logger.error(
        `[Client:${this.workflowName}] Error completing span masking/finalization: ${error}`,
      );
      success = false;
    }
    try {
      await this.tracerProvider.forceFlush();
    } catch (error) {
      logger.error(
        `[Client:${this.workflowName}] Error flushing spans: ${error}`,
      );
      success = false;
    }
    return success;
  }

  shutdown(reason = "shutdown", timeoutMs = 30_000): Promise<boolean> {
    if (this.shutdownPromise) return this.shutdownPromise;
    if (this.state === "closed") return Promise.resolve(true);
    this.state = "closing";
    this.completionProcessor?.beginShutdown();
    this.spanProcessor.beginShutdown(reason);
    const current = Promise.resolve().then(() =>
      this.performShutdown(reason, timeoutMs),
    );
    this.shutdownPromise = current;
    return current;
  }

  close(reason = "shutdown", timeoutMs = 30_000): Promise<boolean> {
    return this.shutdown(reason, timeoutMs);
  }

  private async performShutdown(
    reason: string,
    timeoutMs: number,
  ): Promise<boolean> {
    let success = true;
    const deadline = Date.now() + Math.max(0, timeoutMs);
    const attempt = async (
      label: string,
      operation: () => unknown | PromiseLike<unknown>,
    ): Promise<void> => {
      const outcome = await runByDeadline(operation, deadline);
      if (!outcome.completed) {
        logger.error(
          `[Client:${this.workflowName}] ${label} failed or exceeded the shutdown deadline`,
        );
        success = false;
      }
    };

    // Drain logs before ending roots: root end creates the completion marker.
    if (this.logProvider) {
      await attempt("Log provider shutdown", () =>
        this.logProvider!.shutdown(),
      );
    }
    this.spanProcessor.endActiveSpans(reason);
    this.completionProcessor?.emitDeferred();
    await attempt("Span masking/finalization", () =>
      this.spanProcessor.forceFlush(),
    );
    if (this.completionProcessor) {
      await attempt("Completion processor flush", () =>
        this.completionProcessor!.forceFlush(),
      );
    }
    await attempt("Tracer provider shutdown", () =>
      this.tracerProvider.shutdown(),
    );
    discardPendingMediaOwner(this);
    this.tracers.clear();
    this.state = "closed";
    unregisterClient(this);
    return success;
  }
}
