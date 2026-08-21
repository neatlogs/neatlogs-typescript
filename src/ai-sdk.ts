/**
 * Vercel AI SDK wrapper — inline implementation.
 *
 * Wraps `generateText`, `streamText`, `generateObject`, `streamObject` from
 * the `ai` package with OTel parent spans + forced telemetry. Static export,
 * no dynamic imports — bundler-friendly (works with Turbopack, webpack, esbuild).
 *
 * Usage:
 *   import { wrapAISDK } from 'neatlogs';
 *   import * as ai from 'ai';
 *   const { streamText, generateText } = wrapAISDK(ai);
 */

import { SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';
import { getNeatlogsTracer, getNeatlogsParentContext, getRoutingNeatlogsTracer, withNeatlogsSpan } from './core/provider.js';

const TRACER_NAME = 'neatlogs.ai-sdk';

// -- Telemetry config --------------------------------------------------------

export interface CreateAITelemetryOptions {
  metadata?: Record<string, unknown>;
}

export interface AITelemetryConfig {
  isEnabled: true;
  recordInputs: true;
  recordOutputs: true;
  tracer: Tracer;
  metadata: Record<string, unknown>;
}

export function createAITelemetry(
  opts: CreateAITelemetryOptions = {},
): AITelemetryConfig {
  const userMeta = opts.metadata ?? {};
  return {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    // Hand the AI SDK an isolation-aware tracer: it calls startActiveSpan()
    // internally, which would otherwise parent its native spans from the foreign
    // global context AND push them onto it (so a co-tenant's next span inherits
    // ours). The facade routes both through the private Neatlogs context.
    tracer: getRoutingNeatlogsTracer(TRACER_NAME),
    metadata: { ...userMeta, neatlogsWrapped: true },
  };
}

// -- Span attributes ---------------------------------------------------------

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function setInputValue(span: Span, opts: Record<string, unknown>): void {
  // For generateText/streamText — only capture prompt or messages, not full model config
  if (opts && ('prompt' in opts || 'messages' in opts)) {
    const input = opts.messages ?? opts.prompt;
    const stringified = safeStringify(input);
    if (stringified) {
      span.setAttribute('input.value', stringified);
    }
    return;
  }
  const stringified = safeStringify(opts);
  if (stringified) {
    span.setAttribute('input.value', stringified);
  }
}

function setOutputValue(span: Span, result: unknown): void {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    // GenerateTextResult / StreamTextResult — extract meaningful fields
    if ('text' in r && 'finishReason' in r) {
      const text = String(r.text ?? '');
      if (text) {
        span.setAttribute('output.value', text);
      }
      if (r.finishReason) {
        span.setAttribute('gen_ai.finish_reason', String(r.finishReason));
      }
      return;
    }
    // GenerateObjectResult — the structured object is the output, not `text`.
    // Without this the envelope (object+usage+response+…) gets stringified whole.
    if ('object' in r && 'finishReason' in r) {
      if (r.object !== undefined) {
        span.setAttribute('output.value', safeStringify(r.object));
      }
      if (r.finishReason) {
        span.setAttribute('gen_ai.finish_reason', String(r.finishReason));
      }
      return;
    }
  }
  const stringified = safeStringify(result);
  if (stringified) {
    span.setAttribute('output.value', stringified);
  }
}

// Extract output from a streamText/streamObject `onFinish` event. The event
// extends StepResult, so `text` (streamText) / `object` (streamObject) sit at
// the top level alongside `finishReason` — but the event also carries `steps`,
// `usage`, etc., so we pull only the meaningful fields instead of stringifying
// the whole envelope.
function setStreamOutputValue(span: Span, event: unknown): void {
  if (!event || typeof event !== 'object') return;
  const e = event as Record<string, unknown>;
  if (typeof e.text === 'string' && e.text) {
    span.setAttribute('output.value', e.text);
  } else if ('object' in e && e.object !== undefined) {
    const stringified = safeStringify(e.object);
    if (stringified) span.setAttribute('output.value', stringified);
  }
  if (e.finishReason) {
    span.setAttribute('gen_ai.finish_reason', String(e.finishReason));
  }
}

// -- Wrapping ----------------------------------------------------------------

type WrappedFunctionName = 'generateText' | 'streamText' | 'generateObject' | 'streamObject' | 'embed' | 'embedMany' | 'rerank';

const WRAPPED_FUNCTIONS: readonly WrappedFunctionName[] = [
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
  'embed',
  'embedMany',
  'rerank',
] as const;

/**
 * Wrap the `ai` module namespace so that every `generateText` / `streamText` /
 * `generateObject` / `streamObject` call:
 *
 *   1. Opens a parent OTel span on the active TracerProvider.
 *   2. Forces `experimental_telemetry: { isEnabled: true }`, merging user metadata.
 *   3. Records input/output on the parent span and propagates errors.
 *
 * Other exports (types, helpers) pass through unchanged.
 */
