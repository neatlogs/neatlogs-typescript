import { ROOT_CONTEXT } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { createHash } from "node:crypto";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import type { ResponseInputFile } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import {
  captureMedia,
  mediaReferences,
  setMediaAttributes,
} from "../../src/core/media.js";
import { FilteringExporter } from "../../src/core/filtering-exporter.js";
import { DeliveryDiagnostics } from "../../src/core/delivery-diagnostics.js";
import { scheduleMask } from "../../src/core/mask.js";
import type {
  UploadAuthority,
  UploadPayload,
} from "../../src/core/upload-authority.js";

class RecordingExporter implements SpanExporter {
  readonly batches: ReadableSpan[][] = [];
  export(spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
    this.batches.push([...spans]);
    callback({ code: ExportResultCode.SUCCESS });
  }
  async shutdown(): Promise<void> {}
}

function runExport(exporter: SpanExporter, spans: ReadableSpan[]): Promise<ExportResult> {
  return new Promise((resolve) => exporter.export(spans, resolve));
}

describe("typed media capture", () => {
  it("preserves inline digests and provider references without truncation", async () => {
    const bytes = Buffer.from("full-image-bytes");
    const payload = [
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${bytes.toString("base64")}` },
      },
      {
        type: "input_file",
        file_id: "file-provider-123",
        mime_type: "application/pdf",
      },
    ];
    const records = mediaReferences(payload, "input");
    expect(records[0]).toMatchObject({
      type: "image",
      source: "inline",
      byte_length: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(records[1]).toMatchObject({
      type: "document",
      source: "provider",
      reference: "file-provider-123",
    });

    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(sink));
    const span = provider
      .getTracer("media")
      .startSpan("media", undefined, ROOT_CONTEXT);
    setMediaAttributes(span, "neatlogs.llm.input_messages.0", payload, "input");
    span.end();
    await provider.forceFlush();
    expect(sink.getFinishedSpans()[0].attributes).toMatchObject({
      "neatlogs.llm.input_messages.0.media.0.type": "image",
      "neatlogs.llm.input_messages.0.media.1.reference": "file-provider-123",
    });
  });

  it("does not invent media digests for malformed base64", () => {
    expect(
      mediaReferences(
        [{ type: "image_url", image_url: { url: "data:image/png;base64,not-base64!" } }],
        "input",
      ),
    ).toEqual([]);
  });

  it("recognizes typed OpenAI nested files and Responses file URLs", () => {
    const nestedFile = {
      type: "file",
      file: { file_id: "file-chat-123" },
    } satisfies ChatCompletionContentPart;
    const responseFileURL =
      "https://alice:password@example.com/report.pdf?X-Amz-Credential=secret&X-Amz-Signature=signature#fragment";
    const responseFile = {
      type: "input_file",
      file_url: responseFileURL,
    } satisfies ResponseInputFile;

    expect(mediaReferences(nestedFile, "input")).toEqual([
      expect.objectContaining({
        type: "document",
        source: "provider",
        reference: "file-chat-123",
      }),
    ]);
    expect(mediaReferences(responseFile, "input")).toEqual([
      expect.objectContaining({
        type: "document",
        source: "url",
        reference: "https://example.com/report.pdf",
        id: `nl_media_${createHash("sha256")
          .update(responseFileURL)
          .digest("hex")
          .slice(0, 24)}`,
      }),
    ]);
    expect(JSON.stringify(mediaReferences(responseFile, "input"))).not.toMatch(
      /alice|password|secret|signature|fragment/,
    );
  });

  it("sanitizes protocol-relative and non-HTTP hierarchical URLs", () => {
    const records = mediaReferences(
      [
        {
          type: "input_file",
          file_url:
            "//alice:password@example.com/report.pdf?token=secret#fragment",
        },
        {
          type: "input_file",
          file_url: "s3://alice:password@bucket/report.pdf?token=secret#fragment",
        },
      ],
      "input",
    );

    expect(records).toEqual([
      expect.objectContaining({
        source: "url",
        reference: "//example.com/report.pdf",
      }),
      expect.objectContaining({
        source: "url",
        reference: "s3://bucket/report.pdf",
      }),
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /alice|password|token|secret|fragment/,
    );
  });

  it("recognizes data URL schemes case-insensitively", () => {
    const bytes = Buffer.from("inline-secret");
    const records = mediaReferences(
      {
        type: "image_url",
        image_url: { url: `DATA:image/png;BASE64,${bytes.toString("base64")}` },
      },
      "input",
    );

    expect(records).toEqual([
      expect.objectContaining({
        source: "inline",
        mime_type: "image/png",
        byte_length: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    ]);
    expect(records[0]).not.toHaveProperty("reference");
  });

  it("detects Anthropic, Gemini, Bedrock, and generated-image media shapes", () => {
    const raw = Buffer.from("provider-media");
    const encoded = raw.toString("base64");
    const shapes = [
      {
        value: {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: encoded },
        },
        type: "image",
      },
      {
        value: { inlineData: { mimeType: "application/pdf", data: encoded } },
        type: "document",
      },
      { value: { image: { format: "png", source: { bytes: raw } } }, type: "image" },
      { value: { images: [encoded] }, type: "image" },
    ];

    for (const shape of shapes) {
      expect(mediaReferences(shape.value, "input")).toEqual([
        expect.objectContaining({
          type: shape.type,
          sha256: createHash("sha256").update(raw).digest("hex"),
        }),
      ]);
    }
  });

  it("keeps query-addressed media distinct without exporting query values", () => {
    const records = mediaReferences(
      [
        { type: "input_file", file_url: "https://example.com/media?id=one" },
        { type: "input_file", file_url: "https://example.com/media?id=two" },
      ],
      "input",
    );

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.reference)).toEqual([
      "https://example.com/media",
      "https://example.com/media",
    ]);
    expect(new Set(records.map((record) => record.id)).size).toBe(2);
    expect(JSON.stringify(records)).not.toMatch(/id=(?:one|two)/);
  });

  it("uploads large media after masking and exports only its canonical reference", async () => {
    const raw = Buffer.alloc(120_000, 7);
    const encoded = raw.toString("base64");
    const sink = new RecordingExporter();
    const provider = new BasicTracerProvider();
    let finished: ReadableSpan | undefined;
    provider.addSpanProcessor(
      new SimpleSpanProcessor({
        export(spans, callback) {
          finished = spans[0];
          callback({ code: ExportResultCode.SUCCESS });
        },
        async shutdown() {},
      }),
    );
    const span = provider.getTracer("media").startSpan("media", undefined, ROOT_CONTEXT);
    const safe = captureMedia(
      span,
      "neatlogs.llm.input_messages.0",
      [{ type: "image_url", image_url: { url: `data:image/png;base64,${encoded}` } }],
      "input",
    );
    span.setAttribute("neatlogs.llm.input_messages.0.content", JSON.stringify(safe));
    span.end();
    await provider.forceFlush();
    const attributes = { ...finished!.attributes };
    scheduleMask(
      finished as object,
      { attributes },
      async (data) => ({ ...data, attributes: { ...data.attributes, masked: true } }),
    );
    const uploads: UploadPayload[] = [];
    const authority: UploadAuthority = {
      available: true,
      unavailableReason: "",
      maxPayloadBytes: 1024 * 1024,
      async upload(payload) {
        uploads.push(payload);
        return {
          uploadId: "018f47a6-7f32-7d67-8a1b-42d3f974c012",
          state: "ready",
          reference: {
            id: "018f47a6-7f32-7d67-8a1b-42d3f974c013",
            purpose: payload.purpose,
            sha256: payload.sha256,
            byteLength: payload.byteLength,
            mimeType: payload.mimeType,
            contentEncoding: payload.contentEncoding,
            state: "ready",
          },
        };
      },
    };
    const diagnostics = new DeliveryDiagnostics();
    const exporter = new FilteringExporter(sink, diagnostics, authority);

    expect((await runExport(exporter, [finished!])).code).toBe(ExportResultCode.SUCCESS);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].content).toEqual(raw);
    expect(uploads[0]).toMatchObject({
      purpose: "typed_media",
      mimeType: "image/png",
      payloadSchema: "neatlogs.media.v1",
    });
    expect(sink.batches[0][0].attributes).toMatchObject({
      "masked": true,
      "neatlogs.llm.input_messages.0.media.0.id":
        "018f47a6-7f32-7d67-8a1b-42d3f974c013",
      "neatlogs.llm.input_messages.0.media.0.reference":
        "018f47a6-7f32-7d67-8a1b-42d3f974c013",
      "neatlogs.llm.input_messages.0.media.0.source": "uploaded",
      "neatlogs.llm.input_messages.0.media.0.state": "available",
    });
    const exportedAttributes = JSON.stringify(sink.batches[0][0].attributes);
    expect(exportedAttributes).not.toContain(encoded.slice(0, 100));
    expect(exportedAttributes).not.toContain("pending-upload");
    expect(exportedAttributes).toContain("018f47a6-7f32-7d67-8a1b-42d3f974c013");
    expect(exportedAttributes).not.toMatch(/signature|headers/);
    expect(diagnostics.snapshot().typedMediaUploads).toBe(1);
  });

  it("does not upload media removed by the mask", async () => {
    const raw = Buffer.alloc(120_000, 9);
    const provider = new BasicTracerProvider();
    let finished: ReadableSpan | undefined;
    provider.addSpanProcessor(
      new SimpleSpanProcessor({
        export(spans, callback) {
          finished = spans[0];
          callback({ code: ExportResultCode.SUCCESS });
        },
        async shutdown() {},
      }),
    );
    const span = provider.getTracer("media").startSpan("media", undefined, ROOT_CONTEXT);
    captureMedia(
      span,
      "neatlogs.llm.input_messages.0",
      [{ type: "image_url", image_url: { url: `data:image/png;base64,${raw.toString("base64")}` } }],
      "input",
    );
    span.end();
    await provider.forceFlush();
    scheduleMask(finished as object, { attributes: finished!.attributes }, () => ({
      attributes: {},
    }));
    let uploadCount = 0;
    const authority: UploadAuthority = {
      available: true,
      unavailableReason: "",
      maxPayloadBytes: 1024 * 1024,
      async upload() {
        uploadCount += 1;
        throw new Error("must not upload");
      },
    };
    const sink = new RecordingExporter();
    const exporter = new FilteringExporter(sink, undefined, authority);

    expect((await runExport(exporter, [finished!])).code).toBe(ExportResultCode.SUCCESS);
    expect(uploadCount).toBe(0);
    expect(sink.batches[0][0].attributes).toEqual({});
  });
});
