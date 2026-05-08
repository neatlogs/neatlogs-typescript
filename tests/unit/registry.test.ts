import { describe, it, expect } from 'vitest';
import {
  INSTRUMENTATION_REGISTRY,
  getLibrariesByTag,
  getLibraryInfo,
} from '../../src/instrumentation/registry.js';

describe('INSTRUMENTATION_REGISTRY', () => {
  describe('structure', () => {
    it('should have tags and libraries keys', () => {
      expect(INSTRUMENTATION_REGISTRY).toHaveProperty('tags');
      expect(INSTRUMENTATION_REGISTRY).toHaveProperty('libraries');
    });

    it('should have expected tag categories', () => {
      const tags = Object.keys(INSTRUMENTATION_REGISTRY.tags);
      expect(tags).toContain('llm');
      expect(tags).toContain('embedding');
      expect(tags).toContain('retrieval');
      expect(tags).toContain('agent');
      expect(tags).toContain('tool');
      expect(tags).toContain('http');
      expect(tags).toContain('framework');
    });

    it('should have all tag values as arrays of strings', () => {
      for (const [tag, libs] of Object.entries(INSTRUMENTATION_REGISTRY.tags)) {
        expect(Array.isArray(libs)).toBe(true);
        for (const lib of libs) {
          expect(typeof lib).toBe('string');
        }
      }
    });

    it('should have valid library entries', () => {
      for (const [name, info] of Object.entries(INSTRUMENTATION_REGISTRY.libraries)) {
        expect(info).toHaveProperty('openinference');
        expect(info).toHaveProperty('openllmetry');
        expect(info).toHaveProperty('neatlogs');
        expect(info).toHaveProperty('default_span_kind');
        expect(typeof info.default_span_kind).toBe('string');
        // openinference, openllmetry, neatlogs must be string or null
        for (const field of ['openinference', 'openllmetry', 'neatlogs'] as const) {
          expect(
            info[field] === null || typeof info[field] === 'string',
          ).toBe(true);
        }
      }
    });
  });

  describe('OpenInference packages', () => {
    it('should have openinference for openai', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['openai'];
      expect(info.openinference).toBe(
        '@arizeai/openinference-instrumentation-openai',
      );
    });

    it('should have openinference for anthropic', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['anthropic'];
      expect(info.openinference).toBe(
        '@arizeai/openinference-instrumentation-anthropic',
      );
    });

    it('should have openinference for bedrock', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['bedrock'];
      expect(info.openinference).toBe(
        '@arizeai/openinference-instrumentation-bedrock',
      );
    });

    it('should have openinference for langchain', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['langchain'];
      expect(info.openinference).toBe(
        '@arizeai/openinference-instrumentation-langchain',
      );
    });

    it('should have openinference for mcp', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['mcp'];
      expect(info.openinference).toBe(
        '@arizeai/openinference-instrumentation-mcp',
      );
    });

    it('should have openinference for beeai', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['beeai'];
      expect(info.openinference).toBe(
        '@arizeai/openinference-instrumentation-beeai',
      );
    });

    it('should have openinference for claude_agent_sdk', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['claude_agent_sdk'];
      expect(info.openinference).toBe(
        '@arizeai/openinference-instrumentation-claude-agent-sdk',
      );
    });

    it('should have null openinference for libraries without TS support', () => {
      const nullLibs = [
        'cohere', 'groq', 'together', 'vertexai', 'google_generativeai',
        'mistralai', 'ollama', 'watsonx', 'alephalpha', 'replicate',
        'sagemaker', 'huggingface_hub', 'litellm',
      ];
      for (const lib of nullLibs) {
        expect(INSTRUMENTATION_REGISTRY.libraries[lib].openinference).toBeNull();
      }
    });
  });

  describe('instrumentor entries for google_genai and crewai', () => {
    it('should have null neatlogs path for google_genai (external package)', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['google_genai'];
      expect(info.neatlogs).toBeNull();
    });

    it('should have null neatlogs path for crewai (external package)', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['crewai'];
      expect(info.neatlogs).toBeNull();
    });
  });

  describe('default_span_kind', () => {
    it('should have LLM for openai', () => {
      expect(INSTRUMENTATION_REGISTRY.libraries['openai'].default_span_kind).toBe('LLM');
    });

    it('should have CHAIN for langchain', () => {
      expect(INSTRUMENTATION_REGISTRY.libraries['langchain'].default_span_kind).toBe('CHAIN');
    });

    it('should have AGENT for crewai', () => {
      expect(INSTRUMENTATION_REGISTRY.libraries['crewai'].default_span_kind).toBe('AGENT');
    });

    it('should have RETRIEVER for chromadb', () => {
      expect(INSTRUMENTATION_REGISTRY.libraries['chromadb'].default_span_kind).toBe('RETRIEVER');
    });

    it('should have TOOL for mcp', () => {
      expect(INSTRUMENTATION_REGISTRY.libraries['mcp'].default_span_kind).toBe('TOOL');
    });

    it('should have GUARDRAIL for guardrails', () => {
      expect(INSTRUMENTATION_REGISTRY.libraries['guardrails'].default_span_kind).toBe('GUARDRAIL');
    });

    it('should have WORKFLOW for langgraph', () => {
      expect(INSTRUMENTATION_REGISTRY.libraries['langgraph'].default_span_kind).toBe('WORKFLOW');
    });
  });

  describe('auto_load', () => {
    it('should have auto_load for crewai', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['crewai'];
      expect(info.auto_load).toEqual(['litellm']);
    });

    it('should not have auto_load for openai', () => {
      const info = INSTRUMENTATION_REGISTRY.libraries['openai'];
      expect(info.auto_load).toBeUndefined();
    });
  });
});

