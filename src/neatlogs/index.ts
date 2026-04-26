/**
 * NeatLogs TypeScript SDK
 *
 * Mirrors the Python SDK API surface:
 *   - init()            — initialize OTel SDK + OTLP exporter
 *   - flush()           — force-flush all pending spans
 *   - shutdown()        — shut down the SDK
 *   - spanWrap()        — wrap a function with an OTel span (mirrors @neatlogs.span)
 *   - withTrace()       — wrap a callback in a child span (mirrors neatlogs.trace())
 *   - log()             — structured log as a span event
 *   - PromptTemplate    — prompt versioning helper (system messages)
 *   - UserPromptTemplate — prompt versioning helper (user messages)
 */

import * as otelApi from "@opentelemetry/api";
import {
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import {
  BatchSpanProcessor,
  ReadableSpan,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { OpenAIInstrumentation } from "@opentelemetry/instrumentation-openai";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Context } from "@opentelemetry/api";
import { URL } from "url";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _provider: NodeTracerProvider | null = null;
let _initialized = false;
let _workflowName = "neatlogs-app";
let _tagsStr: string | undefined;

// ---------------------------------------------------------------------------
// NeatlogsAttributeProcessor
//
// Stamps neatlogs.workflow_name, neatlogs.internal, and neatlogs.tags onto
// every span at start time — including auto-instrumented spans from libraries
// like @opentelemetry/instrumentation-openai. This ensures all spans in the
// trace carry the required NeatLogs attributes regardless of how they were
// created.
// ---------------------------------------------------------------------------

class NeatlogsAttributeProcessor implements SpanProcessor {
  private _workflowName: string;
  private _tags: string | undefined;

  constructor(workflowName: string, tags?: string) {
    this._workflowName = workflowName;
    this._tags = tags;
  }

  onStart(span: otelApi.Span, _parentContext: Context): void {
    span.setAttribute("neatlogs.internal", "True");
    span.setAttribute("neatlogs.workflow_name", this._workflowName);
    span.setAttribute("neatlogs.instrumentation.name", "neatlogs.decorators._base");
    if (this._tags) {
      span.setAttribute("neatlogs.tags", this._tags);
    }
    // Stamp neatlogs.span.kind for spans that carry openinference.span.kind but
    // no neatlogs.span.kind yet (e.g. OpenAI auto-instrumented LLM spans).
    // We can only read attributes already set by the time onStart fires, so this
    // covers instrumentations that set openinference.span.kind in startSpan options.
    // spanWrap() and withTrace() will overwrite this with the correct value anyway.
    const oiKind = (span as unknown as { attributes?: Record<string, unknown> }).attributes?.["openinference.span.kind"];
    if (oiKind && typeof oiKind === "string") {
      span.setAttribute("neatlogs.span.kind", oiKind.toLowerCase());
    }
  }

  onEnd(_span: ReadableSpan): void {}
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// CompletionMarkerProcessor
//
// Mirrors the Python NeatlogsSpanProcessor._emit_completion_marker() behavior.
// When a root span (no parent) ends, emits a "neatlogs.trace.complete" marker
// span under the same traceId. The NeatLogs backend watches for this marker to
// finalize the trace and make it visible in the UI.
// ---------------------------------------------------------------------------

class CompletionMarkerProcessor implements SpanProcessor {
  private _debug: boolean;
  private _tags: string | undefined;

  constructor(debug: boolean, tags?: string) {
    this._debug = debug;
    this._tags = tags;
  }

  onStart(_span: otelApi.Span, _parentContext: Context): void {}

  onEnd(span: ReadableSpan): void {
    // Only fire for root spans (no parent span context)
    if (span.parentSpanContext) return;
    if (span.name === "neatlogs.trace.complete") return;

    try {
      const traceId = span.spanContext().traceId;
      const spanId = span.spanContext().spanId;

      // Build a NonRecordingSpan context that sits in the same trace
      // (matching the Python SDK's completion_marker parent context)
      const spanCtx: otelApi.SpanContext = {
        traceId,
        spanId,
        isRemote: false,
        traceFlags: otelApi.TraceFlags.SAMPLED,
      };
      const ctx = otelApi.trace.setSpan(
        otelApi.context.active(),
        otelApi.trace.wrapSpanContext(spanCtx)
      );

      const tracer = otelApi.trace.getTracer("neatlogs.core.context");
      const marker = tracer.startSpan("neatlogs.trace.complete", {}, ctx);
      marker.setAttribute("neatlogs.trace.complete", true);
      marker.setAttribute("neatlogs.internal", "True");
      marker.setAttribute("neatlogs.span.kind", "Neatlogs.INTERNAL");
      if (this._tags) {
        marker.setAttribute("neatlogs.tags", this._tags);
      }
      marker.end();

      if (this._debug) {
        console.log(`[neatlogs] Emitted completion marker for trace ${traceId}`);
      }
    } catch (err) {
      console.warn("[neatlogs] Failed to emit completion marker:", String(err));
    }
  }

  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

export interface InitOptions {
  apiKey?: string;
  endpoint?: string;
  workflowName?: string;
  sessionId?: string;
  userId?: string;
  tags?: string[];
  debug?: boolean;
  disableExport?: boolean;
}

export function init(options: InitOptions = {}): void {
  if (_initialized) {
    if (options.debug) {
      console.warn("[neatlogs] Already initialized, skipping re-initialization");
    }
    return;
  }

  const {
    apiKey,
    endpoint,
    workflowName = "neatlogs-app",
    sessionId,
    userId,
    tags,
    debug = false,
    disableExport = false,
  } = options;

  const resolvedKey = apiKey || process.env.NEATLOGS_API_KEY || "";
  const resolvedEndpoint =
    endpoint ||
    process.env.NEATLOGS_ENDPOINT ||
    "https://staging-cloud.neatlogs.com";

  // Parse base URL (scheme + host only)
  const parsedUrl = new URL(resolvedEndpoint);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

  // Build OTel resource attributes
  const resourceAttrs: Record<string, string> = {
    [SEMRESATTRS_SERVICE_NAME]: workflowName,
    "neatlogs.workflow_name": workflowName,
    "service.version": "1.0.0",
  };
  if (sessionId) resourceAttrs["session.id"] = sessionId;
  if (userId) resourceAttrs["user.id"] = userId;
  if (tags && tags.length > 0) resourceAttrs["neatlogs.tags"] = tags.join(",");

  const resource = resourceFromAttributes(resourceAttrs);

  // OTLP Span Exporter — always send to {base_url}/v1/traces
  const spanProcessors: SpanProcessor[] = [];

  // NeatlogsAttributeProcessor stamps neatlogs.* attributes onto every span
  // at start time, including auto-instrumented spans from OpenAI/other libs.
  const tagsStr = tags && tags.length > 0 ? tags.join(",") : undefined;
  spanProcessors.push(new NeatlogsAttributeProcessor(workflowName, tagsStr));

  // CompletionMarkerProcessor must be added after NeatlogsAttributeProcessor
  // so that when a root span ends it emits "neatlogs.trace.complete".
  spanProcessors.push(new CompletionMarkerProcessor(debug, tagsStr));

  if (!disableExport && resolvedKey) {
    // Use OTLP protobuf transport to /v1/traces — same as the Python SDK.
    const rawExporter = new OTLPTraceExporter({
      url: `${baseUrl}/v1/traces`,
      headers: { "x-api-key": resolvedKey },
    });

    // Wrap exporter to log export results when debug is enabled
    const exporter = debug ? {
      export(spans: ReadableSpan[], cb: (result: import("@opentelemetry/core").ExportResult) => void) {
        rawExporter.export(spans, (result) => {
          if (result.code === 0) {
            console.log(`[neatlogs] exported ${spans.length} span(s) via OTLP — OK`);
          } else {
            console.warn(`[neatlogs] OTLP export failed (${spans.length} spans): ${result.error}`);
          }
          cb(result);
        });
      },
      shutdown: () => rawExporter.shutdown(),
      forceFlush: () => rawExporter.forceFlush?.() ?? Promise.resolve(),
    } : rawExporter;

    spanProcessors.push(
      new BatchSpanProcessor(exporter as import("@opentelemetry/sdk-trace-base").SpanExporter, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 300000, // 5 minutes — defer auto-export; manual flush() sends everything at once
      })
    );

    if (debug) {
      console.log(`[neatlogs] OTLP exporter configured: ${baseUrl}/v1/traces`);
    }
  } else if (debug) {
    console.log("[neatlogs] Export disabled — spans will not be sent to backend");
  }

  // Enable content capture so prompt/completion text is recorded
  process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "true";

  const provider = new NodeTracerProvider({
    resource,
    spanProcessors,
    forceFlushTimeoutMillis: 30000,
  });

  provider.register();

  // Auto-instrument OpenAI (captures LLM call spans with model, tokens, prompts, completions)
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new OpenAIInstrumentation({
        captureMessageContent: true,
      }),
    ],
  });

  _provider = provider;
  _initialized = true;
  _workflowName = workflowName;
  _tagsStr = tags && tags.length > 0 ? tags.join(",") : undefined;

  if (debug) {
    console.log("[neatlogs] SDK initialized");
    console.log(`[neatlogs] Endpoint: ${resolvedEndpoint}`);
    console.log(`[neatlogs] Workflow: ${workflowName}`);
    console.log(`[neatlogs] Session: ${sessionId || "(none)"}`);
    console.log(`[neatlogs] User: ${userId || "(none)"}`);
    console.log(`[neatlogs] Tags: ${tags?.join(", ") || "(none)"}`);
  }
}

