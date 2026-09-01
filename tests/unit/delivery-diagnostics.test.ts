import { ROOT_CONTEXT } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { describe, expect, it } from 'vitest';
import { DeliveryDiagnostics } from '../../src/core/delivery-diagnostics.js';
import { FilteringExporter } from '../../src/core/filtering-exporter.js';
import { scheduleMask } from '../../src/core/mask.js';
import { captureMedia, resolvePendingMediaUploads } from '../../src/core/media.js';
import {
  ObservableBatchLogRecordProcessor,
  ObservableBatchSpanProcessor,
} from '../../src/core/observable-batch-processors.js';

class Sink implements SpanExporter {
  export(_spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
    callback({ code: ExportResultCode.SUCCESS });
  }
  async shutdown(): Promise<void> {}
}

class LogSink implements LogRecordExporter {
  export(_logs: ReadableLogRecord[], callback: (result: ExportResult) => void): void {
    callback({ code: ExportResultCode.SUCCESS });
  }
  async shutdown(): Promise<void> {}
}

async function finishedSpan(): Promise<ReadableSpan> {
  let result: ReadableSpan | undefined;
  const provider = new BasicTracerProvider();
  provider.addSpanProcessor(
    new SimpleSpanProcessor({
      export(spans, callback) {
        result = spans[0];
        callback({ code: ExportResultCode.SUCCESS });
      },
      async shutdown() {},
    }),
  );
  provider.getTracer('delivery-test').startSpan('span', undefined, ROOT_CONTEXT).end();
  await provider.forceFlush();
  return result!;
}

describe('delivery diagnostics', () => {
  it('counts span and log queue saturation before OTel silently drops', async () => {
    const diagnostics = new DeliveryDiagnostics();
    const span = await finishedSpan();
    const mediaAttributes: Record<string, string | number> = {};
    Object.defineProperty(span, 'setAttribute', {
      configurable: true,
      value(name: string, value: string | number) {
        mediaAttributes[name] = value;
      },
    });
    const raw = Buffer.alloc(120_000, 13);
    captureMedia(
      span as ReadableSpan & {
        setAttribute(name: string, value: string | number): void;
      },
      'media',
      [{ type: 'image_url', image_url: { url: `data:image/png;base64,${raw.toString('base64')}` } }],
      'input',
    );
    const spans = new ObservableBatchSpanProcessor(
      new Sink(),
      { maxQueueSize: 1, maxExportBatchSize: 1, scheduledDelayMillis: 60_000 },
      diagnostics,
    );
    (spans as any)._finishedSpans.push(span);
    spans.onEnd(span);
    let mediaUploads = 0;
    const mediaReady = await resolvePendingMediaUploads(
      span as object,
      mediaAttributes,
      {
        available: true,
        unavailableReason: '',
        maxPayloadBytes: 1024 * 1024,
        async upload() {
          mediaUploads += 1;
          throw new Error('queue-dropped media must not upload');
        },
      },
    );

    const logs = new ObservableBatchLogRecordProcessor(
      new LogSink(),
      { maxQueueSize: 1, maxExportBatchSize: 1, scheduledDelayMillis: 60_000 },
      diagnostics,
    );
    (logs as any)._finishedLogRecords.push({});
    logs.onEmit({} as any);

    expect(diagnostics.snapshot()).toMatchObject({ spanQueueDrops: 1, logQueueDrops: 1 });
    expect(mediaReady).toBe(true);
    expect(mediaUploads).toBe(0);
    await spans.shutdown();
    // Clear the deliberately synthetic item before shutdown tries to serialize it.
    (logs as any)._finishedLogRecords = [];
    await logs.shutdown();
  });

  it('tracks framework filtering separately from mask drops', async () => {
    const diagnostics = new DeliveryDiagnostics();
    const span = await finishedSpan();
    const frameworkSpan = {
      ...span,
      instrumentationLibrary: { name: 'next.js' },
    } as ReadableSpan;
    scheduleMask(span as object, { attributes: {} }, () => null);
    const exporter = new FilteringExporter(new Sink(), diagnostics);

    const result = await new Promise<ExportResult>((resolve) =>
      exporter.export([frameworkSpan, span], resolve),
    );

    expect(result.code).toBe(ExportResultCode.SUCCESS);
    expect(diagnostics.snapshot()).toMatchObject({
      frameworkSpanDrops: 1,
      maskedSpanDrops: 1,
    });
  });
});
