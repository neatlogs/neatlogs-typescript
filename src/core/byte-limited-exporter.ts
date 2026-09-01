import { createHash } from "node:crypto";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { ProtobufTraceSerializer } from "@opentelemetry/otlp-transformer";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { DeliveryDiagnostics } from "./delivery-diagnostics.js";
import { getLogger } from "./logger.js";
import {
  assertReadyUploadReceipt,
  DisabledUploadAuthority,
  DEFAULT_MAX_OTLP_OVERFLOW_BYTES,
  TelemetryUploadError,
  type UploadAuthority,
  type UploadPayload,
} from "./upload-authority.js";

export const DEFAULT_MAX_EXPORT_BYTES = 4 * 1024 * 1024;

const logger = getLogger();

type ExportAction =
  | { type: "batch"; spans: ReadableSpan[] }
  | { type: "overflow"; span: ReadableSpan };

/** Split batches by encoded size and route a single oversized span by claim-check. */
export class ByteLimitedSpanExporter implements SpanExporter {
  constructor(
    private readonly delegate: SpanExporter,
    private readonly maxExportBytes = DEFAULT_MAX_EXPORT_BYTES,
    private readonly diagnostics?: DeliveryDiagnostics,
    private readonly uploadAuthority: UploadAuthority = new DisabledUploadAuthority(),
  ) {
    if (!Number.isSafeInteger(maxExportBytes) || maxExportBytes <= 0) {
      throw new RangeError("maxExportBytes must be a positive safe integer");
    }
    diagnostics?.configureUploadAuthority(
      uploadAuthority.available,
      uploadAuthority.unavailableReason,
    );
  }

  static encoded(span: ReadableSpan): Uint8Array {
    const encoded = ProtobufTraceSerializer.serializeRequest([span]);
    if (!encoded) throw new Error("failed to encode OTLP trace request");
    return encoded;
  }

  static encodedUpperBound(span: ReadableSpan): number {
    return ProtobufTraceSerializer.serializeRequest([span])?.byteLength ?? Number.MAX_SAFE_INTEGER;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    let actions: ExportAction[];
    try {
      actions = this.actions(spans);
    } catch (error) {
      this.diagnostics?.recordExportFailure("span", spans.length);
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return;
    }
    void this.exportSequentially(actions).then(resultCallback, (error) => {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }

  private actions(spans: ReadableSpan[]): ExportAction[] {
    const actions: ExportAction[] = [];
    let current: ReadableSpan[] = [];
    let currentBytes = 0;
    for (const span of spans) {
      // Classify one span at a time. Do not retain every oversized encoded
      // request in the action list: a full batch may contain many large spans.
      const spanBytes = ByteLimitedSpanExporter.encodedUpperBound(span);
      if (spanBytes > this.maxExportBytes) {
        if (current.length > 0) actions.push({ type: "batch", spans: current });
        current = [];
        currentBytes = 0;
        actions.push({
          type: "overflow",
          span,
        });
        continue;
      }
      if (current.length > 0 && currentBytes + spanBytes > this.maxExportBytes) {
        actions.push({ type: "batch", spans: current });
        current = [];
        currentBytes = 0;
      }
      current.push(span);
      currentBytes += spanBytes;
    }
    if (current.length > 0) actions.push({ type: "batch", spans: current });
    return actions;
  }

  private async exportSequentially(actions: ExportAction[]): Promise<ExportResult> {
    let overflowFailed = false;
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      if (action.type === "overflow") {
        const success = await this.exportOverflow(
          ByteLimitedSpanExporter.encoded(action.span),
        );
        if (!success) overflowFailed = true;
        continue;
      }
      let result: ExportResult;
      try {
        result = await new Promise<ExportResult>((resolve) => {
          this.delegate.export(action.spans, resolve);
        });
      } catch (error) {
        this.recordUnsent(actions, index);
        throw error;
      }
      if (result.code !== ExportResultCode.SUCCESS) {
        this.recordUnsent(actions, index);
        return result;
      }
    }
    return {
      code: overflowFailed ? ExportResultCode.FAILED : ExportResultCode.SUCCESS,
      ...(overflowFailed
        ? { error: new Error("one or more oversized spans failed authenticated upload") }
        : {}),
    };
  }

  private async exportOverflow(content: Uint8Array): Promise<boolean> {
    if (!this.uploadAuthority.available) {
      const unavailableReason = /^[a-zA-Z0-9_.-]{1,64}$/.test(
        this.uploadAuthority.unavailableReason,
      )
        ? this.uploadAuthority.unavailableReason
        : "upload_authority_unavailable";
      this.diagnostics?.recordOverflow("span", "unavailable");
      this.diagnostics?.recordOverflow("span", "failures");
      this.diagnostics?.recordExportFailure("span", 1);
      this.diagnostics?.recordUploadFailure("prepare", unavailableReason);
      logger.error(
        `oversized span rejected: bytes=${content.byteLength} limit=${this.maxExportBytes} reason=${unavailableReason}`,
      );
      return false;
    }
    const uploadLimit = Math.min(
      this.uploadAuthority.maxPayloadBytes,
      DEFAULT_MAX_OTLP_OVERFLOW_BYTES,
    );
    if (content.byteLength > uploadLimit) {
      this.diagnostics?.recordOverflow("span", "failures");
      this.diagnostics?.recordExportFailure("span", 1);
      this.diagnostics?.recordUploadFailure("validate", "payload_too_large");
      logger.error(
        `oversized span upload rejected locally: bytes=${content.byteLength} upload_limit=${uploadLimit}`,
      );
      return false;
    }
    const sha256 = createHash("sha256").update(content).digest("hex");
    const payload: UploadPayload = {
      content,
      purpose: "otlp_overflow",
      sha256,
      byteLength: content.byteLength,
      mimeType: "application/x-protobuf",
      contentEncoding: "identity",
      idempotencyKey: `nl-ts-v1:otlp_overflow:${sha256}`,
      payloadSchema: "otlp.traces.v1",
    };
    try {
      assertReadyUploadReceipt(await this.uploadAuthority.upload(payload), payload);
      this.diagnostics?.recordOverflow("span", "uploads");
      return true;
    } catch (error) {
      const stage = error instanceof TelemetryUploadError ? error.stage : "upload";
      const rawReason =
        error instanceof TelemetryUploadError ? error.reasonCode : "unexpected_error";
      const reason = /^[a-zA-Z0-9_.-]{1,64}$/.test(rawReason)
        ? rawReason
        : "unsafe_reason_code";
      this.diagnostics?.recordOverflow("span", "failures");
      this.diagnostics?.recordExportFailure("span", 1);
      this.diagnostics?.recordUploadFailure(stage, reason);
      logger.error(`oversized span upload failed: ${stage}/${reason}`);
      return false;
    }
  }

  private recordUnsent(actions: ExportAction[], failedIndex: number): void {
    const count = actions.slice(failedIndex).reduce(
      (total, action) => total + (action.type === "batch" ? action.spans.length : 1),
      0,
    );
    this.diagnostics?.recordExportFailure("span", count);
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush?.();
  }
}
