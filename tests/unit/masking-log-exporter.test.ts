import { SeverityNumber } from '@opentelemetry/api-logs';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { describe, expect, it, vi } from 'vitest';
import { MaskingLogExporter } from '../../src/core/masking-log-exporter.js';
import { DeliveryDiagnostics } from '../../src/core/delivery-diagnostics.js';

class RecordingLogExporter implements LogRecordExporter {
  readonly batches: ReadableLogRecord[][] = [];

  export(logs: ReadableLogRecord[], callback: (result: ExportResult) => void): void {
    this.batches.push([...logs]);
    callback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {}
}

function record(): ReadableLogRecord {
  return {
    hrTime: [1, 2],
    hrTimeObserved: [1, 3],
    severityText: 'INFO',
    severityNumber: SeverityNumber.INFO,
    body: { message: 'secret' },
    resource: new Resource({ 'service.name': 'example', 'user.email': 'secret@example.com' }),
    instrumentationScope: { name: 'neatlogs', version: 'test' },
    attributes: { token: 'secret', nested: { password: 'secret' } },
    droppedAttributesCount: 0,
  };
}

function runExport(exporter: LogRecordExporter, logs: ReadableLogRecord[]): Promise<ExportResult> {
  return new Promise((resolve) => exporter.export(logs, resolve));
}

describe('MaskingLogExporter', () => {
  it('masks body, attributes, and resource data immediately before export', async () => {
    const sink = new RecordingLogExporter();
    const exporter = new MaskingLogExporter(sink, async (data, context) => {
      expect(context?.signalType).toBe('log');
      return {
        ...data,
        body: { message: '[REDACTED]' },
        attributes: { token: '[REDACTED]' },
        resource: { attributes: { 'service.name': 'example' } },
      };
    });

    expect((await runExport(exporter, [record()])).code).toBe(ExportResultCode.SUCCESS);
    expect(sink.batches[0][0].body).toEqual({ message: '[REDACTED]' });
    expect(sink.batches[0][0].attributes).toEqual({ token: '[REDACTED]' });
    expect(sink.batches[0][0].resource.attributes).toEqual({ 'service.name': 'example' });
  });

  it.each([
    {
      name: 'deletes body',
      mask: (data: Record<string, any>) => {
        delete data.body;
        return data;
      },
    },
    {
      name: 'sets body to undefined',
      mask: (data: Record<string, any>) => ({ ...data, body: undefined }),
    },
    {
      name: 'returns a new object without body',
      mask: (data: Record<string, any>) => ({
        signal_type: data.signal_type,
        attributes: data.attributes,
        resource: data.resource,
      }),
    },
  ])('treats the masked snapshot as authoritative when it $name', async ({ mask }) => {
    const sink = new RecordingLogExporter();
    const exporter = new MaskingLogExporter(sink, mask);

    expect((await runExport(exporter, [record()])).code).toBe(ExportResultCode.SUCCESS);
    expect(sink.batches[0][0].body).toBeUndefined();
  });

  it('fails closed when the mask throws', async () => {
    const sink = new RecordingLogExporter();
    const exporter = new MaskingLogExporter(sink, () => {
      throw new Error('mask failed');
    });

    expect((await runExport(exporter, [record()])).code).toBe(ExportResultCode.SUCCESS);
    expect(sink.batches).toEqual([]);
  });

  it('aborts and drops a mask that exceeds its deadline', async () => {
    vi.useFakeTimers();
    try {
      const sink = new RecordingLogExporter();
      let observedSignal: AbortSignal | undefined;
      const exporter = new MaskingLogExporter(
        sink,
        async (_data, context) => {
          observedSignal = context?.signal;
          await new Promise(() => undefined);
        },
        25,
      );

      const result = runExport(exporter, [record()]);
      await vi.advanceTimersByTimeAsync(25);
      expect((await result).code).toBe(ExportResultCode.SUCCESS);
      expect(observedSignal?.aborted).toBe(true);
      expect(sink.batches).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts a final log export failure even when no mask is configured', async () => {
    const diagnostics = new DeliveryDiagnostics();
    const sink: LogRecordExporter = {
      export(_logs, callback) {
        callback({ code: ExportResultCode.FAILED, error: new Error('receiver unavailable') });
      },
      async shutdown() {},
    };
    const exporter = new MaskingLogExporter(sink, null, undefined, diagnostics);

    expect((await runExport(exporter, [record()])).code).toBe(ExportResultCode.FAILED);
    expect(diagnostics.snapshot().logExportFailures).toBe(1);
  });
});
