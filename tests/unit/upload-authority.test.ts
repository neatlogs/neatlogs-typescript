import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_OTLP_OVERFLOW_BYTES,
  HttpUploadAuthority,
  TelemetryUploadError,
  uploadsEnabledFromEnv,
  type UploadPayload,
} from "../../src/core/upload-authority.js";

const uploadId = "018f47a6-7f32-7d67-8a1b-42d3f974c012";
const referenceId = uploadId;
const mismatchedReferenceId = "018f47a6-7f32-7d67-8a1b-42d3f974c013";

function payload(): UploadPayload {
  const content = new TextEncoder().encode("masked protobuf bytes");
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    content,
    purpose: "otlp_overflow",
    sha256,
    byteLength: content.byteLength,
    mimeType: "application/x-protobuf",
    contentEncoding: "identity",
    idempotencyKey: `nl-ts-v1:otlp_overflow:${sha256}`,
    payloadSchema: "otlp.traces.v1",
  };
}

function wireReference(
  item: UploadPayload,
  state: "prepared" | "uploaded" | "validating" | "rejected" | "ready",
) {
  return {
    id: referenceId,
    purpose: item.purpose,
    sha256: item.sha256,
    byte_length: item.byteLength,
    mime_type: item.mimeType,
    content_encoding: item.contentEncoding,
    state,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpUploadAuthority", () => {
  it("uses API-key auth only for prepare/complete and returns only a stable reference", async () => {
    const item = payload();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (calls.length === 1) {
        return json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          ignored_future_field: true,
          upload: {
            method: "PUT",
            url: "https://objects.example.test/private?signature=never-export",
            headers: { "x-object-token": "object-secret" },
          },
          reference: wireReference(item, "prepared"),
        });
      }
      if (calls.length === 2) return new Response(null, { status: 200 });
      return json(202, {
        upload_id: uploadId,
        state: "ready",
        reference: wireReference(item, "ready"),
      });
    });
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test/v1/traces",
      apiKey: "project-secret",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 1,
    });

    const receipt = await authority.upload(item);

    expect(calls.map((call) => call.url)).toEqual([
      "https://ingest.example.test/v1/telemetry/uploads",
      "https://objects.example.test/private?signature=never-export",
      `https://ingest.example.test/v1/telemetry/uploads/${uploadId}/complete`,
    ]);
    expect(calls[0].init?.headers).toMatchObject({
      "x-api-key": "project-secret",
    });
    expect(calls[1].init?.headers).toEqual({
      "x-object-token": "object-secret",
    });
    expect(calls[2].init?.headers).toMatchObject({
      "x-api-key": "project-secret",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      version: 1,
      purpose: "otlp_overflow",
      sha256: item.sha256,
      byte_length: item.byteLength,
      mime_type: "application/x-protobuf",
      content_encoding: "identity",
      idempotency_key: item.idempotencyKey,
      payload_schema: "otlp.traces.v1",
    });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      sha256: item.sha256,
      byte_length: item.byteLength,
    });
    expect(receipt).toEqual({
      uploadId,
      state: "ready",
      reference: {
        id: referenceId,
        purpose: "otlp_overflow",
        sha256: item.sha256,
        byteLength: item.byteLength,
        mimeType: "application/x-protobuf",
        contentEncoding: "identity",
        state: "ready",
      },
    });
    expect(JSON.stringify(receipt)).not.toMatch(
      /signature|object-secret|project-secret|url|headers/,
    );
  });

  it("rejects a reference whose id is not the response upload id", async () => {
    const item = payload();
    const fetch = vi.fn().mockResolvedValue(
      json(200, {
        upload_id: uploadId,
        state: "ready",
        reference: {
          ...wireReference(item, "ready"),
          id: mismatchedReferenceId,
        },
      }),
    );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 1,
    });

    await expect(authority.upload(item)).rejects.toMatchObject({
      stage: "prepare",
      reasonCode: "reference_mismatch",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a claimed digest that does not match the bytes before prepare", async () => {
    const item = { ...payload(), sha256: "0".repeat(64) };
    const fetch = vi.fn();
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(authority.upload(item)).rejects.toMatchObject({
      stage: "validate",
      reasonCode: "invalid_sha256",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["authorization", "cookie", "proxy-authorization", "x-api-key"])(
    "rejects credential-bearing signed PUT header %s",
    async (header) => {
      const item = payload();
      const fetch = vi.fn().mockResolvedValue(
        json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          upload: {
            method: "PUT",
            url: "https://objects.example.test/object",
            headers: { [header]: "secret" },
          },
          reference: wireReference(item, "prepared"),
        }),
      );
      const authority = new HttpUploadAuthority({
        baseUrl: "https://ingest.example.test",
        apiKey: "key",
        fetch: fetch as typeof globalThis.fetch,
        maxAttempts: 1,
      });

      await expect(authority.upload(item)).rejects.toMatchObject({
        stage: "prepare",
        reasonCode: "invalid_upload_headers",
        retryable: false,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("cancels an otherwise unused successful PUT response body", async () => {
    const item = payload();
    let putBodyCancelled = false;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          upload: {
            method: "PUT",
            url: "https://objects.example.test/object",
            headers: {},
          },
          reference: wireReference(item, "prepared"),
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            cancel() {
              putBodyCancelled = true;
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        json(200, {
          upload_id: uploadId,
          state: "ready",
          reference: wireReference(item, "ready"),
        }),
      );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 1,
    });

    await expect(authority.upload(item)).resolves.toMatchObject({
      state: "ready",
    });
    expect(putBodyCancelled).toBe(true);
  });

  it("retries bounded transient failures with the same idempotency key", async () => {
    const item = payload();
    let prepares = 0;
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST" && prepares++ === 0) {
        throw new Error("temporary network failure containing https://secret.invalid");
      }
      if (prepares === 2 && init?.method === "POST") {
        return json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          upload: {
            method: "PUT",
            url: "https://objects.example.test/object",
            headers: {},
          },
          reference: wireReference(item, "prepared"),
        });
      }
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      return json(200, {
        upload_id: uploadId,
        state: "ready",
        reference: wireReference(item, "ready"),
      });
    });
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 2,
      deadlineMs: 2_000,
    });

    await expect(authority.upload(item)).resolves.toMatchObject({
      state: "ready",
    });
    const prepareBodies = fetch.mock.calls
      .filter(
        ([, init]) => init?.method === "POST" && String(init.body).includes("idempotency_key"),
      )
      .map(([, init]) => JSON.parse(String(init?.body)).idempotency_key);
    expect(prepareBodies).toEqual([item.idempotencyKey, item.idempotencyKey]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("accepts an idempotent ready prepare response without another PUT or complete", async () => {
    const item = payload();
    const fetch = vi.fn().mockResolvedValue(
      json(200, {
        upload_id: uploadId,
        state: "ready",
        reference: wireReference(item, "ready"),
        ignored_future_field: "allowed",
      }),
    );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 1,
    });

    await expect(authority.upload(item)).resolves.toMatchObject({
      uploadId,
      state: "ready",
      reference: { id: referenceId, state: "ready" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["uploaded", "validating"])(
    "resumes a prepare response in %s through complete without another PUT",
    async (state) => {
      const item = payload();
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          json(state === "validating" ? 202 : 200, {
            upload_id: uploadId,
            state,
            reference: wireReference(item, state as "uploaded" | "validating"),
            diagnostic: {
              stage: "validation",
              reason_code: "validation_pending",
              retryable: true,
            },
          }),
        )
        .mockResolvedValueOnce(
          json(200, {
            upload_id: uploadId,
            state: "ready",
            reference: wireReference(item, "ready"),
          }),
        );
      const authority = new HttpUploadAuthority({
        baseUrl: "https://ingest.example.test",
        apiKey: "key",
        fetch: fetch as typeof globalThis.fetch,
        maxAttempts: 1,
      });

      await expect(authority.upload(item)).resolves.toMatchObject({
        state: "ready",
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(String(fetch.mock.calls[1][0])).toBe(
        `https://ingest.example.test/v1/telemetry/uploads/${uploadId}/complete`,
      );
      expect(fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    },
  );

  it("retries complete, not prepare, while a resumed upload is validating", async () => {
    const item = payload();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(202, {
          upload_id: uploadId,
          state: "validating",
          reference: { ...wireReference(item, "ready"), state: "validating" },
          diagnostic: {
            stage: "validation",
            reason_code: "validation_pending",
            retryable: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        json(202, {
          upload_id: uploadId,
          state: "validating",
          reference: wireReference(item, "validating"),
          diagnostic: {
            stage: "validation",
            reason_code: "validation_pending",
            retryable: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          upload_id: uploadId,
          state: "ready",
          reference: wireReference(item, "ready"),
        }),
      );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 2,
      deadlineMs: 2_000,
    });

    await expect(authority.upload(item)).resolves.toMatchObject({
      state: "ready",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.every(([, init]) => init?.method === "POST")).toBe(true);
    expect(String(fetch.mock.calls[1][0])).toContain(`/${uploadId}/complete`);
    expect(String(fetch.mock.calls[2][0])).toContain(`/${uploadId}/complete`);
  });

  it("rejects validating completion until the backend returns ready", async () => {
    const item = payload();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          upload: {
            method: "PUT",
            url: "https://objects.example.test/object",
            headers: {},
          },
          reference: wireReference(item, "prepared"),
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        json(202, {
          upload_id: uploadId,
          state: "validating",
          reference: { ...wireReference(item, "ready"), state: "validating" },
          diagnostic: {
            stage: "scanner",
            reason_code: "scan_pending",
            retryable: true,
          },
        }),
      );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 1,
    });

    await expect(authority.upload(item)).rejects.toMatchObject<TelemetryUploadError>({
      stage: "complete",
      reasonCode: "scan_pending",
      retryable: true,
    });
  });

  it("treats validating completion as retryable when diagnostic is omitted", async () => {
    const item = payload();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          upload: {
            method: "PUT",
            url: "https://objects.example.test/object",
            headers: {},
          },
          reference: wireReference(item, "prepared"),
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        json(202, {
          upload_id: uploadId,
          state: "validating",
          reference: { ...wireReference(item, "ready"), state: "validating" },
        }),
      );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 1,
    });

    await expect(authority.upload(item)).rejects.toMatchObject({
      stage: "complete",
      reasonCode: "validation_pending",
      retryable: true,
    });
  });

  it("retries a retryable validating completion and succeeds only once ready", async () => {
    const item = payload();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          upload: {
            method: "PUT",
            url: "https://objects.example.test/object",
            headers: {},
          },
          reference: wireReference(item, "prepared"),
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        json(202, {
          upload_id: uploadId,
          state: "validating",
          reference: { ...wireReference(item, "ready"), state: "validating" },
          diagnostic: {
            stage: "validation",
            reason_code: "scan_pending",
            retryable: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          upload_id: uploadId,
          state: "ready",
          reference: wireReference(item, "ready"),
        }),
      );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 2,
      deadlineMs: 2_000,
    });

    await expect(authority.upload(item)).resolves.toMatchObject({
      state: "ready",
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("retries an uploaded completion response without repeating the PUT", async () => {
    const item = payload();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(201, {
          upload_id: uploadId,
          state: "prepared",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          upload: {
            method: "PUT",
            url: "https://objects.example.test/object",
            headers: {},
          },
          reference: wireReference(item, "prepared"),
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        json(202, {
          upload_id: uploadId,
          state: "uploaded",
          reference: wireReference(item, "uploaded"),
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          upload_id: uploadId,
          state: "ready",
          reference: wireReference(item, "ready"),
        }),
      );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 2,
      deadlineMs: 2_000,
    });

    await expect(authority.upload(item)).resolves.toMatchObject({
      state: "ready",
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });

  it("preserves a safe backend reason code and retryability on errors", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json(409, {
        error: "idempotency collision",
        reason_code: "IDEMPOTENCY_KEY_COLLISION",
        retryable: false,
        ignored_future_field: "allowed",
      }),
    );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 2,
    });

    await expect(authority.upload(payload())).rejects.toMatchObject({
      stage: "prepare",
      reasonCode: "IDEMPOTENCY_KEY_COLLISION",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit non-retryable backend diagnostic on a retryable status", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json(503, {
        reason_code: "DO_NOT_RETRY",
        retryable: false,
      }),
    );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 2,
    });

    await expect(authority.upload(payload())).rejects.toMatchObject({
      stage: "prepare",
      reasonCode: "DO_NOT_RETRY",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects backend-incompatible typed media MIME locally", async () => {
    const content = new TextEncoder().encode("video bytes");
    const fetch = vi.fn();
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(
      authority.upload({
        content,
        purpose: "typed_media",
        sha256: createHash("sha256").update(content).digest("hex"),
        byteLength: content.byteLength,
        mimeType: "video/mp4",
        contentEncoding: "identity",
        idempotencyKey: "typed-media-video",
        payloadSchema: "neatlogs.media.v1",
      }),
    ).rejects.toMatchObject({
      stage: "validate",
      reasonCode: "unsupported_mime_type",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("strictly validates required echoed reference fields", async () => {
    const item = payload();
    const fetch = vi.fn().mockResolvedValue(
      json(201, {
        upload_id: uploadId,
        state: "prepared",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        upload: {
          method: "PUT",
          url: "https://objects.example.test/object",
          headers: {},
        },
        reference: {
          ...wireReference(item, "prepared"),
          sha256: "0".repeat(64),
        },
      }),
    );
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxAttempts: 1,
    });

    await expect(authority.upload(item)).rejects.toMatchObject({
      stage: "prepare",
      reasonCode: "reference_mismatch",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects over-limit bytes locally before prepare", async () => {
    const item = payload();
    const fetch = vi.fn();
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
      maxPayloadBytes: item.byteLength - 1,
    });

    await expect(authority.upload(item)).rejects.toMatchObject({
      stage: "validate",
      reasonCode: "payload_too_large",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caps OTLP overflow uploads at the backend's 20 MiB object limit", async () => {
    expect(DEFAULT_MAX_OTLP_OVERFLOW_BYTES).toBe(20 * 1024 * 1024);
    const content = new Uint8Array(DEFAULT_MAX_OTLP_OVERFLOW_BYTES + 1);
    const fetch = vi.fn();
    const authority = new HttpUploadAuthority({
      baseUrl: "https://ingest.example.test",
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(
      authority.upload({
        content,
        purpose: "otlp_overflow",
        sha256: createHash("sha256").update(content).digest("hex"),
        byteLength: content.byteLength,
        mimeType: "application/x-protobuf",
        contentEncoding: "identity",
        idempotencyKey: "over-backend-limit",
        payloadSchema: "otlp.traces.v1",
      }),
    ).rejects.toMatchObject({
      stage: "validate",
      reasonCode: "payload_too_large",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps environment activation explicit and off by default", () => {
    expect(uploadsEnabledFromEnv(undefined)).toBe(false);
    expect(uploadsEnabledFromEnv("false")).toBe(false);
    expect(uploadsEnabledFromEnv("TRUE")).toBe(true);
    expect(uploadsEnabledFromEnv("1")).toBe(true);
  });
});
