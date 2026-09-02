/**
 * Additional edge-case tests for prompt/template.ts.
 * Covers: PromptContext/UserPromptContext, toString, edge cases in compile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PromptTemplate,
  UserPromptTemplate,
  PromptContext,
  UserPromptContext,
} from '../../src/prompt/template.js';

describe('PromptContext', () => {
  beforeEach(() => {
    PromptContext.clear();
  });

  it('should store and retrieve template', () => {
    PromptContext.set('Hello {{name}}', { name: 'world' });
    expect(PromptContext.getTemplate()).toBe('Hello {{name}}');
  });

  it('should store and retrieve variables', () => {
    PromptContext.set('Hello {{name}}', { name: 'world' });
    expect(PromptContext.getVariables()).toEqual({ name: 'world' });
  });

  it('should return undefined after clear', () => {
    PromptContext.set('Template', { var: 'val' });
    PromptContext.clear();
    expect(PromptContext.getTemplate()).toBeUndefined();
    expect(PromptContext.getVariables()).toBeUndefined();
  });

  it('should overwrite previous values on set', () => {
    PromptContext.set('First', { a: 1 });
    PromptContext.set('Second', { b: 2 });
    expect(PromptContext.getTemplate()).toBe('Second');
    expect(PromptContext.getVariables()).toEqual({ b: 2 });
  });
});

describe('UserPromptContext', () => {
  beforeEach(() => {
    UserPromptContext.clear();
  });

  it('should store and retrieve template', () => {
    UserPromptContext.set('Question: {{q}}', { q: 'test' });
    expect(UserPromptContext.getTemplate()).toBe('Question: {{q}}');
  });

  it('should store and retrieve variables', () => {
    UserPromptContext.set('Q: {{q}}', { q: 'test' });
    expect(UserPromptContext.getVariables()).toEqual({ q: 'test' });
  });

  it('should return undefined after clear', () => {
    UserPromptContext.set('Q', { q: 'v' });
    UserPromptContext.clear();
    expect(UserPromptContext.getTemplate()).toBeUndefined();
    expect(UserPromptContext.getVariables()).toBeUndefined();
  });
});

describe('PromptTemplate edge cases', () => {
  it('should handle template with no variables', () => {
    const tpl = new PromptTemplate('Static template with no placeholders');
    expect(tpl.variables).toEqual([]);
    const result = tpl.compile();
    expect(result).toBe('Static template with no placeholders');
  });

  it('should handle template with duplicate variables', () => {
    const tpl = new PromptTemplate('{{name}} said: {{name}}');
    // Should deduplicate
    expect(tpl.variables).toEqual(['name']);
    const result = tpl.compile({ name: 'Alice' });
    expect(result).toBe('Alice said: Alice');
  });

  it('should handle template with multiple variables', () => {
    const tpl = new PromptTemplate('{{greeting}} {{name}}, you are {{age}} years old');
    expect(tpl.variables).toEqual(expect.arrayContaining(['greeting', 'name', 'age']));
    expect(tpl.variables).toHaveLength(3);
  });

  it('should throw when required variables are missing', () => {
    const tpl = new PromptTemplate('Hello {{name}}, {{greeting}}');
    expect(() => tpl.compile({ name: 'Alice' })).toThrow(/Missing required variables.*greeting/);
  });

  it('should throw with all missing variables listed', () => {
    const tpl = new PromptTemplate('{{a}} {{b}} {{c}}');
    expect(() => tpl.compile({})).toThrow(/Missing required variables.*a.*b.*c/);
  });

  it('should handle message array template', () => {
    const tpl = new PromptTemplate([
      { role: 'system', content: 'You are {{role}}' },
      { role: 'user', content: 'Do {{task}}' },
    ]);
    expect(tpl.variables).toEqual(expect.arrayContaining(['role', 'task']));
    const result = tpl.compile({ role: 'assistant', task: 'coding' });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any)[0]).toEqual({ role: 'system', content: 'You are assistant' });
    expect((result as any)[1]).toEqual({ role: 'user', content: 'Do coding' });
  });

  it('should handle message array with no variables', () => {
    const tpl = new PromptTemplate([
      { role: 'system', content: 'Static system message' },
    ]);
    expect(tpl.variables).toEqual([]);
    const result = tpl.compile();
    expect(Array.isArray(result)).toBe(true);
    expect((result as any)[0].content).toBe('Static system message');
  });

  it('should handle message with empty content', () => {
    const tpl = new PromptTemplate([
      { role: 'system', content: '' },
    ]);
    expect(tpl.variables).toEqual([]);
  });

  it('should set PromptContext on compile', () => {
    const tpl = new PromptTemplate('Hello {{name}}');
    tpl.compile({ name: 'world' });

    expect(PromptContext.getTemplate()).toBe('Hello {{name}}');
    expect(PromptContext.getVariables()).toEqual({ name: 'world' });
    PromptContext.clear();
  });

  it('should convert to string for short templates', () => {
    const tpl = new PromptTemplate('Hello {{name}}');
    const str = tpl.toString();
    expect(str).toContain('PromptTemplate');
    expect(str).toContain('Hello {{name}}');
  });

  it('should truncate long templates in toString', () => {
    const longTemplate = 'A'.repeat(100);
    const tpl = new PromptTemplate(longTemplate);
    const str = tpl.toString();
    expect(str).toContain('...');
  });

  it('should format message array in toString', () => {
    const tpl = new PromptTemplate([
      { role: 'system', content: 'Hello {{name}}' },
      { role: 'user', content: '{{question}}' },
    ]);
    const str = tpl.toString();
    expect(str).toContain('2 messages');
    expect(str).toContain('variables');
  });

  it('should handle variables that look like values (no {{}} confusion)', () => {
    const tpl = new PromptTemplate('Value is {{value}}');
    const result = tpl.compile({ value: '{{not_a_var}}' });
    expect(result).toBe('Value is {{not_a_var}}');
  });

  it('should handle empty compile variables when no variables in template', () => {
    const tpl = new PromptTemplate('No vars here');
    const result = tpl.compile({});
    expect(result).toBe('No vars here');
  });
});

describe('UserPromptTemplate edge cases', () => {
  it('should handle template with no variables', () => {
    const tpl = new UserPromptTemplate('Static user prompt');
    expect(tpl.variables).toEqual([]);
    const result = tpl.compile();
    expect(result).toBe('Static user prompt');
  });

  it('should handle duplicate variables in user template', () => {
    const tpl = new UserPromptTemplate('{{q}} and {{q}}');
    expect(tpl.variables).toEqual(['q']);
    const result = tpl.compile({ q: 'test' });
    expect(result).toBe('test and test');
  });

  it('should throw when required variables are missing', () => {
    const tpl = new UserPromptTemplate('Question: {{q}}');
    expect(() => tpl.compile({})).toThrow(/Missing required variables.*q/);
  });

  it('should set UserPromptContext on compile', () => {
    const tpl = new UserPromptTemplate('Question: {{q}}');
    tpl.compile({ q: 'test' });

    expect(UserPromptContext.getTemplate()).toBe('Question: {{q}}');
    expect(UserPromptContext.getVariables()).toEqual({ q: 'test' });
    UserPromptContext.clear();
  });

  it('should handle message array template', () => {
    const tpl = new UserPromptTemplate([
      { role: 'user', content: 'Ask: {{question}}' },
    ]);
    expect(tpl.variables).toEqual(['question']);
    const result = tpl.compile({ question: 'How?' });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any)[0]).toEqual({ role: 'user', content: 'Ask: How?' });
  });

  it('should convert to string for short templates', () => {
    const tpl = new UserPromptTemplate('Q: {{q}}');
    const str = tpl.toString();
    expect(str).toContain('UserPromptTemplate');
    expect(str).toContain('Q: {{q}}');
  });

  it('should truncate long templates in toString', () => {
    const longTemplate = 'B'.repeat(100);
    const tpl = new UserPromptTemplate(longTemplate);
    const str = tpl.toString();
    expect(str).toContain('...');
  });

  it('should format message array in toString', () => {
    const tpl = new UserPromptTemplate([
      { role: 'user', content: '{{q}}' },
    ]);
    const str = tpl.toString();
    expect(str).toContain('1 messages');
  });

  it('should handle extra variables beyond what template needs', () => {
    const tpl = new UserPromptTemplate('Hello {{name}}');
    // Extra var 'age' is fine — it's just ignored in rendering
    const result = tpl.compile({ name: 'Alice', age: '30' });
    expect(result).toBe('Hello Alice');
  });
});
