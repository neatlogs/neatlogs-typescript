/**
 * Tests that verify all public exports from the main barrel (src/index.ts)
 * are accessible and have the expected types.
 */
import { describe, it, expect } from 'vitest';

describe('barrel exports (src/index.ts)', () => {
  it('should export lifecycle functions', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.init).toBe('function');
    expect(typeof mod.flush).toBe('function');
    expect(typeof mod.shutdown).toBe('function');
  });

  it('should export instrumentation functions', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.span).toBe('function');
    expect(typeof mod.Span).toBe('function');
    expect(typeof mod.trace).toBe('function');
    expect(typeof mod.log).toBe('function');
  });

  it('should export prompt management classes', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.PromptTemplate).toBeDefined();
    expect(mod.UserPromptTemplate).toBeDefined();
    expect(typeof mod.PromptTemplate).toBe('function'); // class constructor
    expect(typeof mod.UserPromptTemplate).toBe('function');
  });

  it('should export PromptClient and PromptHandle', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.PromptClient).toBeDefined();
    expect(mod.PromptHandle).toBeDefined();
    expect(typeof mod.PromptClient).toBe('function');
    expect(typeof mod.PromptHandle).toBe('function');
  });

  it('should export prompt error classes', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.PromptClientError).toBeDefined();
    expect(mod.PromptApiError).toBeDefined();
    expect(mod.PromptNotFoundError).toBeDefined();
    // These should be Error subclasses
    expect(new mod.PromptClientError('test')).toBeInstanceOf(Error);
    expect(new mod.PromptApiError('test')).toBeInstanceOf(Error);
    expect(new mod.PromptNotFoundError('test')).toBeInstanceOf(Error);
  });

  it('should export prompt CRUD functions', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.getPrompt).toBe('function');
    expect(typeof mod.fetchPrompt).toBe('function');
    expect(typeof mod.listPrompts).toBe('function');
    expect(typeof mod.createPrompt).toBe('function');
    expect(typeof mod.updatePrompt).toBe('function');
    expect(typeof mod.saveAsVersion).toBe('function');
    expect(typeof mod.deletePrompt).toBe('function');
    expect(typeof mod.removeTag).toBe('function');
  });

  it('should export utility functions', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.bindTemplates).toBe('function');
    expect(typeof mod.registerCrewaiTask).toBe('function');
  });

  it('should export __version__', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.__version__).toBeDefined();
    expect(typeof mod.__version__).toBe('string');
    // Should look like a semver
    expect(mod.__version__).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should export isDebugEnabled and getSessionConfig', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.isDebugEnabled).toBe('function');
    expect(typeof mod.getSessionConfig).toBe('function');
  });

  it('should allow instantiation of PromptTemplate with a string', async () => {
    const { PromptTemplate } = await import('../../src/index.js');
    const tpl = new PromptTemplate('Hello {{name}}');
    expect(tpl.variables).toEqual(['name']);
    expect(tpl.template).toBe('Hello {{name}}');
  });

  it('should allow instantiation of UserPromptTemplate with a string', async () => {
    const { UserPromptTemplate } = await import('../../src/index.js');
    const tpl = new UserPromptTemplate('Question: {{question}}');
    expect(tpl.variables).toEqual(['question']);
    expect(tpl.template).toBe('Question: {{question}}');
  });

  it('should allow instantiation of PromptTemplate with message array', async () => {
    const { PromptTemplate } = await import('../../src/index.js');
    const tpl = new PromptTemplate([
      { role: 'system', content: 'You are {{role}}.' },
      { role: 'user', content: 'Do {{task}}.' },
    ]);
    expect(tpl.variables).toEqual(expect.arrayContaining(['role', 'task']));
  });

  it('type exports should compile (runtime import check)', async () => {
    // We can't directly test TypeScript types at runtime,
    // but we can verify the modules these types come from load correctly
    const types = await import('../../src/types.js');
    expect(types).toBeDefined();
  });
});
