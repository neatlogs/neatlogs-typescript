import { createHash } from "node:crypto";
import { getActiveClient } from "./active-client.js";
import type { DeliveryDiagnostics } from "./delivery-diagnostics.js";
import {
  assertReadyUploadReceipt,
  DEFAULT_MAX_TYPED_MEDIA_BYTES,
  isSupportedTypedMediaMimeType,
  TelemetryUploadError,
  type UploadAuthority,
  type UploadPayload,
} from "./upload-authority.js";

export type MediaRecord = Record<string, string | number>;

export const DEFAULT_INLINE_MEDIA_BYTES = 100_000;
export const DEFAULT_MAX_PENDING_MEDIA_ITEMS = 32;
export const DEFAULT_MEDIA_EXPORT_DEADLINE_MS = 15_000;

interface DiscoveredMedia {
  record: MediaRecord;
  original?: string;
  binaryOriginal?: Uint8Array;
  bytes?: Uint8Array;
}

interface PendingMedia {
  bytes: Uint8Array;
  prefixes: string[];
  record: MediaRecord;
  token: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
}

interface PendingMediaAccount {
  bytes: number;
  items: number;
  released: boolean;
  owner: PendingMediaOwnerState;
  span: WeakRef<object>;
}

interface PendingMediaBucket {
  items: PendingMedia[];
  account: PendingMediaAccount;
  unregisterToken: object;
}

const pendingBySpan = new WeakMap<object, PendingMediaBucket>();
interface PendingMediaOwnerState {
  bytes: number;
  items: number;
  accounts: Set<PendingMediaAccount>;
}

const defaultPendingMediaOwner = {};
const pendingMediaOwners = new WeakMap<object, PendingMediaOwnerState>();

function pendingOwnerState(owner: object): PendingMediaOwnerState {
  const prior = pendingMediaOwners.get(owner);
  if (prior) return prior;
  const state = {
    bytes: 0,
    items: 0,
    accounts: new Set<PendingMediaAccount>(),
  };
  pendingMediaOwners.set(owner, state);
  return state;
}

function releasePendingAccount(account: PendingMediaAccount): void {
  if (account.released) return;
  account.released = true;
  account.owner.bytes = Math.max(0, account.owner.bytes - account.bytes);
  account.owner.items = Math.max(0, account.owner.items - account.items);
  account.owner.accounts.delete(account);
}

const pendingFinalizer = typeof FinalizationRegistry === "undefined"
  ? undefined
  : new FinalizationRegistry<PendingMediaAccount>(releasePendingAccount);

function pendingBucket(span: object): PendingMediaBucket {
  const prior = pendingBySpan.get(span);
  if (prior) return prior;
  const owner = pendingOwnerState(getActiveClient() ?? defaultPendingMediaOwner);
  const account: PendingMediaAccount = {
    bytes: 0,
    items: 0,
    released: false,
    owner,
    span: new WeakRef(span),
  };
  const unregisterToken = {};
  const bucket = { items: [], account, unregisterToken };
  owner.accounts.add(account);
  pendingBySpan.set(span, bucket);
  pendingFinalizer?.register(span, account, unregisterToken);
  return bucket;
}

function detachPendingBucket(span: object): PendingMediaBucket | undefined {
  const bucket = pendingBySpan.get(span);
  if (!bucket) return undefined;
  pendingBySpan.delete(span);
  pendingFinalizer?.unregister(bucket.unregisterToken);
  return bucket;
}

