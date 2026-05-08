import { describe, it, expect, beforeEach } from 'vitest';
import { getDefaults, enrichInvocationParameters } from '../../src/config/defaults-enricher.js';

describe('defaults-enricher', () => {
  describe('getDefaults', () => {
    it('should return defaults for openai chat.completions gpt-4', () => {
      const defaults = getDefaults('openai', 'chat.completions', 'gpt-4');
      // Should find a prefix match or _default
      expect(defaults).toBeDefined();
      expect(typeof defaults).toBe('object');
    });

    it('should return defaults for exact model match', () => {
      // gpt-5 is an exact key in the config
      const defaults = getDefaults('openai', 'chat.completions', 'gpt-5');
      expect(defaults).toBeDefined();
      expect(defaults).toHaveProperty('temperature');
    });

    it('should return defaults for prefix match', () => {
      // gpt-5.2 is exact, but gpt-5.2-something should match gpt-5.2 prefix
      const defaults = getDefaults('openai', 'chat.completions', 'gpt-5.2-preview');
      expect(defaults).toBeDefined();
      expect(defaults).toHaveProperty('temperature');
    });

    it('should return empty for unknown provider', () => {
      const defaults = getDefaults('nonexistent_provider', 'chat.completions', 'model-x');
      expect(defaults).toEqual({});
    });

    it('should return empty for unknown operation', () => {
      const defaults = getDefaults('openai', 'nonexistent_op', 'gpt-4');
      expect(defaults).toEqual({});
    });

    it('should return a copy (not reference)', () => {
      const defaults1 = getDefaults('openai', 'chat.completions', 'gpt-5');
      const defaults2 = getDefaults('openai', 'chat.completions', 'gpt-5');
      defaults1.temperature = 999;
      expect(defaults2.temperature).not.toBe(999);
    });

    it('should be case-insensitive for provider', () => {
      const lower = getDefaults('openai', 'chat.completions', 'gpt-5');
      const upper = getDefaults('OpenAI', 'chat.completions', 'gpt-5');
      expect(lower).toEqual(upper);
    });

    it('should return defaults for anthropic', () => {
      const defaults = getDefaults('anthropic', 'messages', 'claude-3-opus');
      expect(defaults).toBeDefined();
      expect(typeof defaults).toBe('object');
    });
  });

  describe('enrichInvocationParameters', () => {
    it('should enrich LLM span with defaults', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'LLM',
        'llm.system': 'openai',
        'llm.model_name': 'gpt-5',
        'llm.invocation_parameters': '{}',
      };

      enrichInvocationParameters(attrs);

      const params = JSON.parse(attrs['llm.invocation_parameters']);
      expect(params).toHaveProperty('temperature');
    });

    it('should preserve explicit parameters over defaults', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'LLM',
        'llm.system': 'openai',
        'llm.model_name': 'gpt-5',
        'llm.invocation_parameters': JSON.stringify({ temperature: 0.5 }),
      };

      enrichInvocationParameters(attrs);

      const params = JSON.parse(attrs['llm.invocation_parameters']);
      expect(params.temperature).toBe(0.5); // explicit value preserved
    });

    it('should skip when enableEnrichment is false', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'LLM',
        'llm.system': 'openai',
        'llm.model_name': 'gpt-5',
        'llm.invocation_parameters': '{}',
      };

      enrichInvocationParameters(attrs, false);

      const params = JSON.parse(attrs['llm.invocation_parameters']);
      expect(Object.keys(params)).toHaveLength(0);
    });

    it('should skip non-LLM/EMBEDDING spans', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'TOOL',
        'llm.system': 'openai',
        'llm.model_name': 'gpt-4',
      };

      enrichInvocationParameters(attrs);

      // Should not add invocation_parameters
      expect(attrs['llm.invocation_parameters']).toBeUndefined();
    });

    it('should skip when provider is missing', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'LLM',
        'llm.model_name': 'gpt-4',
        'llm.invocation_parameters': '{}',
      };

      enrichInvocationParameters(attrs);

      const params = JSON.parse(attrs['llm.invocation_parameters']);
      expect(Object.keys(params)).toHaveLength(0);
    });

    it('should skip when model is missing', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'LLM',
        'llm.system': 'openai',
        'llm.invocation_parameters': '{}',
      };

      enrichInvocationParameters(attrs);

      const params = JSON.parse(attrs['llm.invocation_parameters']);
      expect(Object.keys(params)).toHaveLength(0);
    });

    it('should handle EMBEDDING span kind', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'EMBEDDING',
        'llm.system': 'openai',
        'embedding.model_name': 'text-embedding-ada-002',
      };

      enrichInvocationParameters(attrs);
      // Should not throw even if no defaults found
      expect(attrs).toBeDefined();
    });

    it('should handle missing invocation_parameters gracefully', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'LLM',
        'llm.system': 'openai',
        'llm.model_name': 'gpt-5',
      };

      enrichInvocationParameters(attrs);

      // Should create invocation_parameters from defaults
      const params = JSON.parse(attrs['llm.invocation_parameters']);
      expect(params).toHaveProperty('temperature');
    });

    it('should handle malformed invocation_parameters JSON', () => {
      const attrs: Record<string, any> = {
        'openinference.span.kind': 'LLM',
        'llm.system': 'openai',
        'llm.model_name': 'gpt-5',
        'llm.invocation_parameters': 'not-valid-json',
      };

      // Should not throw
      enrichInvocationParameters(attrs);

      const params = JSON.parse(attrs['llm.invocation_parameters']);
      expect(params).toHaveProperty('temperature');
    });
  });
});
