/**
 * NeatlogsSpanProcessor — attribute normalization and file logging.
 *
 * Port of Python neatlogs/core/span_processor.py
 *
 * Sits between span creation and export, normalizing attributes and handling
 * file logging. The downstream BatchSpanProcessor + OTLPSpanExporter handles
 * actual transport.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  context as otelContext,
  trace as otelTrace,
  TraceFlags,
  SpanStatusCode,
} from '@opentelemetry/api';
import type { Context, HrTime, SpanContext } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Span as SdkSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

import { UnifiedAttributeProcessor } from './attribute-processor.js';
import type { SpanDict } from './attribute-processor.js';
import { applyMask } from './mask.js';
import { getLogger } from './logger.js';
import { PromptContext, UserPromptContext } from '../prompt/template.js';
import {
  PROMPT_VARIABLES_KEY,
  PROMPT_TEMPLATE_KEY,
  PROMPT_VERSION_KEY,
  USER_PROMPT_TEMPLATE_KEY,
  USER_PROMPT_VARIABLES_KEY,
} from './context.js';
import { popEntry } from './crewai-task-registry.js';
import type { MaskFunction } from '../types.js';
import { AttributeMapper } from '../config/attribute-mapper.js';

const logger = getLogger();

function resolveLogFilePath(configuredPath: string): string {
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
}

function createLogStream(configuredPath: string): fs.WriteStream | null {
  const logPath = resolveLogFilePath(configuredPath);
  let fd: number | null = null;

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fd = fs.openSync(logPath, 'a');
    const stream = fs.createWriteStream(logPath, { fd, autoClose: true });
    fd = null;
    stream.on('error', (error) => {
      logger.warn(`Failed to write span log file ${logPath}: ${error}`);
      stream.destroy();
    });
    return stream;
  } catch (error) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore cleanup failure; the open error below is the actionable one.
      }
    }
    logger.warn(`Failed to open span log file ${logPath}: ${error}`);
    return null;
  }
}

const CLOSE_STREAM_TIMEOUT_MS = 5_000;

async function closeLogStream(
  stream: fs.WriteStream | null,
  description: string,
): Promise<void> {
  if (!stream || stream.destroyed || stream.writableEnded) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.off('close', closeHandler);
      stream.off('error', errorHandler);
      resolve();
    };

    const closeHandler = settle;
    const errorHandler = (error: Error) => {
      logger.warn(`Failed to close ${description} log file handle: ${error}`);
      settle();
    };
    const timer = setTimeout(() => {
      logger.warn(
        `Timed out waiting for ${description} log stream to close; destroying`,
      );
      stream.destroy();
      settle();
    }, CLOSE_STREAM_TIMEOUT_MS);

    stream.once('close', closeHandler);
    stream.once('error', errorHandler);

    try {
      stream.end();
    } catch (error) {
      logger.warn(`Failed to close ${description} log file handle: ${error}`);
      settle();
    }
  });
}

// ────────────────────────────────────────────────────────
// LLM span detection patterns
// ────────────────────────────────────────────────────────

const LLM_NAME_PATTERNS = /chat|completion|generate|embedding/i;

// ────────────────────────────────────────────────────────
// Performance stats
// ────────────────────────────────────────────────────────

interface PerfStats {
  onStartTime: number;
  onEndTime: number;
  spansProcessed: number;
  spansExported: number;
}

// ────────────────────────────────────────────────────────
// Helper: convert HrTime ([seconds, nanoseconds]) to ns
// ────────────────────────────────────────────────────────

function hrTimeToNanos(hr: HrTime): number {
  return hr[0] * 1_000_000_000 + hr[1];
}

// ────────────────────────────────────────────────────────
// Helper: convert ReadableSpan to JSON-serializable dict
//
// When includeScope=true, includes instrumentation_scope
// and uses `status.message` (for the UnifiedAttributeProcessor).
// When false (default), uses `status.description` for
// backward-compatible raw logging.
// ────────────────────────────────────────────────────────

export function spanToDict(
  span: ReadableSpan,
  options?: { includeScope?: boolean },
): Record<string, any> {
  const ctx = span.spanContext();
  const includeScope = options?.includeScope ?? false;

  const dict: Record<string, any> = {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    parent_span_id: span.parentSpanId ?? null,
    name: span.name,
    kind: span.kind,
    start_time: hrTimeToNanos(span.startTime),
    end_time: hrTimeToNanos(span.endTime),
    attributes: { ...span.attributes },
    resource: span.resource?.attributes ? { ...span.resource.attributes } : {},
    status: includeScope
      ? { code: span.status.code, message: span.status.message ?? undefined }
      : { code: span.status.code, description: span.status.message ?? null },
    events: span.events
      ? span.events.map((e) => ({
          name: e.name,
          timestamp: hrTimeToNanos(e.time),
          attributes: e.attributes ? { ...e.attributes } : {},
        }))
      : [],
  };

  if (includeScope) {
    dict.instrumentation_scope = span.instrumentationLibrary
      ? {
          name: span.instrumentationLibrary.name,
          version: span.instrumentationLibrary.version,
        }
      : null;
  }

  return dict;
}

// ────────────────────────────────────────────────────────
// Constructor options
// ────────────────────────────────────────────────────────

export interface NeatlogsSpanProcessorOptions {
  sampleRate?: number;
  debug?: boolean;
  mask?: MaskFunction;
  /** Pre-built AttributeMapper. If not supplied, a default mapper is created. */
  mapper?: AttributeMapper;
}