function uploadToken(record: MediaRecord): string {
  const material = `${record.sha256}:${record.mime_type}:${record.purpose}`;
  return `nl_pending_media_${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
}

function mediaKind(mimeType: string, declared = ""): string {
  const value = declared
    .toLowerCase()
    .replace(/^(?:input|output)_/, "")
    .replace(/_url$/, "");
  if (value === "image_generation_call") return "image";
  if (value === "file") return "document";
  if (["image", "audio", "video", "document"].includes(value)) return value;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) {
    return "document";
  }
  return "media";
}

function declaredMediaKind(value: string): string {
  const normalized = mediaKind("", value);
  return normalized === "media" ? "" : normalized;
}

function canonicalMimeType(value: string): string {
  const mimeType = value.trim().split(";", 1)[0]?.toLowerCase() ?? "";
  return mimeType === "image/jpg"
    ? "image/jpeg"
    : mimeType === "audio/mp3"
      ? "audio/mpeg"
      : mimeType;
}

interface DecodedBase64 {
  bytes?: Uint8Array;
  byteLength: number;
  sha256: string;
}

function decodeBase64(value: string): DecodedBase64 | null {
  const normalized = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    return null;
  }
  try {
    const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    const estimatedBytes = Math.floor((normalized.length * 3) / 4) - padding;
    if (estimatedBytes <= DEFAULT_MAX_TYPED_MEDIA_BYTES) {
      const bytes = Buffer.from(normalized, "base64");
      if (
        bytes.toString("base64").replace(/=+$/, "") !==
        normalized.replace(/=+$/, "")
      ) {
        return null;
      }
      return {
        bytes,
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
    const digest = createHash("sha256");
    let byteLength = 0;
    const chunkCharacters = 64 * 1024;
    for (let offset = 0; offset < normalized.length; offset += chunkCharacters) {
      const chunk = Buffer.from(normalized.slice(offset, offset + chunkCharacters), "base64");
      digest.update(chunk);
      byteLength += chunk.byteLength;
    }
    if (byteLength !== estimatedBytes) return null;
    return { byteLength, sha256: digest.digest("hex") };
  } catch {
    return null;
  }
}

function inlineRecord(
  input: string | Uint8Array,
  mimeType: string,
  declared: string,
  purpose: string,
): DiscoveredMedia | null {
  mimeType = canonicalMimeType(mimeType);
  let original: string | undefined;
  let binaryOriginal: Uint8Array | undefined;
  let bytes: Uint8Array | undefined;
  let byteLength: number;
  let sha256: string;
  if (typeof input === "string") {
    original = input;
    let encoded = input.trim();
    if (/^data:/i.test(encoded)) {
      const comma = encoded.indexOf(",");
      if (comma < 0) return null;
      const header = encoded.slice(5, comma);
      if (!header.toLowerCase().split(";").includes("base64")) return null;
      mimeType = canonicalMimeType(header.split(";", 1)[0] || mimeType);
      encoded = encoded.slice(comma + 1);
    }
    const decoded = decodeBase64(encoded);
    if (!decoded) return null;
    bytes = decoded.bytes;
    byteLength = decoded.byteLength;
    sha256 = decoded.sha256;
  } else {
    binaryOriginal = input;
    byteLength = input.byteLength;
    sha256 = createHash("sha256").update(input).digest("hex");
    if (byteLength <= DEFAULT_MAX_TYPED_MEDIA_BYTES) {
      bytes = Uint8Array.from(input);
    }
  }
  const eligible =
    byteLength > DEFAULT_INLINE_MEDIA_BYTES &&
    byteLength <= DEFAULT_MAX_TYPED_MEDIA_BYTES;
  const tooLarge = byteLength > DEFAULT_MAX_TYPED_MEDIA_BYTES;
  return {
    original,
    binaryOriginal,
    bytes,
    record: {
      id: `nl_media_${sha256.slice(0, 24)}`,
      type: mediaKind(mimeType, declared),
      source: "inline",
      mime_type: mimeType || "application/octet-stream",
      byte_length: byteLength,
      sha256,
      purpose,
      state: tooLarge ? "failed" : eligible ? "pending-upload" : "inline",
      ...(tooLarge
        ? { safe_preview: "upload failed: validate/payload_too_large" }
        : eligible
          ? { safe_preview: "awaiting authenticated upload" }
          : {}),
    },
  };
}

function referenceRecord(
  reference: string,
  mimeType: string,
  declared: string,
  purpose: string,
): DiscoveredMedia | null {
  mimeType = canonicalMimeType(mimeType);
  let safeReference = reference;
  let isURLReference = false;
  const normalizedReference = reference.trim();
  const protocolRelative = normalizedReference.startsWith("//");
  try {
    const parsed = protocolRelative
      ? new URL(normalizedReference, "https://neatlogs.invalid")
      : new URL(normalizedReference);
    if (parsed.protocol.toLowerCase() === "data:") return null;
    const hierarchical =
      protocolRelative ||
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      /^[a-z][a-z\d+.-]*:\/\//i.test(normalizedReference) ||
      parsed.pathname.startsWith("/");
    if (hierarchical) {
      isURLReference = true;
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      safeReference = protocolRelative
        ? `//${parsed.host}${parsed.pathname}`
        : parsed.toString();
    }
  } catch {
    if (/^(?:\/\/|[a-z][a-z\d+.-]*:)/i.test(normalizedReference)) return null;
  }
  const digest = createHash("sha256").update(reference).digest("hex");
  return {
    original: reference,
    record: {
      id: `nl_media_${digest.slice(0, 24)}`,
      type: mediaKind(mimeType, declared),
      source: isURLReference ? "url" : "provider",
      mime_type: mimeType || "application/octet-stream",
      reference: safeReference,
      purpose,
      state: "available",
    },
  };
}

