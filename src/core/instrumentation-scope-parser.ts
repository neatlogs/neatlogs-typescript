/**
 * Framework and platform detection from instrumentation scope.
 *
 * Parses OpenTelemetry instrumentation_scope.name to extract:
 * - Provider: LLM provider (openai, anthropic, google, etc.)
 * - Framework: Orchestration framework (langchain, llamaindex, crewai, etc.)
 * - Platform: Cloud platform (bedrock, vertex_ai, azure_openai, etc.)
 *
 * Port of Python neatlogs/core/instrumentation_scope_parser.py
 */

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface ScopeInfo {
  provider?: string;
  framework?: string;
  platform?: string;
}

// ────────────────────────────────────────────────────────
// Scope-name → provider / framework / platform tables
// ────────────────────────────────────────────────────────

const SCOPE_PATTERNS: Record<string, ScopeInfo> = {
  // OpenInference instrumentations
  'openinference.instrumentation.openai': { provider: 'openai' },
  'openinference.instrumentation.anthropic': { provider: 'anthropic' },
  'openinference.instrumentation.google_genai': { provider: 'google' },
  'openinference.instrumentation.bedrock': { provider: 'bedrock', platform: 'bedrock' },
  'openinference.instrumentation.vertexai': { provider: 'vertex_ai', platform: 'vertex_ai' },
  'openinference.instrumentation.mistralai': { provider: 'mistral' },
  'openinference.instrumentation.cohere': { provider: 'cohere' },
  'openinference.instrumentation.groq': { provider: 'groq' },

  // OpenInference frameworks
  'openinference.instrumentation.langchain': { framework: 'langchain' },
  'openinference.instrumentation.llama_index': { framework: 'llamaindex' },
  'openinference.instrumentation.llamaindex': { framework: 'llamaindex' },
  'openinference.instrumentation.crewai': { framework: 'crewai' },
  'openinference.instrumentation.haystack': { framework: 'haystack' },
  'openinference.instrumentation.dspy': { framework: 'dspy' },

  // OpenLLMetry (Traceloop) instrumentations
  'opentelemetry.instrumentation.openai': { provider: 'openai' },
  'opentelemetry.instrumentation.anthropic': { provider: 'anthropic' },
  'opentelemetry.instrumentation.google_generativeai': { provider: 'google' },
  'opentelemetry.instrumentation.bedrock': { provider: 'bedrock', platform: 'bedrock' },
  'opentelemetry.instrumentation.vertexai': { provider: 'vertex_ai', platform: 'vertex_ai' },
  'opentelemetry.instrumentation.cohere': { provider: 'cohere' },
  'opentelemetry.instrumentation.mistralai': { provider: 'mistral' },

  // OpenLLMetry frameworks
  'opentelemetry.instrumentation.langchain': { framework: 'langchain' },
  'opentelemetry.instrumentation.llamaindex': { framework: 'llamaindex' },
  'opentelemetry.instrumentation.crewai': { framework: 'crewai' },
  'opentelemetry.instrumentation.haystack': { framework: 'haystack' },

  // Native framework telemetry
  'haystack.telemetry': { framework: 'haystack' },
  crewai: { framework: 'crewai' },
  langchain: { framework: 'langchain' },
  llama_index: { framework: 'llamaindex' },
};

// gen_ai.system → neatlogs.provider mapping
const GEN_AI_SYSTEM_TO_PROVIDER: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  vertex_ai: 'vertex_ai',
  bedrock: 'bedrock',
  azure_openai: 'openai', // Azure OpenAI uses OpenAI provider
  cohere: 'cohere',
  mistral: 'mistral',
  groq: 'groq',
};

// ────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────

/**
 * Parse instrumentation scope name to extract provider/framework/platform.
 *
 * @param scopeName - The instrumentation_scope.name from the span
 * @returns Dictionary with detected: provider, framework, platform (if found)
 *
 * @example
 * parseInstrumentationScope('openinference.instrumentation.openai')
 * // → { provider: 'openai' }
 *
 * parseInstrumentationScope('openinference.instrumentation.langchain')
 * // → { framework: 'langchain' }
 *
 * parseInstrumentationScope('opentelemetry.instrumentation.bedrock')
 * // → { provider: 'bedrock', platform: 'bedrock' }
 */
export function parseInstrumentationScope(scopeName: string | null | undefined): ScopeInfo {
  if (!scopeName) return {};

  const scopeLower = scopeName.toLowerCase();

  // Direct exact match
  if (scopeLower in SCOPE_PATTERNS) {
    return { ...SCOPE_PATTERNS[scopeLower] };
  }

  // Prefix match (handles versioned scopes like "openinference.instrumentation.openai.v1")
  for (const [pattern, info] of Object.entries(SCOPE_PATTERNS)) {
    if (scopeLower.startsWith(pattern)) {
      return { ...info };
    }
  }

  // Fuzzy extraction as fallback
  const result: ScopeInfo = {};

  // Check for framework indicators
  if (scopeLower.includes('langchain')) {
    result.framework = 'langchain';
  } else if (scopeLower.includes('llama') || scopeLower.includes('llamaindex')) {
    result.framework = 'llamaindex';
  } else if (scopeLower.includes('crewai') || scopeLower.includes('crew')) {
    result.framework = 'crewai';
  } else if (scopeLower.includes('haystack')) {
    result.framework = 'haystack';
  } else if (scopeLower.includes('dspy')) {
    result.framework = 'dspy';
  }

  // Check for provider indicators
  if (scopeLower.includes('openai')) {
    result.provider = 'openai';
    if (scopeLower.includes('azure')) {
      result.platform = 'azure_openai';
    }
  } else if (scopeLower.includes('anthropic') || scopeLower.includes('claude')) {
    result.provider = 'anthropic';
  } else if (
    scopeLower.includes('google') ||
    scopeLower.includes('gemini') ||
    scopeLower.includes('genai')
  ) {
    result.provider = 'google';
  } else if (scopeLower.includes('bedrock')) {
    result.provider = 'bedrock';
    result.platform = 'bedrock';
  } else if (scopeLower.includes('vertex')) {
    result.platform = 'vertex_ai';
    // Vertex can host multiple providers, default to google
    if (!result.provider) {
      result.provider = 'vertex_ai';
    }
  } else if (scopeLower.includes('mistral')) {
    result.provider = 'mistral';
  } else if (scopeLower.includes('cohere')) {
    result.provider = 'cohere';
  } else if (scopeLower.includes('groq')) {
    result.provider = 'groq';
  }

  return result;
}

