/**
 * Span kind for categorizing instrumented operations.
 */
export type SpanKind =
  | 'WORKFLOW'
  | 'AGENT'
  | 'CHAIN'
  | 'TOOL'
  | 'RETRIEVER'
  | 'EMBEDDING'
  | 'MCP_TOOL'
  | 'GUARDRAIL';

/**
 * A mask function that can redact or transform span data before export.
 * Return null to drop the span entirely.
 */
export type MaskFunction = (spanData: Record<string, any>) => Record<string, any> | null;

/**
 * A prompt message with role and content.
 */
export interface PromptMessage {
  role: string;
  content: string;
}

/**
 * Options for initializing the Neatlogs SDK.
 */
export interface InitOptions {
  /** Neatlogs API key. Falls back to NEATLOGS_API_KEY env var. */
  apiKey?: string;
  /** Base URL for the Neatlogs API. Defaults to https://app.neatlogs.com */
  baseUrl?: string;
  /** Name of the workflow being traced. Defaults to process.argv[1]. */
  workflowName?: string;
  /** Explicit session ID for grouping traces. */
  sessionId?: string;
  /** Auto-generate a session ID if none provided. Defaults to false. */
  autoSession?: boolean;
  /** User identifier for the session. */
  userId?: string;
  /** Tags to attach to all spans. Must be string array. */
  tags?: string[];
  /** Custom metadata to attach to all spans. */
  metadata?: Record<string, any>;
  /** Enable debug logging. Defaults to false. */
  debug?: boolean;
  /** Disable export to Neatlogs backend. Defaults to false. */
  disableExport?: boolean;
  /** Libraries to auto-instrument (e.g., ['openai', 'anthropic']). */
  instrumentations?: string[];
  /** Global mask function applied to all spans. */
  mask?: MaskFunction;
  /** Sampling rate (0.0 to 1.0). Defaults to 1.0. */
  sampleRate?: number;
  /** Whether to capture log records. Defaults to true. */
  captureLogs?: boolean;
  /** Whether to capture input/output content. Defaults to true. */
  traceContent?: boolean;
  /** PII detection settings. */
  pii?: 'redact' | 'hash' | false;
  /** SDK version override. */
  version?: string;
  /** Backend endpoint URL. Defaults to https://staging-cloud.neatlogs.com/api/data/v4/batch */
  endpoint?: string;
  /** Maximum spans per export batch. Defaults to 100. */
  batchSize?: number;
  /** Seconds between batch flushes. Defaults to 5. */
  flushInterval?: number;
  /** Override team-level PII redaction toggle. true = enable, false = disable. */
  piiEnabled?: boolean;
  /** Override which span types have server-side PII redaction applied. */
  piiSpanTypes?: string[];
}

/**
 * Options for the span() function wrapper.
 */
export interface SpanOptions {
  /** The kind of span. Required. */
  kind: SpanKind;
  /** Custom name for the span. Defaults to the function name. */
  name?: string;
  /** Human-readable description of what this span does. */
  description?: string;
  /** Whether to capture function input. Defaults to true. */
  captureInput?: boolean;
  /** Whether to capture function output. Defaults to true. */
  captureOutput?: boolean;
  /** Per-span mask function. */
  mask?: MaskFunction;
  /** Mark this span as internal (not user-facing). */
  internal?: boolean;

  // Agent-specific
  /** Agent role (for kind: AGENT). */
  role?: string;
  /** Agent goal (for kind: AGENT). */
  goal?: string;

  // Tool-specific
  /** Tool name (for kind: TOOL or MCP_TOOL). */
  toolName?: string;
  /** Tool parameters schema (for kind: TOOL). */
  parameters?: Record<string, any>;
  /** JSON schema describing the tool interface (for kind: MCP_TOOL). */
  toolJsonSchema?: Record<string, any>;

  // Embedding-specific
  /** Embedding model name (for kind: EMBEDDING). */
  model?: string;
  /** Embedding dimension (for kind: EMBEDDING). */
  dimension?: number;
}

/**
 * Options for the trace() context wrapper.
 */
export interface TraceOptions {
  /** Name for the trace span. */
  name: string;
  /** Span kind. Defaults to 'CHAIN'. */
  kind?: SpanKind;
  /** Input data for this span. Auto-serialized to input.value. */
  input?: any;
  /** Prompt template to associate with this trace (string or PromptTemplate instance). */
  promptTemplate?: string | { template: string | PromptMessage[]; variables: string[] };
  /** Prompt variables used in this trace. */
  promptVariables?: Record<string, any>;
  /** User prompt template (string or UserPromptTemplate instance). */
  userPromptTemplate?: string | { template: string | PromptMessage[]; variables: string[] };
  /** User prompt variables used in this trace. */
  userPromptVariables?: Record<string, any>;
  /** Prompt version identifier. */
  version?: string;
  /** Per-trace mask function. */
  mask?: MaskFunction;
  /** Custom attributes to set on the span. */
  attributes?: Record<string, any>;
  /** Allow extra attributes via index signature. */
  [key: string]: any;
}

/**
 * Cached prompt data from the Neatlogs API.
 */
export interface CachedPrompt {
  id: string;
  name: string;
  version: number;
  content: string | null;
  messages: PromptMessage[] | null;
  config: Record<string, any>;
  labels: string[];
  updatedAt: string;
  type: 'text' | 'chat';
}

/**
 * Session configuration stored after init().
 */
export interface SessionConfig {
  sessionId?: string;
  userId?: string;
  workflowName: string;
  tags: string[];
  metadata: Record<string, any>;
  traceContent: boolean;
  pii: 'redact' | 'hash' | false;
}