function discoverMedia(value: unknown, purpose: string): DiscoveredMedia[] {
  const found: DiscoveredMedia[] = [];
  const discoveredKeys = new Set<string>();
  let retainedBytes = 0;
  const append = (item: DiscoveredMedia | null): void => {
    if (!item) return;
    const key = `${item.record.id}:${item.record.mime_type}:${item.record.reference ?? ""}:${item.record.type}`;
    if (discoveredKeys.has(key)) return;
    discoveredKeys.add(key);
    if (item.bytes && item.record.state === "pending-upload") {
      if (retainedBytes + item.bytes.byteLength > DEFAULT_MAX_TYPED_MEDIA_BYTES) {
        item.bytes = undefined;
        item.record.state = "failed";
        item.record.safe_preview = "upload failed: validate/pending_media_memory_limit";
      } else {
        retainedBytes += item.bytes.byteLength;
      }
    }
    found.push(item);
  };
  const visited = new WeakSet<object>();
  const visit = (
    node: any,
    inheritedDeclared = "",
    inheritedMimeType = "",
  ): void => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    if (node instanceof Uint8Array) return;
    if (Array.isArray(node)) {
      node.forEach((item) => {
        if (
          inheritedDeclared &&
          (typeof item === "string" || item instanceof Uint8Array)
        ) {
          const record =
            typeof item === "string" && /^(?:https?:|s3:|gs:|\/\/)/i.test(item)
              ? referenceRecord(item, inheritedMimeType, inheritedDeclared, purpose)
              : inlineRecord(item, inheritedMimeType, inheritedDeclared, purpose);
          append(record);
        } else {
          visit(item, inheritedDeclared, inheritedMimeType);
        }
      });
      return;
    }
    const declared = String(node.type ?? inheritedDeclared);
    const normalizedDeclared = declaredMediaKind(declared);
    const mediaDeclared = normalizedDeclared || declaredMediaKind(inheritedDeclared);
    let mimeType = canonicalMimeType(String(
      node.mime_type ??
        node.mimeType ??
        node.media_type ??
        node.mediaType ??
        inheritedMimeType,
    ));
    const declaredFormat = node.format ?? node.output_format ?? node.outputFormat;
    if (!mimeType && mediaDeclared && typeof declaredFormat === "string") {
      const format = declaredFormat.toLowerCase();
      mimeType = canonicalMimeType(
        mediaDeclared === "document" && format === "pdf"
          ? "application/pdf"
          : `${mediaDeclared}/${format}`,
      );
    }
    const image =
      typeof node.image_url === "object" ? node.image_url?.url : node.image_url;
    if (typeof image === "string") {
      const record = /^\s*data:/i.test(image)
        ? inlineRecord(image, mimeType, "image", purpose)
        : referenceRecord(image, mimeType, "image", purpose);
      append(record);
    }
    const audio = node.input_audio ?? node.inputAudio;
    if (audio && typeof audio.data === "string") {
      const format = String(audio.format ?? "unknown");
      const record = inlineRecord(
        audio.data,
        mimeType || `audio/${format}`,
        "audio",
        purpose,
      );
      append(record);
    }
    const inline = node.inline_data ?? node.inlineData;
    if (inline && typeof inline.data === "string") {
      const record = inlineRecord(
        inline.data,
        String(inline.mime_type ?? inline.mimeType ?? mimeType),
        mediaDeclared,
        purpose,
      );
      append(record);
    }
    const fileData = node.file_data ?? node.fileData;
    if (typeof fileData === "string") {
      const record = inlineRecord(fileData, mimeType, mediaDeclared || "document", purpose);
      append(record);
    }
    const raw =
      node.data ??
      node.bytes ??
      node.b64_json ??
      (normalizedDeclared === "image" ? node.result : undefined);
    if (
      (typeof raw === "string" || raw instanceof Uint8Array) &&
      (mediaDeclared || mimeType)
    ) {
      const record = inlineRecord(raw, mimeType, mediaDeclared, purpose);
      append(record);
    }
    const reference =
      node.file_id ?? node.file_url ?? node.file_uri ?? node.fileUri ?? node.url;
    if (
      typeof reference === "string" &&
      (["file", "url"].includes(normalizedDeclared) ||
        !!mediaDeclared ||
        !!mimeType)
    ) {
      const record = referenceRecord(
        reference,
        mimeType,
        mediaDeclared || "document",
        purpose,
      );
      append(record);
    }
    for (const [key, item] of Object.entries(node)) {
      const keyed = key.toLowerCase().replace(/^input_/, "").replace(/s$/, "");
      const childDeclared = declaredMediaKind(keyed) || mediaDeclared;
      let childMimeType = mimeType;
      if (!childMimeType && childDeclared && typeof declaredFormat === "string") {
        const format = declaredFormat.toLowerCase();
        childMimeType = canonicalMimeType(
          childDeclared === "document" && format === "pdf"
            ? "application/pdf"
            : `${childDeclared}/${format}`,
        );
      }
      visit(item, childDeclared, childMimeType);
    }
  };
  visit(value);
  return found;
}

