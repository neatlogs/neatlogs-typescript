import { describe, it, expect } from 'vitest';
import { resolveIngestBaseUrl } from '../../src/init.js';
import { NeatlogsConfigurationError } from '../../src/errors.js';

describe('resolveIngestBaseUrl', () => {
  it('returns the origin for a bare base URL', () => {
    expect(resolveIngestBaseUrl('http://127.0.0.1:4318')).toBe('http://127.0.0.1:4318');
    expect(resolveIngestBaseUrl('https://ingest.example.com')).toBe('https://ingest.example.com');
  });

  it('accepts a trailing slash', () => {
    expect(resolveIngestBaseUrl('https://ingest.example.com/')).toBe('https://ingest.example.com');
  });

  it('accepts a full OTLP traces URL ending in /v1/traces', () => {
    expect(resolveIngestBaseUrl('https://ingest.example.com/v1/traces')).toBe(
      'https://ingest.example.com',
    );
    expect(resolveIngestBaseUrl('https://ingest.example.com/v1/traces/')).toBe(
      'https://ingest.example.com',
    );
  });

  it('throws on an endpoint with any other path instead of silently dropping it', () => {
    expect(() => resolveIngestBaseUrl('http://host/proxy')).toThrow(NeatlogsConfigurationError);
    expect(() => resolveIngestBaseUrl('http://host/proxy/sub')).toThrow(NeatlogsConfigurationError);
    try {
      resolveIngestBaseUrl('http://host/proxy');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NeatlogsConfigurationError);
      expect((err as NeatlogsConfigurationError).code).toBe('INVALID_ENDPOINT');
      expect((err as NeatlogsConfigurationError).option).toBe('endpoint');
      expect((err as Error).message).toContain('/v1/traces');
    }
  });

  it('still throws on a malformed endpoint', () => {
    expect(() => resolveIngestBaseUrl('not a url')).toThrow();
  });
});
