/**
 * init() atomicity under the isolation gate.
 *
 * When init() rejects an unsafe auto-instrumentation, it must
 * leave NO partially-initialized state behind — no accessible tracer provider,
 * no half-set module state — so the very next init() starts clean and can't leak
 * an abandoned provider. The pre-flight gate runs before any provider is created.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { getTracerProvider, init, shutdown } from '../../src/init.js';

afterEach(async () => {
  // Best-effort: leave no global state between cases regardless of pass/fail.
  await shutdown().catch(() => {});
});

describe('init() atomicity under the isolation gate', () => {
  it('leaves no accessible provider after a rejected isolated init', async () => {
    await expect(
      init({
        apiKey: 'test-key',
        disableExport: true,
        instrumentations: ['openai'],
        registerShutdownHandlers: false,
      }),
    ).rejects.toThrow(/cannot guarantee isolation/);

    // The user-reported bug: providerAccessibleAfterRejectedInit === true.
    // getTracerProvider() must throw because init() was never completed.
    expect(() => getTracerProvider()).toThrow(/not initialized/);
  });

  it('allows a clean init immediately after a rejected one (no leaked provider)', async () => {
    await expect(
      init({
        apiKey: 'test-key',
        disableExport: true,
        instrumentations: ['anthropic'],
        registerShutdownHandlers: false,
      }),
    ).rejects.toThrow(/cannot guarantee isolation/);

    // Fresh init with no unsafe instrumentation must succeed and expose a provider.
    await init({
      apiKey: 'test-key',
      disableExport: true,
      registerShutdownHandlers: false,
    });
    expect(getTracerProvider()).toBeDefined();
  });

  it('does not touch module state when the gate rejects (isDebugEnabled stays false)', async () => {
    const { isDebugEnabled } = await import('../../src/init.js');
    await expect(
      init({
        apiKey: 'test-key',
        disableExport: true,
        debug: true, // would flip _debugMode if state were mutated before the gate
        instrumentations: ['openai'],
        registerShutdownHandlers: false,
      }),
    ).rejects.toThrow(/cannot guarantee isolation/);

    // The gate runs BEFORE the debug flag is set, so a rejected init leaves it off.
    expect(isDebugEnabled()).toBe(false);
  });

  it('has no shared-provider escape hatch for unsafe instrumentations', async () => {
    await expect(
      init({
        apiKey: 'test-key',
        disableExport: true,
        instrumentations: ['openai'],
        registerShutdownHandlers: false,
      }),
    ).rejects.toThrow(/does not support shared global-context instrumentation/);
    expect(() => getTracerProvider()).toThrow(/not initialized/);
  });
});
