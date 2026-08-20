/**
 * Core span decoration utilities.
 * Provides the low-level wrapping logic used by span() and Span().
 */

import {
  ROOT_CONTEXT,
  SpanStatusCode,
  type Span as OtelSpan,
} from "@opentelemetry/api";
import { getLogger } from "../core/logger.js";
import { registerMask } from "../core/mask.js";
import { applyEndUserAttributes, isRootSpan } from "../core/end-user.js";
import { applySessionAttributes } from "../core/session.js";
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  withNeatlogsSpan,
} from "../core/provider.js";
import type { SpanOptions, MaskFunction } from "../types.js";

const logger = getLogger();
const TRACER_NAME = "neatlogs";
const MAX_SEMANTIC_STREAM_EVENTS = 128;

/** Safely serialize any value to JSON string. */
export function safeJsonDumps(value: any): string {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "bigint") return val.toString();
      if (val instanceof Error)
        return { message: val.message, name: val.name, stack: val.stack };
      if (typeof val === "function")
        return `[Function: ${val.name || "anonymous"}]`;
      return val;
    });
  } catch {
    return String(value);
  }
}

/** Serialize an object for span attributes. Handles toJSON(), plain objects, primitives. */
export function serializeObj(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (
    typeof obj === "string" ||
    typeof obj === "number" ||
    typeof obj === "boolean"
  )
    return obj;
  if (typeof obj.toJSON === "function") return obj.toJSON();
  if (Array.isArray(obj)) return obj.map(serializeObj);
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeObj(value);
    }
    return result;
  }
  return String(obj);
}

/** Set common span attributes from options. */
export function setCommonSpanAttrs(span: OtelSpan, opts: SpanOptions): void {
  if (opts.kind) {
    span.setAttribute("openinference.span.kind", opts.kind);
  }
  if (opts.internal) {
    span.setAttribute("neatlogs.internal", true);
  }
  if (opts.description) {
    span.setAttribute("neatlogs.description", opts.description);
  }
  if (opts.mask) {
    const maskId = registerMask(opts.mask);
    span.setAttribute("neatlogs.mask_id", maskId);
  }
}

export interface DecorateSpanOptions extends SpanOptions {
  /** Override the span name (defaults to function name). */
  spanName?: string;
  /** Post-process callback after the function returns. */
  postprocessResult?: (
    span: OtelSpan,
    result: any,
    boundInputs: Record<string, any>,
  ) => void;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === "function"
  );
}

function isReadableStreamLike(value: unknown): value is {
  getReader: (...args: any[]) => any;
  cancel: (...args: any[]) => Promise<unknown>;
} {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { getReader?: unknown }).getReader === "function" &&
    typeof (value as { cancel?: unknown }).cancel === "function"
  );
}

/**
 * Core wrapper factory that creates an instrumented version of a function.
 * This is the low-level building block used by span() and Span().
 */
