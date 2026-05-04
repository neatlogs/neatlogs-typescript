import { describe, it, expect } from 'vitest';

describe('project setup', () => {
  it('should have correct TypeScript types', async () => {
    // Verify types module can be imported
    const types = await import('../src/types.js');
    expect(types).toBeDefined();
  });
});
