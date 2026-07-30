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
  /**
   * Whether this library's manager-loaded auto-instrumentor is safe to run
   * with Neatlogs' always-private provider. Manager-loaded OTel/OpenInference instrumentors
   * create and activate spans through the GLOBAL OpenTelemetry context
   * (`context.active()` / `context.with()`), which cannot be intercepted by a
   * private-provider facade — so a foreign co-tenant (Datadog, …) can still
   * parent or be parented by their spans in both directions. Such instrumentors
   * are therefore NOT isolation-safe and `init()` rejects them.
   *
   * Absent/false = not isolation-safe (the fail-closed default). Set `true` only
   * for an instrumentor that creates AND activates its spans exclusively through
   * Neatlogs' private context runtime. Explicit wrappers (wrapOpenAI, etc.) are
   * a separate, always-allowed path and don't go through the manager.
   */
  isolationSafe?: boolean;
  /**
   * Human-readable pointer to the explicit, fully-isolated Neatlogs wrapper for
   * this library — used to build the rejection message so users
   * know the supported alternative (e.g. "wrapOpenAI() from 'neatlogs/openai'").
   */
  explicitWrapper?: string;
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
      'azure_openai',
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
      'ai_sdk',
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
      'ai_sdk',
      'claude_agent_sdk',
      'openrouter_agent',
      'opencode',
      'pi_agent',
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
    ai_sdk: {
      openinference: null,
      openllmetry: null,
      // The wrapper is opt-in per call site; init({ instrumentations: ['ai_sdk'] })
      // is a no-op. This registry entry exists so scope detection and tagging stay
      // consistent with other LLM/agent libraries.
      neatlogs: '@neatlogs/instrumentation-ai-sdk',
      default_span_kind: 'LLM',
      explicitWrapper: "wrapAISDK() from 'neatlogs/ai'",
    },
    openai: {
      openinference: '@arizeai/openinference-instrumentation-openai',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
      npm_package: 'openai',
      explicitWrapper: "wrapOpenAI() from 'neatlogs/openai'",
    },
    anthropic: {
      openinference: '@arizeai/openinference-instrumentation-anthropic',
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
      npm_package: '@anthropic-ai/sdk',
      explicitWrapper: "wrapAnthropic() from 'neatlogs/anthropic'",
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
      // The wrapper is opt-in per call site (wrapBedrock); this entry keeps
      // scope detection and tagging consistent.
      neatlogs: 'neatlogs/bedrock',
      default_span_kind: 'LLM',
      explicitWrapper: "wrapBedrock() from 'neatlogs/bedrock'",
    },
    azure_openai: {
      openinference: null,
      openllmetry: null,
      neatlogs: 'neatlogs/azure-openai',
      default_span_kind: 'LLM',
      explicitWrapper: "wrapAzureOpenAI() from 'neatlogs/azure-openai'",
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
      neatlogs: 'neatlogs/vertex-ai',
      default_span_kind: 'LLM',
      explicitWrapper: "wrapVertexAI() from 'neatlogs/vertex-ai'",
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
      explicitWrapper: "langchainHandler() from 'neatlogs/langchain'",
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
      // The MastraInstrumentor path monkey-patches the (sealed) Mastra
      // constructor and its bridge activates spans on the global context, so it
      // is neither reliable nor isolation-safe. Use the explicit wrapper.
      explicitWrapper: "wrapMastra() from 'neatlogs/mastra'",
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
      // The instrumentor calls startActiveSpan on a global-context-bound tracer.
      explicitWrapper: "wrapGoogleGenAI() from 'neatlogs/google-genai'",
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
      // Opt-in wrapper (wrapClaudeAgentSDK); entry kept for scope detection/tagging.
      neatlogs: 'neatlogs/claude-agent-sdk',
      default_span_kind: 'AGENT',
      explicitWrapper: "wrapClaudeAgentSDK() from 'neatlogs/claude-agent-sdk'",
    },
    openrouter_agent: {
      openinference: null,
      openllmetry: null,
      neatlogs: 'neatlogs/openrouter-agent',
      default_span_kind: 'AGENT',
      explicitWrapper: "wrapOpenRouterAgent() from 'neatlogs/openrouter-agent'",
    },
    opencode: {
      openinference: null,
      openllmetry: null,
      neatlogs: 'neatlogs/opencode',
      default_span_kind: 'AGENT',
      explicitWrapper: "NeatlogsOpencodePlugin from 'neatlogs/opencode'",
    },
    pi_agent: {
      openinference: null,
      openllmetry: null,
      neatlogs: 'neatlogs/pi-agent',
      default_span_kind: 'AGENT',
      explicitWrapper: "piAgentHooks() from 'neatlogs/pi-agent'",
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