export function decorateSpan<TArgs extends any[], TReturn>(
  opts: DecorateSpanOptions,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  const spanName = opts.spanName ?? opts.name ?? (fn.name || "anonymous");
  const captureInput = opts.captureInput !== false;
  const captureOutput = opts.captureOutput !== false;

  const wrapped = (...args: TArgs): any => {
    // Resolve the tracer at CALL time, not definition time: a decorator applied
    // before init() would otherwise capture the no-op global provider forever
    // and emit zero spans once the private provider is configured.
    const tracer = getNeatlogsTracer(TRACER_NAME);
    // End-user belongs to the trace root only. Capture root status BEFORE the
    // span is created (once it's active, it would be the "current" span).
    const isRoot = isRootSpan();
    // Parent from our private span store; a root decorated function anchors a
    // fresh trace under ROOT_CONTEXT.
    const parentContext = isRoot ? ROOT_CONTEXT : getNeatlogsParentContext();
    const span = tracer.startSpan(spanName, {}, parentContext);
    return withNeatlogsSpan(span, () => {
      let finished = false;
      const streamChunks: any[] = [];

      const captureResult = (result: any): void => {
        if (captureOutput) {
          try {
            span.setAttribute(
              "output.value",
              safeJsonDumps(serializeObj(result)),
            );
          } catch (err) {
            logger.debug(`Failed to capture output: ${err}`);
          }
        }

        if (opts.postprocessResult) {
          try {
            const boundInputs = _extractBoundInputs(fn, args);
            opts.postprocessResult(span, result, boundInputs);
          } catch (err) {
            logger.debug(`Postprocess failed: ${err}`);
          }
        }
      };

      const finishSuccess = (result: any): void => {
        if (finished) return;
        finished = true;
        captureResult(result);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      };

      const setStreamCounts = (): void => {
        span.setAttribute("neatlogs.stream.chunk_count", streamChunks.length);
        if (streamChunks.length > MAX_SEMANTIC_STREAM_EVENTS) {
          span.setAttribute(
            "neatlogs.stream.events_dropped",
            streamChunks.length - MAX_SEMANTIC_STREAM_EVENTS,
          );
        }
      };

      const finishError = (error: any): void => {
        if (finished) return;
        finished = true;
        if (error?.name === "AbortError") {
          span.setAttribute("neatlogs.stream.cancelled", true);
          if (streamChunks.length > 0) {
            setStreamCounts();
            captureResult(streamChunks);
          }
          span.setStatus({ code: SpanStatusCode.UNSET });
          span.end();
          return;
        }
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error?.message ?? String(error),
        });
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        span.end();
      };

      const recordChunk = (chunk: any): void => {
        const index = streamChunks.length;
        streamChunks.push(chunk);
        if (index >= MAX_SEMANTIC_STREAM_EVENTS) return;
        const serialized = safeJsonDumps(serializeObj(chunk));
        const summary: Record<string, unknown> = {
          value_type: Array.isArray(chunk) ? "array" : typeof chunk,
          encoded_bytes: new TextEncoder().encode(serialized).byteLength,
        };
        if (Array.isArray(chunk)) summary.items = chunk.length;
        else if (chunk && typeof chunk === "object")
          summary.keys = Object.keys(chunk).sort();
        span.addEvent("neatlogs.stream.chunk", {
          "neatlogs.stream.chunk.index": index,
          "neatlogs.stream.chunk.summary": safeJsonDumps(summary),
        });
      };

      const finishStream = (cancelled = false): void => {
        setStreamCounts();
        if (!cancelled) {
          finishSuccess(streamChunks);
          return;
        }
        if (finished) return;
        finished = true;
        span.setAttribute("neatlogs.stream.cancelled", true);
        captureResult(streamChunks);
        span.setStatus({ code: SpanStatusCode.UNSET });
        span.end();
      };

      const wrapIterator = (iterator: any): any => {
        let proxy: any;
        proxy = new Proxy(iterator, {
          get(target, property) {
            if (property === Symbol.asyncIterator) return () => proxy;
            if (property === "next") {
              return async (...nextArgs: any[]) => {
                try {
                  const item = await withNeatlogsSpan(span, () =>
                    target.next(...nextArgs),
                  );
                  if (item.done) finishStream();
                  else recordChunk(item.value);
                  return item;
                } catch (error) {
                  finishError(error);
                  throw error;
                }
              };
            }
            if (property === "return") {
              return async (...returnArgs: any[]) => {
                try {
                  const item = target.return
                    ? await withNeatlogsSpan(span, () =>
                        target.return(...returnArgs),
                      )
                    : { done: true, value: returnArgs[0] };
                  finishStream(true);
                  return item;
                } catch (error) {
                  finishError(error);
                  throw error;
                }
              };
            }
            if (property === "throw") {
              return async (...throwArgs: any[]) => {
                try {
                  const item = target.throw
                    ? await withNeatlogsSpan(span, () =>
                        target.throw(...throwArgs),
                      )
                    : Promise.reject(throwArgs[0]);
                  if (item.done) finishStream();
                  else recordChunk(item.value);
                  return item;
                } catch (error) {
                  finishError(error);
                  throw error;
                }
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return proxy;
      };

      const wrapAsyncIterable = (source: AsyncIterable<unknown>): any => {
        if (typeof (source as any).next === "function") {
          return wrapIterator(source);
        }
        return new Proxy(source as any, {
          get(target, property) {
            if (property === Symbol.asyncIterator) {
              return () => wrapIterator(target[Symbol.asyncIterator]());
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      };

      const wrapReader = (reader: any): any =>
        new Proxy(reader, {
          get(target, property) {
            if (property === "read") {
              return async (...readArgs: any[]) => {
                try {
                  const item = await withNeatlogsSpan(span, () =>
                    target.read(...readArgs),
                  );
                  if (item.done) finishStream();
                  else recordChunk(item.value);
                  return item;
                } catch (error) {
                  finishError(error);
                  throw error;
                }
              };
            }
            if (property === "cancel") {
              return async (...cancelArgs: any[]) => {
                try {
                  const result = await target.cancel(...cancelArgs);
                  finishStream(true);
                  return result;
                } catch (error) {
                  finishError(error);
                  throw error;
                }
              };
            }
            if (property === "releaseLock") {
              return (...releaseArgs: any[]) => {
                try {
                  return target.releaseLock(...releaseArgs);
                } finally {
                  finishStream(true);
                }
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });

      const wrapReadableStream = (stream: any): any =>
        new Proxy(stream, {
          get(target, property) {
            if (property === "getReader") {
              return (...readerArgs: any[]) =>
                wrapReader(target.getReader(...readerArgs));
            }
            if (property === Symbol.asyncIterator) {
              const iteratorFactory = target[Symbol.asyncIterator];
              if (typeof iteratorFactory === "function") {
                return () => wrapIterator(iteratorFactory.call(target));
              }
            }
            if (property === "cancel") {
              return async (...cancelArgs: any[]) => {
                try {
                  const result = await target.cancel(...cancelArgs);
                  finishStream(true);
                  return result;
                } catch (error) {
                  finishError(error);
                  throw error;
                }
              };
            }
            if (property === "pipeTo") {
              return async (...pipeArgs: any[]) => {
                try {
                  const result = await target.pipeTo(...pipeArgs);
                  finishStream();
                  return result;
                } catch (error) {
                  finishError(error);
                  throw error;
                }
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });

      try {
        // Set common attributes
        setCommonSpanAttrs(span, opts);

        // Session/end-user identity (root span only; skipped on a non-root child).
        applySessionAttributes(span, opts.sessionId, isRoot, {
          parentSessionId: opts.parentSessionId,
          sessionFeatureName: opts.sessionFeatureName,
          sessionEntryPoint: opts.sessionEntryPoint,
        });
        applyEndUserAttributes(
          span,
          opts.endUserId,
          opts.endUserMetadata,
          isRoot,
        );

        // Capture input
        if (captureInput && args.length > 0) {
          try {
            const inputValue =
              args.length === 1
                ? serializeObj(args[0])
                : args.map(serializeObj);
            span.setAttribute("input.value", safeJsonDumps(inputValue));
          } catch (err) {
            logger.debug(`Failed to capture input: ${err}`);
          }
        }

        // Execute the function
        const result = fn(...args);

        const handleResult = (resolved: any): any => {
          // A promise may resolve to a stream. Classify the resolved value before
          // ending the span so async factories remain open through consumption.
          if (isReadableStreamLike(resolved))
            return wrapReadableStream(resolved);
          if (isAsyncIterable(resolved)) return wrapAsyncIterable(resolved);
          finishSuccess(resolved);
          return resolved;
        };

        // Handle any Promise/A+ thenable, not only native Promise instances.
        if (isPromiseLike(result)) {
          return Promise.resolve(result)
            .then(handleResult)
            .catch((error: any) => {
              finishError(error);
              throw error;
            });
        }

        return handleResult(result);
      } catch (error: any) {
        finishError(error);
        throw error;
      }
    });
  };

  // Preserve function name for debugging
  Object.defineProperty(wrapped, "name", {
    value: spanName,
    configurable: true,
  });

  return wrapped as any;
}

/** Extract named arguments from function call (best-effort). */
function _extractBoundInputs(fn: Function, args: any[]): Record<string, any> {
  const result: Record<string, any> = {};
  // Parse function parameter names from toString()
  const fnStr = fn.toString();
  const match = fnStr.match(/\(([^)]*)\)/);
  if (match) {
    const paramNames = match[1]
      .split(",")
      .map((p) =>
        p
          .trim()
          .replace(/\s*[:=].*$/, "")
          .replace(/^\.\.\./, ""),
      )
      .filter(Boolean);
    for (let i = 0; i < Math.min(paramNames.length, args.length); i++) {
      result[paramNames[i]] = args[i];
    }
  }
  return result;
}
