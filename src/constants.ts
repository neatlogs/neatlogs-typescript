/** Stable SDK-wide defaults shared by every NeatLogs entry point. */
export const DEFAULT_INGEST_ENDPOINT = 'https://ingest.neatlogs.com' as const;
export const DEFAULT_MAX_QUEUE_ITEMS = 2048;
export const DEFAULT_MAX_SEMANTIC_STREAM_EVENTS = 128;
export const DEFAULT_MAX_STREAM_CAPTURE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_STREAM_CAPTURE_ITEMS = 1024;

/** UTF-8 byte length without allocating a second buffer for hostile stream chunks. */
export function utf8ByteLength(
  value: string,
  limit = Number.MAX_SAFE_INTEGER,
): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > limit) return limit + 1;
  }
  return bytes;
}

export function exportQueueCapacity(batchSize: number): number {
  return Math.max(DEFAULT_MAX_QUEUE_ITEMS, batchSize * 4);
}

export const DEFAULT_MAX_SPAN_ATTRIBUTES = 10_000;

/**
 * OpenTelemetry defaults to 128 span attributes, which can silently drop
 * semantic attributes in LLM apps (retrieval docs, tool IO, etc). If the user
 * explicitly sets OTel limits via env vars, respect that by leaving
 * attributeCountLimit unset so the SDK's env-driven defaults apply. Otherwise
 * raise the budget. Mirrors the Python SDK's _span_limits_for_capture_everything.
 */
export function spanLimitsForCaptureEverything(): { attributeCountLimit?: number } {
  const spanLimit = (process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT ?? '').trim();
  const generalLimit = (process.env.OTEL_ATTRIBUTE_COUNT_LIMIT ?? '').trim();
  if (spanLimit || generalLimit) return {};
  return { attributeCountLimit: DEFAULT_MAX_SPAN_ATTRIBUTES };
}
