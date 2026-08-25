import { context, trace as otelTrace } from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';
import { doctor, init, shutdown, trace } from '../../src/index.js';
import { getNeatlogsProvider } from '../../src/core/provider.js';

describe('doctor v1', () => {
  afterEach(async () => { await shutdown(); });

  it('is stable, credential-safe, network-free, and does not initialize', () => {
    const secret = 'doctor-secret-user-password';
    const beforeGlobal = otelTrace.getTracerProvider();
    const beforeListeners = process.listenerCount('SIGTERM');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error('doctor must not use network'); }) as typeof fetch;
    try {
      const result = doctor({ endpoint: `https://${secret}@ingest.neatlogs.com`, sampleRate: Number.NaN });
      expect(result.format_version).toBe('neatlogs.doctor/v1');
      expect(result.ready).toBe(false);
      expect(result.checks.map((item) => item.name)).toEqual([
        'runtime', 'package', 'schema', 'transport', 'endpoint', 'sampler',
        'ownership', 'queue', 'export_health', 'root',
      ]);
      expect(result.checks.find((item) => item.name === 'endpoint')?.reason_code).toBe('ENDPOINT_INVALID');
      expect(result.checks.find((item) => item.name === 'sampler')?.reason_code).toBe('SAMPLER_INVALID');
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(getNeatlogsProvider()).toBeNull();
      expect(otelTrace.getTracerProvider()).toBe(beforeGlobal);
      expect(process.listenerCount('SIGTERM')).toBe(beforeListeners);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reports disabled queue and unknown runtime evidence before init', () => {
    const result = doctor({ disableExport: true, sampleRate: 0 });
    expect(result.ready).toBe(true);
    expect(result.checks.find((item) => item.name === 'queue')).toMatchObject({ status: 'warn', reason_code: 'EXPORT_QUEUE_DISABLED' });
    expect(result.checks.find((item) => item.name === 'export_health')).toMatchObject({ status: 'unknown', reason_code: 'EXPORT_HEALTH_UNOBSERVABLE' });
    expect(result.checks.find((item) => item.name === 'root')).toMatchObject({ status: 'unknown', reason_code: 'ROOT_UNOBSERVABLE' });
  });

  it('observes a running private runtime and active root without mutating it', async () => {
    await init({ apiKey: 'test-key', disableExport: true, registerShutdownHandlers: false });
    const provider = getNeatlogsProvider();
    const beforeListeners = process.listenerCount('SIGTERM');
    await trace({ name: 'doctor-root', kind: 'WORKFLOW' }, async () => {
      const result = doctor({ disableExport: true });
      expect(result.checks.find((item) => item.name === 'root')).toMatchObject({ status: 'pass', reason_code: 'ROOT_IDS_VALID' });
      expect(result.checks.find((item) => item.name === 'root')?.details?.trace_id).toMatch(/^[0-9a-f]{32}$/);
      expect(result.checks.find((item) => item.name === 'root')?.details?.span_id).toMatch(/^[0-9a-f]{16}$/);
      expect(getNeatlogsProvider()).toBe(provider);
      expect(context.active()).toBe(context.active());
      expect(process.listenerCount('SIGTERM')).toBe(beforeListeners);
    });
  });

  it.each([-0.01, 1.01, Infinity, -Infinity, Number.NaN])('rejects invalid sample rate %s without throwing', (sampleRate) => {
    const result = doctor({ sampleRate });
    expect(result.ready).toBe(false);
    expect(result.checks.find((item) => item.name === 'sampler')?.reason_code).toBe('SAMPLER_INVALID');
  });
});
