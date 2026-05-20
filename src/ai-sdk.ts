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

import { trace, context as otelContext, ROOT_CONTEXT, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

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
    tracer: trace.getTracer(TRACER_NAME),
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
  }
  const stringified = safeStringify(result);
  if (stringified) {
    span.setAttribute('output.value', stringified);
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
      wrapped[name] = createSyncWrapper(name, original as (opts: any) => unknown);
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
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const instrScope = (activeSpan as any).instrumentationLibrary?.name ?? '';
    if (instrScope === 'next.js') {
      return ROOT_CONTEXT;
    }
  }
  return otelContext.active();
}

function createAsyncWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => Promise<unknown>,
): (opts: any) => Promise<unknown> {
  return async function wrappedAsyncFn(opts: any): Promise<unknown> {
    const tracer = trace.getTracer(TRACER_NAME);
    return tracer.startActiveSpan(
      `ai.${name}`,
      { attributes: { 'openinference.span.kind': rootSpanKind(name) } },
      getParentContext(),
      async (span) => {
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
    );
  };
}

function createSyncWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => unknown,
): (opts: any) => unknown {
  return function wrappedSyncFn(opts: any): unknown {
    const tracer = trace.getTracer(TRACER_NAME);
    return tracer.startActiveSpan(`ai.${name}`, { attributes: { 'openinference.span.kind': rootSpanKind(name) } }, getParentContext(), (span) => {
      try {
        setInputValue(span, opts);
        const merged = mergeTelemetry(opts);
        const result = original(merged);
        return result;
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    });
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
