/**
 * Registry of available instrumentations for the TypeScript SDK.
 *
 * Ported from Python: neatlogs/instrumentation/registry.py
 *
 * Each library entry specifies which instrumentation packages are available:
 * - openinference: @arizeai/openinference-instrumentation-* npm package (or null)
 * - openllmetry: OpenTelemetry contrib package (or null — not used in TS SDK)
 * - neatlogs: custom instrumentor module path relative to instrumentation dir (or null)
 * - default_span_kind: the default span kind for this library
 */

/**
 * Information about a single library's instrumentation options.
 */
export interface LibraryInfo {
  openinference: string | null;
  openllmetry: string | null;
  neatlogs: string | null;
  default_span_kind: string;
  auto_load?: string[];
  /** npm package name for eager patching (used when OTel hooks don't fire) */
  npm_package?: string;
}

/**
 * Shape of the instrumentation registry.
 */
export interface InstrumentationRegistryShape {
  tags: Record<string, string[]>;
  libraries: Record<string, LibraryInfo>;
}

export const INSTRUMENTATION_REGISTRY: InstrumentationRegistryShape = {
  tags: {
    llm: [
      'azure_ai_inference',
      'openai',
      'anthropic',
      'cohere',
      'bedrock',
      'groq',
      'together',
      'vertexai',
      'google_generativeai',
      'mistralai',
      'ollama',
      'watsonx',
      'alephalpha',
      'replicate',
      'sagemaker',
      'huggingface_hub',
      'litellm',
      'google_genai',
      'portkey',
    ],
    embedding: ['openai', 'cohere', 'huggingface', 'vertexai', 'mistralai', 'ollama'],
    retrieval: [
      'chromadb',
      'pinecone',
      'weaviate',
      'qdrant',
      'milvus',
      'opensearch',
      'elasticsearch',
      'redis',
      'marqo',
    ],
    agent: [
      'langchain',
      'langgraph',
      'llamaindex',
      'crewai',
      'mastra',
      'autogen',
      'haystack',
      'dspy',
      'agno',
      'beeai',
      'openai_agents',
      'pydantic_ai',
      'smolagents',
      'strands',
      'pipecat',
    ],
    tool: ['langchain', 'llamaindex', 'haystack', 'mcp'],
    http: ['requests', 'httpx', 'urllib3', 'aiohttp'],
    framework: ['instructor', 'guardrails', 'promptflow', 'google_adk'],
  },
  libraries: {
    azure_ai_inference: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    openai: {
      openinference: '@arizeai/openinference-instrumentation-openai',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
      npm_package: 'openai',
    },
    anthropic: {
      openinference: '@arizeai/openinference-instrumentation-anthropic',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
      npm_package: '@anthropic-ai/sdk',
    },
    cohere: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    bedrock: {
      openinference: '@arizeai/openinference-instrumentation-bedrock',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    groq: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    together: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    vertexai: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    google_generativeai: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    mistralai: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    ollama: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    watsonx: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    alephalpha: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    replicate: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    sagemaker: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    huggingface_hub: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    litellm: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    langchain: {
      openinference: '@arizeai/openinference-instrumentation-langchain',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'CHAIN',
      npm_package: '@langchain/core/callbacks/manager',
    },
    langgraph: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'WORKFLOW',
    },
    llamaindex: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'CHAIN',
    },
    crewai: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
      auto_load: ['litellm'],
    },
    mastra: {
      openinference: null,
      openllmetry: null,
      neatlogs: '@neatlogs/instrumentation-mastra',
      default_span_kind: 'AGENT',
    },
    autogen: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    haystack: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'CHAIN',
    },
    dspy: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'CHAIN',
    },
    requests: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'TOOL',
    },
    httpx: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'TOOL',
    },
    urllib3: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'TOOL',
    },
    aiohttp: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'TOOL',
    },
    chromadb: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    pinecone: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    weaviate: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    qdrant: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    milvus: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    opensearch: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    elasticsearch: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    redis: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    marqo: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'RETRIEVER',
    },
    instructor: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'CHAIN',
    },
    guardrails: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'GUARDRAIL',
    },
    google_genai: {
      openinference: null,
      openllmetry: null,
      neatlogs: '@neatlogs/instrumentation-google-genai',
      default_span_kind: 'LLM',
      npm_package: '@google/genai',
    },
    google_adk: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'CHAIN',
    },
    agno: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    beeai: {
      openinference: '@arizeai/openinference-instrumentation-beeai',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    openai_agents: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    pydantic_ai: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    smolagents: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    strands: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    pipecat: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
    portkey: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    promptflow: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'CHAIN',
    },
    mcp: {
      openinference: '@arizeai/openinference-instrumentation-mcp',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'TOOL',
    },
    claude_agent_sdk: {
      openinference: '@arizeai/openinference-instrumentation-claude-agent-sdk',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'AGENT',
    },
  },
};

/**
 * Get list of library names for a given semantic tag.
 *
 * @param tag - Semantic tag (e.g., "llm", "agent", "http")
 * @returns List of library names matching the tag
 */
export function getLibrariesByTag(tag: string): string[] {
  return INSTRUMENTATION_REGISTRY.tags[tag] ?? [];
}

/**
 * Get instrumentation info for a specific library.
 *
 * @param library - Library name (e.g., "openai", "langchain")
 * @returns Library info object or undefined if not found
 */
export function getLibraryInfo(library: string): LibraryInfo | undefined {
  return INSTRUMENTATION_REGISTRY.libraries[library];
}
