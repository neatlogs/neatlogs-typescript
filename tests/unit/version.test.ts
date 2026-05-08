import { describe, it, expect } from 'vitest';
import { __version__ } from '../../src/version.js';

describe('version', () => {
  it('should export a version string', () => {
    expect(typeof __version__).toBe('string');
  });

  it('should be a valid semver-like version', () => {
    expect(__version__).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should match package.json version', () => {
    expect(__version__).toBe('1.0.0');
  });
});
