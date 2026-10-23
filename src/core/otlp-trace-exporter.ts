import { AsyncLocalStorage } from 'node:async_hooks';
import { ExportResultCode } from '@opentelemetry/core';
import { OTLPExporterBase, type OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
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
    const delegate = createOtlpHttpExportDelegate(
      convertLegacyHttpOptions(config, 'TRACES', 'v1/traces', {
        'User-Agent': `Neatlogs/${__version__}`,
        'Content-Type': 'application/x-protobuf',
      }),
      serializer,
    );
    super({
      export(spans, callback) {
        const batch: { acknowledgement: Acknowledgement } = { acknowledgement: { kind: 'pending' } };
        batches.run(batch, () => delegate.export(spans, (result) => {
          // The upstream delegate reports SUCCESS even when it rejects response data.
          if (result.code !== ExportResultCode.SUCCESS || batch.acknowledgement.kind === 'accepted') {
            callback(result);
          } else {
            callback({
              code: ExportResultCode.FAILED,
              error: batch.acknowledgement.kind === 'failed'
                ? batch.acknowledgement.error
                : new Error('OTLP acknowledgement was not validated'),
            });
          }
        }));
      },
      forceFlush: () => delegate.forceFlush(),
      async shutdown() {
        try { await delegate.shutdown(); }
        finally { batches.disable(); }
      },
    });
  }
}
