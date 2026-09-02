import { createHash } from "node:crypto";

export type UploadPurpose = "typed_media" | "otlp_overflow";
export type UploadContentEncoding = "identity" | "gzip";
export type UploadPayloadSchema = "otlp.traces.v1" | "neatlogs.media.v1";

export interface UploadPayload {
  content: Uint8Array;
  purpose: UploadPurpose;
  sha256: string;
  byteLength: number;
  mimeType: string;
  contentEncoding: UploadContentEncoding;
  idempotencyKey: string;
  payloadSchema?: UploadPayloadSchema;
}

export interface UploadReference {
  id: string;
  purpose: UploadPurpose;
  sha256: string;
  byteLength: number;
  mimeType: string;
  contentEncoding: UploadContentEncoding;
  state: "ready";
}

export interface UploadReceipt {
  uploadId: string;
  state: "ready";
  reference: UploadReference;
}

export interface UploadRequestOptions {
  /** Absolute wall-clock deadline shared by the caller's enclosing export. */
  deadlineUnixMs?: number;
}

export interface UploadAuthority {
  readonly available: boolean;
  readonly unavailableReason: string;
  readonly maxPayloadBytes: number;
  upload(payload: UploadPayload, options?: UploadRequestOptions): Promise<UploadReceipt>;
}

export type UploadAuthorityOption = boolean | UploadAuthority;

export const DEFAULT_MAX_OTLP_OVERFLOW_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_TYPED_MEDIA_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_UPLOAD_BYTES = DEFAULT_MAX_TYPED_MEDIA_BYTES;
export const UPLOADS_DISABLED_REASON = "telemetry_uploads_disabled";

export class TelemetryUploadError extends Error {
  constructor(
    readonly stage: "prepare" | "put" | "complete" | "validate",
    readonly reasonCode: string,
    readonly retryable: boolean,
  ) {
    super(`telemetry upload ${stage} failed: ${reasonCode}`);
    this.name = "TelemetryUploadError";
  }
}

export class DisabledUploadAuthority implements UploadAuthority {
  readonly available = false;
  readonly unavailableReason: string;
  readonly maxPayloadBytes: number;

  constructor(reason = UPLOADS_DISABLED_REASON, maxPayloadBytes = DEFAULT_MAX_UPLOAD_BYTES) {
    this.unavailableReason = reason;
    this.maxPayloadBytes = maxPayloadBytes;
  }

  async upload(_payload: UploadPayload): Promise<UploadReceipt> {
    throw new TelemetryUploadError("prepare", this.unavailableReason, false);
  }
}

interface PrepareRequest {
  version: 1;
  purpose: UploadPurpose;
  sha256: string;
  byte_length: number;
  mime_type: string;
  content_encoding: UploadContentEncoding;
  idempotency_key: string;
  payload_schema?: UploadPayloadSchema;
}

interface WireReference {
  id: string;
  purpose: UploadPurpose;
  sha256: string;
  byte_length: number;
  mime_type: string;
  content_encoding: UploadContentEncoding;
  state: string;
}

interface PreparedUpload {
  uploadId: string;
  state: "prepared";
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  reference: WireReference;
}

interface ResumableUpload {
  uploadId: string;
  state: "uploaded" | "validating";
  reference: WireReference;
}

type PrepareResult = PreparedUpload | ResumableUpload | UploadReceipt;

interface WireDiagnostic {
  stage: string;
  reasonCode: string;
  retryable: boolean;
}

