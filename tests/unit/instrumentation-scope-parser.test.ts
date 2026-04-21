import { describe, it, expect } from 'vitest';
import {
  parseInstrumentationScope,
  enrichWithScopeDetection,
  getEffectiveProviderForPricing,
  getEffectiveProviderForDefaults,
} from '../../src/core/instrumentation-scope-parser.js';

describe('instrumentation-scope-parser', () => {
  describe('parseInstrumentationScope', () => {
    it('should return empty for null/undefined/empty', () => {
      expect(parseInstrumentationScope(null)).toEqual({});
      expect(parseInstrumentationScope(undefined)).toEqual({});
      expect(parseInstrumentationScope('')).toEqual({});
    });

    // OpenInference providers
    it('should detect openai from OpenInference scope', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.openai')).toEqual({
        provider: 'openai',
      });
    });

    it('should detect anthropic from OpenInference scope', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.anthropic')).toEqual({
        provider: 'anthropic',
      });
    });

    it('should detect google from OpenInference scope', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.google_genai')).toEqual({
        provider: 'google',
      });
    });

    it('should detect bedrock with platform from OpenInference scope', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.bedrock')).toEqual({
        provider: 'bedrock',
        platform: 'bedrock',
      });
    });

    it('should detect vertexai with platform from OpenInference scope', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.vertexai')).toEqual({
        provider: 'vertex_ai',
        platform: 'vertex_ai',
      });
    });

    it('should detect groq from OpenInference scope', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.groq')).toEqual({
        provider: 'groq',
      });
    });

    // OpenInference frameworks
    it('should detect langchain framework', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.langchain')).toEqual({
        framework: 'langchain',
      });
    });

    it('should detect llamaindex framework', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.llama_index')).toEqual({
        framework: 'llamaindex',
      });
    });

    it('should detect crewai framework', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.crewai')).toEqual({
        framework: 'crewai',
      });
    });

    it('should detect haystack framework', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.haystack')).toEqual({
        framework: 'haystack',
      });
    });

    it('should detect dspy framework', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.dspy')).toEqual({
        framework: 'dspy',
      });
    });

    // OpenLLMetry
    it('should detect openai from OpenLLMetry scope', () => {
      expect(parseInstrumentationScope('opentelemetry.instrumentation.openai')).toEqual({
        provider: 'openai',
      });
    });

    it('should detect anthropic from OpenLLMetry scope', () => {
      expect(parseInstrumentationScope('opentelemetry.instrumentation.anthropic')).toEqual({
        provider: 'anthropic',
      });
    });

    // Native telemetry
    it('should detect haystack native telemetry', () => {
      expect(parseInstrumentationScope('haystack.telemetry')).toEqual({
        framework: 'haystack',
      });
    });

    it('should detect crewai native scope', () => {
      expect(parseInstrumentationScope('crewai')).toEqual({
        framework: 'crewai',
      });
    });

    // Prefix matching
    it('should handle versioned scopes via prefix match', () => {
      expect(parseInstrumentationScope('openinference.instrumentation.openai.v1')).toEqual({
        provider: 'openai',
      });
    });

    // Case insensitivity
    it('should be case-insensitive', () => {
      expect(parseInstrumentationScope('OpenInference.Instrumentation.OpenAI')).toEqual({
        provider: 'openai',
      });
    });

    // Fuzzy matching
    it('should fuzzy-match unknown scopes containing provider names', () => {
      expect(parseInstrumentationScope('custom.mistral.instrumentor')).toEqual({
        provider: 'mistral',
      });
    });

    it('should fuzzy-match unknown scopes containing framework names', () => {
      expect(parseInstrumentationScope('my.custom.langchain.thing')).toEqual({
        framework: 'langchain',
      });
    });

    it('should detect azure openai platform in fuzzy mode', () => {
      const result = parseInstrumentationScope('custom.azure.openai.thing');
      expect(result.provider).toBe('openai');
      expect(result.platform).toBe('azure_openai');
    });

    it('should detect bedrock in fuzzy mode', () => {
      const result = parseInstrumentationScope('my.bedrock.thing');
      expect(result.provider).toBe('bedrock');
      expect(result.platform).toBe('bedrock');
    });

    it('should detect vertex in fuzzy mode', () => {
      const result = parseInstrumentationScope('my.vertex.thing');
      expect(result.platform).toBe('vertex_ai');
    });

    it('should return empty for completely unknown scope', () => {
      expect(parseInstrumentationScope('my.totally.unrelated.scope')).toEqual({});
    });
  });

  describe('enrichWithScopeDetection', () => {
    it('should set neatlogs.instrumentation.name from scope', () => {
      const attrs: Record<string, any> = {};
      enrichWithScopeDetection(attrs, 'openinference.instrumentation.openai');
      expect(attrs['neatlogs.instrumentation.name']).toBe(
        'openinference.instrumentation.openai',
      );
    });

    it('should set provider from scope', () => {
      const attrs: Record<string, any> = {};
      enrichWithScopeDetection(attrs, 'openinference.instrumentation.openai');
      expect(attrs['neatlogs.provider']).toBe('openai');
    });

    it('should set platform from scope', () => {
      const attrs: Record<string, any> = {};
      enrichWithScopeDetection(attrs, 'openinference.instrumentation.bedrock');
      expect(attrs['neatlogs.platform']).toBe('bedrock');
      expect(attrs['neatlogs.provider']).toBe('bedrock');
    });

    it('should set framework from scope', () => {
      const attrs: Record<string, any> = {};
      enrichWithScopeDetection(attrs, 'openinference.instrumentation.langchain');
      expect(attrs['neatlogs.framework']).toBe('langchain');
    });

    it('should prefer parent scope for framework', () => {
      const attrs: Record<string, any> = {};
      enrichWithScopeDetection(
        attrs,
        'openinference.instrumentation.openai',
        'openinference.instrumentation.langchain',
      );
      expect(attrs['neatlogs.provider']).toBe('openai');
      expect(attrs['neatlogs.framework']).toBe('langchain');
    });

    it('should not overwrite existing attributes', () => {
      const attrs: Record<string, any> = {
        'neatlogs.provider': 'custom_provider',
      };
      enrichWithScopeDetection(attrs, 'openinference.instrumentation.openai');
      expect(attrs['neatlogs.provider']).toBe('custom_provider');
    });

    it('should detect provider from gen_ai.system', () => {
      const attrs: Record<string, any> = {
        'gen_ai.system': 'anthropic',
      };
      enrichWithScopeDetection(attrs, null);
      expect(attrs['neatlogs.provider']).toBe('anthropic');
    });

    it('should detect bedrock platform from model name', () => {
      const attrs: Record<string, any> = {
        'llm.model_name': 'anthropic.claude-3-5-sonnet-v1:0',
      };
      enrichWithScopeDetection(attrs, null);
      expect(attrs['neatlogs.platform']).toBe('bedrock');
    });

    it('should detect azure platform from model name', () => {
      const attrs: Record<string, any> = {
        'llm.model_name': 'azure-gpt-4o',
      };
      enrichWithScopeDetection(attrs, null);
      expect(attrs['neatlogs.platform']).toBe('azure_openai');
    });

    it('should handle null scope gracefully', () => {
      const attrs: Record<string, any> = {};
      enrichWithScopeDetection(attrs, null);
      expect(attrs['neatlogs.instrumentation.name']).toBeUndefined();
    });
  });

  describe('getEffectiveProviderForPricing', () => {
    it('should prefer platform for pricing', () => {
      expect(
        getEffectiveProviderForPricing({
          'neatlogs.platform': 'bedrock',
          'neatlogs.provider': 'anthropic',
        }),
      ).toBe('bedrock');
    });

    it('should fall back to provider', () => {
      expect(
        getEffectiveProviderForPricing({
          'neatlogs.provider': 'openai',
        }),
      ).toBe('openai');
    });

    it('should fall back to gen_ai.system', () => {
      expect(
        getEffectiveProviderForPricing({
          'gen_ai.system': 'anthropic',
        }),
      ).toBe('anthropic');
    });

    it('should fall back to llm.system', () => {
      expect(
        getEffectiveProviderForPricing({
          'llm.system': 'openai',
        }),
      ).toBe('openai');
    });

    it('should return empty for no signals', () => {
      expect(getEffectiveProviderForPricing({})).toBe('');
    });
  });

  describe('getEffectiveProviderForDefaults', () => {
    it('should match pricing logic', () => {
      const attrs = { 'neatlogs.platform': 'azure_openai', 'neatlogs.provider': 'openai' };
      expect(getEffectiveProviderForDefaults(attrs)).toBe(
        getEffectiveProviderForPricing(attrs),
      );
    });
  });
});
