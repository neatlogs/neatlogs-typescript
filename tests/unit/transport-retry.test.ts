import { createServer, type Server } from "node:http";
import { gunzipSync } from "node:zlib";
import { ROOT_CONTEXT } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { CompressionAlgorithm } from "@opentelemetry/otlp-exporter-base";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, describe, expect, it } from "vitest";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function oneSpan(): Promise<ReadableSpan> {
  const sink = new InMemorySpanExporter();
  const provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(sink));
  provider
    .getTracer("retry-test")
    .startSpan("span", undefined, ROOT_CONTEXT)
    .end();
  await provider.forceFlush();
  return sink.getFinishedSpans()[0];
}

function exportOnce(
  exporter: SpanExporter,
  span: ReadableSpan,
): Promise<ExportResult> {
  return new Promise((resolve) => exporter.export([span], resolve));
}

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
}

describe("upstream OTLP retry and compression", () => {
  it.each([429, 503])(
    "retries transient HTTP %s and sends receiver-compatible gzip",
    async (status) => {
      let attempts = 0;
      const decoded: Buffer[] = [];
      const server = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        request.on("end", () => {
          attempts += 1;
          expect(request.headers["content-encoding"]).toBe("gzip");
          decoded.push(gunzipSync(Buffer.concat(chunks)));
          response.statusCode = attempts === 1 ? status : 200;
          response.setHeader("Retry-After", "0");
          response.end();
        });
      });
      const port = await listen(server);
      const exporter = new OTLPTraceExporter({
        url: `http://127.0.0.1:${port}/v1/traces`,
        compression: CompressionAlgorithm.GZIP,
        timeoutMillis: 2_000,
      });

      expect((await exportOnce(exporter, await oneSpan())).code).toBe(
        ExportResultCode.SUCCESS,
      );
      expect(attempts).toBe(2);
      expect(decoded.every((payload) => payload.byteLength > 0)).toBe(true);
      await exporter.shutdown();
    },
  );

  it("bounds a receiver timeout and rejects work after shutdown", async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => response.end(), 100);
    });
    const port = await listen(server);
    const exporter = new OTLPTraceExporter({
      url: `http://127.0.0.1:${port}/v1/traces`,
      timeoutMillis: 20,
    });
    const span = await oneSpan();

    expect((await exportOnce(exporter, span)).code).toBe(
      ExportResultCode.FAILED,
    );
    await exporter.shutdown();
    expect((await exportOnce(exporter, span)).code).toBe(
      ExportResultCode.FAILED,
    );
  });
});