describe('getLibrariesByTag', () => {
  it('should return libraries for llm tag', () => {
    const libs = getLibrariesByTag('llm');
    expect(libs).toContain('openai');
    expect(libs).toContain('anthropic');
    expect(libs).toContain('bedrock');
    expect(libs).toContain('google_genai');
  });

  it('should return libraries for agent tag', () => {
    const libs = getLibrariesByTag('agent');
    expect(libs).toContain('langchain');
    expect(libs).toContain('crewai');
    expect(libs).toContain('beeai');
  });

  it('should return libraries for tool tag', () => {
    const libs = getLibrariesByTag('tool');
    expect(libs).toContain('mcp');
    expect(libs).toContain('langchain');
  });

  it('should return empty array for unknown tag', () => {
    expect(getLibrariesByTag('nonexistent')).toEqual([]);
  });

  it('should return a fresh copy each time (from the same array reference)', () => {
    const libs1 = getLibrariesByTag('llm');
    const libs2 = getLibrariesByTag('llm');
    expect(libs1).toEqual(libs2);
  });
});

describe('getLibraryInfo', () => {
  it('should return info for openai', () => {
    const info = getLibraryInfo('openai');
    expect(info).toBeDefined();
    expect(info!.openinference).toBe(
      '@arizeai/openinference-instrumentation-openai',
    );
    expect(info!.default_span_kind).toBe('LLM');
  });

  it('should return info for mcp', () => {
    const info = getLibraryInfo('mcp');
    expect(info).toBeDefined();
    expect(info!.openinference).toBe(
      '@arizeai/openinference-instrumentation-mcp',
    );
    expect(info!.default_span_kind).toBe('TOOL');
  });

  it('should return undefined for unknown library', () => {
    expect(getLibraryInfo('nonexistent')).toBeUndefined();
  });

  it('should return info with null neatlogs field for google_genai (external package)', () => {
    const info = getLibraryInfo('google_genai');
    expect(info).toBeDefined();
    expect(info!.neatlogs).toBeNull();
  });
});
