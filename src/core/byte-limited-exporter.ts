import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { ProtobufTraceSerializer } from '@opentelemetry/otlp-transformer';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { DeliveryDiagnostics } from './delivery-diagnostics.js';

export const DEFAULT_MAX_EXPORT_BYTES = 4 * 1024 * 1024;

/** Split row batches by a conservative encoded OTLP/protobuf byte bound. */
export class ByteLimitedSpanExporter implements SpanExporter {
  constructor(
    private readonly delegate: SpanExporter,
    private readonly maxExportBytes = DEFAULT_MAX_EXPORT_BYTES,
    private readonly diagnostics?: DeliveryDiagnostics,
  ) {
    if (!Number.isSafeInteger(maxExportBytes) || maxExportBytes <= 0) {
      throw new RangeError('maxExportBytes must be a positive safe integer');
    }
  }

  static encodedUpperBound(span: ReadableSpan): number {
    return ProtobufTraceSerializer.serializeRequest([span])?.byteLength ?? Number.MAX_SAFE_INTEGER;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const batches: ReadableSpan[][] = [];
    let current: ReadableSpan[] = [];
    let currentBytes = 0;

    for (const span of spans) {
      const spanBytes = ByteLimitedSpanExporter.encodedUpperBound(span);
      if (current.length > 0 && currentBytes + spanBytes > this.maxExportBytes) {
        batches.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(span);
      currentBytes += spanBytes;
    }
    if (current.length > 0) batches.push(current);

    void this.exportSequentially(batches).then(resultCallback, (error) => {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }

  private async exportSequentially(batches: ReadableSpan[][]): Promise<ExportResult> {
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      let result: ExportResult;
      try {
        result = await new Promise<ExportResult>((resolve) => {
          this.delegate.export(batch, resolve);
        });
      } catch (error) {
        this.recordUnsent(batches, index);
        throw error;
      }
      if (result.code !== ExportResultCode.SUCCESS) {
        this.recordUnsent(batches, index);
        return result;
      }
    }
    return { code: ExportResultCode.SUCCESS };
  }

  private recordUnsent(batches: ReadableSpan[][], failedIndex: number): void {
    const count = batches
      .slice(failedIndex)
      .reduce((total, batch) => total + batch.length, 0);
    this.diagnostics?.recordExportFailure('span', count);
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush?.();
  }
}
