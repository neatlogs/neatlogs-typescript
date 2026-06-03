import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NeatlogsLogExporter } from '../../src/core/log-exporter.js';
import { NeatlogsExporter } from '../../src/core/exporter.js';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';

describe('NeatlogsLogExporter', () => {
  let mockExporter: NeatlogsExporter;
  let exportSpy: ReturnType<typeof vi.fn>;
  let flushSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    exportSpy = vi.fn();
    flushSpy = vi.fn().mockResolvedValue(undefined);
    mockExporter = {
      export: exportSpy,
      flush: flushSpy,
    } as unknown as NeatlogsExporter;
  });

  function makeLogRecord(overrides: Partial<ReadableLogRecord> = {}): ReadableLogRecord {
    return {
      hrTime: [1700000000, 0] as [number, number],
      hrTimeObserved: [1700000000, 0] as [number, number],
      spanContext: {
        traceId: 'abc123',
        spanId: 'def456',
        traceFlags: 1,
      },
      severityText: 'INFO',
      severityNumber: 9,
      body: 'Test message',
      resource: {
        attributes: {},
        merge: vi.fn() as any,
      } as any,
      instrumentationScope: { name: 'test', version: '1.0.0' },
      attributes: {
        'log.template': 'Test {key}',
        'log.key': 'value',
      },
      droppedAttributesCount: 0,
      ...overrides,
    } as ReadableLogRecord;
  }

  it('should convert log records and forward to exporter', () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const record = makeLogRecord();
    const callback = vi.fn();

    logExporter.export([record], callback);

    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });

    const spanDict = exportSpy.mock.calls[0][0];
    expect(spanDict.name).toBe('Test {key}');
    expect(spanDict.kind).toBe('LOG');
    expect(spanDict.trace_id).toBe('abc123');
    // span_id is freshly generated to avoid colliding with the originating
    // span; the originating span's id is preserved as parent_span_id.
    expect(spanDict.span_id).toMatch(/^[0-9a-f]{16}$/);
    expect(spanDict.span_id).not.toBe('def456');
    expect(spanDict.parent_span_id).toBe('def456');
    expect(spanDict.status).toBe('OK');
    expect(spanDict.attributes['log.template']).toBe('Test {key}');
    expect(spanDict.attributes['log.key']).toBe('value');
    expect(spanDict.attributes['log.message']).toBe('Test message');
  });

  it('should handle multiple log records in a batch', () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const records = [
      makeLogRecord({ body: 'msg1' }),
      makeLogRecord({ body: 'msg2' }),
      makeLogRecord({ body: 'msg3' }),
    ];
    const callback = vi.fn();

    logExporter.export(records, callback);

    expect(exportSpy).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('should use "log" as default name when no log.template attribute', () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const record = makeLogRecord({ attributes: {} });
    const callback = vi.fn();

    logExporter.export([record], callback);

    const spanDict = exportSpy.mock.calls[0][0];
    expect(spanDict.name).toBe('log');
  });

  it('should handle record with no body', () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const record = makeLogRecord({ body: undefined });
    const callback = vi.fn();

    logExporter.export([record], callback);

    const spanDict = exportSpy.mock.calls[0][0];
    expect(spanDict.attributes['log.message']).toBeUndefined();
  });

  it('should handle record with null body', () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const record = makeLogRecord({ body: null as any });
    const callback = vi.fn();

    logExporter.export([record], callback);

    const spanDict = exportSpy.mock.calls[0][0];
    expect(spanDict.attributes['log.message']).toBeUndefined();
  });

  it('should use empty string for missing spanContext fields', () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const record = makeLogRecord({ spanContext: undefined });
    const callback = vi.fn();

    logExporter.export([record], callback);

    const spanDict = exportSpy.mock.calls[0][0];
    expect(spanDict.trace_id).toBe('');
    // span_id is always freshly generated; parent_span_id falls back to ''
    // when spanContext (and thus the originating spanId) is missing.
    expect(spanDict.span_id).toMatch(/^[0-9a-f]{16}$/);
    expect(spanDict.parent_span_id).toBe('');
  });

  it('should convert hrTime to ISO string', () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const record = makeLogRecord({
      hrTime: [1700000000, 500_000_000] as [number, number],
    });
    const callback = vi.fn();

    logExporter.export([record], callback);

    const spanDict = exportSpy.mock.calls[0][0];
    // 1700000000 * 1000 + 500_000_000 / 1_000_000 = 1700000000500
    const expectedDate = new Date(1700000000500).toISOString();
    expect(spanDict.start_time).toBe(expectedDate);
    expect(spanDict.end_time).toBe(expectedDate);
  });

  it('should return FAILED when exporter throws', () => {
    exportSpy.mockImplementation(() => {
      throw new Error('Export failure');
    });
    const logExporter = new NeatlogsLogExporter(mockExporter);
    const record = makeLogRecord();
    const callback = vi.fn();

    logExporter.export([record], callback);

    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.FAILED });
  });

  it('should delegate forceFlush to exporter.flush', async () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    await logExporter.forceFlush();
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('should resolve shutdown without error', async () => {
    const logExporter = new NeatlogsLogExporter(mockExporter);
    await expect(logExporter.shutdown()).resolves.toBeUndefined();
  });
});
