/**
 * Additional edge-case tests for llm-binder (bindTemplates).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bindTemplates } from '../../src/core/llm-binder.js';
import { PromptContext, UserPromptContext, PromptTemplate, UserPromptTemplate } from '../../src/prompt/template.js';

describe('bindTemplates', () => {
  beforeEach(() => {
    PromptContext.clear();
    UserPromptContext.clear();
  });

  it('should wrap invoke() method and inject template context', () => {
    // Use a template with no variables so compile() succeeds without args
    const systemTpl = new PromptTemplate('You are a helpful assistant');
    const callResults: string[] = [];

    const mockLlm = {
      invoke: vi.fn((...args: any[]) => {
        callResults.push('invoked');
        return 'llm response';
      }),
    };

    const bound = bindTemplates(mockLlm, systemTpl);

    const result = bound.invoke('test input');
    expect(result).toBe('llm response');
    expect(callResults).toEqual(['invoked']);
  });

  it('should wrap call() method when invoke() is not present', () => {
    const systemTpl = new PromptTemplate('System prompt with no vars');

    const mockLlm = {
      call: vi.fn(() => 'call response'),
    };

    const bound = bindTemplates(mockLlm, systemTpl);
    const result = bound.call('test');
    expect(result).toBe('call response');
  });

  it('should prefer invoke() over call()', () => {
    const systemTpl = new PromptTemplate('System prompt');
    const invokeMock = vi.fn(() => 'invoke result');
    const callMock = vi.fn(() => 'call result');

    const mockLlm = {
      invoke: invokeMock,
      call: callMock,
    };

    const bound = bindTemplates(mockLlm, systemTpl);
    const result = bound.invoke('test');
    expect(result).toBe('invoke result');
    expect(invokeMock).toHaveBeenCalled();
    expect(callMock).not.toHaveBeenCalled();
  });

  it('should return unmodified LLM when neither invoke() nor call() exists', () => {
    const systemTpl = new PromptTemplate('System prompt');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockLlm = { name: 'no-method-llm' };
    const bound = bindTemplates(mockLlm, systemTpl);

    // Should return the llm copy without wrapping
    expect(bound.name).toBe('no-method-llm');
    warnSpy.mockRestore();
  });

  it('should compile user template with variables when provided', () => {
    // Use templates without variables (or provide all needed vars via compiledVars)
    const systemTpl = new PromptTemplate('System prompt no vars');
    const userTpl = new UserPromptTemplate('Question: {{q}}');

    const mockLlm = {
      invoke: vi.fn(() => 'response'),
    };

    const bound = bindTemplates(mockLlm, systemTpl, userTpl, { q: 'What is JS?' });
    bound.invoke('test');

    expect(mockLlm.invoke).toHaveBeenCalled();
  });

  it('should clear PromptContext after invoke completes', () => {
    const systemTpl = new PromptTemplate('System prompt no vars');
    const clearSpy = vi.spyOn(PromptContext, 'clear');

    const mockLlm = {
      invoke: vi.fn(() => 'response'),
    };

    const bound = bindTemplates(mockLlm, systemTpl);
    bound.invoke('test');

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('should clear UserPromptContext after invoke completes when userTpl provided', () => {
    const systemTpl = new PromptTemplate('System prompt no vars');
    const userTpl = new UserPromptTemplate('User: {{msg}}');
    const clearSpy = vi.spyOn(UserPromptContext, 'clear');

    const mockLlm = {
      invoke: vi.fn(() => 'response'),
    };

    const bound = bindTemplates(mockLlm, systemTpl, userTpl, { msg: 'hello' });
    bound.invoke('test');

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('should clear contexts even when original method throws', () => {
    const systemTpl = new PromptTemplate('System prompt no vars');
    const userTpl = new UserPromptTemplate('User: {{msg}}');
    const promptClearSpy = vi.spyOn(PromptContext, 'clear');
    const userClearSpy = vi.spyOn(UserPromptContext, 'clear');

    const mockLlm = {
      invoke: vi.fn(() => {
        throw new Error('LLM error');
      }),
    };

    const bound = bindTemplates(mockLlm, systemTpl, userTpl, { msg: 'hello' });
    expect(() => bound.invoke('test')).toThrow('LLM error');

    expect(promptClearSpy).toHaveBeenCalled();
    expect(userClearSpy).toHaveBeenCalled();
    promptClearSpy.mockRestore();
    userClearSpy.mockRestore();
  });

  it('should create a copy of the LLM object (not mutate original)', () => {
    const systemTpl = new PromptTemplate('System prompt no vars');
    const originalInvoke = vi.fn(() => 'original');

    const mockLlm = {
      invoke: originalInvoke,
      otherProp: 'keep-me',
    };

    const bound = bindTemplates(mockLlm, systemTpl);

    // Original invoke should not be replaced
    expect(mockLlm.invoke).toBe(originalInvoke);
    // Bound should have a different invoke
    expect(bound.invoke).not.toBe(originalInvoke);
    // Other properties should be preserved
    expect(bound.otherProp).toBe('keep-me');
  });

  it('should not compile userTpl when compiledVars is not provided', () => {
    const systemTpl = new PromptTemplate('System prompt no vars');
    const userTpl = new UserPromptTemplate('User: {{msg}}');
    const compileSpy = vi.spyOn(userTpl, 'compile');

    const mockLlm = {
      invoke: vi.fn(() => 'response'),
    };

    // Pass userTpl but no compiledVars
    const bound = bindTemplates(mockLlm, systemTpl, userTpl);
    bound.invoke('test');

    expect(compileSpy).not.toHaveBeenCalled();
    compileSpy.mockRestore();
  });

  it('should handle LLM with prototype chain correctly', () => {
    const systemTpl = new PromptTemplate('System prompt no vars');

    class BaseLlm {
      invoke(input: string) {
        return `base: ${input}`;
      }
    }

    class DerivedLlm extends BaseLlm {
      invoke(input: string) {
        return `derived: ${input}`;
      }
    }

    const llm = new DerivedLlm();
    const bound = bindTemplates(llm, systemTpl);
    const result = bound.invoke('test');

    expect(result).toBe('derived: test');
  });
});
