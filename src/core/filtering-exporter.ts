import { SpanStatusCode, type Attributes, type HrTime } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { getScheduledMask } from './mask.js';

function toHrTime(nanos: unknown, fallback: HrTime): HrTime {
  if (typeof nanos !== 'number' || !Number.isFinite(nanos)) return fallback;
  const seconds = Math.floor(nanos / 1_000_000_000);
  return [seconds, Math.max(0, Math.floor(nanos - seconds * 1_000_000_000))];
}

function toAttributes(value: unknown): Attributes {
  if (!value || typeof value !== 'object') return {};
  const result: Attributes = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ||
      (Array.isArray(item) && item.every((entry) => entry === null || typeof entry === 'string' ||
        typeof entry === 'number' || typeof entry === 'boolean'))) result[key] = item as any;
    else if (item !== undefined) result[key] = JSON.stringify(item);
  }
  return result;
}

function statusCode(value: unknown, fallback: SpanStatusCode): SpanStatusCode {
  if (typeof value === 'number') return value as SpanStatusCode;
  if (typeof value === 'string') {
    const resolved = SpanStatusCode[value as keyof typeof SpanStatusCode];
    if (typeof resolved === 'number') return resolved;
  }
  return fallback;
}

function maskedReadableSpan(span: ReadableSpan, data: Record<string, any>): ReadableSpan {
  const status = data.status ?? {};
  return {
    ...span,
    name: typeof data.name === 'string' ? data.name : span.name,
    spanContext: () => span.spanContext(),
    parentSpanId: data.parent_span_id === null ? undefined :
      typeof data.parent_span_id === 'string' ? data.parent_span_id : span.parentSpanId,
    status: {
      code: statusCode(status.code, span.status.code),
      message: typeof status.message === 'string' ? status.message :
        typeof status.description === 'string' ? status.description : span.status.message,
    },
    attributes: toAttributes(data.attributes),
    events: (Array.isArray(data.events) ? data.events : []).map((event: any, index: number) => ({
      name: typeof event?.name === 'string' ? event.name : (span.events[index]?.name ?? 'event'),
      time: toHrTime(event?.timestamp, span.events[index]?.time ?? span.endTime),
      attributes: toAttributes(event?.attributes),
      droppedAttributesCount: span.events[index]?.droppedAttributesCount ?? 0,
    })),
    resource: new Resource(toAttributes(data.resource?.attributes ?? data.resource)),
  };
}

/** Applies masking only at the wrapped Neatlogs export sink. */
export class FilteringExporter implements SpanExporter {
  private _exportFailures = 0;
  private _droppedSpans = 0;

  constructor(
    private readonly _delegate: SpanExporter,
    private readonly _onPrepared?: (spans: readonly ReadableSpan[]) => void,
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    void Promise.all(spans.map(async (span) => {
      if (span.instrumentationLibrary.name === 'next.js') return null;
      const scheduled = getScheduledMask(span as object);
      if (!scheduled) return span;
      const masked = await scheduled;
      return masked === null ? null : maskedReadableSpan(span, masked);
    })).then((prepared) => {
      const filtered = prepared.filter((span): span is ReadableSpan => span !== null);
      this._droppedSpans += prepared.length - filtered.length;
      // This is the final masked and filtered boundary. Doctor v2 can observe
      // the exact exportable batch here without receiving credentials or
      // mutating the spans passed to the transport exporter.
      this._onPrepared?.(Object.freeze([...filtered]));
      if (filtered.length === 0) return resultCallback({ code: ExportResultCode.SUCCESS });
      this._delegate.export(filtered, (result) => {
        if (result.code === ExportResultCode.FAILED) this._exportFailures += 1;
        resultCallback(result);
      });
    }, (error) => {
      this._exportFailures += 1;
      resultCallback({ code: ExportResultCode.FAILED, error });
    });
  }

  /** @internal Read-only, credential-free health counters for doctor(). */
  health(): Readonly<{ droppedSpans: number; exportFailures: number }> {
    return { droppedSpans: this._droppedSpans, exportFailures: this._exportFailures };
  }

  async shutdown(): Promise<void> { return this._delegate.shutdown(); }
  async forceFlush?(): Promise<void> { return this._delegate.forceFlush?.(); }
}
