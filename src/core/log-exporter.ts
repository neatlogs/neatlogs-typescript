/**
 * NeatlogsLogExporter — bridges OTel LogRecord to NeatlogsExporter.
 *
 * Converts OTel log records into span-like dicts and forwards them
 * to the NeatlogsExporter for batch export.
 */

import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter } from '@opentelemetry/sdk-logs';
import { NeatlogsExporter } from './exporter.js';
import { getLogger } from './logger.js';

const logger = getLogger();

export class NeatlogsLogExporter implements LogRecordExporter {
  private exporter: NeatlogsExporter;

  constructor(exporter: NeatlogsExporter) {
    this.exporter = exporter;
  }

  export(
    logRecords: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    try {
      for (const record of logRecords) {
        const spanDict = this._convertLogRecord(record);
        this.exporter.export(spanDict);
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      logger.warn(`Failed to export log records: ${err}`);
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  async shutdown(): Promise<void> {
    // Exporter shutdown is handled separately
  }

  async forceFlush(): Promise<void> {
    await this.exporter.flush();
  }

  private _convertLogRecord(record: ReadableLogRecord): Record<string, any> {
    const attributes: Record<string, any> = { ...(record.attributes ?? {}) };

    // Add body as log.message if present
    if (record.body !== undefined && record.body !== null) {
      attributes['log.message'] = String(record.body);
    }

    return {
      name: attributes['log.template'] ?? 'log',
      kind: 'LOG',
      trace_id: record.spanContext?.traceId ?? '',
      span_id: record.spanContext?.spanId ?? '',
      parent_span_id: '',
      start_time: record.hrTime ? this._hrTimeToIso(record.hrTime) : new Date().toISOString(),
      end_time: record.hrTime ? this._hrTimeToIso(record.hrTime) : new Date().toISOString(),
      status: 'OK',
      attributes,
    };
  }

  private _hrTimeToIso(hrTime: [number, number]): string {
    const ms = hrTime[0] * 1000 + hrTime[1] / 1_000_000;
    return new Date(ms).toISOString();
  }
}