// ────────────────────────────────────────────────────────
// NeatlogsSpanProcessor
// ────────────────────────────────────────────────────────

export class NeatlogsSpanProcessor implements SpanProcessor {
  private readonly sampleRate: number;
  private readonly debug: boolean;
  private readonly mask: MaskFunction | undefined;
  private readonly unifiedProcessor: UnifiedAttributeProcessor;

  private perfStats: PerfStats;
  private _retrieversToSuppress: Set<string>;

  // File logging
  private _logRawSpansEnabled: boolean;
  private _logProcessedSpansEnabled: boolean;
  private _rawLogStream: fs.WriteStream | null;
  private _processedLogStream: fs.WriteStream | null;

  constructor(opts: NeatlogsSpanProcessorOptions = {}) {
    this.sampleRate = opts.sampleRate ?? 1.0;
    this.debug = opts.debug ?? false;
    this.mask = opts.mask;

    this.unifiedProcessor = new UnifiedAttributeProcessor(
      opts.mapper ?? new AttributeMapper(),
      this.debug,
    );

    this._logRawSpansEnabled = false;
    this._logProcessedSpansEnabled = false;
    this._rawLogStream = null;
    this._processedLogStream = null;

    this._initFileLogging();

    this.perfStats = {
      onStartTime: 0,
      onEndTime: 0,
      spansProcessed: 0,
      spansExported: 0,
    };

    this._retrieversToSuppress = new Set<string>();
  }

  // ── File logging init ─────────────────────────────────

  private _initFileLogging(): void {
    // Raw OTel span JSON (before attribute normalization)
    this._logRawSpansEnabled =
      this.debug ||
      ['true', '1', 'yes'].includes(
        (process.env.NEATLOGS_LOG_RAW_SPANS ?? '').toLowerCase(),
      );

    if (this._logRawSpansEnabled) {
      const rawPath =
        process.env.NEATLOGS_LOG_RAW_SPANS_FILE ?? 'spans_raw_optimized.log';
      this._rawLogStream = createLogStream(rawPath);
      if (this._rawLogStream) {
        logger.info(
          `Raw span logging enabled: ${resolveLogFilePath(rawPath)}`,
        );
      }
    }

    // Processed span dict (after normalization)
    this._logProcessedSpansEnabled = ['true', '1', 'yes'].includes(
      (process.env.NEATLOGS_LOG_SPANS ?? '').toLowerCase(),
    );

    if (this._logProcessedSpansEnabled) {
      const processedPath =
        process.env.NEATLOGS_LOG_SPANS_FILE ?? 'spans_optimized.log';
      this._processedLogStream = createLogStream(processedPath);
      if (this._processedLogStream) {
        logger.info(
          `Processed span logging enabled: ${resolveLogFilePath(processedPath)}`,
        );
      }
    }
  }

  // ── SpanProcessor.onStart ─────────────────────────────

