/**
 * Core span decoration utilities.
 * Provides the low-level wrapping logic used by span() and Span().
 */

import { trace, SpanStatusCode, type Span as OtelSpan } from '@opentelemetry/api';
import { getLogger } from '../core/logger.js';
import { registerMask } from '../core/mask.js';
import { applyEndUserAttributes, isRootSpan } from '../core/end-user.js';
import type { SpanOptions, MaskFunction } from '../types.js';

const logger = getLogger();
const TRACER_NAME = 'neatlogs';

/** Safely serialize any value to JSON string. */
export function safeJsonDumps(value: any): string {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') return val.toString();
      if (val instanceof Error) return { message: val.message, name: val.name, stack: val.stack };
      if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
      return val;
    });
  } catch {
    return String(value);
  }
}

/** Serialize an object for span attributes. Handles toJSON(), plain objects, primitives. */
export function serializeObj(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (typeof obj.toJSON === 'function') return obj.toJSON();
  if (Array.isArray(obj)) return obj.map(serializeObj);
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeObj(value);
    }
    return result;
  }
  return String(obj);
}

/** Check if content capture is enabled via env var. */
export function shouldCaptureContent(): boolean {
  const envVal = process.env.NEATLOGS_TRACE_CONTENT;
  if (envVal === undefined || envVal === '') return true;
  return envVal.toLowerCase() !== 'false' && envVal !== '0';
}

/** Set common span attributes from options. */
export function setCommonSpanAttrs(span: OtelSpan, opts: SpanOptions): void {
  if (opts.kind) {
    span.setAttribute('openinference.span.kind', opts.kind);
  }
  if (opts.internal) {
    span.setAttribute('neatlogs.internal', true);
  }
  if (opts.description) {
    span.setAttribute('neatlogs.description', opts.description);
  }
  if (opts.mask) {
    const maskId = registerMask(opts.mask);
    span.setAttribute('neatlogs.mask_id', maskId);
  }
}

export interface DecorateSpanOptions extends SpanOptions {
  /** Override the span name (defaults to function name). */
  spanName?: string;
  /** Post-process callback after the function returns. */
  postprocessResult?: (span: OtelSpan, result: any, boundInputs: Record<string, any>) => void;
}

/**
 * Core wrapper factory that creates an instrumented version of a function.
 * This is the low-level building block used by span() and Span().
 */
export function decorateSpan<TArgs extends any[], TReturn>(
  opts: DecorateSpanOptions,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn extends Promise<any> ? TReturn : Promise<Awaited<TReturn>> {
  const tracer = trace.getTracer(TRACER_NAME);
  const spanName = opts.spanName ?? opts.name ?? (fn.name || 'anonymous');
  const captureInput = opts.captureInput !== false;
  const captureOutput = opts.captureOutput !== false;
  const doCapture = shouldCaptureContent();

  const wrapped = (...args: TArgs): any => {
    // End-user belongs to the trace root only. Capture root status BEFORE the
    // span is created (once it's active, it would be the "current" span).
    const isRoot = isRootSpan();
    return tracer.startActiveSpan(spanName, (span: OtelSpan) => {
      try {
        // Set common attributes
        setCommonSpanAttrs(span, opts);

        // End-user identity (root span only; skipped on a non-root child).
        applyEndUserAttributes(span, opts.endUserId, opts.endUserMetadata, isRoot);

        // Capture input
        if (captureInput && doCapture && args.length > 0) {
          try {
            const inputValue = args.length === 1 ? serializeObj(args[0]) : args.map(serializeObj);
            span.setAttribute('input.value', safeJsonDumps(inputValue));
          } catch (err) {
            logger.debug(`Failed to capture input: ${err}`);
          }
        }

        // Execute the function
        const result = fn(...args);

        // Handle async results
        if (result instanceof Promise) {
          return result
            .then((resolved: any) => {
              // Capture output
              if (captureOutput && doCapture) {
                try {
                  span.setAttribute('output.value', safeJsonDumps(serializeObj(resolved)));
                } catch (err) {
                  logger.debug(`Failed to capture output: ${err}`);
                }
              }

              // Post-process
              if (opts.postprocessResult) {
                try {
                  const boundInputs = _extractBoundInputs(fn, args);
                  opts.postprocessResult(span, resolved, boundInputs);
                } catch (err) {
                  logger.debug(`Postprocess failed: ${err}`);
                }
              }

              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return resolved;
            })
            .catch((error: any) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error?.message ?? String(error),
              });
              span.recordException(error instanceof Error ? error : new Error(String(error)));
              span.end();
              throw error;
            });
        }

        // Sync result
        if (captureOutput && doCapture) {
          try {
            span.setAttribute('output.value', safeJsonDumps(serializeObj(result)));
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

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return result;
      } catch (error: any) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error?.message ?? String(error),
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.end();
        throw error;
      }
    });
  };

  // Preserve function name for debugging
  Object.defineProperty(wrapped, 'name', { value: spanName, configurable: true });

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
      .split(',')
      .map((p) => p.trim().replace(/\s*[:=].*$/, '').replace(/^\.\.\./, ''))
      .filter(Boolean);
    for (let i = 0; i < Math.min(paramNames.length, args.length); i++) {
      result[paramNames[i]] = args[i];
    }
  }
  return result;
}
