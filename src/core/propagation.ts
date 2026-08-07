/**
 * Explicit W3C propagation for the private Neatlogs trace context.
 *
 * The global OpenTelemetry propagator is deliberately not used or changed:
 * callers opt in at the exact cross-process boundary where Neatlogs context
 * should travel.
 */

import {
  TraceFlags,
  createTraceState,
  trace as otelTrace,
  type SpanContext,
} from '@opentelemetry/api';
import {
  getActiveNeatlogsSpan,
  withNeatlogsRemoteParent,
} from './provider.js';

export type TraceContextCarrier =
  | Record<string, string | undefined>
  | {
      get?(name: string): string | null | undefined;
      set?(name: string, value: string): unknown;
    };

/**
 * Inject the active private Neatlogs span as W3C `traceparent`/`tracestate`
 * headers. Returns false when no valid Neatlogs span is active.
 */
export function injectTraceContext(carrier: TraceContextCarrier): boolean {
  const spanContext = getActiveNeatlogsSpan()?.spanContext();
  if (!spanContext?.traceId || !spanContext.spanId) {
    return false;
  }
  if (
    spanContext.traceId === '00000000000000000000000000000000' ||
    spanContext.spanId === '0000000000000000'
  ) {
    return false;
  }

  const flags =
    spanContext.traceFlags & TraceFlags.SAMPLED
      ? TraceFlags.SAMPLED
      : TraceFlags.NONE;
  setHeader(
    carrier,
    'traceparent',
    `00-${spanContext.traceId}-${spanContext.spanId}-${flags
      .toString(16)
      .padStart(2, '0')}`,
  );

  const traceState = spanContext.traceState?.serialize();
  if (traceState) {
    setHeader(carrier, 'tracestate', traceState);
  }
  return true;
}

/**
 * Run a callback under a remote W3C parent in Neatlogs' private context.
 * Invalid or absent context is ignored, so request handling remains fail-open.
 * The process-global OpenTelemetry context and propagator are never touched.
 */
export function extractTraceContext<T>(
  carrier: TraceContextCarrier,
  fn: () => T,
): T {
  const spanContext = parseTraceParent(
    getHeader(carrier, 'traceparent'),
    getHeader(carrier, 'tracestate'),
  );
  if (!spanContext) {
    return fn();
  }
  return withNeatlogsRemoteParent(otelTrace.wrapSpanContext(spanContext), fn);
}

function parseTraceParent(
  traceparent: string | undefined,
  tracestate: string | undefined,
): SpanContext | undefined {
  const match = traceparent?.trim().match(
    /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/,
  );
  if (
    !match ||
    match[1] === '00000000000000000000000000000000' ||
    match[2] === '0000000000000000'
  ) {
    return undefined;
  }
  const flags = Number.parseInt(match[3], 16);
  return {
    traceId: match[1],
    spanId: match[2],
    traceFlags:
      flags & TraceFlags.SAMPLED ? TraceFlags.SAMPLED : TraceFlags.NONE,
    isRemote: true,
    ...(tracestate?.trim()
      ? { traceState: createTraceState(tracestate.trim()) }
      : {}),
  };
}

function getHeader(
  carrier: TraceContextCarrier,
  name: string,
): string | undefined {
  const getter = (carrier as { get?: unknown }).get;
  if (typeof getter === 'function') {
    const value = getter.call(carrier, name);
    return typeof value === 'string' ? value : undefined;
  }
  const record = carrier as Record<string, string | undefined>;
  return record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
}

function setHeader(
  carrier: TraceContextCarrier,
  name: string,
  value: string,
): void {
  if ('set' in carrier && typeof carrier.set === 'function') {
    carrier.set(name, value);
    return;
  }
  (carrier as Record<string, string | undefined>)[name] = value;
}
