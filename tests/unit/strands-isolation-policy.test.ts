import { describe, expect, it } from 'vitest';

import { strandsHooks } from '../../src/strands.js';

describe('strandsHooks isolation policy', () => {
  it('always rejects the global-context Strands integration', () => {
    expect(() => strandsHooks({})).toThrowError(
      /cannot be isolated from other tracing SDKs/,
    );
  });
});
