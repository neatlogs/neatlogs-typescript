import { TraceFlags } from '@opentelemetry/api';
import {
  BatchSpanProcessor,
  type BufferConfig as SpanBufferConfig,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import {
  BatchLogRecordProcessor,
  type BufferConfig as LogBufferConfig,
  type LogRecord,
  type LogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { DeliveryDiagnostics } from './delivery-diagnostics.js';
import { discardPendingMedia } from './media.js';

interface SpanQueueState {
  _finishedSpans: ReadableSpan[];
  _maxQueueSize: number;
}
interface LogQueueState {
  _finishedLogRecords: LogRecord[];
  _maxQueueSize: number;
}

/** Adds stable Neatlogs loss counters to OTel's bounded span processor. */
export class ObservableBatchSpanProcessor extends BatchSpanProcessor {
  constructor(
    exporter: SpanExporter,
    config: SpanBufferConfig,
    private readonly diagnostics: DeliveryDiagnostics,
  ) {
    super(exporter, config);
  }

  override onEnd(span: ReadableSpan): void {
    const state = this as unknown as SpanQueueState;
    if (
      (span.spanContext().traceFlags & TraceFlags.SAMPLED) !== 0 &&
      state._finishedSpans.length >= state._maxQueueSize
    ) {
      discardPendingMedia(span as object);
      this.diagnostics.recordQueueDrop('span');
    }
    super.onEnd(span);
  }
}

/** Adds stable Neatlogs loss counters to OTel's bounded log processor. */
export class ObservableBatchLogRecordProcessor extends BatchLogRecordProcessor {
  constructor(
    exporter: LogRecordExporter,
    config: LogBufferConfig,
    private readonly diagnostics: DeliveryDiagnostics,
  ) {
    super(exporter, config);
  }

  override onEmit(logRecord: LogRecord): void {
    const state = this as unknown as LogQueueState;
    if (state._finishedLogRecords.length >= state._maxQueueSize) {
      this.diagnostics.recordQueueDrop('log');
    }
    super.onEmit(logRecord);
  }
}
