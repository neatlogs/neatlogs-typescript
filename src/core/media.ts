import { createHash } from "node:crypto";

export type MediaRecord = Record<string, string | number>;

function mediaKind(mimeType: string, declared = ""): string {
  const value = declared.toLowerCase().replace(/^input_/, "");
  if (value === "file") return "document";
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
  const normalizedInput = input.trim();
  let encoded = normalizedInput;
  if (/^data:/i.test(normalizedInput)) {
    const comma = normalizedInput.indexOf(",");
    if (comma < 0) return null;
    const header = normalizedInput.slice(5, comma);
    if (!header.toLowerCase().split(";").includes("base64")) return null;
    mimeType = header.split(";", 1)[0] || mimeType;
    encoded = normalizedInput.slice(comma + 1);
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
): MediaRecord | null {
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
    // Malformed URL-like references are unsafe to export verbatim because
    // their authority or query credentials cannot be isolated reliably.
    if (/^(?:\/\/|[a-z][a-z\d+.-]*:)/i.test(normalizedReference)) return null;
  }
  // The original value is used only as one-way identity input. This keeps
  // query-addressed media distinct without exporting query values.
  const digest = createHash("sha256").update(reference).digest("hex");
  return {
    id: `nl_media_${digest.slice(0, 24)}`,
    type: mediaKind(mimeType, declared),
    source: isURLReference ? "url" : "provider",
    mime_type: mimeType || "application/octet-stream",
    reference: safeReference,
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
  const visit = (node: any, inheritedDeclared = ""): void => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item));
      return;
    }
    const declared = String(node.type ?? inheritedDeclared);
    const mimeType = String(node.mime_type ?? node.mimeType ?? "");
    const image =
      typeof node.image_url === "object" ? node.image_url?.url : node.image_url;
    if (typeof image === "string") {
      const record = /^\s*data:/i.test(image)
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
    const reference =
      node.file_id ??
      node.file_url ??
      node.file_uri ??
      node.fileUri ??
      node.url;
    if (
      typeof reference === "string" &&
      (["file", "input_file"].includes(declared) || !!mimeType)
    ) {
      const record = referenceRecord(
        reference,
        mimeType,
        declared || "document",
        purpose,
      );
      if (record) found.push(record);
    }
    for (const [key, item] of Object.entries(node)) {
      const childDeclared =
        key === "file" && ["file", "input_file"].includes(declared)
          ? declared
          : "";
      visit(item, childDeclared);
    }
  };
  visit(value);
  const unique = new Map<string, MediaRecord>();
  for (const record of found) {
    unique.set(
      `${record.id}:${record.sha256 ?? ""}:${record.reference ?? ""}:${record.type}`,
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