// ---------------------------------------------------------------------------
// flush() / shutdown()
// ---------------------------------------------------------------------------

export async function flush(): Promise<void> {
  if (_provider) {
    // forceFlush() rejects with an errors array when any processor times out.
    // Catch and log those errors so callers don't get an unhandled rejection.
    await _provider.forceFlush().catch((errs: unknown) => {
      const msgs = Array.isArray(errs) ? errs.map(String).join(", ") : String(errs);
      console.warn("[neatlogs] flush warning:", msgs);
    });
  }
}

export async function shutdown(): Promise<void> {
  if (_provider) {
    await flush();
    await _provider.shutdown().catch((err: unknown) => {
      console.warn("[neatlogs] shutdown warning:", String(err));
    });
    _initialized = false;
    _provider = null;
  }
}

// ---------------------------------------------------------------------------
// span kinds
// ---------------------------------------------------------------------------

export type SpanKind =
  | "WORKFLOW"
  | "AGENT"
  | "CHAIN"
  | "TOOL"
  | "RETRIEVER"
  | "EMBEDDING"
  | "MCP_TOOL"
  | "GUARDRAIL";

export interface SpanOptions {
  kind: SpanKind;
  name?: string;
  role?: string;
  goal?: string;
  toolName?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  attributes?: Record<string, string | number | boolean>;
  captureInput?: boolean;
  captureOutput?: boolean;
}

