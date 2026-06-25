import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('legacy batch exporter cleanup', () => {
  it('does not ship the custom /api/data/v4 batch exporter modules', () => {
    const repoRoot = resolve(__dirname, '../..');

    expect(existsSync(resolve(repoRoot, 'src/core/exporter.ts'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'src/core/log-exporter.ts'))).toBe(false);
  });
});
