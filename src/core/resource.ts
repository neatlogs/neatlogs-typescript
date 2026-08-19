const VERIFICATION_MARKER_KEY = 'neatlogs.verification.marker';
const MAX_VERIFICATION_MARKER_LENGTH = 128;

function decodeResourceComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Read only the temporary Wizard correlation marker from OTel resource env. */
export function verificationMarkerFromEnv(
  value = process.env.OTEL_RESOURCE_ATTRIBUTES ?? '',
): string | undefined {
  for (const entry of value.split(',')) {
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const key = decodeResourceComponent(entry.slice(0, separator).trim());
    if (key !== VERIFICATION_MARKER_KEY) continue;
    const marker = decodeResourceComponent(entry.slice(separator + 1).trim());
    if (!marker || marker.length > MAX_VERIFICATION_MARKER_LENGTH) return undefined;
    return marker;
  }
  return undefined;
}

export function addVerificationMarkerResourceAttribute(
  attributes: Record<string, string | number | boolean>,
): void {
  const marker = verificationMarkerFromEnv();
  if (marker) attributes[VERIFICATION_MARKER_KEY] = marker;
}

