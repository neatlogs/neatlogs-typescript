import { AsyncLocalStorage } from 'node:async_hooks';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { OTLPExporterBase, type IOtlpExportDelegate, type OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
import { createOtlpHttpExportDelegate, convertLegacyHttpOptions } from '@opentelemetry/otlp-exporter-base/node-http';
import { ProtobufTraceSerializer, type ISerializer, type IExportTraceServiceResponse } from '@opentelemetry/otlp-transformer';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { __version__ } from '../version.js';

type Acknowledgement = { kind: 'pending' } | { kind: 'accepted' } | { kind: 'failed'; error: Error };

/** Keep the upstream HTTP transport while requiring a complete OTLP acknowledgement. */
export class OTLPTraceExporter extends OTLPExporterBase<ReadableSpan[]> {
  constructor(config: OTLPExporterNodeConfigBase = {}) {
    const batches = new AsyncLocalStorage<{ acknowledgement: Acknowledgement }>();
    const serializer: ISerializer<ReadableSpan[], IExportTraceServiceResponse> = {
      serializeRequest: ProtobufTraceSerializer.serializeRequest,
      deserializeResponse(data) {
        const batch = batches.getStore();
        try {
          const response = ProtobufTraceSerializer.deserializeResponse(data);
          // Protobuf int64 fields can be Long objects, including a Long zero.
          if (String(response.partialSuccess?.rejectedSpans ?? 0) !== '0') {
            if (batch) batch.acknowledgement = { kind: 'failed', error: new Error('Collector rejected one or more spans') };
            return {};
          }
          if (batch) batch.acknowledgement = { kind: 'accepted' };
          return response;
        } catch {
          if (batch) batch.acknowledgement = { kind: 'failed', error: new Error('Invalid OTLP trace acknowledgement') };
          return {};
        }
      },
    };
    const options = convertLegacyHttpOptions(config, 'TRACES', 'v1/traces', {
      'User-Agent': `Neatlogs/${__version__}`,
      'Content-Type': 'application/x-protobuf',
    });
    const delegate = createOtlpHttpExportDelegate(options, serializer);
    const pending = new Set<Promise<void>>();
    let stopped = false;
    const attempt = (transport: IOtlpExportDelegate<ReadableSpan[]>, spans: ReadableSpan[]) => new Promise<ExportResult>((resolve) => {
      const batch: { acknowledgement: Acknowledgement } = { acknowledgement: { kind: 'pending' } };
      batches.run(batch, () => transport.export(spans, (result) => {
        // The upstream delegate reports SUCCESS even when it rejects response data.
        if (result.code !== ExportResultCode.SUCCESS || batch.acknowledgement.kind === 'accepted') {
          resolve(result);
        } else {
          resolve({
            code: ExportResultCode.FAILED,
            error: batch.acknowledgement.kind === 'failed'
              ? batch.acknowledgement.error
              : new Error('OTLP acknowledgement was not validated'),
          });
        }
      }));
    });
    const exportBatch = async (spans: ReadableSpan[]): Promise<ExportResult> => {
      const deadline = performance.now() + options.timeoutMillis;
      const result = await attempt(delegate, spans);
      const remaining = Math.floor(deadline - performance.now());
      if (result.code !== ExportResultCode.FAILED || !result.error || !('code' in result.error)
        || result.error.code !== 'ECONNRESET' || remaining <= 0) return result;
      // A reset can happen after receipt; resend the same span IDs once within the original deadline.
      const retry = createOtlpHttpExportDelegate({ ...options, timeoutMillis: remaining }, serializer);
      try { return await attempt(retry, spans); }
      finally { await retry.shutdown(); }
    };
    super({
      export(spans, callback) {
        if (stopped) {
          callback({ code: ExportResultCode.FAILED, error: new Error('Exporter has been shut down') });
          return;
        }
        if (pending.size >= options.concurrencyLimit) {
          callback({ code: ExportResultCode.FAILED, error: new Error('Concurrent export limit reached') });
          return;
        }
        const task = exportBatch(spans).then((result) => {
          callback(result);
        }, (error: unknown) => {
          callback({
            code: ExportResultCode.FAILED,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        });
        pending.add(task);
        void task.then(() => pending.delete(task), () => pending.delete(task));
      },
      async forceFlush() {
        await Promise.all(pending);
        await delegate.forceFlush();
      },
      async shutdown() {
        stopped = true;
        try {
          await Promise.all(pending);
          await delegate.shutdown();
        } finally { batches.disable(); }
      },
    });
  }
}
