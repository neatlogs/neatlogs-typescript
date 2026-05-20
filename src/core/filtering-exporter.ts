/**
 * A SpanExporter wrapper that filters out spans marked as dropped by the mask system.
 *
 * When NeatlogsSpanProcessor's onEnd() determines a mask returned null (meaning
 * "drop this span"), it sets `neatlogs.dropped = true` on the OTel span's attributes.
 * This exporter wrapper checks for that attribute and excludes those spans before
 * delegating to the real exporter.
 */
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';

export class FilteringExporter implements SpanExporter {
  constructor(private readonly _delegate: SpanExporter) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    const filtered = spans.filter(
      (s) => !s.attributes['neatlogs.dropped'] && s.instrumentationLibrary.name !== 'next.js',
    );
    if (filtered.length === 0) {
      // Nothing to export — report success immediately
      resultCallback({ code: 0 });
      return;
    }
    this._delegate.export(filtered, resultCallback);
  }

  async shutdown(): Promise<void> {
    return this._delegate.shutdown();
  }

  async forceFlush?(): Promise<void> {
    return this._delegate.forceFlush?.();
  }
}
