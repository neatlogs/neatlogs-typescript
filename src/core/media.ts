import { createHash } from "node:crypto";

export type MediaRecord = Record<string, string | number>;

function mediaKind(mimeType: string, declared = ""): string {
  const value = declared.toLowerCase().replace(/^input_/, "");
  if (["image", "audio", "video", "document"].includes(value)) return value;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/"))
    return "document";
  return "media";
}

function inlineRecord(
  input: string,
  mimeType: string,
  declared: string,
  purpose: string,
): MediaRecord | null {
  let encoded = input;
  if (input.startsWith("data:")) {
    const comma = input.indexOf(",");
    if (comma < 0) return null;
    const header = input.slice(5, comma);
    if (!header.split(";").includes("base64")) return null;
    mimeType = header.split(";", 1)[0] || mimeType;
    encoded = input.slice(comma + 1);
  }
  try {
    const normalized = encoded.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
    const bytes = Buffer.from(normalized, "base64");
    if (
      bytes.toString("base64").replace(/=+$/, "") !==
      normalized.replace(/=+$/, "")
    ) {
      return null;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      id: `nl_media_${sha256.slice(0, 24)}`,
      type: mediaKind(mimeType, declared),
      source: "inline",
      mime_type: mimeType || "application/octet-stream",
      byte_length: bytes.byteLength,
      sha256,
      purpose,
      state: "inline",
    };
  } catch {
    return null;
  }
}

function referenceRecord(
  reference: string,
  mimeType: string,
  declared: string,
  purpose: string,
): MediaRecord {
  const digest = createHash("sha256").update(reference).digest("hex");
  const hasNetworkScheme = /^https?:\/\//i.test(reference);
  return {
    id: `nl_media_${digest.slice(0, 24)}`,
    type: mediaKind(mimeType, declared),
    source: hasNetworkScheme ? "url" : "provider",
    mime_type: mimeType || "application/octet-stream",
    reference,
    purpose,
    state: "available",
  };
}

export function mediaReferences(
  value: unknown,
  purpose: string,
): MediaRecord[] {
  const found: MediaRecord[] = [];
  const visited = new WeakSet<object>();
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const declared = String(node.type ?? "");
    const mimeType = String(node.mime_type ?? node.mimeType ?? "");
    const image =
      typeof node.image_url === "object" ? node.image_url?.url : node.image_url;
    if (typeof image === "string") {
      const record = image.startsWith("data:")
        ? inlineRecord(image, mimeType, "image", purpose)
        : referenceRecord(image, mimeType, "image", purpose);
      if (record) found.push(record);
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
      if (record) found.push(record);
    }
    const fileData = node.file_data ?? node.fileData;
    if (typeof fileData === "string") {
      const record = inlineRecord(
        fileData,
        mimeType,
        declared || "document",
        purpose,
      );
      if (record) found.push(record);
    }
    const reference = node.file_id ?? node.file_uri ?? node.fileUri ?? node.url;
    if (
      typeof reference === "string" &&
      (["file", "input_file"].includes(declared) || !!mimeType)
    ) {
      found.push(
        referenceRecord(reference, mimeType, declared || "document", purpose),
      );
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  const unique = new Map<string, MediaRecord>();
  for (const record of found) {
    unique.set(
      `${record.sha256 ?? ""}:${record.reference ?? ""}:${record.type}`,
      record,
    );
  }
  return [...unique.values()];
}

export function setMediaAttributes(
  span: { setAttribute(name: string, value: string | number): unknown },
  prefix: string,
  value: unknown,
  purpose: string,
): void {
  mediaReferences(value, purpose).forEach((record, index) => {
    Object.entries(record).forEach(([key, item]) =>
      span.setAttribute(`${prefix}.media.${index}.${key}`, item),
    );
  });
}
