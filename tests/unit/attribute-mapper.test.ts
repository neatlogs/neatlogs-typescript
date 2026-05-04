import { describe, it, expect, beforeEach } from 'vitest';
import { AttributeMapper } from '../../src/config/attribute-mapper.js';

describe('AttributeMapper', () => {
  let mapper: AttributeMapper;

  beforeEach(() => {
    mapper = new AttributeMapper();
  });

  describe('constructor', () => {
    it('should load bundled config by default', () => {
      const m = new AttributeMapper();
      expect(m).toBeInstanceOf(AttributeMapper);
    });

    it('should accept a custom config object', () => {
      const m = new AttributeMapper({ mappings: {} });
      const result = m.mapAttributes({});
      expect(result).toHaveProperty('neatlogs.span.kind', 'unknown');
    });

    it('should handle empty config gracefully', () => {
      const m = new AttributeMapper({});
      const result = m.mapAttributes({});
      expect(result).toHaveProperty('neatlogs.span.kind', 'unknown');
    });
  });

  describe('shouldIgnore', () => {
    it('should ignore attributes matching ignore patterns', () => {
      // The config has patterns like "telemetry.distro.*", "code.*", "exception.*"
      expect(mapper.shouldIgnore('telemetry.distro.name')).toBe(true);
      expect(mapper.shouldIgnore('code.function')).toBe(true);
      expect(mapper.shouldIgnore('exception.type')).toBe(true);
    });

    it('should not ignore unmatched attributes', () => {
      expect(mapper.shouldIgnore('llm.model_name')).toBe(false);
      expect(mapper.shouldIgnore('custom.attribute')).toBe(false);
    });
  });

  describe('shouldKeepAsIs', () => {
    it('should keep OTel standard attributes', () => {
      expect(mapper.shouldKeepAsIs('http.method')).toBe(true);
      expect(mapper.shouldKeepAsIs('service.name')).toBe(true);
      expect(mapper.shouldKeepAsIs('http.status_code')).toBe(true);
    });

    it('should not keep non-standard attributes', () => {
      expect(mapper.shouldKeepAsIs('llm.model_name')).toBe(false);
      expect(mapper.shouldKeepAsIs('some.random.attr')).toBe(false);
    });
  });

  describe('mapSpanKind', () => {
    it('should map openinference span kind LLM', () => {
      const result = mapper.mapSpanKind({ 'openinference.span.kind': 'LLM' });
      expect(result).toBe('llm');
    });

    it('should map openinference span kind TOOL', () => {
      const result = mapper.mapSpanKind({ 'openinference.span.kind': 'TOOL' });
      expect(result).toBe('tool');
    });

    it('should map openinference span kind AGENT', () => {
      const result = mapper.mapSpanKind({ 'openinference.span.kind': 'AGENT' });
      expect(result).toBe('agent');
    });

    it('should map openinference span kind CHAIN', () => {
      const result = mapper.mapSpanKind({ 'openinference.span.kind': 'CHAIN' });
      expect(result).toBe('chain');
    });

    it('should map openinference span kind EMBEDDING', () => {
      const result = mapper.mapSpanKind({ 'openinference.span.kind': 'EMBEDDING' });
      expect(result).toBe('embedding');
    });

    it('should infer LLM span from gen_ai attributes', () => {
      const result = mapper.mapSpanKind({
        'gen_ai.request.model': 'gpt-4',
      });
      expect(result).toBe('llm');
    });

    it('should infer LLM span from token count attributes', () => {
      const result = mapper.mapSpanKind({
        'llm.token_count.prompt': 100,
        'llm.token_count.completion': 50,
      });
      expect(result).toBe('llm');
    });

    it('should return unknown for unrecognized attributes', () => {
      const result = mapper.mapSpanKind({ 'custom.attr': 'value' });
      expect(result).toBe('unknown');
    });

    it('should prioritize openinference over other sources', () => {
      const result = mapper.mapSpanKind({
        'openinference.span.kind': 'TOOL',
        'traceloop.span.kind': 'LLM',
      });
      expect(result).toBe('tool');
    });
  });

  describe('mapSimpleAttribute', () => {
    it('should return value from first matching source', () => {
      const config = {
        sources: ['llm.model_name', 'gen_ai.request.model'],
        target: 'neatlogs.llm.model_name',
      };
      const attrs = { 'gen_ai.request.model': 'gpt-4' };
      expect(mapper.mapSimpleAttribute(config, attrs)).toBe('gpt-4');
    });

    it('should return first source when multiple present', () => {
      const config = {
        sources: ['llm.model_name', 'gen_ai.request.model'],
        target: 'neatlogs.llm.model_name',
      };
      const attrs = {
        'llm.model_name': 'gpt-4-turbo',
        'gen_ai.request.model': 'gpt-4',
      };
      expect(mapper.mapSimpleAttribute(config, attrs)).toBe('gpt-4-turbo');
    });

    it('should return undefined when no sources match', () => {
      const config = {
        sources: ['llm.model_name'],
        target: 'neatlogs.llm.model_name',
      };
      const attrs = { 'other.attr': 'value' };
      expect(mapper.mapSimpleAttribute(config, attrs)).toBeUndefined();
    });
  });

  describe('mapIndexedAttributes', () => {
    it('should map indexed attributes with numeric indices', () => {
      const config = {
        sources: ['llm.input_messages.{i}.role'],
        target: 'neatlogs.llm.input_messages.{i}.role',
        indexed: true,
      };
      const attrs = {
        'llm.input_messages.0.role': 'user',
        'llm.input_messages.1.role': 'assistant',
      };
      const result = mapper.mapIndexedAttributes(config, attrs, config.target);
      expect(result).toEqual({
        'neatlogs.llm.input_messages.0.role': 'user',
        'neatlogs.llm.input_messages.1.role': 'assistant',
      });
    });

    it('should return empty for non-matching attributes', () => {
      const config = {
        sources: ['llm.input_messages.{i}.role'],
        target: 'neatlogs.llm.input_messages.{i}.role',
        indexed: true,
      };
      const attrs = { 'unrelated.attr': 'value' };
      const result = mapper.mapIndexedAttributes(config, attrs, config.target);
      expect(result).toEqual({});
    });
  });

  describe('mapAttributes', () => {
    it('should map LLM attributes to neatlogs namespace', () => {
      const attrs = {
        'openinference.span.kind': 'LLM',
        'llm.model_name': 'gpt-4',
        'llm.system': 'openai',
      };
      const result = mapper.mapAttributes(attrs);
      expect(result['neatlogs.span.kind']).toBe('llm');
      expect(result['neatlogs.llm.model_name']).toBe('gpt-4');
      expect(result['neatlogs.llm.system']).toBe('openai');
    });

    it('should respect explicit spanKind parameter', () => {
      const attrs = {
        'openinference.span.kind': 'LLM',
        'llm.model_name': 'gpt-4',
      };
      const result = mapper.mapAttributes(attrs, 'custom_kind');
      expect(result['neatlogs.span.kind']).toBe('custom_kind');
    });

    it('should keep OTel standard attributes unchanged', () => {
      const attrs = {
        'openinference.span.kind': 'LLM',
        'http.method': 'POST',
        'service.name': 'my-service',
      };
      const result = mapper.mapAttributes(attrs);
      expect(result['http.method']).toBe('POST');
      expect(result['service.name']).toBe('my-service');
    });

    it('should pass through unmapped custom attributes', () => {
      const attrs = {
        'openinference.span.kind': 'LLM',
        'my.custom.attribute': 'hello',
      };
      const result = mapper.mapAttributes(attrs);
      expect(result['my.custom.attribute']).toBe('hello');
    });

    it('should remove ignored attributes from result', () => {
      const attrs = {
        'openinference.span.kind': 'LLM',
        'code.function': 'myFunc',
        'exception.type': 'Error',
        'telemetry.distro.name': 'test',
      };
      const result = mapper.mapAttributes(attrs);
      expect(result).not.toHaveProperty('code.function');
      expect(result).not.toHaveProperty('exception.type');
      expect(result).not.toHaveProperty('telemetry.distro.name');
    });

    it('should handle empty attributes', () => {
      const result = mapper.mapAttributes({});
      expect(result['neatlogs.span.kind']).toBe('unknown');
    });

    it('should map token counts', () => {
      const attrs = {
        'openinference.span.kind': 'LLM',
        'llm.token_count.prompt': 100,
        'llm.token_count.completion': 50,
        'llm.token_count.total': 150,
      };
      const result = mapper.mapAttributes(attrs);
      expect(result['neatlogs.llm.token_count.prompt']).toBe(100);
      expect(result['neatlogs.llm.token_count.completion']).toBe(50);
      expect(result['neatlogs.llm.token_count.total']).toBe(150);
    });
  });

  describe('getSpanKindValueMapping', () => {
    it('should return the span kind value mapping', () => {
      const mapping = mapper.getSpanKindValueMapping();
      expect(mapping['LLM']).toBe('llm');
      expect(mapping['TOOL']).toBe('tool');
      expect(mapping['AGENT']).toBe('agent');
    });
  });

  describe('getTargetAttributeName', () => {
    it('should find target name for llm.model_name', () => {
      const target = mapper.getTargetAttributeName('llm.model_name');
      expect(target).toBe('neatlogs.llm.model_name');
    });

    it('should find target name for gen_ai.request.model', () => {
      const target = mapper.getTargetAttributeName('gen_ai.request.model');
      expect(target).toBe('neatlogs.llm.model_name');
    });

    it('should return undefined for unknown source', () => {
      const target = mapper.getTargetAttributeName('nonexistent.attr');
      expect(target).toBeUndefined();
    });
  });
});
