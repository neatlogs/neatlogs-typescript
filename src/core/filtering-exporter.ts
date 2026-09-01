/**
 * A SpanExporter wrapper that filters out spans marked as dropped by the mask system.
 *
 * When NeatlogsSpanProcessor's onEnd() determines a mask returned null (meaning
 * "drop this span"), it sets `neatlogs.dropped = true` on the OTel span's attributes.
 * This exporter wrapper checks for that attribute and excludes those spans before
 * delegating to the real exporter.
 */
import { SpanStatusCode, type Attributes, type HrTime } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { getScheduledMask } from './mask.js';
import type { DeliveryDiagnostics } from './delivery-diagnostics.js';
import { discardPendingMedia, resolvePendingMediaUploads } from './media.js';
import {
  DisabledUploadAuthority,
  type UploadAuthority,
} from './upload-authority.js';

function toHrTime(nanos: unknown, fallback: HrTime): HrTime {
  if (typeof nanos !== 'number' || !Number.isFinite(nanos)) return fallback;
  const seconds = Math.floor(nanos / 1_000_000_000);
  return [seconds, Math.max(0, Math.floor(nanos - seconds * 1_000_000_000))];
}

function toAttributes(value: unknown): Attributes {
  if (!value || typeof value !== 'object') return {};
  const result: Attributes = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      (Array.isArray(item) &&
        item.every(
          (entry) =>
            entry === null ||
            typeof entry === 'string' ||
            typeof entry === 'number' ||
            typeof entry === 'boolean',
        ))
    ) {
      result[key] = item as any;
    } else if (item !== undefined) {
      result[key] = JSON.stringify(item);
    }
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
  const resourceData = data.resource?.attributes ?? data.resource;
  const eventData = Array.isArray(data.events) ? data.events : [];
  const linkData = Array.isArray(data.links) ? data.links : [];
  const status = data.status ?? {};

  return {
    name: typeof data.name === 'string' ? data.name : span.name,
    kind: span.kind,
    spanContext: () => span.spanContext(),
    parentSpanId:
      data.parent_span_id === null
        ? undefined
        : typeof data.parent_span_id === 'string'
          ? data.parent_span_id
          : span.parentSpanId,
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    ended: span.ended,
    status: {
      code: statusCode(status.code, span.status.code),
      message:
        typeof status.message === 'string'
          ? status.message
          : typeof status.description === 'string'
            ? status.description
            : span.status.message,
    },
    attributes: toAttributes(data.attributes),
    events: eventData.map((event: any, index: number) => ({
      name: typeof event?.name === 'string' ? event.name : (span.events[index]?.name ?? 'event'),
      time: toHrTime(event?.timestamp, span.events[index]?.time ?? span.endTime),
      attributes: toAttributes(event?.attributes),
      droppedAttributesCount: span.events[index]?.droppedAttributesCount ?? 0,
    })),
    links: linkData.map((link: any, index: number) => {
      const original = span.links[index];
      return {
        context: {
          traceId:
            typeof link?.trace_id === 'string'
              ? link.trace_id
              : (original?.context.traceId ?? span.spanContext().traceId),
          spanId:
            typeof link?.span_id === 'string'
              ? link.span_id
              : (original?.context.spanId ?? span.spanContext().spanId),
          traceFlags:
            typeof link?.trace_flags === 'number'
              ? link.trace_flags
              : (original?.context.traceFlags ?? 0),
          traceState: original?.context.traceState,
          isRemote: original?.context.isRemote,
        },
        attributes: toAttributes(link?.attributes),
        droppedAttributesCount: original?.droppedAttributesCount ?? 0,
      };
    }),
    resource: new Resource(toAttributes(resourceData)),
    instrumentationLibrary: span.instrumentationLibrary,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

export class FilteringExporter implements SpanExporter {
  constructor(
    private readonly _delegate: SpanExporter,
    private readonly diagnostics?: DeliveryDiagnostics,
    private readonly uploadAuthority: UploadAuthority = new DisabledUploadAuthority(),
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    void Promise.all(
      spans.map(async (span) => {
        if (span.instrumentationLibrary.name === 'next.js') {
          discardPendingMedia(span as object);
          this.diagnostics?.recordFrameworkSpanDrop();
          return { span: null, mediaReady: true };
        }
        const scheduled = getScheduledMask(span as object);
        if (!scheduled) {
          discardPendingMedia(span as object);
          return { span, mediaReady: true };
        }
        const masked = await scheduled;
        if (masked === null) {
          discardPendingMedia(span as object);
          this.diagnostics?.recordMaskedDrop('span');
          return { span: null, mediaReady: true };
        }
        const attributes = {
          ...(masked.attributes && typeof masked.attributes === 'object'
            ? masked.attributes
            : {}),
        };
        const mediaReady = await resolvePendingMediaUploads(
          span as object,
          attributes,
          this.uploadAuthority,
          this.diagnostics,
        );
        return {
          span: maskedReadableSpan(span, { ...masked, attributes }),
          mediaReady,
        };
      }),
    ).then(
      (prepared) => {
        const filtered = prepared
          .map((item) => item.span)
          .filter((span): span is ReadableSpan => span !== null);
        const mediaFailures = prepared.filter(
          (item) => item.span !== null && !item.mediaReady,
        ).length;
        if (filtered.length === 0) {
          resultCallback({ code: ExportResultCode.SUCCESS });
          return;
        }
        this._delegate.export(filtered, (result) => {
          if (result.code === ExportResultCode.SUCCESS && mediaFailures > 0) {
            this.diagnostics?.recordExportFailure('span', mediaFailures);
            resultCallback({
              code: ExportResultCode.FAILED,
              error: new Error('one or more typed media uploads failed'),
            });
            return;
          }
          resultCallback(result);
        });
      },
      (error) => {
        resultCallback({ code: ExportResultCode.FAILED, error });
      },
    );
  }

  async shutdown(): Promise<void> {
    return this._delegate.shutdown();
  }

  async forceFlush?(): Promise<void> {
    return this._delegate.forceFlush?.();
  }
}
