import type { Attributes } from '@opentelemetry/api';
import type { LogAttributes, LogBody, SeverityNumber } from '@opentelemetry/api-logs';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import type { MaskFunction } from '../types.js';
import type { DeliveryDiagnostics } from './delivery-diagnostics.js';
import { applyMask, DEFAULT_MASK_TIMEOUT_MS } from './mask.js';

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function resourceAttributes(value: unknown): Attributes {
  if (!value || typeof value !== 'object') return {};
  const result: Attributes = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      (Array.isArray(item) &&
        item.every(
          (entry) =>
            entry === null ||
            typeof entry === 'string' ||
            typeof entry === 'number' ||
            typeof entry === 'boolean',
        ))
    ) {
      result[key] = item as any;
    } else if (item !== undefined) {
      result[key] = JSON.stringify(item);
    }
  }
  return result;
}

function snapshot(log: ReadableLogRecord): Record<string, any> {
  return {
    signal_type: 'log',
    body: cloneValue(log.body),
    attributes: cloneValue(log.attributes),
    resource: { attributes: cloneValue(log.resource.attributes) },
    severity_text: log.severityText,
    severity_number: log.severityNumber,
    trace_id: log.spanContext?.traceId,
    span_id: log.spanContext?.spanId,
  };
}

function maskedReadableLogRecord(
  log: ReadableLogRecord,
  data: Record<string, any>,
): ReadableLogRecord {
  const resourceData = data.resource?.attributes ?? data.resource;
  return {
    hrTime: log.hrTime,
    hrTimeObserved: log.hrTimeObserved,
    spanContext: log.spanContext,
    severityText:
      typeof data.severity_text === 'string' ? data.severity_text : log.severityText,
    severityNumber:
      typeof data.severity_number === 'number'
        ? (data.severity_number as SeverityNumber)
        : log.severityNumber,
    body: (data.body === undefined ? log.body : data.body) as LogBody,
    resource: new Resource(resourceAttributes(resourceData)),
    instrumentationScope: log.instrumentationScope,
    attributes: (data.attributes && typeof data.attributes === 'object'
      ? data.attributes
      : {}) as LogAttributes,
    droppedAttributesCount: log.droppedAttributesCount,
  };
}

/** Applies the global fail-closed mask to immutable log snapshots at export. */
export class MaskingLogExporter implements LogRecordExporter {
  constructor(
    private readonly delegate: LogRecordExporter,
    private readonly mask: MaskFunction | null | undefined,
    private readonly timeoutMs = DEFAULT_MASK_TIMEOUT_MS,
    private readonly diagnostics?: DeliveryDiagnostics,
  ) {}

  export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
    if (!this.mask) {
      this.delegate.export(logs, (result) => {
        if (result.code !== ExportResultCode.SUCCESS) {
          this.diagnostics?.recordExportFailure('log', logs.length);
        }
        resultCallback(result);
      });
      return;
    }

    void Promise.all(
      logs.map(async (log) => {
        const masked = await applyMask(snapshot(log), this.mask, {
          signalType: 'log',
          timeoutMs: this.timeoutMs,
        });
        if (masked === null) this.diagnostics?.recordMaskedDrop('log');
        return masked === null ? null : maskedReadableLogRecord(log, masked);
      }),
    ).then(
      (prepared) => {
        const retained = prepared.filter((log): log is ReadableLogRecord => log !== null);
        if (retained.length === 0) {
          resultCallback({ code: ExportResultCode.SUCCESS });
          return;
        }
        this.delegate.export(retained, (result) => {
          if (result.code !== ExportResultCode.SUCCESS) {
            this.diagnostics?.recordExportFailure('log', retained.length);
          }
          resultCallback(result);
        });
      },
      (error) => resultCallback({ code: ExportResultCode.FAILED, error }),
    );
  }

  async shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
