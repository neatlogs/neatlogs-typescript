import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { init, shutdown } from '../../src/index.js';

describe('init apiKey resolution', () => {
  const ORIGINAL = process.env.NEATLOGS_API_KEY;

  beforeEach(() => {
    process.env.NEATLOGS_API_KEY = 'env-key';
  });

  afterEach(async () => {
    await shutdown();
    if (ORIGINAL === undefined) {
      delete process.env.NEATLOGS_API_KEY;
    } else {
      process.env.NEATLOGS_API_KEY = ORIGINAL;
    }
  });

  it('empty-string apiKey falls back to the env key; re-init without apiKey stays idempotent', async () => {
    await init({ apiKey: '', workflowName: 'k', disableExport: true, registerShutdownHandlers: false });
    await expect(
      init({ workflowName: 'k', disableExport: true, registerShutdownHandlers: false }),
    ).resolves.toBeUndefined();
  });

  it('whitespace apiKey falls back to the env key', async () => {
    await init({ apiKey: '   ', workflowName: 'k', disableExport: true, registerShutdownHandlers: false });
    await expect(
      init({ workflowName: 'k', disableExport: true, registerShutdownHandlers: false }),
    ).resolves.toBeUndefined();
  });

  it('explicit apiKey still wins over the env var, and a later env-only init conflicts', async () => {
    await init({ apiKey: 'explicit-key', workflowName: 'k', disableExport: true, registerShutdownHandlers: false });
    await expect(
      init({ apiKey: 'explicit-key', workflowName: 'k', disableExport: true, registerShutdownHandlers: false }),
    ).resolves.toBeUndefined();
    await expect(
      init({ workflowName: 'k', disableExport: true, registerShutdownHandlers: false }),
    ).rejects.toThrow(/different configuration/);
  });
});