// ---------------------------------------------------------------------------
// truncateAttr() — truncate large attribute values to avoid backend rejection
// The NeatLogs backend silently rejects batches with oversized span attributes.
// Python SDK uses a similar cap; 8KB is a safe limit for text fields.
// ---------------------------------------------------------------------------

const ATTR_MAX_CHARS = 4096;

function truncateAttr(value: string): string {
  if (value.length <= ATTR_MAX_CHARS) return value;
  return value.slice(0, ATTR_MAX_CHARS) + `...[truncated ${value.length - ATTR_MAX_CHARS} chars]`;
}

// Convert any value to a string for span attributes without double-encoding.
// Mirrors Python SDK behavior: strings are stored as-is, other types are JSON-serialized.
function toAttrString(value: unknown): string {
  if (typeof value === "string") return truncateAttr(value);
  try {
    return truncateAttr(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// spanWrap() — wraps an async function with a NeatLogs span
// Mirrors Python @neatlogs.span decorator
//
// Usage:
//   const plannerAgent = spanWrap(
//     { kind: "AGENT", name: "planner", role: "Research Planner" },
//     async (company: string) => { ... }
//   );
//   const result = await plannerAgent("NVIDIA");
// ---------------------------------------------------------------------------

export function spanWrap<TArgs extends unknown[], TReturn>(
  options: SpanOptions,
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  const tracer = otelApi.trace.getTracer("neatlogs.decorators._base");
  const spanName = options.name ?? fn.name ?? "span";
  const captureInput = options.captureInput ?? true;
  const captureOutput = options.captureOutput ?? true;

  return async (...args: TArgs): Promise<TReturn> => {
    return tracer.startActiveSpan(spanName, async (span: otelApi.Span) => {
      const startTimeMs = Date.now();
      try {
        // Core NeatLogs attributes (mirrors Python SDK)
        span.setAttribute("neatlogs.internal", "True");
        span.setAttribute("neatlogs.workflow_name", _workflowName);
        span.setAttribute("openinference.span.kind", options.kind);
        span.setAttribute("neatlogs.span.kind", options.kind.toLowerCase());
        span.setAttribute("neatlogs.instrumentation.name", "neatlogs.decorators._base");
        if (_tagsStr) {
          span.setAttribute("neatlogs.tags", _tagsStr);
        }

        // Agent-specific attributes
        if (options.kind === "AGENT") {
          if (options.role) {
            span.setAttribute("agent.name", options.role);
            span.setAttribute("neatlogs.agent.name", options.role);
            span.setAttribute("neatlogs.agent.role", options.role);
          }
          if (options.goal) {
            span.setAttribute("neatlogs.agent.goal", options.goal);
          }
        }

        // Tool-specific attributes
        if (options.kind === "TOOL" || options.kind === "MCP_TOOL") {
          const toolName = options.toolName ?? spanName;
          span.setAttribute("tool.name", toolName);
          if (options.description) {
            span.setAttribute("tool.description", options.description);
          }
        }

        // Tags and metadata
        if (options.tags && options.tags.length > 0) {
          span.setAttribute("tag.tags", options.tags.join(","));
        }
        if (options.metadata) {
          span.setAttribute("metadata", JSON.stringify(options.metadata));
        }

        // Extra custom attributes
        if (options.attributes) {
          for (const [k, v] of Object.entries(options.attributes)) {
            span.setAttribute(k, v);
          }
        }

        // Capture input
        let inputStr: string | undefined;
        if (captureInput && args.length > 0) {
          try {
            // Use the single arg directly if there's only one value, otherwise wrap in array.
            const inputVal = args.length === 1 ? args[0] : args;
            inputStr = toAttrString(inputVal);
            span.setAttribute("input.value", inputStr);
            span.setAttribute("input.mime_type", "application/json");
          } catch {
            // ignore serialization errors
          }
        }

        let result: TReturn;
        try {
          result = await fn(...args);
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: otelApi.SpanStatusCode.ERROR,
            message: String(err),
          });
          span.setAttribute("neatlogs.metrics.duration_ms", Date.now() - startTimeMs);
          span.end();
          throw err;
        }

        // Capture output
        let outputStr: string | undefined;
        if (captureOutput) {
          try {
            outputStr = toAttrString(result);
            span.setAttribute("output.value", outputStr);
            span.setAttribute("output.mime_type", "application/json");
          } catch {
            // ignore serialization errors
          }
        }

        // Kind-prefixed input/output attributes (mirrors Python SDK attribute normalization)
        const kindLower = options.kind.toLowerCase();
        if (inputStr !== undefined) {
          span.setAttribute(`neatlogs.${kindLower}.input`, inputStr);
          span.setAttribute(`neatlogs.${kindLower}.input_mime_type`, "application/json");
        }
        if (outputStr !== undefined) {
          span.setAttribute(`neatlogs.${kindLower}.output`, outputStr);
          span.setAttribute(`neatlogs.${kindLower}.output_mime_type`, "application/json");
        }

        span.setAttribute("neatlogs.metrics.duration_ms", Date.now() - startTimeMs);
        span.setStatus({ code: otelApi.SpanStatusCode.OK });
        span.end();
        return result;
      } catch (err) {
        // Ensure span is ended if setAttribute or something outside fn() throws
        try {
          span.end();
        } catch {
          // already ended
        }
        throw err;
      }
    });
  };
}

// ---------------------------------------------------------------------------
// withTrace() — context-manager style wrapper for LLM calls
// Mirrors Python neatlogs.trace() context manager
//
// Usage:
//   const response = await withTrace(
//     { name: "plan_questions", kind: "LLM", promptTemplate: sysTpl, userPromptTemplate: userTpl },
//     async () => client.chat.completions.create({ ... })
//   );
// ---------------------------------------------------------------------------

export interface TraceOptions {
  name: string;
  kind?: string;
  promptTemplate?: PromptTemplate;
  userPromptTemplate?: UserPromptTemplate;
}

export async function withTrace<T>(
  options: TraceOptions,
  callback: () => Promise<T>
): Promise<T> {
  const tracer = otelApi.trace.getTracer("neatlogs.decorators._base");
  return tracer.startActiveSpan(options.name, async (span: otelApi.Span) => {
    const startTimeMs = Date.now();
    try {
      span.setAttribute("neatlogs.internal", "True");
      span.setAttribute("neatlogs.workflow_name", _workflowName);
      const traceKind = options.kind ?? "CHAIN";
      span.setAttribute("openinference.span.kind", traceKind);
      span.setAttribute("neatlogs.span.kind", traceKind.toLowerCase());
      span.setAttribute("neatlogs.instrumentation.name", "neatlogs.decorators._base");
      if (_tagsStr) {
        span.setAttribute("neatlogs.tags", _tagsStr);
      }

      // Attach prompt template strings for UI visualization
      if (options.promptTemplate) {
        const tpl = options.promptTemplate;
        span.setAttribute(
          "llm.prompt_template.template",
          truncateAttr(JSON.stringify(tpl.template))
        );
        span.setAttribute(
          "llm.prompt_template.variables",
          JSON.stringify(tpl.variables)
        );
      }
      if (options.userPromptTemplate) {
        const tpl = options.userPromptTemplate;
        span.setAttribute(
          "llm.user_prompt_template.template",
          truncateAttr(JSON.stringify(tpl.template))
        );
        span.setAttribute(
          "llm.user_prompt_template.variables",
          JSON.stringify(tpl.variables)
        );
      }

      let result: T;
      try {
        result = await callback();
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: otelApi.SpanStatusCode.ERROR,
          message: String(err),
        });
        span.setAttribute("neatlogs.metrics.duration_ms", Date.now() - startTimeMs);
        span.end();
        throw err;
      }

      span.setAttribute("neatlogs.metrics.duration_ms", Date.now() - startTimeMs);
      span.setStatus({ code: otelApi.SpanStatusCode.OK });
      span.end();
      return result;
    } catch (err) {
      try {
        span.end();
      } catch {
        // already ended
      }
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// log() — structured log as a span event on the active span
// Mirrors Python neatlogs.log()
//
// Usage:
//   log("planner generated {count} questions", { count: 3 });
// ---------------------------------------------------------------------------

export function log(
  message: string,
  attributes: Record<string, string | number | boolean> = {}
): void {
  const span = otelApi.trace.getActiveSpan();
  if (!span) return;

  // Interpolate {key} placeholders in message (mirrors Python SDK behaviour)
  let rendered = message;
  for (const [k, v] of Object.entries(attributes)) {
    rendered = rendered.split(`{${k}}`).join(String(v));
  }
  span.addEvent(rendered, attributes);
}

// ---------------------------------------------------------------------------
// PromptTemplate — system/AI instruction prompt with {{variable}} placeholders
// Mirrors Python PromptTemplate
// ---------------------------------------------------------------------------

export type MessageTemplate = { role: string; content: string };
export type TemplateInput = string | MessageTemplate[];

export class PromptTemplate {
  readonly template: TemplateInput;
  readonly variables: string[];

  constructor(template: TemplateInput) {
    this.template = template;
    this.variables = this._extractVariables(template);
  }

  private _extractVariables(template: TemplateInput): string[] {
    const pattern = /\{\{(\w+)\}\}/g;
    const found = new Set<string>();
    const source =
      typeof template === "string"
        ? template
        : template.map((m) => m.content).join("\n");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      found.add(match[1]);
    }
    return [...found];
  }

  compile(variables: Record<string, string>): MessageTemplate[] {
    if (typeof this.template === "string") {
      return [{ role: "system", content: this._render(this.template, variables) }];
    }
    return this.template.map((msg) => ({
      role: msg.role,
      content: this._render(msg.content, variables),
    }));
  }

  private _render(text: string, variables: Record<string, string>): string {
    let result = text;
    for (const [k, v] of Object.entries(variables)) {
      result = result.split(`{{${k}}}`).join(v);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// UserPromptTemplate — user/human turn prompt with {{variable}} placeholders
// Mirrors Python UserPromptTemplate
// ---------------------------------------------------------------------------

export class UserPromptTemplate {
  readonly template: TemplateInput;
  readonly variables: string[];

  constructor(template: TemplateInput) {
    this.template = template;
    this.variables = this._extractVariables(template);
  }

  private _extractVariables(template: TemplateInput): string[] {
    const pattern = /\{\{(\w+)\}\}/g;
    const found = new Set<string>();
    const source =
      typeof template === "string"
        ? template
        : template.map((m) => m.content).join("\n");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      found.add(match[1]);
    }
    return [...found];
  }

  compile(variables: Record<string, string>): MessageTemplate[] {
    if (typeof this.template === "string") {
      return [{ role: "user", content: this._render(this.template, variables) }];
    }
    return this.template.map((msg) => ({
      role: msg.role,
      content: this._render(msg.content, variables),
    }));
  }

  private _render(text: string, variables: Record<string, string>): string {
    let result = text;
    for (const [k, v] of Object.entries(variables)) {
      result = result.split(`{{${k}}}`).join(v);
    }
    return result;
  }
}