function placeholder(record: MediaRecord): Record<string, unknown> {
  return {
    neatlogs_media: Object.fromEntries(
      Object.entries(record).filter(([key]) =>
        [
          "id",
          "type",
          "source",
          "mime_type",
          "byte_length",
          "sha256",
          "purpose",
          "state",
          "reference",
          "content_encoding",
          "safe_preview",
          "upload_token",
        ].includes(key),
      ),
    ),
  };
}

function sanitizedCopy(value: unknown, discovered: DiscoveredMedia[]): unknown {
  const replacements = new Map<string, unknown>();
  for (const item of discovered) {
    if (!item.original) continue;
    if (item.record.state === "pending-upload" || item.record.state === "failed") {
      replacements.set(item.original, placeholder(item.record));
    } else if (typeof item.record.reference === "string") {
      replacements.set(item.original, item.record.reference);
    }
  }
  const visited = new WeakMap<object, unknown>();
  const clone = (node: any): any => {
    if (typeof node === "string") return replacements.get(node) ?? node;
    if (node instanceof Uint8Array) {
      const match = discovered.find(
        (item) =>
          item.binaryOriginal === node ||
          (item.bytes?.buffer === node.buffer && item.bytes.byteOffset === node.byteOffset),
      );
      return match && ["pending-upload", "failed"].includes(String(match.record.state))
        ? placeholder(match.record)
        : node;
    }
    if (!node || typeof node !== "object") return node;
    const prior = visited.get(node);
    if (prior) return prior;
    if (Array.isArray(node)) {
      const result: unknown[] = [];
      visited.set(node, result);
      node.forEach((item) => result.push(clone(item)));
      return result;
    }
    const result: Record<string, unknown> = {};
    visited.set(node, result);
    for (const [key, item] of Object.entries(node)) result[key] = clone(item);
    return result;
  };
  return clone(value);
}

