export type DeliverySignal = 'span' | 'log';

export interface DeliveryDiagnosticsSnapshot {
  spanQueueDrops: number;
  logQueueDrops: number;
  spanExportFailures: number;
  logExportFailures: number;
  frameworkSpanDrops: number;
  maskedSpanDrops: number;
  maskedLogDrops: number;
  typedMediaUploads: number;
  typedMediaFailures: number;
  typedMediaUnavailable: number;
  spanOverflowUploads: number;
  spanOverflowFailures: number;
  spanOverflowUnavailable: number;
  logOverflowUploads: number;
  logOverflowFailures: number;
  logOverflowUnavailable: number;
  uploadAuthorityAvailable: boolean;
  uploadAuthorityReason: string;
  lastUploadFailureStage?: string;
  lastUploadFailureReason?: string;
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
    typedMediaUploads: 0,
    typedMediaFailures: 0,
    typedMediaUnavailable: 0,
    spanOverflowUploads: 0,
    spanOverflowFailures: 0,
    spanOverflowUnavailable: 0,
    logOverflowUploads: 0,
    logOverflowFailures: 0,
    logOverflowUnavailable: 0,
    uploadAuthorityAvailable: false,
    uploadAuthorityReason: "telemetry_uploads_disabled",
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

  configureUploadAuthority(available: boolean, reason: string): void {
    this.counters.uploadAuthorityAvailable = available;
    this.counters.uploadAuthorityReason =
      available && reason.length === 0
        ? ""
        : /^[a-zA-Z0-9_.-]{1,64}$/.test(reason)
          ? reason
          : "upload_authority_unavailable";
  }

  recordTypedMedia(outcome: "uploads" | "failures" | "unavailable", count = 1): void {
    if (outcome === "uploads") this.counters.typedMediaUploads += count;
    else if (outcome === "failures") this.counters.typedMediaFailures += count;
    else this.counters.typedMediaUnavailable += count;
  }

  recordOverflow(
    signal: DeliverySignal,
    outcome: "uploads" | "failures" | "unavailable",
    count = 1,
  ): void {
    const prefix = signal === "span" ? "spanOverflow" : "logOverflow";
    const suffix =
      outcome === "uploads"
        ? "Uploads"
        : outcome === "failures"
          ? "Failures"
          : "Unavailable";
    const key = `${prefix}${suffix}` as keyof DeliveryDiagnosticsSnapshot;
    (this.counters[key] as number) += count;
  }

  recordUploadFailure(stage: string, reason: string): void {
    this.counters.lastUploadFailureStage = /^[a-zA-Z0-9_.-]{1,64}$/.test(stage)
      ? stage
      : "upload";
    this.counters.lastUploadFailureReason = /^[a-zA-Z0-9_.-]{1,64}$/.test(reason)
      ? reason
      : "unsafe_reason_code";
  }

  snapshot(): DeliveryDiagnosticsSnapshot {
    return { ...this.counters };
  }
}
