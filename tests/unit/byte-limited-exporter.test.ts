import { ROOT_CONTEXT } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';
import { ByteLimitedSpanExporter } from '../../src/core/byte-limited-exporter.js';
import { DeliveryDiagnostics } from '../../src/core/delivery-diagnostics.js';
import type {
  UploadAuthority,
  UploadPayload,
} from '../../src/core/upload-authority.js';

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

  it('rejects one oversized span when upload authority is disabled', async () => {
    const spans = await finishedSpans(1, 16_384);
    const sink = new RecordingExporter();
    const diagnostics = new DeliveryDiagnostics();
    const exporter = new ByteLimitedSpanExporter(sink, 128, diagnostics);

    expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.FAILED);
    expect(sink.batches).toEqual([]);
    expect(diagnostics.snapshot()).toMatchObject({
      spanOverflowUnavailable: 1,
      spanOverflowFailures: 1,
      spanExportFailures: 1,
    });
  });

  it('uploads one complete oversized OTLP request without delegating it', async () => {
    const spans = await finishedSpans(1, 16_384);
    const sink = new RecordingExporter();
    const uploads: UploadPayload[] = [];
    const authority: UploadAuthority = {
      available: true,
      unavailableReason: '',
      maxPayloadBytes: 1024 * 1024,
      async upload(payload) {
        uploads.push(payload);
        return {
          uploadId: '018f47a6-7f32-7d67-8a1b-42d3f974c012',
          state: 'ready',
          reference: {
            id: '018f47a6-7f32-7d67-8a1b-42d3f974c012',
            purpose: payload.purpose,
            sha256: payload.sha256,
            byteLength: payload.byteLength,
            mimeType: payload.mimeType,
            contentEncoding: payload.contentEncoding,
            state: 'ready',
          },
        };
      },
    };
    const diagnostics = new DeliveryDiagnostics();
    const exporter = new ByteLimitedSpanExporter(sink, 128, diagnostics, authority);

    expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.SUCCESS);
    expect(sink.batches).toEqual([]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      purpose: 'otlp_overflow',
      mimeType: 'application/x-protobuf',
      contentEncoding: 'identity',
      payloadSchema: 'otlp.traces.v1',
    });
    expect(uploads[0].byteLength).toBe(uploads[0].content.byteLength);
    expect(diagnostics.snapshot().spanOverflowUploads).toBe(1);
  });

  it('rejects overflow above the authority limit before preparing an upload', async () => {
    const spans = await finishedSpans(1, 16_384);
    let uploadCount = 0;
    const authority: UploadAuthority = {
      available: true,
      unavailableReason: '',
      maxPayloadBytes: 100,
      async upload() {
        uploadCount += 1;
        throw new Error('must not prepare');
      },
    };
    const diagnostics = new DeliveryDiagnostics();
    const exporter = new ByteLimitedSpanExporter(
      new RecordingExporter(),
      128,
      diagnostics,
      authority,
    );

    expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.FAILED);
    expect(uploadCount).toBe(0);
    expect(diagnostics.snapshot()).toMatchObject({
      spanOverflowFailures: 1,
      lastUploadFailureStage: 'validate',
      lastUploadFailureReason: 'payload_too_large',
    });
  });

  it('does not accept a non-ready injected authority receipt as export success', async () => {
    const spans = await finishedSpans(1, 16_384);
    const sink = new RecordingExporter();
    const diagnostics = new DeliveryDiagnostics();
    const authority: UploadAuthority = {
      available: true,
      unavailableReason: '',
      maxPayloadBytes: 1024 * 1024,
      async upload(payload) {
        return {
          uploadId: '018f47a6-7f32-7d67-8a1b-42d3f974c012',
          state: 'validating',
          reference: {
            id: '018f47a6-7f32-7d67-8a1b-42d3f974c013',
            purpose: payload.purpose,
            sha256: payload.sha256,
            byteLength: payload.byteLength,
            mimeType: payload.mimeType,
            contentEncoding: payload.contentEncoding,
            state: 'validating',
          },
        } as any;
      },
    };
    const exporter = new ByteLimitedSpanExporter(sink, 128, diagnostics, authority);

    expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.FAILED);
    expect(sink.batches).toEqual([]);
    expect(diagnostics.snapshot()).toMatchObject({
      spanOverflowUploads: 0,
      spanOverflowFailures: 1,
      lastUploadFailureStage: 'complete',
      lastUploadFailureReason: 'invalid_receipt',
    });
  });

  it('does not accept an injected ready receipt with a different reference id', async () => {
    const spans = await finishedSpans(1, 16_384);
    const sink = new RecordingExporter();
    const authority: UploadAuthority = {
      available: true,
      unavailableReason: '',
      maxPayloadBytes: 1024 * 1024,
      async upload(payload) {
        return {
          uploadId: '018f47a6-7f32-7d67-8a1b-42d3f974c012',
          state: 'ready',
          reference: {
            id: '018f47a6-7f32-7d67-8a1b-42d3f974c013',
            purpose: payload.purpose,
            sha256: payload.sha256,
            byteLength: payload.byteLength,
            mimeType: payload.mimeType,
            contentEncoding: payload.contentEncoding,
            state: 'ready',
          },
        };
      },
    };
    const exporter = new ByteLimitedSpanExporter(sink, 128, undefined, authority);

    expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.FAILED);
    expect(sink.batches).toEqual([]);
  });

  it.each([
    { failedBatch: 0, expectedFailures: 3, expectedAttempts: 1 },
    { failedBatch: 1, expectedFailures: 2, expectedAttempts: 2 },
    { failedBatch: 2, expectedFailures: 1, expectedAttempts: 3 },
  ])(
    'counts the failed and unattempted tail when sub-batch $failedBatch fails',
    async ({ failedBatch, expectedFailures, expectedAttempts }) => {
      const spans = await finishedSpans(3);
      const diagnostics = new DeliveryDiagnostics();
      let attempts = 0;
      const sink: SpanExporter = {
        export(_batch, callback) {
          const code =
            attempts++ === failedBatch
              ? ExportResultCode.FAILED
              : ExportResultCode.SUCCESS;
          callback({ code });
        },
        async shutdown() {},
      };
      const maxBytes = Math.max(
        ...spans.map((span) => ByteLimitedSpanExporter.encodedUpperBound(span)),
      );
      const exporter = new ByteLimitedSpanExporter(sink, maxBytes, diagnostics);

      expect((await runExport(exporter, spans)).code).toBe(ExportResultCode.FAILED);
      expect(attempts).toBe(expectedAttempts);
      expect(diagnostics.snapshot().spanExportFailures).toBe(expectedFailures);
    },
  );
});