export function mediaReferences(value: unknown, purpose: string): MediaRecord[] {
  return discoverMedia(value, purpose).map(({ record }) =>
    record.state === "pending-upload"
      ? {
          ...record,
          state: "failed",
          safe_preview: "upload unavailable: telemetry_uploads_disabled",
        }
      : { ...record },
  );
}

/** Remove large inline bytes and URL credentials from a captured value. */
export function sanitizeMediaPayload(value: unknown, purpose = "capture"): unknown {
  const discovered = discoverMedia(value, purpose);
  return sanitizedCopy(value, discovered);
}

/** Capture typed media metadata and return a telemetry-safe clone of the value. */
export function captureMedia(
  span: {
    setAttribute(name: string, value: string | number): unknown;
    isRecording?(): boolean;
  },
  prefix: string,
  value: unknown,
  purpose: string,
): unknown {
  const discovered = discoverMedia(value, purpose);
  const recording = typeof span.isRecording !== "function" || span.isRecording();
  discovered.forEach((item, index) => {
    const recordPrefix = `${prefix}.media.${index}`;
    if (item.bytes && item.record.state === "pending-upload") {
      if (!recording) {
        item.bytes = undefined;
        item.record.state = "failed";
        item.record.safe_preview = "upload unavailable: span_not_recording";
      } else {
        const token = uploadToken(item.record);
        item.record.upload_token = token;
        const bucket = pendingBucket(span as object);
        const duplicate = bucket.items.find(
          (candidate) =>
            candidate.sha256 === item.record.sha256 &&
            candidate.mimeType === item.record.mime_type,
        );
        if (duplicate) {
          if (!duplicate.prefixes.includes(recordPrefix)) {
            duplicate.prefixes.push(recordPrefix);
          }
        } else if (bucket.account.owner.items >= DEFAULT_MAX_PENDING_MEDIA_ITEMS) {
          item.bytes = undefined;
          delete item.record.upload_token;
          item.record.state = "failed";
          item.record.safe_preview =
            "upload failed: validate/pending_media_item_limit";
        } else if (
          bucket.account.owner.bytes + item.bytes.byteLength >
          DEFAULT_MAX_TYPED_MEDIA_BYTES
        ) {
          item.bytes = undefined;
          delete item.record.upload_token;
          item.record.state = "failed";
          item.record.safe_preview =
            "upload failed: validate/pending_media_memory_limit";
        } else {
          bucket.account.owner.bytes += item.bytes.byteLength;
          bucket.account.owner.items += 1;
          bucket.account.bytes += item.bytes.byteLength;
          bucket.account.items += 1;
          bucket.items.push({
            bytes: item.bytes,
            prefixes: [recordPrefix],
            record: { ...item.record },
            token,
            sha256: String(item.record.sha256),
            byteLength: Number(item.record.byte_length),
            mimeType: String(item.record.mime_type),
          });
        }
        if (bucket.items.length === 0) {
          pendingBySpan.delete(span as object);
          pendingFinalizer?.unregister(bucket.unregisterToken);
          releasePendingAccount(bucket.account);
        }
      }
    }
    Object.entries(item.record).forEach(([key, field]) =>
      span.setAttribute(`${recordPrefix}.${key}`, field),
    );
  });
  return sanitizedCopy(value, discovered);
}

export function setMediaAttributes(
  span: { setAttribute(name: string, value: string | number): unknown },
  prefix: string,
  value: unknown,
  purpose: string,
): void {
  captureMedia(span, prefix, value, purpose);
}

function safeFailure(error: unknown): { stage: string; reason: string } {
  if (!(error instanceof TelemetryUploadError)) {
    return { stage: "upload", reason: "unexpected_error" };
  }
  return {
    stage: error.stage,
    reason: /^[a-zA-Z0-9_.-]{1,64}$/.test(error.reasonCode)
      ? error.reasonCode
      : "unsafe_reason_code",
  };
}

function safeUnavailableReason(value: string): string {
  return /^[a-zA-Z0-9_.-]{1,64}$/.test(value)
    ? value
    : "upload_authority_unavailable";
}