/**
 * Enrich attributes with framework/platform/provider detected from instrumentation scope.
 *
 * Modifies attrs **in-place** by adding:
 * - neatlogs.instrumentation.name
 * - neatlogs.provider
 * - neatlogs.framework
 * - neatlogs.platform
 *
 * Logic:
 * 1. Parse current span's scope → gives provider/platform
 * 2. Parse parent span's scope (if provided) → gives orchestrating framework
 * 3. Only set attributes if not already present (explicit attrs take precedence)
 * 4. Cross-reference with gen_ai.system / model name patterns
 */
export function enrichWithScopeDetection(
  attrs: Record<string, any>,
  scopeName: string | null | undefined,
  parentScopeName: string | null | undefined = null,
): void {
  // Store original instrumentation scope info
  if (scopeName) {
    if (!('neatlogs.instrumentation.name' in attrs)) {
      attrs['neatlogs.instrumentation.name'] = scopeName;
    }
  }

  // Parse current span's scope
  const currentInfo = parseInstrumentationScope(scopeName);

  // Set provider (from current span's scope)
  if (currentInfo.provider && !('neatlogs.provider' in attrs)) {
    attrs['neatlogs.provider'] = currentInfo.provider;
  }

  // Set platform (from current span's scope)
  if (currentInfo.platform && !('neatlogs.platform' in attrs)) {
    attrs['neatlogs.platform'] = currentInfo.platform;
  }

  // Set framework — prioritize parent scope, fallback to current scope
  if (parentScopeName) {
    const parentInfo = parseInstrumentationScope(parentScopeName);
    if (parentInfo.framework && !('neatlogs.framework' in attrs)) {
      attrs['neatlogs.framework'] = parentInfo.framework;
    }
  }

  // If no framework from parent, check current scope
  if (!('neatlogs.framework' in attrs) && currentInfo.framework) {
    attrs['neatlogs.framework'] = currentInfo.framework;
  }

  // Cross-reference with gen_ai.system if available
  const genAiSystem = (attrs['gen_ai.system'] ?? '').toLowerCase();
  if (genAiSystem && !('neatlogs.provider' in attrs)) {
    const mapped = GEN_AI_SYSTEM_TO_PROVIDER[genAiSystem];
    if (mapped) {
      attrs['neatlogs.provider'] = mapped;
    }
  }

  // Detect platform from model name patterns (e.g., "anthropic.claude-3-5-sonnet-v1:0" → Bedrock)
  const llmModel: string = attrs['llm.model_name'] ?? '';
  if (llmModel && !('neatlogs.platform' in attrs)) {
    if (
      llmModel.startsWith('anthropic.') ||
      llmModel.startsWith('meta.') ||
      llmModel.startsWith('amazon.')
    ) {
      attrs['neatlogs.platform'] = 'bedrock';
    } else if (llmModel.toLowerCase().includes('azure')) {
      attrs['neatlogs.platform'] = 'azure_openai';
    }
  }
}

/**
 * Get the effective provider to use for pricing lookups.
 *
 * Logic:
 * 1. Use neatlogs.platform if it's set (bedrock/vertex_ai/azure_openai)
 * 2. Otherwise use neatlogs.provider
 * 3. Fallback to gen_ai.system or llm.system
 */
export function getEffectiveProviderForPricing(attrs: Record<string, any>): string {
  // Platform takes precedence for pricing (different pricing on cloud platforms)
  const platform = (attrs['neatlogs.platform'] ?? '').toLowerCase();
  if (platform) {
    const platformPricingMap: Record<string, string> = {
      bedrock: 'bedrock',
      vertex_ai: 'vertex_ai',
      azure_openai: 'azure_openai',
    };
    if (platform in platformPricingMap) {
      return platformPricingMap[platform];
    }
  }

  // Use detected provider
  const provider = (attrs['neatlogs.provider'] ?? '').toLowerCase();
  if (provider) {
    return provider;
  }

  // Fallback to gen_ai.system or llm.system
  return (attrs['gen_ai.system'] ?? attrs['llm.system'] ?? '').toLowerCase();
}

/**
 * Get the effective provider to use for defaults lookups.
 *
 * Currently uses the same logic as pricing. Exported as a separate
 * name so callers express intent (defaults vs pricing) even though
 * the implementation is shared.
 */
export const getEffectiveProviderForDefaults = getEffectiveProviderForPricing;