  onStart(span: SdkSpan, parentContext: Context): void {
    const startTime = performance.now();
    try {
      const attrs = (span as any).attributes ?? {};
      const spanKind = attrs['openinference.span.kind'] as string | undefined;
      const spanName: string =
        typeof (span as any).name === 'string' ? (span as any).name : '';

      const isLlmSpan =
        spanKind === 'LLM' || LLM_NAME_PATTERNS.test(spanName);

      if (!isLlmSpan) return;

      // Read context values
      const ctx = otelContext.active();
      let variablesJson = ctx.getValue(PROMPT_VARIABLES_KEY) as
        | string
        | undefined;
      let template = ctx.getValue(PROMPT_TEMPLATE_KEY) as string | undefined;
      const versionVal = ctx.getValue(PROMPT_VERSION_KEY) as
        | string
        | undefined;
      let userTemplate = ctx.getValue(USER_PROMPT_TEMPLATE_KEY) as
        | string
        | undefined;
      let userVariablesJson = ctx.getValue(USER_PROMPT_VARIABLES_KEY) as
        | string
        | undefined;

      // Fall back to PromptContext / UserPromptContext
      if (!variablesJson) {
        const captured = PromptContext.getVariables();
        if (captured) {
          variablesJson = JSON.stringify(captured);
        }
      }

      if (!template) {
        const captured = PromptContext.getTemplate();
        if (captured) {
          template = captured;
        }
      }

      if (!userTemplate) {
        const captured = UserPromptContext.getTemplate();
        if (captured) {
          userTemplate = captured;
        }
      }

      if (!userVariablesJson) {
        const captured = UserPromptContext.getVariables();
        if (captured) {
          userVariablesJson = JSON.stringify(captured);
        }
      }

      if (this.debug) {
        logger.debug(
          `[SpanProcessor.onStart] LLM span '${spanName}' starting`,
        );
        logger.debug(`  variables_json from context: ${variablesJson}`);
        logger.debug(`  template from context: ${template}`);
        logger.debug(`  version from context: ${versionVal}`);
        logger.debug(`  user_template from context: ${userTemplate}`);
        logger.debug(
          `  user_variables_json from context: ${userVariablesJson}`,
        );
      }

      if (variablesJson) {
        span.setAttribute('llm.prompt_template_variables', variablesJson);
      }
      if (template) {
        span.setAttribute('llm.prompt_template', template);
      }
      if (versionVal) {
        span.setAttribute('llm.prompt_template.version', versionVal);
      }
      if (userTemplate) {
        span.setAttribute('llm.user_prompt_template', userTemplate);
      }
      if (userVariablesJson) {
        span.setAttribute(
          'llm.user_prompt_template_variables',
          userVariablesJson,
        );
      }
    } finally {
      this.perfStats.onStartTime += performance.now() - startTime;
    }
  }

  // ── SpanProcessor.onEnd ───────────────────────────────