export function wrapAISDK<T extends Record<string, unknown>>(aiModule: T): T {
  const wrapped: Record<string, unknown> = { ...aiModule };

  for (const name of WRAPPED_FUNCTIONS) {
    const original = aiModule[name];
    if (typeof original !== 'function') continue;

    if (name === 'streamText' || name === 'streamObject') {
      wrapped[name] = createStreamWrapper(name, original as (opts: any) => unknown);
    } else {
      wrapped[name] = createAsyncWrapper(name, original as (opts: any) => Promise<unknown>);
    }
  }

  return wrapped as T;
}

function rootSpanKind(name: WrappedFunctionName): string {
  if (name === 'embed' || name === 'embedMany' || name === 'rerank') return 'CHAIN';
  return 'WORKFLOW';
}


function getParentContext() {
  // Our parent comes solely from the private span store; a
  // foreign provider's active span must never become our ancestor.
  return getNeatlogsParentContext();
}

function createAsyncWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => Promise<unknown>,
): (opts: any) => Promise<unknown> {
  return async function wrappedAsyncFn(opts: any): Promise<unknown> {
    const tracer = getNeatlogsTracer(TRACER_NAME);
    // startSpan (NOT startActiveSpan) + withNeatlogsSpan: startActiveSpan would
    // push our span onto the GLOBAL OTel context, so a foreign tracer's
    // startSpan() inside generateText() would read it as parent and inherit our
    // trace id. withNeatlogsSpan carries the parent in the private store in
    // the private context, leaving the global context untouched.
    const parentContext = getParentContext();
    const span = tracer.startSpan(
      `ai.${name}`,
      { attributes: { 'openinference.span.kind': rootSpanKind(name) } },
      parentContext,
    );
    return withNeatlogsSpan(
      span,
      async () => {
        try {
          const isEmbedOrRerank = name === 'embed' || name === 'embedMany' || name === 'rerank';
          if (!isEmbedOrRerank) {
            setInputValue(span, opts);
          }
          if (name === 'rerank' && opts?.query) {
            span.setAttribute('ai.rerank.query', String(opts.query));
          }
          const merged = mergeTelemetry(opts);
          const result = await original(merged);
          if (!isEmbedOrRerank) {
            setOutputValue(span, result);
          }
          return result;
        } catch (err) {
          recordSpanError(span, err);
          throw err;
        } finally {
          span.end();
        }
      },
      parentContext,
    );
  };
}

// streamText/streamObject return synchronously while the model keeps producing
// tokens for seconds afterwards. Ending the span in a `finally` (as a plain sync
// wrapper would) closes it in ~2ms with no output — the output only exists once
// the stream finishes. Instead we keep the span open and end it from the AI SDK's
// `onFinish` callback, where the final text/object is available. Any user-provided
// `onFinish` is preserved and invoked first.
function createStreamWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => unknown,
): (opts: any) => unknown {
  return function wrappedStreamFn(opts: any): unknown {
    const tracer = getNeatlogsTracer(TRACER_NAME);
    // startSpan + withNeatlogsSpan (see createAsyncWrapper) so streamText's
    // internals never see our span on the global OTel context. The span stays
    // open past the run scope and is ended from onFinish/onError.
    const parentContext = getParentContext();
    const span = tracer.startSpan(
      `ai.${name}`,
      { attributes: { 'openinference.span.kind': rootSpanKind(name) } },
      parentContext,
    );
    return withNeatlogsSpan(
      span,
      () => {
        let spanEnded = false;
        const endOnce = () => {
          if (spanEnded) return;
          spanEnded = true;
          span.end();
        };
        try {
          setInputValue(span, opts);
          const merged = mergeTelemetry(opts);
          const userOnFinish = opts?.onFinish;
          const userOnError = opts?.onError;
          const wrappedOpts = {
            ...merged,
            onFinish: async (event: any) => {
              try {
                setStreamOutputValue(span, event);
              } finally {
                endOnce();
              }
              if (typeof userOnFinish === 'function') {
                return userOnFinish(event);
              }
            },
            onError: (event: any) => {
              recordSpanError(span, (event && event.error) ?? event);
              endOnce();
              if (typeof userOnError === 'function') {
                return userOnError(event);
              }
            },
          };
          return original(wrappedOpts);
        } catch (err) {
          // Synchronous throw (e.g. bad arguments) — the stream never started.
          recordSpanError(span, err);
          endOnce();
          throw err;
        }
      },
      parentContext,
    );
  };
}

function mergeTelemetry(opts: any): any {
  const baseTelemetry: AITelemetryConfig = createAITelemetry({
    metadata: opts?.experimental_telemetry?.metadata,
  });
  return {
    ...opts,
    experimental_telemetry: {
      ...opts?.experimental_telemetry,
      ...baseTelemetry,
    },
  };
}


function recordSpanError(span: Span, err: unknown): void {
  if (err instanceof Error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.recordException(err);
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  }
}
