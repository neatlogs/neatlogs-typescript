import { describe, it, expect, beforeEach } from 'vitest';
import {
  SystemPromptTemplate,
  PromptTemplate,
  UserPromptTemplate,
  PromptContext,
  UserPromptContext,
} from '../../src/prompt/template.js';

describe('PromptTemplate', () => {
  beforeEach(() => {
    PromptContext.clear();
  });

  describe('constructor + variables', () => {
    it('should extract variables from a string template', () => {
      const tpl = new PromptTemplate('You are a {{role}} assistant helping with {{topic}}');
      expect(tpl.variables).toEqual(expect.arrayContaining(['role', 'topic']));
      expect(tpl.variables).toHaveLength(2);
    });

    it('should extract variables from message array', () => {
      const tpl = new PromptTemplate([
        { role: 'system', content: 'You are a {{role}} assistant' },
        { role: 'user', content: 'Tell me about {{topic}} in {{language}}' },
      ]);
      expect(tpl.variables).toEqual(expect.arrayContaining(['role', 'topic', 'language']));
      expect(tpl.variables).toHaveLength(3);
    });

    it('should deduplicate variable names', () => {
      const tpl = new PromptTemplate('{{name}} and {{name}} again');
      expect(tpl.variables).toEqual(['name']);
    });

    it('should handle template with no variables', () => {
      const tpl = new PromptTemplate('No variables here');
      expect(tpl.variables).toEqual([]);
    });
  });

  describe('template getter', () => {
    it('should return the raw string template', () => {
      const tpl = new PromptTemplate('Hello {{name}}');
      expect(tpl.template).toBe('Hello {{name}}');
    });

    it('should return the raw message array', () => {
      const msgs = [{ role: 'system', content: 'Hi {{name}}' }];
      const tpl = new PromptTemplate(msgs);
      expect(tpl.template).toEqual(msgs);
    });
  });

  describe('compile', () => {
    it('should render a string template with variables', () => {
      const tpl = new PromptTemplate('You are a {{role}} assistant');
      const result = tpl.compile({ role: 'helpful' });
      expect(result).toBe('You are a helpful assistant');
    });

    it('should render a message array template', () => {
      const tpl = new PromptTemplate([
        { role: 'system', content: 'You are a {{role}} assistant' },
        { role: 'user', content: 'Help with {{topic}}' },
      ]);
      const result = tpl.compile({ role: 'code', topic: 'TypeScript' });
      expect(result).toEqual([
        { role: 'system', content: 'You are a code assistant' },
        { role: 'user', content: 'Help with TypeScript' },
      ]);
    });

    it('should throw on missing variables', () => {
      const tpl = new PromptTemplate('Hello {{name}}, you like {{color}}');
      expect(() => tpl.compile({ name: 'Alice' })).toThrow('Missing required variables: color');
    });

    it('should throw when no variables provided but template needs them', () => {
      const tpl = new PromptTemplate('Hello {{name}}');
      expect(() => tpl.compile()).toThrow('Missing required variables');
    });

    it('should work when template has no variables and none are provided', () => {
      const tpl = new PromptTemplate('Static text');
      expect(tpl.compile()).toBe('Static text');
    });

    it('should store template and variables in PromptContext', () => {
      const tpl = new PromptTemplate('Hi {{name}}');
      tpl.compile({ name: 'Bob' });

      expect(PromptContext.getTemplate()).toBe('Hi {{name}}');
      expect(PromptContext.getVariables()).toEqual({ name: 'Bob' });
    });

    it('should convert non-string values to strings', () => {
      const tpl = new PromptTemplate('Count: {{n}}, Flag: {{flag}}');
      const result = tpl.compile({ n: 42, flag: true });
      expect(result).toBe('Count: 42, Flag: true');
    });

    it('should handle multiple occurrences of same variable', () => {
      const tpl = new PromptTemplate('{{x}} and {{x}} again');
      const result = tpl.compile({ x: 'hello' });
      expect(result).toBe('hello and hello again');
    });
  });

  describe('_renderString', () => {
    it('should replace placeholders', () => {
      const tpl = new PromptTemplate('');
      expect(tpl._renderString('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
    });
  });

  describe('toString', () => {
    it('should show short string templates', () => {
      const tpl = new PromptTemplate('Hi');
      expect(tpl.toString()).toBe("SystemPromptTemplate('Hi')");
    });

    it('should truncate long string templates', () => {
      const longStr = 'A'.repeat(60);
      const tpl = new PromptTemplate(longStr);
      expect(tpl.toString()).toContain('...');
      expect(tpl.toString()).toContain("SystemPromptTemplate('");
    });

    it('should show message count for arrays', () => {
      const tpl = new PromptTemplate([
        { role: 'system', content: 'A' },
        { role: 'user', content: 'B' },
      ]);
      expect(tpl.toString()).toContain('2 messages');
    });
  });
});


describe('SystemPromptTemplate', () => {
  beforeEach(() => {
    PromptContext.clear();
  });

  it('is the canonical system prompt template class', () => {
    const tpl = new SystemPromptTemplate('You are a {{role}} assistant');
    expect(tpl.variables).toEqual(['role']);
    expect(tpl.compile({ role: 'helpful' })).toBe('You are a helpful assistant');
    expect(tpl.toString()).toBe("SystemPromptTemplate('You are a {{role}} assistant')");
  });

  it('keeps PromptTemplate as a backward-compatible alias', () => {
    expect(PromptTemplate).toBe(SystemPromptTemplate);
    const tpl = new PromptTemplate('Hi {{name}}');
    tpl.compile({ name: 'Ada' });
    expect(PromptContext.getTemplate()).toBe('Hi {{name}}');
    expect(PromptContext.getVariables()).toEqual({ name: 'Ada' });
  });
});

describe('PromptContext', () => {
  beforeEach(() => {
    PromptContext.clear();
  });

  it('should return undefined when not set', () => {
    PromptContext.clear();
    expect(PromptContext.getTemplate()).toBeUndefined();
    expect(PromptContext.getVariables()).toBeUndefined();
  });

  it('should store and retrieve template + variables', () => {
    PromptContext.set('Hello {{name}}', { name: 'World' });
    expect(PromptContext.getTemplate()).toBe('Hello {{name}}');
    expect(PromptContext.getVariables()).toEqual({ name: 'World' });
  });

  it('should clear stored data', () => {
    PromptContext.set('test', { a: 1 });
    PromptContext.clear();
    expect(PromptContext.getTemplate()).toBeUndefined();
    expect(PromptContext.getVariables()).toBeUndefined();
  });
});

describe('UserPromptTemplate', () => {
  beforeEach(() => {
    UserPromptContext.clear();
  });

  it('should extract variables from string', () => {
    const tpl = new UserPromptTemplate('Tell me about {{topic}}');
    expect(tpl.variables).toEqual(['topic']);
  });

  it('should compile string template', () => {
    const tpl = new UserPromptTemplate('Tell me about {{topic}}');
    const result = tpl.compile({ topic: 'cats' });
    expect(result).toBe('Tell me about cats');
  });

  it('should compile message array template', () => {
    const tpl = new UserPromptTemplate([
      { role: 'user', content: 'Tell me about {{topic}}' },
    ]);
    const result = tpl.compile({ topic: 'dogs' });
    expect(result).toEqual([{ role: 'user', content: 'Tell me about dogs' }]);
  });

  it('should store context in UserPromptContext (not PromptContext)', () => {
    const tpl = new UserPromptTemplate('{{query}}');
    tpl.compile({ query: 'hello' });

    expect(UserPromptContext.getTemplate()).toBe('{{query}}');
    expect(UserPromptContext.getVariables()).toEqual({ query: 'hello' });
    // System context should be unaffected
    expect(PromptContext.getTemplate()).toBeUndefined();
  });

  it('should throw on missing variables', () => {
    const tpl = new UserPromptTemplate('{{a}} {{b}}');
    expect(() => tpl.compile({ a: '1' })).toThrow('Missing required variables: b');
  });

  describe('toString', () => {
    it('should prefix with UserPromptTemplate', () => {
      const tpl = new UserPromptTemplate('Hi');
      expect(tpl.toString()).toBe("UserPromptTemplate('Hi')");
    });
  });
});

describe('UserPromptContext', () => {
  beforeEach(() => {
    UserPromptContext.clear();
  });

  it('should return undefined when not set', () => {
    UserPromptContext.clear();
    expect(UserPromptContext.getTemplate()).toBeUndefined();
    expect(UserPromptContext.getVariables()).toBeUndefined();
  });

  it('should store and retrieve template + variables', () => {
    UserPromptContext.set('Ask {{question}}', { question: 'why' });
    expect(UserPromptContext.getTemplate()).toBe('Ask {{question}}');
    expect(UserPromptContext.getVariables()).toEqual({ question: 'why' });
  });

  it('should clear stored data', () => {
    UserPromptContext.set('test', { b: 2 });
    UserPromptContext.clear();
    expect(UserPromptContext.getTemplate()).toBeUndefined();
    expect(UserPromptContext.getVariables()).toBeUndefined();
  });
});
