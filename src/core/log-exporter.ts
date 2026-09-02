/**
 * NeatlogsLogExporter — bridges OTel LogRecord to NeatlogsExporter.
 *
 * Converts OTel log records into span-like dicts and forwards them
 * to the NeatlogsExporter for batch export.
 *
 * Also supports NEATLOGS_LOG_LOGS / NEATLOGS_LOG_LOGS_FILE env vars
 * for writing log records to a local file (mirrors Python SDK behavior).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter } from '@opentelemetry/sdk-logs';
import { NeatlogsExporter } from './exporter.js';
import { getLogger } from './logger.js';

const logger = getLogger();

export class NeatlogsLogExporter implements LogRecordExporter {
  private exporter: NeatlogsExporter;
  private logFileHandle: number | null = null;
  private logEnabled: boolean;

  constructor(exporter: NeatlogsExporter) {
    this.exporter = exporter;

    this.logEnabled = ['1', 'true', 'yes'].includes(
      (process.env.NEATLOGS_LOG_LOGS ?? '').toLowerCase(),
    );
    const logFile = process.env.NEATLOGS_LOG_LOGS_FILE ?? '';

    if (this.logEnabled && logFile) {
      const filePath = path.resolve(process.cwd(), logFile);
      try {
        this.logFileHandle = fs.openSync(filePath, 'a');
        logger.info(`Log record logging enabled: ${filePath}`);
      } catch (err) {
        logger.warn(`Failed to open log file ${filePath}: ${err}`);
      }
    }
  }

  export(
    logRecords: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    try {
      for (const record of logRecords) {
        const spanDict = this._convertLogRecord(record);
        this.exporter.export(spanDict);
        this._writeToFile(record, spanDict);
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      logger.warn(`Failed to export log records: ${err}`);
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  async shutdown(): Promise<void> {
    if (this.logFileHandle !== null) {
      fs.closeSync(this.logFileHandle);
      this.logFileHandle = null;
    }
  }

  async forceFlush(): Promise<void> {
    await this.exporter.flush();
  }

  private _writeToFile(record: ReadableLogRecord, spanDict: Record<string, any>): void {
    if (!this.logEnabled || this.logFileHandle === null) return;

    const entry: Record<string, any> = {
      trace_id: spanDict.trace_id || '',
      span_id: spanDict.span_id || '',
      body: spanDict.attributes?.['log.message'] ?? '',
      severity: record.severityText ?? '',
      template: spanDict.attributes?.['log.template'] ?? '',
      timestamp: spanDict.start_time,
    };

    fs.writeSync(this.logFileHandle, JSON.stringify(entry) + '\n');
  }

  private _convertLogRecord(record: ReadableLogRecord): Record<string, any> {
    const attributes: Record<string, any> = { ...(record.attributes ?? {}) };

    if (record.body !== undefined && record.body !== null) {
      attributes['log.message'] = String(record.body);
    }

    attributes['openinference.span.kind'] = 'LOG';
    attributes['neatlogs.span.kind'] = 'log';

    return {
      name: attributes['log.template'] ?? 'log',
      kind: 'LOG',
      trace_id: record.spanContext?.traceId ?? '',
      span_id: crypto.randomBytes(8).toString('hex'),
      parent_span_id: record.spanContext?.spanId ?? '',
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
