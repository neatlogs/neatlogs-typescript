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
import { mediaReferences, setMediaAttributes } from "../../src/core/media.js";

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
});