export interface HttpUploadAuthorityOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  maxPayloadBytes?: number;
  deadlineMs?: number;
  attemptTimeoutMs?: number;
  maxAttempts?: number;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const TYPED_MEDIA_MIME_TYPES = new Set([
  "application/pdf",
  "audio/flac",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SAFE_REASON_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;
const MAX_RESPONSE_BYTES = 64 * 1024;
const SENSITIVE_UPLOAD_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function isSupportedTypedMediaMimeType(value: string): boolean {
  return TYPED_MEDIA_MIME_TYPES.has(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  stage: TelemetryUploadError["stage"],
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TelemetryUploadError(stage, `invalid_${field}`, false);
  }
  return value;
}

function validateReference(
  value: unknown,
  payload: UploadPayload,
  expectedUploadId: string,
  expectedState: string,
  stage: TelemetryUploadError["stage"],
): WireReference {
  if (!isObject(value)) {
    throw new TelemetryUploadError(stage, "invalid_reference", false);
  }
  const reference: WireReference = {
    id: requiredString(value.id, "reference_id", stage),
    purpose: value.purpose as UploadPurpose,
    sha256: requiredString(value.sha256, "reference_sha256", stage),
    byte_length: value.byte_length as number,
    mime_type: requiredString(value.mime_type, "reference_mime_type", stage),
    content_encoding: value.content_encoding as UploadContentEncoding,
    state: requiredString(value.state, "reference_state", stage),
  };
  if (!UUID_PATTERN.test(reference.id)) {
    throw new TelemetryUploadError(stage, "invalid_reference_id", false);
  }
  if (
    reference.id !== expectedUploadId ||
    reference.purpose !== payload.purpose ||
    reference.sha256 !== payload.sha256 ||
    reference.byte_length !== payload.byteLength ||
    reference.mime_type !== payload.mimeType ||
    reference.content_encoding !== payload.contentEncoding ||
    reference.state !== expectedState
  ) {
    throw new TelemetryUploadError(stage, "reference_mismatch", false);
  }
  return reference;
}

/** Validate untrusted/injected authority output and return a credential-free clone. */
export function assertReadyUploadReceipt(value: unknown, payload: UploadPayload): UploadReceipt {
  if (!isObject(value)) {
    throw new TelemetryUploadError("complete", "invalid_receipt", false);
  }
  const uploadId = requiredString(value.uploadId, "upload_id", "complete");
  if (!UUID_PATTERN.test(uploadId) || value.state !== "ready" || !isObject(value.reference)) {
    throw new TelemetryUploadError("complete", "invalid_receipt", false);
  }
  const reference = value.reference;
  if (
    typeof reference.id !== "string" ||
    !UUID_PATTERN.test(reference.id) ||
    reference.id !== uploadId ||
    reference.state !== "ready" ||
    reference.purpose !== payload.purpose ||
    reference.sha256 !== payload.sha256 ||
    reference.byteLength !== payload.byteLength ||
    reference.mimeType !== payload.mimeType ||
    reference.contentEncoding !== payload.contentEncoding
  ) {
    throw new TelemetryUploadError("complete", "receipt_mismatch", false);
  }
  return {
    uploadId,
    state: "ready",
    reference: {
      id: reference.id,
      purpose: reference.purpose as UploadPurpose,
      sha256: reference.sha256,
      byteLength: reference.byteLength,
      mimeType: reference.mimeType,
      contentEncoding: reference.contentEncoding as UploadContentEncoding,
      state: "ready",
    },
  };
}

function validatePayload(payload: UploadPayload, maxPayloadBytes: number): void {
  if (!(payload.content instanceof Uint8Array)) {
    throw new TelemetryUploadError("validate", "invalid_content", false);
  }
  if (!SHA256_PATTERN.test(payload.sha256)) {
    throw new TelemetryUploadError("validate", "invalid_sha256", false);
  }
  if (createHash("sha256").update(payload.content).digest("hex") !== payload.sha256) {
    throw new TelemetryUploadError("validate", "invalid_sha256", false);
  }
  if (
    !Number.isSafeInteger(payload.byteLength) ||
    payload.byteLength <= 0 ||
    payload.byteLength !== payload.content.byteLength
  ) {
    throw new TelemetryUploadError("validate", "invalid_byte_length", false);
  }
  if (!(["typed_media", "otlp_overflow"] as const).includes(payload.purpose)) {
    throw new TelemetryUploadError("validate", "invalid_purpose", false);
  }
  const backendLimit =
    payload.purpose === "otlp_overflow"
      ? DEFAULT_MAX_OTLP_OVERFLOW_BYTES
      : DEFAULT_MAX_TYPED_MEDIA_BYTES;
  if (payload.byteLength > Math.min(maxPayloadBytes, backendLimit)) {
    throw new TelemetryUploadError("validate", "payload_too_large", false);
  }
  if (!MIME_TYPE_PATTERN.test(payload.mimeType) || payload.mimeType.length > 160) {
    throw new TelemetryUploadError("validate", "invalid_mime_type", false);
  }
  if (!(["identity", "gzip"] as const).includes(payload.contentEncoding)) {
    throw new TelemetryUploadError("validate", "invalid_content_encoding", false);
  }
  if (!payload.idempotencyKey || payload.idempotencyKey.length > 128) {
    throw new TelemetryUploadError("validate", "invalid_idempotency_key", false);
  }
  if (payload.purpose === "typed_media") {
    if (!TYPED_MEDIA_MIME_TYPES.has(payload.mimeType)) {
      throw new TelemetryUploadError("validate", "unsupported_mime_type", false);
    }
    if (payload.contentEncoding !== "identity") {
      throw new TelemetryUploadError("validate", "unsupported_content_encoding", false);
    }
    if (payload.payloadSchema && payload.payloadSchema !== "neatlogs.media.v1") {
      throw new TelemetryUploadError("validate", "invalid_payload_schema", false);
    }
  } else if (
    payload.mimeType !== "application/x-protobuf" ||
    payload.payloadSchema !== "otlp.traces.v1"
  ) {
    throw new TelemetryUploadError("validate", "invalid_overflow_contract", false);
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function withinDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  stage: TelemetryUploadError["stage"],
  cancel?: () => Promise<void>,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    void cancel?.().catch(() => undefined);
    throw new TelemetryUploadError(stage, "deadline_exceeded", true);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(async () => {
          void cancel?.().catch(() => undefined);
          reject(new TelemetryUploadError(stage, "deadline_exceeded", true));
        }, remaining);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function boundedJson(
  response: Response,
  deadline: number,
  stage: TelemetryUploadError["stage"],
): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new TelemetryUploadError(stage, "response_too_large", false);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await withinDeadline(response.text(), deadline, stage);
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new TelemetryUploadError(stage, "response_too_large", false);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new TelemetryUploadError(stage, "invalid_json", false);
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await withinDeadline(reader.read(), deadline, stage, () =>
        reader.cancel(),
      );
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TelemetryUploadError(stage, "response_too_large", false);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new TelemetryUploadError(stage, "invalid_json", false);
  }
}

function responseReason(value: unknown): string | undefined {
  return isObject(value) &&
    typeof value.reason_code === "string" &&
    SAFE_REASON_PATTERN.test(value.reason_code)
    ? value.reason_code
    : undefined;
}

function optionalDiagnostic(
  value: unknown,
  stage: TelemetryUploadError["stage"],
): WireDiagnostic | undefined {
  if (value === undefined) return undefined;
  if (
    !isObject(value) ||
    typeof value.stage !== "string" ||
    value.stage.length === 0 ||
    typeof value.reason_code !== "string" ||
    !SAFE_REASON_PATTERN.test(value.reason_code) ||
    typeof value.retryable !== "boolean"
  ) {
    throw new TelemetryUploadError(stage, "invalid_diagnostic", false);
  }
  return {
    stage: value.stage,
    reasonCode: value.reason_code,
    retryable: value.retryable,
  };
}

/** Authenticated implementation of the Phase 8 telemetry upload draft. */
export class HttpUploadAuthority implements UploadAuthority {
  readonly available = true;
  readonly unavailableReason = "";
  readonly maxPayloadBytes: number;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly deadlineMs: number;
  private readonly attemptTimeoutMs: number;
  private readonly maxAttempts: number;

  constructor(options: HttpUploadAuthorityOptions) {
    this.baseUrl = new URL(options.baseUrl).origin;
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new TypeError("apiKey is required for upload authority");
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError("fetch is required for upload authority");
    }
    this.fetchImpl = fetchImpl;
    this.maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    this.deadlineMs = options.deadlineMs ?? 15_000;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? 5_000;
    this.maxAttempts = options.maxAttempts ?? 2;
    if (!Number.isSafeInteger(this.maxPayloadBytes) || this.maxPayloadBytes <= 0) {
      throw new RangeError("maxPayloadBytes must be a positive safe integer");
    }
    if (!Number.isFinite(this.deadlineMs) || this.deadlineMs <= 0) {
      throw new RangeError("deadlineMs must be positive");
    }
    if (!Number.isFinite(this.attemptTimeoutMs) || this.attemptTimeoutMs <= 0) {
      throw new RangeError("attemptTimeoutMs must be positive");
    }
    if (!Number.isSafeInteger(this.maxAttempts) || this.maxAttempts <= 0 || this.maxAttempts > 4) {
      throw new RangeError("maxAttempts must be an integer between 1 and 4");
    }
  }

  async upload(payload: UploadPayload, options: UploadRequestOptions = {}): Promise<UploadReceipt> {
    validatePayload(payload, this.maxPayloadBytes);
    const deadline = Math.min(
      Date.now() + this.deadlineMs,
      options.deadlineUnixMs ?? Number.POSITIVE_INFINITY,
    );
    if (deadline <= Date.now()) {
      throw new TelemetryUploadError("prepare", "deadline_exceeded", true);
    }
    const prepared = await this.prepare(payload, deadline);
    if (prepared.state === "ready") return prepared;
    if (prepared.state === "prepared") {
      await this.put(prepared, payload, deadline);
    }
    return this.complete(prepared, payload, deadline);
  }

  private async prepare(payload: UploadPayload, deadline: number): Promise<PrepareResult> {
    let lastError: TelemetryUploadError | undefined;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        return await this.prepareAttempt(payload, deadline);
      } catch (error) {
        if (!(error instanceof TelemetryUploadError) || !error.retryable) throw error;
        lastError = error;
      }
      if (attempt + 1 < this.maxAttempts) {
        const delay = Math.min(100 * 2 ** attempt, Math.max(0, deadline - Date.now()));
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError ?? new TelemetryUploadError("prepare", "request_failed", true);
  }

  private async prepareAttempt(payload: UploadPayload, deadline: number): Promise<PrepareResult> {
    const body: PrepareRequest = {
      version: 1,
      purpose: payload.purpose,
      sha256: payload.sha256,
      byte_length: payload.byteLength,
      mime_type: payload.mimeType,
      content_encoding: payload.contentEncoding,
      idempotency_key: payload.idempotencyKey,
      ...(payload.payloadSchema ? { payload_schema: payload.payloadSchema } : {}),
    };
    const response = await this.request(
      "prepare",
      `${this.baseUrl}/v1/telemetry/uploads`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        credentials: "omit",
        redirect: "error",
      },
      deadline,
      new Set([200, 201, 202]),
      1,
    );
    const data = await boundedJson(response, deadline, "prepare");
    if (!isObject(data)) {
      throw new TelemetryUploadError("prepare", "invalid_response", false);
    }
    const diagnostic = optionalDiagnostic(data.diagnostic, "prepare");
    const uploadId = requiredString(data.upload_id, "upload_id", "prepare");
    if (!UUID_PATTERN.test(uploadId)) {
      throw new TelemetryUploadError("prepare", "invalid_upload_id", false);
    }
    if (response.status === 200 && data.state === "ready") {
      const reference = validateReference(data.reference, payload, uploadId, "ready", "prepare");
      return {
        uploadId,
        state: "ready",
        reference: {
          id: reference.id,
          purpose: reference.purpose,
          sha256: reference.sha256,
          byteLength: reference.byte_length,
          mimeType: reference.mime_type,
          contentEncoding: reference.content_encoding,
          state: "ready",
        },
      };
    }
    if (data.state === "uploaded" || data.state === "validating") {
      if (response.status !== 200 && response.status !== 202) {
        throw new TelemetryUploadError("prepare", "invalid_response", false);
      }
      const reference = validateReference(
        data.reference,
        payload,
        uploadId,
        String(data.state),
        "prepare",
      );
      return { uploadId, state: data.state, reference };
    }
    if (data.state === "rejected") {
      validateReference(data.reference, payload, uploadId, "rejected", "prepare");
      throw new TelemetryUploadError("prepare", diagnostic?.reasonCode ?? "upload_rejected", false);
    }
    if (response.status !== 201 || data.state !== "prepared" || !isObject(data.upload)) {
      throw new TelemetryUploadError(
        "prepare",
        diagnostic?.reasonCode ?? "invalid_response",
        diagnostic?.retryable ?? false,
      );
    }
    const expiresAt = requiredString(data.expires_at, "expires_at", "prepare");
    const expires = Date.parse(expiresAt);
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      throw new TelemetryUploadError("prepare", "invalid_expiry", false);
    }
    if (data.upload.method !== "PUT") {
      throw new TelemetryUploadError("prepare", "invalid_upload_method", false);
    }
    const uploadUrl = requiredString(data.upload.url, "upload_url", "prepare");
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(uploadUrl);
    } catch {
      throw new TelemetryUploadError("prepare", "invalid_upload_url", false);
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
      throw new TelemetryUploadError("prepare", "invalid_upload_url", false);
    }
    if (!isObject(data.upload.headers)) {
      throw new TelemetryUploadError("prepare", "invalid_upload_headers", false);
    }
    const uploadHeaders: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(data.upload.headers)) {
      if (
        typeof value !== "string" ||
        !HEADER_NAME_PATTERN.test(key) ||
        /[\r\n]/.test(value) ||
        SENSITIVE_UPLOAD_HEADERS.has(key.toLowerCase())
      ) {
        throw new TelemetryUploadError("prepare", "invalid_upload_headers", false);
      }
      uploadHeaders[key] = value;
    }
    const reference = validateReference(data.reference, payload, uploadId, "prepared", "prepare");
    return { uploadId, state: "prepared", uploadUrl, uploadHeaders, reference };
  }

  private async put(
    prepared: PreparedUpload,
    payload: UploadPayload,
    deadline: number,
  ): Promise<void> {
    const response = await this.request(
      "put",
      prepared.uploadUrl,
      {
        method: "PUT",
        headers: prepared.uploadHeaders,
        body: payload.content,
        credentials: "omit",
        redirect: "error",
      },
      deadline,
    );
    try {
      void response.body?.cancel().catch(() => undefined);
    } catch {
      // A successful object PUT is authoritative; cleanup must not trigger a retry.
    }
  }

  private async complete(
    prepared: PreparedUpload | ResumableUpload,
    payload: UploadPayload,
    deadline: number,
  ): Promise<UploadReceipt> {
    let lastError: TelemetryUploadError | undefined;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        return await this.completeAttempt(prepared, payload, deadline);
      } catch (error) {
        if (!(error instanceof TelemetryUploadError) || !error.retryable) throw error;
        lastError = error;
      }
      if (attempt + 1 < this.maxAttempts) {
        const delay = Math.min(100 * 2 ** attempt, Math.max(0, deadline - Date.now()));
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError ?? new TelemetryUploadError("complete", "request_failed", true);
  }

  private async completeAttempt(
    prepared: PreparedUpload | ResumableUpload,
    payload: UploadPayload,
    deadline: number,
  ): Promise<UploadReceipt> {
    const response = await this.request(
      "complete",
      `${this.baseUrl}/v1/telemetry/uploads/${encodeURIComponent(prepared.uploadId)}/complete`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          sha256: payload.sha256,
          byte_length: payload.byteLength,
        }),
        credentials: "omit",
        redirect: "error",
      },
      deadline,
      new Set([200, 202]),
      1,
    );
    const data = await boundedJson(response, deadline, "complete");
    if (!isObject(data)) {
      throw new TelemetryUploadError("complete", "invalid_response", false);
    }
    const diagnostic = optionalDiagnostic(data.diagnostic, "complete");
    if (data.upload_id !== prepared.uploadId) {
      throw new TelemetryUploadError("complete", "upload_id_mismatch", false);
    }
    if (!["ready", "uploaded", "validating", "rejected"].includes(String(data.state))) {
      throw new TelemetryUploadError("complete", "invalid_state", false);
    }
    const reference = validateReference(
      data.reference,
      payload,
      prepared.uploadId,
      String(data.state),
      "complete",
    );
    if (data.state !== "ready") {
      const reason =
        diagnostic?.reasonCode ??
        (data.state === "uploaded" || data.state === "validating"
          ? "validation_pending"
          : "upload_rejected");
      throw new TelemetryUploadError(
        "complete",
        reason,
        diagnostic?.retryable ?? (data.state === "uploaded" || data.state === "validating"),
      );
    }
    return {
      uploadId: prepared.uploadId,
      state: "ready",
      reference: {
        id: reference.id,
        purpose: reference.purpose,
        sha256: reference.sha256,
        byteLength: reference.byte_length,
        mimeType: reference.mime_type,
        contentEncoding: reference.content_encoding,
        state: "ready",
      },
    };
  }

  private async request(
    stage: "prepare" | "put" | "complete",
    url: string,
    init: RequestInit,
    deadline: number,
    expectedStatuses?: ReadonlySet<number>,
    attemptLimit = this.maxAttempts,
    parseErrorBody = stage !== "put",
  ): Promise<Response> {
    let lastError: TelemetryUploadError | undefined;
    for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new TelemetryUploadError(stage, "deadline_exceeded", true);
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(remaining, this.attemptTimeoutMs),
      );
      timer.unref?.();
      try {
        const response = await this.fetchImpl(url, {
          ...init,
          signal: controller.signal,
        });
        const accepted = expectedStatuses
          ? expectedStatuses.has(response.status)
          : response.status >= 200 && response.status < 300;
        if (accepted) return response;
        let retryable = retryableStatus(response.status);
        let reason = `http_${response.status}`;
        if (parseErrorBody) {
          try {
            const errorBody = await boundedJson(response, deadline, stage);
            reason = responseReason(errorBody) ?? reason;
            if (isObject(errorBody) && typeof errorBody.retryable === "boolean") {
              retryable = errorBody.retryable;
            }
          } catch {
            // HTTP status remains authoritative when an error body is malformed.
          }
        } else {
          await response.body?.cancel().catch(() => undefined);
        }
        lastError = new TelemetryUploadError(stage, reason, retryable);
        if (!retryable) throw lastError;
      } catch (error) {
        if (error instanceof TelemetryUploadError && !error.retryable) throw error;
        lastError =
          error instanceof TelemetryUploadError
            ? error
            : new TelemetryUploadError(
                stage,
                controller.signal.aborted ? "timeout" : "network_error",
                true,
              );
      } finally {
        clearTimeout(timer);
      }
      if (attempt + 1 < attemptLimit) {
        const delay = Math.min(100 * 2 ** attempt, Math.max(0, deadline - Date.now()));
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError ?? new TelemetryUploadError(stage, "request_failed", true);
  }
}

export function isUploadAuthority(value: unknown): value is UploadAuthority {
  return (
    isObject(value) &&
    typeof value.available === "boolean" &&
    typeof value.unavailableReason === "string" &&
    Number.isSafeInteger(value.maxPayloadBytes) &&
    (value.maxPayloadBytes as number) > 0 &&
    typeof value.upload === "function"
  );
}

export function uploadsEnabledFromEnv(value: string | undefined): boolean {
  return ["true", "1", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function resolveUploadAuthority(
  option: UploadAuthorityOption | undefined,
  envValue: string | undefined,
  baseUrl: string,
  apiKey: string,
): UploadAuthority {
  if (isUploadAuthority(option)) return option;
  const enabled = typeof option === "boolean" ? option : uploadsEnabledFromEnv(envValue);
  return enabled ? new HttpUploadAuthority({ baseUrl, apiKey }) : new DisabledUploadAuthority();
}