  onEnd(span: ReadableSpan): void {
    // Skip internal completion markers — they only need to be exported as-is
    if (span.name === 'neatlogs.trace.complete') {
      return;
    }

    const startTime = performance.now();
    this.perfStats.spansProcessed += 1;

    try {
      if (this.debug) {
        logger.debug(`[SpanProcessor.onEnd] Span ending: ${span.name}`);
      }

      // 1. Log raw OTel span (before any processing)
      if (this._rawLogStream && !this._rawLogStream.destroyed) {
        try {
          this._rawLogStream.write(
            JSON.stringify(spanToDict(span)) + '\n',
          );
        } catch (e) {
          logger.warn(`Failed to write span to raw log file: ${e}`);
        }
      }

      // Sample rate check
      if (this.sampleRate < 1.0 && Math.random() > this.sampleRate) {
        return;
      }

      // 2. Process and normalize attributes
      const spanDict = spanToDict(span, { includeScope: true }) as SpanDict;
      const unifiedAttrs = this.unifiedProcessor.normalize(spanDict);

      // 3. Filter large tokenized arrays for EMBEDDING/VECTOR_STORE spans
      let nlKind = unifiedAttrs['neatlogs.span.kind'] as string | undefined;
      if (nlKind === 'embedding' || nlKind === 'vector_store') {
        const skipOutput =
          unifiedAttrs['neatlogs._skip_output_value'] === true;
        const keysToRemove: string[] = [];

        for (const key of Object.keys(unifiedAttrs)) {
          if (
            key.includes('input_messages') ||
            key.includes('output_messages') ||
            key.includes('gen_ai.prompt') ||
            key.includes('gen_ai.completion') ||
            key.includes('.content')
          ) {
            keysToRemove.push(key);
          } else if (
            skipOutput &&
            (key === 'neatlogs.embedding.input' ||
              key === 'neatlogs.embedding.output')
          ) {
            keysToRemove.push(key);
          }
        }

        for (const key of keysToRemove) {
          delete unifiedAttrs[key];
        }

        if (this.debug && keysToRemove.length > 0) {
          logger.debug(
            `[EMBEDDING Filter] Removed ${keysToRemove.length} large attribute keys ` +
              `from ${nlKind} span (skip_output=${skipOutput})`,
          );
        }
      }

      // 4. Filter prompt template keys for non-LLM spans
      nlKind = unifiedAttrs['neatlogs.span.kind'] as string | undefined;
      if (
        nlKind !== 'llm' &&
        nlKind !== 'embedding' &&
        nlKind !== 'crewai_task' &&
        span.name !== 'PromptTemplate'
      ) {
        delete unifiedAttrs['neatlogs.llm.prompt_template'];
        delete unifiedAttrs['neatlogs.llm.prompt_template_variables'];
        delete unifiedAttrs['neatlogs.llm.prompt_template.version'];
      }

      // PromptTemplate spans → internal
      if (span.name === 'PromptTemplate') {
        if (unifiedAttrs['neatlogs.internal'] === undefined) {
          unifiedAttrs['neatlogs.internal'] = true;
        }
        unifiedAttrs['neatlogs.span.kind'] = 'Neatlogs.INTERNAL';
      }

      // 4b. Retriever span dedup
      if (nlKind === 'retriever') {
        const isInternal = unifiedAttrs['neatlogs.internal'] === true;
        if (isInternal && span.parentSpanId) {
          this._retrieversToSuppress.add(span.parentSpanId);
        }
        const spanId = span.spanContext().spanId;
        if (this._retrieversToSuppress.has(spanId)) {
          this._retrieversToSuppress.delete(spanId);
          unifiedAttrs['neatlogs.internal'] = true;
          if (this.debug) {
            logger.debug(
              `[Retriever Merge] Marked OI retriever '${span.name}' as internal ` +
                `(had neatlogs retriever child)`,
            );
          }
        }
      }

      // 5. Build resource attributes
      const resourceAttrs: Record<string, any> = {};
      if (span.resource?.attributes) {
        for (const [key, value] of Object.entries(span.resource.attributes)) {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            resourceAttrs[key] = value;
          } else if (Array.isArray(value)) {
            resourceAttrs[key] = [...value];
          } else {
            resourceAttrs[key] = String(value);
          }
        }

        if (this.debug && 'neatlogs.tags' in resourceAttrs) {
          logger.debug(
            `[Tags] Span ${span.name}: resource.neatlogs.tags = ${resourceAttrs['neatlogs.tags']}`,
          );
        }
      }

      // Format IDs — JS OTel SDK already provides hex strings
      const traceId = span.spanContext().traceId;
      const spanId = span.spanContext().spanId;
      let parentSpanId: string | null = span.parentSpanId ?? null;

      // Detect self-parenting
      if (parentSpanId === spanId) {
        if (this.debug) {
          logger.warn(
            `[SpanProcessor] Detected self-parenting span. ` +
              `trace_id=${traceId} span_id=${spanId} name=${span.name}. ` +
              `Setting parent_span_id=None.`,
          );
        }
        parentSpanId = null;
      }

      // 6. Build span_data dict
      const kindValue = (unifiedAttrs['neatlogs.span.kind'] as string) ?? 'UNKNOWN';
      const startTimeNs = hrTimeToNanos(span.startTime);
      const endTimeNs = hrTimeToNanos(span.endTime);

      let spanData: Record<string, any> = {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId,
        name: span.name,
        kind: kindValue || 'UNKNOWN',
        start_time: startTimeNs,
        end_time: endTimeNs,
        duration_ns: endTimeNs > 0 ? endTimeNs - startTimeNs : null,
        attributes: unifiedAttrs,
        resource: { attributes: resourceAttrs },
        status: {
          code: SpanStatusCode[span.status.code] ?? String(span.status.code),
          description: span.status.message ?? null,
        },
        events: span.events
          ? span.events.map((e) => ({
              name: e.name,
              timestamp: hrTimeToNanos(e.time),
              attributes: e.attributes ? { ...e.attributes } : {},
            }))
          : [],
      };

      // 7. Post-processing: framework span name normalization, CrewAI tasks, model resolution
      let results = this._normalizeFrameworkSpanNames([spanData]);
      spanData = results[0] ?? spanData;
      results = this._injectCrewaiTaskTemplates([spanData]);
      spanData = results[0] ?? spanData;
      this._resolveActualModelName(spanData);

      // 7b. Apply mask — if mask returns null, drop the span entirely
      const maskedSpanData = applyMask(spanData, this.mask ?? null);
      if (maskedSpanData === null) {
        // Mark the OTel span so the FilteringExporter can skip it
        try {
          const spanAttrs = (span as any).attributes ?? (span as any)._attributes;
          if (spanAttrs != null) {
            spanAttrs['neatlogs.dropped'] = true;
          }
        } catch {
          // Best-effort — if write-back fails, span may still export
        }
        return;
      }
      spanData = maskedSpanData;

      // 7c. Write normalized neatlogs.* attributes back to the OTel span
      const finalAttrs = (spanData.attributes ?? {}) as Record<string, any>;
      try {
        const spanAttrs = (span as any).attributes ?? (span as any)._attributes;
        if (spanAttrs != null) {
          for (const [k, v] of Object.entries(finalAttrs)) {
            if (
              typeof v === 'string' ||
              typeof v === 'number' ||
              typeof v === 'boolean'
            ) {
              spanAttrs[k] = v;
            } else if (
              Array.isArray(v) &&
              v.every(
                (i: any) =>
                  typeof i === 'string' ||
                  typeof i === 'number' ||
                  typeof i === 'boolean',
              )
            ) {
              spanAttrs[k] = [...v];
            }
          }
        }
      } catch (wbExc) {
        if (this.debug) {
          logger.debug(
            `[SpanProcessor] Attr write-back failed: ${wbExc}`,
          );
        }
      }

      // 8. Log processed span dict (mask already applied in step 7b)
      if (this._processedLogStream && !this._processedLogStream.destroyed) {
        try {
          this._processedLogStream.write(
            JSON.stringify(spanData) + '\n',
          );
        } catch (e) {
          logger.warn(`Failed to write span to processed log file: ${e}`);
        }
      }

      this.perfStats.spansExported += 1;

      // Emit completion marker when a root span ends
      if (!span.parentSpanId) {
        this._emitCompletionMarker(span, traceId, resourceAttrs);
      }
    } finally {
      this.perfStats.onEndTime += performance.now() - startTime;
    }
  }

  // ── Completion marker ─────────────────────────────────

  private _emitCompletionMarker(
    rootSpan: ReadableSpan,
    traceId: string,
    resourceAttrs: Record<string, any>,
  ): void {
    try {
      const spanCtx: SpanContext = {
        traceId: rootSpan.spanContext().traceId,
        spanId: rootSpan.spanContext().spanId,
        isRemote: false,
        traceFlags: TraceFlags.SAMPLED,
      };

      // Use wrapSpanContext to create a non-recording span from context
      const wrappedSpan = otelTrace.wrapSpanContext(spanCtx);
      const ctx = otelTrace.setSpan(otelContext.active(), wrappedSpan);

      const tracer = otelTrace.getTracer('neatlogs.internal');
      const marker = tracer.startSpan('neatlogs.trace.complete', undefined, ctx);
      marker.setAttribute('neatlogs.trace.complete', true);
      marker.setAttribute('neatlogs.internal', true);
      marker.setAttribute('neatlogs.span.kind', 'Neatlogs.INTERNAL');

      // Copy resource tags
      if (resourceAttrs['neatlogs.tags']) {
        marker.setAttribute('neatlogs.tags', resourceAttrs['neatlogs.tags']);
      }

      marker.end();

      if (this.debug) {
        logger.debug(
          `[SpanProcessor] Emitted completion marker for trace ${traceId}`,
        );
      }
    } catch (e) {
      logger.warn(`[SpanProcessor] Failed to emit completion marker: ${e}`);
    }
  }

  // ── Framework span name normalization ─────────────────

  private _normalizeFrameworkSpanNames(
    spans: Record<string, any>[],
  ): Record<string, any>[] {
    for (const s of spans) {
      const name: string = s.name ?? '';
      const kind: string =
        s.kind ?? s.attributes?.['neatlogs.span.kind'] ?? '';

      if (kind !== 'task' || !name.endsWith('.task')) {
        continue;
      }

      const attrs: Record<string, any> = s.attributes ?? {};
      if (!Object.keys(attrs).some((k) => k.startsWith('neatlogs.crewai.'))) {
        continue;
      }

      let desc = name.slice(0, -'.task'.length).trimEnd();
      while (desc.endsWith('.')) {
        desc = desc.slice(0, -1).trimEnd();
      }

      if (desc) {
        if (attrs['neatlogs.task.description'] === undefined) {
          attrs['neatlogs.task.description'] = desc;
        }
      }

      s.name = 'crewai.task';
      s.attributes = attrs;
    }

    return spans;
  }

  // ── CrewAI task template injection ────────────────────

  private _injectCrewaiTaskTemplates(
    spans: Record<string, any>[],
  ): Record<string, any>[] {
    for (const s of spans) {
      const attrs: Record<string, any> = s.attributes ?? {};
      const taskId = attrs['neatlogs.task.id'];
      if (!taskId) continue;

      const entry = popEntry(String(taskId));
      if (!entry) continue;

      const [tplStr, varsJson] = entry;
      attrs['neatlogs.task.user_prompt_template'] = tplStr;
      if (varsJson) {
        attrs['neatlogs.task.user_prompt_template_variables'] = varsJson;
      }
      attrs['neatlogs.span.kind'] = 'crewai_task';
      s.attributes = attrs;
    }

    return spans;
  }

  // ── Resolve actual model name from LLM output ────────
  // LangChain/Azure spans report deployment names (e.g., "gpt-3.5-turbo") as
  // the model name. The actual resolved model (e.g., "gpt-5-nano-2025-08-07")
  // is buried in the LLM output JSON at response_metadata.model_name.

  private _resolveActualModelName(spanData: Record<string, any>): void {
    const attrs: Record<string, any> = spanData.attributes ?? {};
    const kind = attrs['neatlogs.span.kind'];
    if (kind !== 'llm') return;

    const currentModel = attrs['neatlogs.llm.model_name'] as string | undefined;
    if (!currentModel) return;

    const llmOutput = attrs['neatlogs.llm.output'] as string | undefined;
    if (!llmOutput) return;

    try {
      const output = JSON.parse(llmOutput);

      // LangChain format: generations[0][0].message.kwargs.response_metadata.model_name
      const generations = output?.generations;
      if (Array.isArray(generations) && generations[0]?.[0]) {
        const respMeta = generations[0][0]?.message?.kwargs?.response_metadata;
        if (respMeta?.model_name && respMeta.model_name !== currentModel) {
          attrs['neatlogs.llm.model_name'] = respMeta.model_name;
          if (this.debug) {
            logger.debug(
              `[ModelResolve] LangChain span: ${currentModel} → ${respMeta.model_name}`,
            );
          }
          return;
        }
      }

      // Vercel AI SDK / direct OpenAI format: model field at top level of response
      if (output?.model && output.model !== currentModel) {
        attrs['neatlogs.llm.model_name'] = output.model;
        if (this.debug) {
          logger.debug(
            `[ModelResolve] Direct response: ${currentModel} → ${output.model}`,
          );
        }
      }
    } catch (e: unknown) {
      logger.warn(`[ModelResolve] Failed to parse LLM output for model extraction: ${e}`);
    }
  }

  // ── forceFlush / shutdown ─────────────────────────────

  async forceFlush(): Promise<void> {
    // Flushing is handled by BatchSpanProcessor downstream.
  }

  async shutdown(): Promise<void> {
    this._logPerformanceStats();

    await closeLogStream(this._rawLogStream, 'raw');
    this._rawLogStream = null;

    await closeLogStream(this._processedLogStream, 'processed');
    this._processedLogStream = null;
  }

  // ── Performance stats ─────────────────────────────────

  private _logPerformanceStats(): void {
    if (!this.debug) return;

    const stats = this.perfStats;
    if (stats.spansProcessed === 0) return;

    const totalTime = stats.onStartTime + stats.onEndTime;
    const avgMs = totalTime / stats.spansProcessed;

    try {
      logger.info(
        `Neatlogs overhead: ${totalTime.toFixed(2)}ms total, ${avgMs.toFixed(3)}ms/span ` +
          `(${stats.spansProcessed} spans processed, ` +
          `${stats.spansExported} spans logged)`,
      );
    } catch {
      // ignore
    }
  }

  // ── Accessors for testing ─────────────────────────────

  /** @internal — exposed for testing */
  get _perfStats(): PerfStats {
    return this.perfStats;
  }

  /** @internal — exposed for testing */
  get _suppressedRetrievers(): Set<string> {
    return this._retrieversToSuppress;
  }
}
