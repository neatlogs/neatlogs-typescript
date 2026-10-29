import { createServer, type Server } from "node:http";
import { gunzipSync } from "node:zlib";
import { ROOT_CONTEXT } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPTraceExporter } from "../../src/core/otlp-trace-exporter.js";
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

async function oneSpan(name = "span"): Promise<ReadableSpan> {
  const sink = new InMemorySpanExporter();
  const provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(sink));
  provider
    .getTracer("retry-test")
    .startSpan(name, undefined, ROOT_CONTEXT)
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

describe("acknowledged OTLP export, retry and compression", () => {
  it.each([
    { name: "empty acknowledgement", response: [], code: ExportResultCode.SUCCESS },
    { name: "rejected spans", response: [10, 2, 8, 1], code: ExportResultCode.FAILED },
    { name: "zero rejected spans with warning", response: [10, 5, 8, 0, 18, 1, 119], code: ExportResultCode.SUCCESS },
    { name: "malformed protobuf", response: [10, 127], code: ExportResultCode.FAILED },
    { name: "unknown compatible field", response: [16, 0], code: ExportResultCode.SUCCESS },
    { name: "int64 rejected count above safe integer range", response: [10, 9, 8, 129, 128, 128, 128, 128, 128, 128, 16], code: ExportResultCode.FAILED },
  ])("validates $name", async ({ response: body, code }) => {
    let attempts = 0;
    const port = await listen(createServer((request, response) => {
      attempts += 1;
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "application/x-protobuf" });
        response.end(Buffer.from(body));
      });
    }));
    const exporter = new OTLPTraceExporter({ url: `http://127.0.0.1:${port}/v1/traces` });
    try {
      const result = await exportOnce(exporter, await oneSpan());
      expect(result.code, result.error?.message).toBe(code);
      expect(attempts).toBe(1);
    } finally { await exporter.shutdown(); }
  });

  it("keeps concurrent out-of-order acknowledgements isolated", async () => {
    const port = await listen(createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const rejected = Buffer.concat(chunks).includes(Buffer.from("reject-this-batch"));
        setTimeout(() => {
          response.writeHead(200, { "Content-Type": "application/x-protobuf" });
          response.end(rejected ? Buffer.from([10, 2, 8, 1]) : undefined);
        }, rejected ? 25 : 1);
      });
    }));
    const exporter = new OTLPTraceExporter({ url: `http://127.0.0.1:${port}/v1/traces`, concurrencyLimit: 2 });
    try {
      const [rejected, accepted] = await Promise.all([
        oneSpan("reject-this-batch").then((span) => exportOnce(exporter, span)),
        oneSpan("accept-this-batch").then((span) => exportOnce(exporter, span)),
      ]);
      expect(rejected.code).toBe(ExportResultCode.FAILED);
      expect(accepted.code).toBe(ExportResultCode.SUCCESS);
    } finally { await exporter.shutdown(); }
  });

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

  it.each([false, true])("retries a reset once and preserves the batch (persistent=%s)", async (persistent) => {
    const payloads: Buffer[] = [];
    const port = await listen(createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        payloads.push(Buffer.concat(chunks));
        if (persistent || payloads.length === 1) request.socket.destroy();
        else setTimeout(() => response.end(), 20);
      });
    }));
    const exporter = new OTLPTraceExporter({ url: `http://127.0.0.1:${port}/v1/traces`, timeoutMillis: 500 });
    let settled = false;
    const exported = exportOnce(exporter, await oneSpan("reset-recovery")).then((result) => {
      settled = true;
      return result;
    });
    await (persistent ? exporter.shutdown() : exporter.forceFlush());
    expect(settled).toBe(true);
    expect((await exported).code).toBe(persistent ? ExportResultCode.FAILED : ExportResultCode.SUCCESS);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    await exporter.shutdown();
  });

  it.each(["forceFlush", "shutdown"] as const)("ignores callback-returned %s promises", async (barrier) => {
    const port = await listen(createServer((request, response) => {
      request.resume();
      request.on("end", () => response.end());
    }));
    const exporter = new OTLPTraceExporter({ url: `http://127.0.0.1:${port}/v1/traces` });
    const span = await oneSpan();
    await new Promise<void>((resolve) => {
      exporter.export([span], () => exporter[barrier]().then(resolve));
    });
    await exporter.shutdown();
  }, 2_000);

  it("uses only the remaining deadline for a reset retry", async () => {
    let attempts = 0;
    const port = await listen(createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        attempts += 1;
        if (attempts === 1) setTimeout(() => request.socket.destroy(), 300);
        else setTimeout(() => response.end(), 300);
      });
    }));
    const exporter = new OTLPTraceExporter({ url: `http://127.0.0.1:${port}/v1/traces`, timeoutMillis: 500 });
    expect((await exportOnce(exporter, await oneSpan())).code).toBe(ExportResultCode.FAILED);
    expect(attempts).toBe(2);
    await exporter.shutdown();
  });

  it("does not retry a non-retryable HTTP rejection", async () => {
    let attempts = 0;
    const port = await listen(createServer((request, response) => {
      attempts += 1;
      request.resume();
      request.on("end", () => { response.statusCode = 403; response.end(); });
    }));
    const exporter = new OTLPTraceExporter({ url: `http://127.0.0.1:${port}/v1/traces` });
    expect((await exportOnce(exporter, await oneSpan())).code).toBe(ExportResultCode.FAILED);
    expect(attempts).toBe(1);
    await exporter.shutdown();
  });

  it("does not retry a reset after its original deadline", async () => {
    let attempts = 0;
    const port = await listen(createServer((request) => {
      attempts += 1;
      request.resume();
      request.on("end", () => setTimeout(() => request.socket.destroy(), 35));
    }));
    const exporter = new OTLPTraceExporter({ url: `http://127.0.0.1:${port}/v1/traces`, timeoutMillis: 20 });
    expect((await exportOnce(exporter, await oneSpan())).code).toBe(ExportResultCode.FAILED);
    expect(attempts).toBe(1);
    await exporter.shutdown();
  });

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
