import { afterEach, describe, expect, it } from 'vitest';
import {
  addVerificationMarkerResourceAttribute,
  verificationMarkerFromEnv,
} from '../../src/core/resource.js';

const previous = process.env.OTEL_RESOURCE_ATTRIBUTES;

afterEach(() => {
  if (previous === undefined) delete process.env.OTEL_RESOURCE_ATTRIBUTES;
  else process.env.OTEL_RESOURCE_ATTRIBUTES = previous;
});

describe('verification marker resource attribute', () => {
  it('extracts only the exact marker while preserving encoded content', () => {
    process.env.OTEL_RESOURCE_ATTRIBUTES =
      'service.name=app,neatlogs.verification.marker=run%2D123,other=value';
    expect(verificationMarkerFromEnv()).toBe('run-123');
    const attributes: Record<string, string | number | boolean> = {};
    addVerificationMarkerResourceAttribute(attributes);
    expect(attributes['neatlogs.verification.marker']).toBe('run-123');
  });

  it('rejects empty, malformed, and oversized markers', () => {
    expect(verificationMarkerFromEnv('neatlogs.verification.marker=')).toBeUndefined();
    expect(verificationMarkerFromEnv('not-the-marker=value')).toBeUndefined();
    expect(
      verificationMarkerFromEnv(
        `neatlogs.verification.marker=${'x'.repeat(129)}`,
      ),
    ).toBeUndefined();
  });
});
