import { ROOT_CONTEXT } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { describe, expect, it } from 'vitest';
import { DeliveryDiagnostics } from '../../src/core/delivery-diagnostics.js';
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
    const spans = new ObservableBatchSpanProcessor(
      new Sink(),
      { maxQueueSize: 1, maxExportBatchSize: 1, scheduledDelayMillis: 60_000 },
      diagnostics,
    );
    (spans as any)._finishedSpans.push(span);
    spans.onEnd(span);

    const logs = new ObservableBatchLogRecordProcessor(
      new LogSink(),
      { maxQueueSize: 1, maxExportBatchSize: 1, scheduledDelayMillis: 60_000 },
      diagnostics,
    );
    (logs as any)._finishedLogRecords.push({});
    logs.onEmit({} as any);

    expect(diagnostics.snapshot()).toMatchObject({ spanQueueDrops: 1, logQueueDrops: 1 });
    await spans.shutdown();
    // Clear the deliberately synthetic item before shutdown tries to serialize it.
    (logs as any)._finishedLogRecords = [];
    await logs.shutdown();
  });
});

