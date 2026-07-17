/**
 * Explicit W3C propagation for the private Neatlogs trace context.
 *
 * The global OpenTelemetry propagator is deliberately not used or changed:
 * callers opt in at the exact cross-process boundary where Neatlogs context
 * should travel.
 */

import { TraceFlags } from '@opentelemetry/api';
import { getActiveNeatlogsSpan } from './provider.js';

export type TraceContextCarrier =
  | Record<string, string>
  | { set(name: string, value: string): unknown };

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

function setHeader(
  carrier: TraceContextCarrier,
  name: string,
  value: string,
): void {
  if ('set' in carrier && typeof carrier.set === 'function') {
    carrier.set(name, value);
    return;
  }
  (carrier as Record<string, string>)[name] = value;
}
