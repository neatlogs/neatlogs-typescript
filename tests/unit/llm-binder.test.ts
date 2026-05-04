import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bindTemplates } from '../../src/core/llm-binder.js';
import { PromptContext, UserPromptContext } from '../../src/prompt/template.js';

describe('bindTemplates', () => {
  beforeEach(() => {
    PromptContext.clear();
    UserPromptContext.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should wrap invoke() on an LLM with invoke method', () => {
    const originalInvoke = vi.fn().mockReturnValue('response');
    const llm = {
      invoke: originalInvoke,
    };
    const systemTpl = {
      template: 'You are a {{role}} assistant',
      compile: vi.fn(),
    };

    const bound = bindTemplates(llm, systemTpl);
    expect(bound).not.toBe(llm); // Should be a copy
    expect(typeof bound.invoke).toBe('function');

    const result = bound.invoke('hello');
    expect(result).toBe('response');
    expect(systemTpl.compile).toHaveBeenCalled();
  });

  it('should wrap call() when invoke() is not available', () => {
    const originalCall = vi.fn().mockReturnValue('call-response');
    const llm = {
      call: originalCall,
    };
    const systemTpl = {
      template: 'System prompt',
      compile: vi.fn(),
    };

    const bound = bindTemplates(llm, systemTpl);
    expect(typeof bound.call).toBe('function');

    const result = bound.call('input');
    expect(result).toBe('call-response');
    expect(systemTpl.compile).toHaveBeenCalled();
  });

  it('should return llm unchanged when neither invoke() nor call() exists', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const llm = { someOtherMethod: () => {} };
    const systemTpl = {
      template: 'System prompt',
      compile: vi.fn(),
    };

    const bound = bindTemplates(llm, systemTpl);
    // Should still be returned (as a copy or the original)
    expect(bound).toBeDefined();
    expect(typeof bound.invoke).not.toBe('function');
    expect(typeof bound.call).not.toBe('function');
  });

  it('should compile user template with vars when provided', () => {
    const llm = {
      invoke: vi.fn().mockReturnValue('ok'),
    };
    const systemTpl = {
      template: 'System prompt',
      compile: vi.fn(),
    };
    const userTpl = {
      template: 'Tell me about {{topic}}',
      compile: vi.fn(),
    };
    const vars = { topic: 'cats' };

    const bound = bindTemplates(llm, systemTpl, userTpl, vars);
    bound.invoke('input');

    expect(systemTpl.compile).toHaveBeenCalled();
    expect(userTpl.compile).toHaveBeenCalledWith(vars);
  });

  it('should not compile user template when no compiledVars provided', () => {
    const llm = {
      invoke: vi.fn().mockReturnValue('ok'),
    };
    const systemTpl = {
      template: 'System',
      compile: vi.fn(),
    };
    const userTpl = {
      template: 'User prompt',
      compile: vi.fn(),
    };

    const bound = bindTemplates(llm, systemTpl, userTpl);
    bound.invoke('input');

    expect(systemTpl.compile).toHaveBeenCalled();
    expect(userTpl.compile).not.toHaveBeenCalled();
  });

  it('should clear PromptContext after invoke even on success', () => {
    const llm = {
      invoke: vi.fn().mockReturnValue('ok'),
    };
    const systemTpl = {
      template: 'System',
      compile: () => {
        PromptContext.set('System', {});
      },
    };

    const bound = bindTemplates(llm, systemTpl);
    bound.invoke('input');

    // PromptContext should have been cleared in finally
    expect(PromptContext.getTemplate()).toBeUndefined();
  });

  it('should clear both contexts when user template is provided', () => {
    const llm = {
      invoke: vi.fn().mockReturnValue('ok'),
    };
    const systemTpl = {
      template: 'System',
      compile: () => {
        PromptContext.set('System', {});
      },
    };
    const userTpl = {
      template: 'User {{x}}',
      compile: (vars: any) => {
        UserPromptContext.set('User {{x}}', vars);
      },
    };

    const bound = bindTemplates(llm, systemTpl, userTpl, { x: '1' });
    bound.invoke('input');

    expect(PromptContext.getTemplate()).toBeUndefined();
    expect(UserPromptContext.getTemplate()).toBeUndefined();
  });

  it('should clear contexts even when original method throws', () => {
    const llm = {
      invoke: vi.fn().mockImplementation(() => {
        throw new Error('LLM error');
      }),
    };
    const systemTpl = {
      template: 'System',
      compile: () => {
        PromptContext.set('System', {});
      },
    };
    const userTpl = {
      template: 'User {{x}}',
      compile: (vars: any) => {
        UserPromptContext.set('User {{x}}', vars);
      },
    };

    const bound = bindTemplates(llm, systemTpl, userTpl, { x: '1' });
    expect(() => bound.invoke('input')).toThrow('LLM error');

    // Contexts should still be cleared
    expect(PromptContext.getTemplate()).toBeUndefined();
    expect(UserPromptContext.getTemplate()).toBeUndefined();
  });

  it('should pass through all arguments to the original method', () => {
    const originalInvoke = vi.fn().mockReturnValue('done');
    const llm = { invoke: originalInvoke };
    const systemTpl = {
      template: 'System',
      compile: vi.fn(),
    };

    const bound = bindTemplates(llm, systemTpl);
    bound.invoke('arg1', 'arg2', { key: 'val' });

    expect(originalInvoke).toHaveBeenCalledWith('arg1', 'arg2', { key: 'val' });
  });

  it('should prefer invoke over call when both exist', () => {
    const invokeMethod = vi.fn().mockReturnValue('from-invoke');
    const callMethod = vi.fn().mockReturnValue('from-call');
    const llm = {
      invoke: invokeMethod,
      call: callMethod,
    };
    const systemTpl = {
      template: 'System',
      compile: vi.fn(),
    };

    const bound = bindTemplates(llm, systemTpl);
    const result = bound.invoke('input');

    expect(result).toBe('from-invoke');
    expect(invokeMethod).toHaveBeenCalled();
    expect(callMethod).not.toHaveBeenCalled();
  });

  it('should handle non-copyable LLMs by binding in place', () => {
    // Create an object that can't be structured-cloned or copied via Object.create
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    class NonCopyableLLM {
      invoke(...args: any[]) {
        return 'original';
      }
    }

    // structuredClone will fail on class instances with methods,
    // Object.create should work though. This tests the fallback chain.
    const llm = new NonCopyableLLM();
    const systemTpl = {
      template: 'System',
      compile: vi.fn(),
    };

    const bound = bindTemplates(llm, systemTpl);
    expect(typeof bound.invoke).toBe('function');
  });
});
