import { createHash } from "node:crypto";
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
  sha256: string;
  byteLength: number;
  mimeType: string;
}

const pendingBySpan = new WeakMap<object, PendingMedia[]>();
let retainedPendingBytes = 0;

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
  span: { setAttribute(name: string, value: string | number): unknown },
  prefix: string,
  value: unknown,
  purpose: string,
): unknown {
  const discovered = discoverMedia(value, purpose);
  discovered.forEach((item, index) => {
    const recordPrefix = `${prefix}.media.${index}`;
    if (item.bytes && item.record.state === "pending-upload") {
      const existing = pendingBySpan.get(span as object) ?? [];
      const duplicate = existing.find(
        (candidate) =>
          candidate.sha256 === item.record.sha256 &&
          candidate.mimeType === item.record.mime_type,
      );
      if (duplicate) {
        if (!duplicate.prefixes.includes(recordPrefix)) {
          duplicate.prefixes.push(recordPrefix);
        }
      } else if (
        retainedPendingBytes + item.bytes.byteLength >
        DEFAULT_MAX_TYPED_MEDIA_BYTES
      ) {
        item.bytes = undefined;
        item.record.state = "failed";
        item.record.safe_preview =
          "upload failed: validate/pending_media_memory_limit";
      } else {
        retainedPendingBytes += item.bytes.byteLength;
        existing.push({
          bytes: item.bytes,
          prefixes: [recordPrefix],
          record: { ...item.record },
          sha256: String(item.record.sha256),
          byteLength: Number(item.record.byte_length),
          mimeType: String(item.record.mime_type),
        });
      }
      if (existing.length > 0) pendingBySpan.set(span as object, existing);
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
  const before = JSON.stringify(placeholder(item.record));
  const afterRecord = { ...item.record, ...update };
  if (afterRecord.state === "available") delete afterRecord.safe_preview;
  const after = JSON.stringify(placeholder(afterRecord));
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "string" && value.includes(before)) {
      attributes[key] = value.split(before).join(after);
    }
  }
}

/** Upload only media references retained by the accepted masked snapshot. */
export async function resolvePendingMediaUploads(
  span: object,
  attributes: Record<string, any>,
  authority: UploadAuthority,
  diagnostics?: DeliveryDiagnostics,
): Promise<void> {
  const pending = pendingBySpan.get(span) ?? [];
  pendingBySpan.delete(span);
  try {
    for (const item of pending) {
      const retained = item.prefixes.filter(
        (prefix) =>
          attributes[`${prefix}.sha256`] === item.sha256 &&
          attributes[`${prefix}.state`] === "pending-upload",
      );
      if (retained.length === 0) {
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: "upload skipped: media reference removed by mask",
        });
        continue;
      }
      if (!authority.available) {
        const unavailableReason = safeUnavailableReason(authority.unavailableReason);
        diagnostics?.recordTypedMedia("unavailable", retained.length);
        diagnostics?.recordTypedMedia("failures", retained.length);
        diagnostics?.recordUploadFailure("prepare", unavailableReason);
        const safePreview = `upload unavailable: ${unavailableReason}`;
        for (const prefix of retained) {
          attributes[`${prefix}.state`] = "failed";
          attributes[`${prefix}.safe_preview`] = safePreview;
        }
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
        diagnostics?.recordTypedMedia("failures", retained.length);
        diagnostics?.recordUploadFailure("validate", "payload_too_large");
        const safePreview = "upload failed: validate/payload_too_large";
        for (const prefix of retained) {
          attributes[`${prefix}.state`] = "failed";
          attributes[`${prefix}.safe_preview`] = safePreview;
        }
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: safePreview,
        });
        continue;
      }
      if (!isSupportedTypedMediaMimeType(item.mimeType)) {
        diagnostics?.recordTypedMedia("failures", retained.length);
        diagnostics?.recordUploadFailure("validate", "unsupported_mime_type");
        const safePreview = "upload failed: validate/unsupported_mime_type";
        for (const prefix of retained) {
          attributes[`${prefix}.state`] = "failed";
          attributes[`${prefix}.safe_preview`] = safePreview;
        }
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
        const receipt = assertReadyUploadReceipt(await authority.upload(payload), payload);
        diagnostics?.recordTypedMedia("uploads", retained.length);
        for (const prefix of retained) {
          attributes[`${prefix}.id`] = receipt.reference.id;
          attributes[`${prefix}.reference`] = receipt.reference.id;
          attributes[`${prefix}.source`] = "uploaded";
          attributes[`${prefix}.state`] = "available";
          attributes[`${prefix}.content_encoding`] = receipt.reference.contentEncoding;
          delete attributes[`${prefix}.safe_preview`];
        }
        rewritePendingPlaceholder(attributes, item, {
          id: receipt.reference.id,
          reference: receipt.reference.id,
          source: "uploaded",
          state: "available",
          content_encoding: receipt.reference.contentEncoding,
        });
      } catch (error) {
        const failure = safeFailure(error);
        diagnostics?.recordTypedMedia("failures", retained.length);
        diagnostics?.recordUploadFailure(failure.stage, failure.reason);
        const safePreview = `upload failed: ${failure.stage}/${failure.reason}`;
        for (const prefix of retained) {
          attributes[`${prefix}.state`] = "failed";
          attributes[`${prefix}.safe_preview`] = safePreview;
        }
        rewritePendingPlaceholder(attributes, item, {
          state: "failed",
          safe_preview: safePreview,
        });
      }
    }
  } finally {
    retainedPendingBytes = Math.max(
      0,
      retainedPendingBytes - pending.reduce((total, item) => total + item.byteLength, 0),
    );
  }
}

/** Drop out-of-band bytes when a span is filtered or never exported. */
export function discardPendingMedia(span: object): void {
  const pending = pendingBySpan.get(span) ?? [];
  pendingBySpan.delete(span);
  retainedPendingBytes = Math.max(
    0,
    retainedPendingBytes - pending.reduce((total, item) => total + item.byteLength, 0),
  );
}