function rewritePendingPlaceholder(
  attributes: Record<string, any>,
  item: PendingMedia,
  update: MediaRecord,
): void {
  const matches = (value: Record<string, any>): boolean =>
    value.state === "pending-upload" &&
    (value.upload_token === item.token ||
      (value.id === item.record.id && value.sha256 === item.sha256));
  const applyUpdate = (value: Record<string, any>): Record<string, any> => {
    const after = { ...value, ...update };
    delete after.upload_token;
    if (after.state === "available") delete after.safe_preview;
    return after;
  };
  const seen = new WeakSet<object>();
  const rewrite = (value: any): any => {
    if (typeof value === "string") {
      if (!value.includes("pending-upload")) return value;
      const trimmed = value.trimStart();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
      try {
        const parsed = JSON.parse(value);
        const rewritten = rewrite(parsed);
        return rewritten === parsed ? value : JSON.stringify(rewritten);
      } catch {
        return value;
      }
    }
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return value;
    seen.add(value);
    if (!Array.isArray(value) && matches(value)) return applyUpdate(value);
    let changed = false;
    const output = Array.isArray(value) ? [...value] : { ...value };
    for (const [key, child] of Object.entries(value)) {
      const rewritten = rewrite(child);
      if (rewritten !== child) {
        (output as Record<string, any>)[key] = rewritten;
        changed = true;
      }
    }
    return changed ? output : value;
  };

  for (const [key, value] of Object.entries(attributes)) {
    attributes[key] = rewrite(value);
  }
  for (const prefix of item.prefixes) {
    const stateKey = `${prefix}.state`;
    const tokenKey = `${prefix}.upload_token`;
    const matchesFlat =
      attributes[stateKey] === "pending-upload" &&
      (attributes[tokenKey] === item.token ||
        (attributes[`${prefix}.id`] === item.record.id &&
          attributes[`${prefix}.sha256`] === item.sha256));
    if (!matchesFlat) continue;
    delete attributes[tokenKey];
    for (const [field, fieldValue] of Object.entries(update)) {
      attributes[`${prefix}.${field}`] = fieldValue;
    }
    if (update.state === "available") delete attributes[`${prefix}.safe_preview`];
  }
}

