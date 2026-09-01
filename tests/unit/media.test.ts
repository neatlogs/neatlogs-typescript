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
    const responseFile = {
      type: "input_file",
      file_url: "https://example.com/report.pdf",
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
      }),
    ]);
  });
});
