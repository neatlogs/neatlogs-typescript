export type DeliverySignal = 'span' | 'log';

export interface DeliveryDiagnosticsSnapshot {
  spanQueueDrops: number;
  logQueueDrops: number;
  spanExportFailures: number;
  logExportFailures: number;
  frameworkSpanDrops: number;
  maskedSpanDrops: number;
  maskedLogDrops: number;
}

/** Per-pipeline loss counters retained for launch diagnostics and doctor. */
export class DeliveryDiagnostics {
  private readonly counters: DeliveryDiagnosticsSnapshot = {
    spanQueueDrops: 0,
    logQueueDrops: 0,
    spanExportFailures: 0,
    logExportFailures: 0,
    frameworkSpanDrops: 0,
    maskedSpanDrops: 0,
    maskedLogDrops: 0,
  };

  recordQueueDrop(signal: DeliverySignal, count = 1): void {
    if (signal === 'span') this.counters.spanQueueDrops += count;
    else this.counters.logQueueDrops += count;
  }

  recordExportFailure(signal: DeliverySignal, count: number): void {
    if (signal === 'span') this.counters.spanExportFailures += count;
    else this.counters.logExportFailures += count;
  }

  recordMaskedDrop(signal: DeliverySignal, count = 1): void {
    if (signal === 'span') this.counters.maskedSpanDrops += count;
    else this.counters.maskedLogDrops += count;
  }

  recordFrameworkSpanDrop(count = 1): void {
    this.counters.frameworkSpanDrops += count;
  }

  snapshot(): DeliveryDiagnosticsSnapshot {
    return { ...this.counters };
  }
}