function retainedPendingTokens(value: unknown): Set<string> {
  const tokens = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (node: any): void => {
    if (typeof node === "string") {
      if (!node.includes("nl_pending_media_")) return;
      const trimmed = node.trimStart();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
      try {
        visit(JSON.parse(node));
      } catch {
        // Invalid JSON cannot authorize an out-of-band upload.
      }
      return;
    }
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (
      !Array.isArray(node) &&
      node.state === "pending-upload" &&
      typeof node.upload_token === "string"
    ) {
      tokens.add(node.upload_token);
    }
    if (!Array.isArray(node)) {
      for (const [key, token] of Object.entries(node)) {
        if (!key.endsWith(".upload_token") || typeof token !== "string") continue;
        const prefix = key.slice(0, -".upload_token".length);
        if (node[`${prefix}.state`] === "pending-upload") tokens.add(token);
      }
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return tokens;
}

async function uploadWithinDeadline(
  authority: UploadAuthority,
  payload: UploadPayload,
  deadlineUnixMs: number,
) {
  const remaining = deadlineUnixMs - Date.now();
  if (remaining <= 0) {
    throw new TelemetryUploadError(
      "prepare",
      "media_export_deadline_exceeded",
      true,
    );
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      authority.upload(payload, { deadlineUnixMs }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(
            new TelemetryUploadError(
              "prepare",
              "media_export_deadline_exceeded",
              true,
            ),
          ),
          remaining,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Upload only media references retained by the accepted masked snapshot. */
export async function resolvePendingMediaUploads(
  span: object,
  attributes: Record<string, any>,
  authority: UploadAuthority,
  diagnostics?: DeliveryDiagnostics,
): Promise<boolean> {
  const bucket = detachPendingBucket(span);
  const pending = bucket?.items ?? [];
  const deadlineUnixMs = Date.now() + DEFAULT_MEDIA_EXPORT_DEADLINE_MS;
  let failed = false;
  try {
    const retainedTokens = retainedPendingTokens(attributes);
    for (const item of pending) {
      const retained = item.prefixes.filter(
        (prefix) =>
          attributes[`${prefix}.upload_token`] === item.token &&
          attributes[`${prefix}.state`] === "pending-upload",
      );
      const retainedCount = Math.max(
        retained.length,
        retainedTokens.has(item.token) ? 1 : 0,
      );
      if (!retainedTokens.has(item.token)) {
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: "upload skipped: media reference removed by mask",
        });
        continue;
      }
      if (!authority.available) {
        const unavailableReason = safeUnavailableReason(authority.unavailableReason);
        failed = true;
        diagnostics?.recordTypedMedia("unavailable", retainedCount);
        diagnostics?.recordTypedMedia("failures", retainedCount);
        diagnostics?.recordUploadFailure("prepare", unavailableReason);
        const safePreview = `upload unavailable: ${unavailableReason}`;
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: safePreview,
        });
        continue;
      }
      if (
        item.byteLength >
        Math.min(authority.maxPayloadBytes, DEFAULT_MAX_TYPED_MEDIA_BYTES)
      ) {
        failed = true;
        diagnostics?.recordTypedMedia("failures", retainedCount);
        diagnostics?.recordUploadFailure("validate", "payload_too_large");
        const safePreview = "upload failed: validate/payload_too_large";
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: safePreview,
        });
        continue;
      }
      if (!isSupportedTypedMediaMimeType(item.mimeType)) {
        failed = true;
        diagnostics?.recordTypedMedia("failures", retainedCount);
        diagnostics?.recordUploadFailure("validate", "unsupported_mime_type");
        const safePreview = "upload failed: validate/unsupported_mime_type";
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: safePreview,
        });
        continue;
      }
      const payload: UploadPayload = {
        content: item.bytes,
        purpose: "typed_media",
        sha256: item.sha256,
        byteLength: item.byteLength,
        mimeType: item.mimeType,
        contentEncoding: "identity",
        idempotencyKey: `nl-ts-v1:typed_media:${item.sha256}:${item.mimeType}`,
        payloadSchema: "neatlogs.media.v1",
      };
      try {
        const receipt = assertReadyUploadReceipt(
          await uploadWithinDeadline(authority, payload, deadlineUnixMs),
          payload,
        );
        diagnostics?.recordTypedMedia("uploads", retainedCount);
        rewritePendingPlaceholder(attributes, item, {
          id: receipt.reference.id,
          reference: receipt.reference.id,
          source: "uploaded",
          sha256: receipt.reference.sha256,
          byte_length: receipt.reference.byteLength,
          mime_type: receipt.reference.mimeType,
          purpose: receipt.reference.purpose,
          state: "available",
          content_encoding: receipt.reference.contentEncoding,
        });
      } catch (error) {
        failed = true;
        const failure = safeFailure(error);
        diagnostics?.recordTypedMedia("failures", retainedCount);
        diagnostics?.recordUploadFailure(failure.stage, failure.reason);
        const safePreview = `upload failed: ${failure.stage}/${failure.reason}`;
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: safePreview,
        });
      }
    }
  } finally {
    if (bucket) releasePendingAccount(bucket.account);
  }
  return !failed;
}

/** Drop out-of-band bytes when a span is filtered or never exported. */
export function discardPendingMedia(span: object): void {
  const bucket = detachPendingBucket(span);
  if (bucket) releasePendingAccount(bucket.account);
}

/** Release all staged bytes owned by one SDK pipeline during shutdown. */
export function discardPendingMediaOwner(owner?: object): void {
  const state = pendingMediaOwners.get(owner ?? defaultPendingMediaOwner);
  if (!state) return;
  for (const account of [...state.accounts]) {
    const span = account.span.deref();
    if (span) {
      const bucket = pendingBySpan.get(span);
      if (bucket?.account === account) {
        pendingBySpan.delete(span);
        pendingFinalizer?.unregister(bucket.unregisterToken);
      }
    }
    releasePendingAccount(account);
  }
  pendingMediaOwners.delete(owner ?? defaultPendingMediaOwner);
}
