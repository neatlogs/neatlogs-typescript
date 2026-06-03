import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { __version__ } from '../../src/version.js';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
);

describe('version', () => {
  it('should export a version string', () => {
    expect(typeof __version__).toBe('string');
  });

  it('should be a valid semver-like version', () => {
    expect(__version__).toMatch(/^\d+\.\d+\.\d+/);
  });

  // Reads package.json dynamically (not a hardcoded literal) so it can never go
  // stale: it enforces that the `version:sync` / prebuild step ran. If this fails,
  // run `npm run version:sync`.
  it('should match package.json version', () => {
    expect(__version__).toBe(pkg.version);
  });
});
