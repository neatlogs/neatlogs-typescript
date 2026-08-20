import { ROOT_CONTEXT } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';
import { ByteLimitedSpanExporter } from '../../src/core/byte-limited-exporter.js';

class RecordingExporter implements SpanExporter {
  readonly batches: ReadableSpan[][] = [];

  export(spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
    this.batches.push([...spans]);
    callback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {}
}

async function finishedSpans(count = 3, payloadSize = 2048): Promise<ReadableSpan[]> {
  const sink = new RecordingExporter();
  const provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(sink));
  const tracer = provider.getTracer('byte-test');
  for (let index = 0; index < count; index += 1) {
    const span = tracer.startSpan(`span-${index}`, undefined, ROOT_CONTEXT);
    span.setAttribute('neatlogs.llm.input', 'x'.repeat(payloadSize));
    span.end();
  }
  await provider.forceFlush();
  return sink.batches.flat();
}

function runExport(exporter: SpanExporter, spans: ReadableSpan[]): Promise<ExportResult> {
  return new Promise((resolve) => exporter.export(spans, resolve));
}

describe('ByteLimitedSpanExporter', () => {
  it('splits using encoded protobuf upper bounds', async () => {
    const spans = await finishedSpans();
    const oneSpanBytes = ByteLimitedSpanExporter.encodedUpperBound(spans[0]);
    const sink = new RecordingExporter();
    const exporter = new ByteLimitedSpanExporter(sink, oneSpanBytes * 2);

    expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.SUCCESS);
    expect(sink.batches.map((batch) => batch.length)).toEqual([2, 1]);
  });

  it('forwards one oversized span intact', async () => {
    const spans = await finishedSpans(1, 16_384);
    const sink = new RecordingExporter();
    const exporter = new ByteLimitedSpanExporter(sink, 128);

    expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.SUCCESS);
    expect(sink.batches).toEqual([spans]);
  });
});
