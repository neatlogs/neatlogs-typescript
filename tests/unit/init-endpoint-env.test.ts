import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveInitEndpoint } from '../../src/init.js';
import { DEFAULT_INGEST_ENDPOINT } from '../../src/constants.js';

describe('resolveInitEndpoint', () => {
  const ORIGINAL = process.env.NEATLOGS_ENDPOINT;

  beforeEach(() => {
    delete process.env.NEATLOGS_ENDPOINT;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.NEATLOGS_ENDPOINT;
    } else {
      process.env.NEATLOGS_ENDPOINT = ORIGINAL;
    }
  });

  it('explicit endpoint wins over the env var', () => {
    process.env.NEATLOGS_ENDPOINT = 'https://env-endpoint.example.com';
    expect(resolveInitEndpoint('https://explicit-endpoint.example.com')).toBe(
      'https://explicit-endpoint.example.com',
    );
  });

  it('falls back to NEATLOGS_ENDPOINT when no explicit endpoint', () => {
    process.env.NEATLOGS_ENDPOINT = 'https://env-endpoint.example.com';
    expect(resolveInitEndpoint(undefined)).toBe('https://env-endpoint.example.com');
    expect(resolveInitEndpoint('')).toBe('https://env-endpoint.example.com');
    expect(resolveInitEndpoint('   ')).toBe('https://env-endpoint.example.com');
  });

  it('trims the env var value', () => {
    process.env.NEATLOGS_ENDPOINT = '  https://env-endpoint.example.com  ';
    expect(resolveInitEndpoint(undefined)).toBe('https://env-endpoint.example.com');
  });

  it('defaults to prod ingest when neither explicit nor env is set', () => {
    expect(resolveInitEndpoint(undefined)).toBe(DEFAULT_INGEST_ENDPOINT);
    expect(resolveInitEndpoint('')).toBe(DEFAULT_INGEST_ENDPOINT);
  });
});
