/**
 * Unified Attribute Processor — the core normalization pipeline.
 *
 * Port of Python neatlogs/core/attribute_processor.py
 *
 * Receives a span dict (already serialized from an OTel ReadableSpan) and
 * produces a normalized dict with neatlogs.* attributes.
 *
 * The processor handles three conventions:
 *  - OpenInference (llm.*, embedding.*, openinference.*)
 *  - OpenLLMetry   (gen_ai.*, traceloop.*)
 *  - Raw OTel      (http.*, db.*, etc.)
 */

import { getLogger } from './logger.js';
import { enrichWithScopeDetection } from './instrumentation-scope-parser.js';
import { inferSpanKindFromName } from '../span-kinds/mapping.js';
import { enrichInvocationParameters } from '../config/defaults-enricher.js';
import { VECTOR_DB_SYSTEMS, RETRIEVAL_OPS, WRITE_OPS } from '../span-kinds/constants.js';
import type { AttributeMapper } from '../config/attribute-mapper.js';

const logger = getLogger();

// ────────────────────────────────────────────────────────
// Regular expressions
// ────────────────────────────────────────────────────────

/** Matches Python object repr strings like `<function BaseTool.<lambda> at 0x110107be0>` */
const PYTHON_REPR_RE = /^<[A-Za-z_].*?\bat\s+0x[0-9a-fA-F]+>$/;

// Tool-call extraction from OpenInference output messages
const OI_TOOL_RE =
  /^llm\.output_messages\.(\d+)\.message\.tool_calls\.(\d+)\.tool_call\.function\.(name|arguments)$/;
const OI_TOOL_ID_RE =
  /^llm\.output_messages\.(\d+)\.message\.tool_calls\.(\d+)\.tool_call\.id$/;

// Tool definitions
const OI_SCHEMA_RE = /^llm\.tools\.(\d+)\.tool\.json_schema$/;
const OL_FN_RE = /^llm\.request\.functions\.(\d+)\.(name|description|input_schema)$/;

// Input message tool fields
const INPUT_MSG_TOOL_RE = /^llm\.input_messages\.(\d+)\.message\.(tool_call_id|name)$/;

// Maps neatlogs.provider → neatlogs.llm.system
const PROVIDER_TO_SYSTEM: Record<string, string> = {
  openai: 'openai',
  azure: 'openai',
  azure_openai: 'openai',
  anthropic: 'anthropic',
  cohere: 'cohere',
  mistral: 'mistralai',
  mistralai: 'mistralai',
  google: 'google',
  vertex_ai: 'vertexai',
  groq: 'groq',
  xai: 'xai',
  deepseek: 'deepseek',
};

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function isPythonRepr(s: string): boolean {
  return PYTHON_REPR_RE.test(s.trim());
}

/** Recursively remove Python object repr strings from a parsed JSON structure. */
function cleanPythonReprs(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => !(typeof item === 'string' && isPythonRepr(item)))
      .map((item) => cleanPythonReprs(item));
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && isPythonRepr(v)) continue;
      cleaned[k] = cleanPythonReprs(v);
    }
    return cleaned;
  }

  return obj;
}

function safeParse(val: string): any {
  try {
    return JSON.parse(val);
  } catch {
    return undefined;
  }
}

function safeStringify(val: any): string {
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

// ────────────────────────────────────────────────────────
// Span dict shape
// ────────────────────────────────────────────────────────

export interface SpanDict {
  name: string;
  kind: number | string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  start_time: number | string;
  end_time: number | string;
  status?: { code?: number | string; message?: string };
  attributes: Record<string, any>;
  resource?: Record<string, any>;
  instrumentation_scope?: { name?: string; version?: string } | null;
  events?: Array<{
    name: string;
    timestamp: number | string;
    attributes: Record<string, any>;
  }>;
}

// ────────────────────────────────────────────────────────
// UnifiedAttributeProcessor
// ────────────────────────────────────────────────────────

export class UnifiedAttributeProcessor {
  private mapper: AttributeMapper;
  private debug: boolean;

  constructor(mapper: AttributeMapper, debug = false) {
    this.mapper = mapper;
    this.debug = debug;
  }

  // ── Public entry point ──────────────────────────────

  /**
   * Normalize a raw span dict into the neatlogs.* namespace.
   *
   * Steps:
   * 1. Merge resource + span attributes
   * 2. Detect framework/provider/platform from instrumentation scope
   * 3. Normalize vendor conventions (tool calls, tool defs, MCP, vector DB, etc.)
   * 4. Extract operational metrics (duration, TTFT)
   * 5. Upcycle events (retriever docs, embedding dimensions)
   * 6. Enrich invocation parameters with model defaults
   * 7. Apply namespace mapping via AttributeMapper
   * 8. Fill provider / system gaps
   * 9. Add intermediate ReAct steps
   * 10. Filter embedding vectors if applicable
   */
  normalize(spanDict: SpanDict): Record<string, any> {
    // 1. Merge resource + span attributes
    const resAttrs = spanDict.resource ?? {};
    const attrs: Record<string, any> = { ...resAttrs, ...spanDict.attributes };

    // Add span name for downstream processing
    attrs['_span_name'] = spanDict.name;

    // 2. Detect framework/provider/platform from instrumentation scope
    const scopeName = spanDict.instrumentation_scope?.name ?? null;
    enrichWithScopeDetection(attrs, scopeName, null);

    if (this.debug) {
      logger.debug(
        `[ScopeDetection] trace_id=${spanDict.trace_id} span_id=${spanDict.span_id} ` +
          `span_name=${spanDict.name} scope=${scopeName} ` +
          `framework=${attrs['neatlogs.framework'] ?? ''} ` +
          `provider=${attrs['neatlogs.provider'] ?? ''} ` +
          `platform=${attrs['neatlogs.platform'] ?? ''}`,
      );
    }

    // 3. Normalize vendor conventions
    this.normalizeConventions(spanDict, attrs);

    // 4. Extract operational metrics
    const computedMetrics = this.extractOperationalMetrics(spanDict, attrs);
    Object.assign(attrs, computedMetrics);

    // 5. Upcycle events
    const eventAttrs = this.upcycleEvents(spanDict);
    Object.assign(attrs, eventAttrs);

    // 6. Enrich invocation parameters
    try {
      enrichInvocationParameters(attrs, true);
    } catch (e: any) {
      logger.warn(`Failed to enrich invocation parameters: ${e?.message ?? e}`);
    }

    // 7. Apply namespace mapping
    const unified = this.applyNamespaceMapping(attrs);

    // 8. Add intermediate ReAct steps
    this.addIntermediateSteps(unified);

    // 9. Filter embedding vectors
    const spanKind = (unified['neatlogs.span.kind'] ?? '').toLowerCase();
    if (spanKind === 'embedding' || spanKind === 'vector_store') {
      return this.filterEmbeddingVectors(unified);
    }

    return unified;
  }

  // ── Convention normalization ────────────────────────

  private normalizeConventions(spanDict: SpanDict, attrs: Record<string, any>): void {
    // Detect HTTP spans
    if (this.isHttpLikeSpanKind(spanDict.kind) && this.looksLikeHttp(attrs)) {
      attrs['openinference.span.kind'] = 'HTTP';
    }

    // CrewAI fallback: if no span kind and has crewai.crew.* attrs → CHAIN
    if (
      !('openinference.span.kind' in attrs) &&
      Object.keys(attrs).some((k) => k.startsWith('crewai.crew.'))
    ) {
      attrs['openinference.span.kind'] = 'CHAIN';
    }

    // CrewAI token usage fallback
    this.addCrewaiTokenUsageFallback(attrs);

    // Reasoning tokens from output.value
    this.addReasoningTokensFromOutputValue(attrs);

    // CrewAI kickoff telemetry
    this.addCrewaiKickoffTelemetry(attrs);

    // Vercel AI SDK ai.* normalization MUST run before extractToolCalls so
    // the exploded llm.output_messages.0.message.tool_calls.* keys get
    // collapsed into the canonical llm.tool_calls.{i}.* shape that
    // attribute-mapping.json understands.
    this.extractVercelAiSdkAttrs(attrs);

    // Extract tool calls from output messages (OpenInference format)
    this.extractToolCalls(attrs);

    // Extract tool_call_id and name from input messages (tool response messages)
    for (const [k, v] of Object.entries(attrs)) {
      const m = INPUT_MSG_TOOL_RE.exec(k);
      if (m) {
        const [, msgIdx, field] = m;
        attrs[`llm.input_messages.${msgIdx}.${field}`] = v;
      }
    }

    // Extract invalid_tool_calls from output
    this.extractInvalidToolCalls(attrs);

    // Extract tool_call_id from tool output (for TOOL kind spans)
    this.extractToolCallIdFromOutput(attrs);

    // Extract tool definitions
    this.extractToolDefinitions(attrs);

    // Detect vector DB span kind from db.system
    this.detectVectorDbSpanKind(attrs);

    // Parse traceloop.entity.input for MCP signals
    this.parseMcpFromTraceloop(attrs);

    // Process MCP-specific signals
    this.processMcpSignals(attrs);

    // Handle EMBEDDING spans
    this.handleEmbeddingSpans(attrs);

    // Handle vector DB doc attributes
    this.handleVectorDbDocAttributes(attrs);

    // Extract LangChain metadata (ls_*) into standard positions
    this.extractLangchainMetadata(attrs);
  }

  private extractToolCalls(attrs: Record<string, any>): void {
    const toolCalls: Record<number, Record<string, any>> = {};
    const keysToRemove: string[] = [];

    for (const [k, v] of Object.entries(attrs)) {
      let m = OI_TOOL_RE.exec(k);
      if (m) {
        const [, , callIdxStr, field] = m;
        const idx = parseInt(callIdxStr, 10);
        if (!toolCalls[idx]) toolCalls[idx] = {};
        toolCalls[idx][field] = v;
        keysToRemove.push(k);
        continue;
      }

      m = OI_TOOL_ID_RE.exec(k);
      if (m) {
        const [, , callIdxStr] = m;
        const idx = parseInt(callIdxStr, 10);
        if (!toolCalls[idx]) toolCalls[idx] = {};
        toolCalls[idx]['id'] = v;
        keysToRemove.push(k);
        continue;
      }
    }

    for (const idx of Object.keys(toolCalls).map(Number).sort((a, b) => a - b)) {
      const tc = toolCalls[idx];
      if (tc.id !== undefined) attrs[`llm.tool_calls.${idx}.id`] = tc.id;
      if (tc.name !== undefined) attrs[`llm.tool_calls.${idx}.name`] = tc.name;
      if (tc.arguments !== undefined) attrs[`llm.tool_calls.${idx}.arguments`] = tc.arguments;
    }

    for (const k of keysToRemove) {
      delete attrs[k];
    }
  }

  private extractInvalidToolCalls(attrs: Record<string, any>): void {
    const llmOutput = attrs['llm.output'] ?? attrs['output.value'];
    if (!llmOutput || typeof llmOutput !== 'string') return;

    try {
      const outputData = JSON.parse(llmOutput);
      if (typeof outputData === 'object' && outputData !== null && !Array.isArray(outputData)) {
        const generations = outputData.generations;
        if (
          Array.isArray(generations) &&
          generations.length > 0 &&
          Array.isArray(generations[0]) &&
          generations[0].length > 0
        ) {
          const message = generations[0][0]?.message;
          const invalidCalls = message?.invalid_tool_calls;
          if (Array.isArray(invalidCalls) && invalidCalls.length > 0) {
            attrs['llm.invalid_tool_calls'] = JSON.stringify(invalidCalls);
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  private extractToolCallIdFromOutput(attrs: Record<string, any>): void {
    const toolOutput = attrs['tool.output'] ?? attrs['output.value'];
    if (!toolOutput || typeof toolOutput !== 'string') return;

    try {
      const outputData = JSON.parse(toolOutput);
      if (typeof outputData === 'object' && outputData !== null && !Array.isArray(outputData)) {
        const toolCallId = outputData.tool_call_id ?? outputData.toolCallId;
        if (toolCallId) {
          attrs['tool_call_id'] = toolCallId;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  private extractToolDefinitions(attrs: Record<string, any>): void {
    const toolDefs: Record<number, Record<string, any>> = {};
    const keysToRemove: string[] = [];

    for (const [k, v] of Object.entries(attrs)) {
      let m = OL_FN_RE.exec(k);
      if (m) {
        const [, idxStr, field] = m;
        const idx = parseInt(idxStr, 10);
        if (!toolDefs[idx]) toolDefs[idx] = {};
        toolDefs[idx][field] = v;
        keysToRemove.push(k);
        continue;
      }

      m = OI_SCHEMA_RE.exec(k);
      if (m) {
        const idx = parseInt(m[1], 10);
        let schema = v;
        if (typeof schema === 'string') {
          schema = safeParse(schema) ?? null;
        }
        if (typeof schema === 'object' && schema !== null) {
          if (!toolDefs[idx]) toolDefs[idx] = {};
          const td = toolDefs[idx];
          if (!td.name) td.name = schema.name;
          if (!td.description) td.description = schema.description;
          if (!td.input_schema) td.input_schema = schema.input_schema ?? schema.parameters;
        }
        keysToRemove.push(k);
      }
    }

    for (const idx of Object.keys(toolDefs).map(Number).sort((a, b) => a - b)) {
      const td = toolDefs[idx];
      if (td.name !== undefined && td.name !== null) {
        if (!('llm.tools.' + idx + '.name' in attrs)) {
          attrs[`llm.tools.${idx}.name`] = td.name;
        }
      }
      if (td.description !== undefined && td.description !== null) {
        if (!('llm.tools.' + idx + '.description' in attrs)) {
          attrs[`llm.tools.${idx}.description`] = td.description;
        }
      }
      if (td.input_schema !== undefined && td.input_schema !== null) {
        let val = td.input_schema;
        if (typeof val !== 'string') {
          val = safeStringify(val);
        }
        if (!('llm.tools.' + idx + '.input_schema' in attrs)) {
          attrs[`llm.tools.${idx}.input_schema`] = val;
        }
      }
    }

    for (const k of keysToRemove) {
      delete attrs[k];
    }
  }

  private detectVectorDbSpanKind(attrs: Record<string, any>): void {
    if ('openinference.span.kind' in attrs) return;

    const dbSystem = attrs['db.system'];
    if (typeof dbSystem !== 'string') return;

    if (!VECTOR_DB_SYSTEMS.has(dbSystem.toLowerCase())) return;

    const dbOperation = (attrs['db.operation'] ?? '').toLowerCase();
    const spanName = (attrs['_span_name'] ?? '').toLowerCase();

    let isRetrieval = false;
    if (dbOperation) {
      isRetrieval = RETRIEVAL_OPS.some((op) => dbOperation.includes(op));
    } else {
      isRetrieval = RETRIEVAL_OPS.some((op) => spanName.includes(op));
    }

    attrs['openinference.span.kind'] = isRetrieval ? 'RETRIEVER' : 'VECTOR_STORE';
  }

  private parseMcpFromTraceloop(attrs: Record<string, any>): void {
    const rawInput = attrs['traceloop.entity.input'];
    if (rawInput === undefined || rawInput === null) return;

    try {
      const entityInput = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
      if (typeof entityInput !== 'object' || entityInput === null || Array.isArray(entityInput))
        return;

      if ('method' in entityInput) {
        attrs['mcp.method.name'] = entityInput.method;
      }
      if ('params' in entityInput) {
        attrs['mcp.request.argument'] = JSON.stringify(entityInput.params);
      }
      if ('tool_name' in entityInput) {
        attrs['mcp.tool.name'] = entityInput.tool_name;
        if (
          'arguments' in entityInput &&
          typeof entityInput.arguments === 'object' &&
          entityInput.arguments !== null
        ) {
          attrs['mcp.tool.arguments'] = JSON.stringify(entityInput.arguments);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  private processMcpSignals(attrs: Record<string, any>): void {
    const hasMcpSignal =
      (typeof attrs['mcp.method.name'] === 'string' && !!attrs['mcp.method.name']) ||
      (typeof attrs['mcp.tool.name'] === 'string' && !!attrs['mcp.tool.name']) ||
      'mcp.request.argument' in attrs ||
      'mcp.tool.arguments' in attrs;

    if (hasMcpSignal && 'traceloop.entity.output' in attrs && !('mcp.response.value' in attrs)) {
      attrs['mcp.response.value'] = attrs['traceloop.entity.output'];
    }

    // MCP initialize response
    if (attrs['mcp.method.name'] === 'initialize' && 'traceloop.entity.output' in attrs) {
      try {
        const output =
          typeof attrs['traceloop.entity.output'] === 'string'
            ? JSON.parse(attrs['traceloop.entity.output'])
            : attrs['traceloop.entity.output'];

        if (output && typeof output === 'object') {
          if ('protocolVersion' in output) {
            attrs['mcp.protocol_version'] = output.protocolVersion;
          }
          if ('serverInfo' in output && typeof output.serverInfo === 'object') {
            const info = output.serverInfo;
            attrs['mcp.server.name'] = info.name ?? '';
            attrs['mcp.server.version'] = info.version ?? '';
          }
          if ('capabilities' in output) {
            attrs['mcp.server.capabilities'] = JSON.stringify(output.capabilities);
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    // MCP tools/list response
    if (attrs['mcp.method.name'] === 'tools/list' && 'traceloop.entity.output' in attrs) {
      try {
        const output =
          typeof attrs['traceloop.entity.output'] === 'string'
            ? JSON.parse(attrs['traceloop.entity.output'])
            : attrs['traceloop.entity.output'];

        if (output && typeof output === 'object' && Array.isArray(output.tools)) {
          const tools: any[] = output.tools;
          attrs['mcp.tools.count'] = tools.length;
          const toolNames = tools.filter((t) => 'name' in t).map((t) => t.name);
          attrs['mcp.tools.names'] = JSON.stringify(toolNames);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  private handleEmbeddingSpans(attrs: Record<string, any>): void {
    const spanKind = (attrs['openinference.span.kind'] ?? '').toUpperCase();
    if (spanKind !== 'EMBEDDING') return;

    const embeddings: Array<{ index: number; text: any }> = [];
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('embedding.embeddings.') && key.endsWith('.embedding.text')) {
        const parts = key.split('.');
        if (parts.length >= 3) {
          const index = parseInt(parts[2], 10);
          if (!isNaN(index)) {
            embeddings.push({ index, text: value });
          }
        }
      }
    }

    if (embeddings.length > 0) {
      embeddings.sort((a, b) => a.index - b.index);
      attrs['embeddings_data'] = JSON.stringify(embeddings);
    }

    // Only skip output if it's a REAL embedding operation from OpenLLMetry
    const hasEmbeddingAttrs = Object.keys(attrs).some(
      (k) => k.startsWith('embedding.') || k.startsWith('gen_ai.embedding'),
    );
    if (hasEmbeddingAttrs) {
      attrs['neatlogs._skip_output_value'] = true;
    }
  }

  /**
   * Extract vendor-specific keys from attrs into a plain object,
   * mapping each source key to a short target name.
   */
  private _extractKeys(
    attrs: Record<string, any>,
    keyMap: Record<string, string>,
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [srcKey, tgtName] of Object.entries(keyMap)) {
      if (srcKey in attrs) {
        result[tgtName] = attrs[srcKey];
      }
    }
    return result;
  }

  private handleVectorDbDocAttributes(attrs: Record<string, any>): void {
    const dbSystem = (attrs['db.system'] ?? '').toLowerCase();

    if (dbSystem === 'chroma') {
      const docKeyMap: Record<string, string> = {
        'db.chroma.add.ids_count': 'ids_count',
        'db.chroma.add.embeddings_count': 'embeddings_count',
        'db.chroma.add.metadatas_count': 'metadatas_count',
        'db.chroma.add.documents_count': 'documents_count',
        'db.chroma.upsert.ids_count': 'ids_count',
        'db.chroma.upsert.embeddings_count': 'embeddings_count',
        'db.chroma.upsert.metadatas_count': 'metadatas_count',
        'db.chroma.upsert.documents_count': 'documents_count',
        'db.chroma.query.n_results': 'requested_top_k',
        'db.chroma.query.include': 'include',
      };
      const docAttrs = this._extractKeys(attrs, docKeyMap);
      if (Object.keys(docAttrs).length > 0) {
        attrs['document_attributes'] = JSON.stringify(docAttrs);
      }
    } else if (dbSystem === 'marqo') {
      const inputKeyMap: Record<string, string> = {
        'marqo.limit': 'limit',
        'marqo.hits_count': 'hits_count',
        'marqo.filter': 'filter',
      };
      const inputParams = this._extractKeys(attrs, inputKeyMap);
      if (Object.keys(inputParams).length > 0) {
        attrs['retrieval_input_params'] = JSON.stringify(inputParams);
      }
      const docKeyMap: Record<string, string> = {
        'marqo.document_count': 'document_count',
        'marqo.items_processed': 'items_processed',
      };
      const docAttrs = this._extractKeys(attrs, docKeyMap);
      if (Object.keys(docAttrs).length > 0) {
        attrs['document_attributes'] = JSON.stringify(docAttrs);
      }
    } else if (dbSystem === 'qdrant') {
      const docKeyMap: Record<string, string> = {
        'qdrant.upsert.points_count': 'points_count',
      };
      const docAttrs = this._extractKeys(attrs, docKeyMap);
      if (Object.keys(docAttrs).length > 0) {
        attrs['document_attributes'] = JSON.stringify(docAttrs);
      }
    } else if (dbSystem === 'milvus') {
      const docKeyMap: Record<string, string> = {
        'db.milvus.insert.data_count': 'insert.data_count',
        'db.milvus.search.data_count': 'search.data_count',
        'db.milvus.search.limit': 'search.limit',
        'db.milvus.search.output_fields_count': 'search.output_fields_count',
        'db.milvus.search.result_count': 'search.result_count',
        'db.milvus.search.filter': 'search.filter',
      };
      const docAttrs = this._extractKeys(attrs, docKeyMap);
      if (Object.keys(docAttrs).length > 0) {
        attrs['document_attributes'] = JSON.stringify(docAttrs);
      }
    }
  }

  // ── LangChain metadata extraction ───────────────────

  /**
   * LangChain instrumentation puts model info in `metadata` as a JSON string
   * with `ls_provider`, `ls_model_name`, `ls_temperature`, `ls_max_tokens`.
   * Extract these into standard positions when the standard attributes are missing.
   */
  private extractLangchainMetadata(attrs: Record<string, any>): void {
    const raw = attrs['metadata'];
    if (!raw || typeof raw !== 'string') return;

    let meta: Record<string, any>;
    try {
      meta = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof meta !== 'object' || meta === null) return;

    // ls_model_name → llm.model_name
    if (meta.ls_model_name && !attrs['llm.model_name']) {
      attrs['llm.model_name'] = meta.ls_model_name;
    }

    // ls_provider → llm.system (used by defaults enricher and provider detection)
    if (meta.ls_provider && !attrs['llm.system']) {
      const providerMap: Record<string, string> = {
        google_genai: 'google',
        openai: 'openai',
        anthropic: 'anthropic',
      };
      attrs['llm.system'] = providerMap[meta.ls_provider] ?? meta.ls_provider;
    }

    // ls_temperature / ls_max_tokens → merge into invocation_parameters
    const hasTemp = meta.ls_temperature !== undefined;
    const hasMaxTokens = meta.ls_max_tokens !== undefined;
    if (hasTemp || hasMaxTokens) {
      let existing: Record<string, any> = {};
      try {
        existing = JSON.parse(attrs['llm.invocation_parameters'] ?? '{}');
      } catch {
        existing = {};
      }
      if (hasTemp && !('temperature' in existing)) {
        existing['temperature'] = meta.ls_temperature;
      }
      if (hasMaxTokens && !('max_tokens' in existing)) {
        existing['max_tokens'] = meta.ls_max_tokens;
      }
      // Also inject model if missing
      if (meta.ls_model_name && !('model' in existing)) {
        existing['model'] = meta.ls_model_name;
      }
      attrs['llm.invocation_parameters'] = JSON.stringify(existing);
    }
  }

  // ── Vercel AI SDK extraction ───────────────────────

  /**
   * The Vercel AI SDK emits its own `ai.*` namespace alongside `gen_ai.*`. Map
   * the AI-SDK-specific keys onto the canonical `llm.*` / `gen_ai.*` / `tool.*`
   * keys that the existing pipeline already understands. Span-kind inference
   * runs first so downstream `applyNamespaceMapping` resolves it correctly.
   */
  private extractVercelAiSdkAttrs(attrs: Record<string, any>): void {
    const spanName: string = attrs['_span_name'] ?? '';
    const isAiSdkSpan =
      spanName.startsWith('ai.') ||
      'ai.model.id' in attrs ||
      'ai.toolCall.name' in attrs;

    if (!isAiSdkSpan) return;

    // Span-kind inference (only when not already set)
    if (!('openinference.span.kind' in attrs)) {
      if (spanName === 'ai.toolCall') {
        attrs['openinference.span.kind'] = 'TOOL';
      } else if (spanName.startsWith('ai.embed')) {
        attrs['openinference.span.kind'] = 'EMBEDDING';
      } else if (spanName.startsWith('ai.rerank')) {
        attrs['openinference.span.kind'] = 'RERANKER';
      } else if (spanName.endsWith('.doStream') || spanName.endsWith('.doGenerate') || spanName.endsWith('.doRerank') || spanName.endsWith('.doEmbed')) {
        // Actual provider API calls (ai.streamText.doStream, ai.generateText.doGenerate, etc.)
        if (spanName.includes('embed')) {
          attrs['openinference.span.kind'] = 'EMBEDDING';
        } else if (spanName.includes('rerank')) {
          attrs['openinference.span.kind'] = 'RERANKER';
        } else {
          attrs['openinference.span.kind'] = 'LLM';
        }
      } else if (spanName === 'ai.generateText' || spanName === 'ai.streamText' || spanName === 'ai.generateObject' || spanName === 'ai.streamObject') {
        // Top-level AI SDK orchestration spans (multi-step loops)
        attrs['openinference.span.kind'] = 'CHAIN';
      }
    }

    // Model id / provider
    if ('ai.model.id' in attrs && !('llm.model_name' in attrs)) {
      attrs['llm.model_name'] = attrs['ai.model.id'];
    }
    if ('ai.model.provider' in attrs && !('llm.provider' in attrs)) {
      // ai.model.provider is e.g. "openai.chat" — take the leading segment
      const raw = String(attrs['ai.model.provider']);
      attrs['llm.provider'] = raw.split('.')[0];
    }

    // Token usage
    if ('ai.usage.promptTokens' in attrs && !('llm.token_count.prompt' in attrs)) {
      attrs['llm.token_count.prompt'] = attrs['ai.usage.promptTokens'];
    }
    if ('ai.usage.completionTokens' in attrs && !('llm.token_count.completion' in attrs)) {
      attrs['llm.token_count.completion'] = attrs['ai.usage.completionTokens'];
    }
    if ('ai.usage.totalTokens' in attrs && !('llm.token_count.total' in attrs)) {
      attrs['llm.token_count.total'] = attrs['ai.usage.totalTokens'];
    }

    // Settings → gen_ai.request.*
    const settingMap: Record<string, string> = {
      'ai.settings.temperature': 'gen_ai.request.temperature',
      'ai.settings.maxTokens': 'gen_ai.request.max_tokens',
      'ai.settings.topP': 'gen_ai.request.top_p',
      'ai.settings.topK': 'gen_ai.request.top_k',
      'ai.settings.frequencyPenalty': 'gen_ai.request.frequency_penalty',
      'ai.settings.presencePenalty': 'gen_ai.request.presence_penalty',
      'ai.settings.stopSequences': 'gen_ai.request.stop_sequences',
    };
    for (const [src, tgt] of Object.entries(settingMap)) {
      if (src in attrs && !(tgt in attrs)) {
        attrs[tgt] = attrs[src];
      }
    }

    // Build llm.invocation_parameters from gen_ai.request.* if not already set
    if (!('llm.invocation_parameters' in attrs)) {
      const params: Record<string, any> = {};
      if ('gen_ai.request.temperature' in attrs) params.temperature = attrs['gen_ai.request.temperature'];
      if ('gen_ai.request.max_tokens' in attrs) params.max_tokens = attrs['gen_ai.request.max_tokens'];
      if ('gen_ai.request.top_p' in attrs) params.top_p = attrs['gen_ai.request.top_p'];
      if ('gen_ai.request.top_k' in attrs) params.top_k = attrs['gen_ai.request.top_k'];
      if ('gen_ai.request.frequency_penalty' in attrs) params.frequency_penalty = attrs['gen_ai.request.frequency_penalty'];
      if ('gen_ai.request.presence_penalty' in attrs) params.presence_penalty = attrs['gen_ai.request.presence_penalty'];
      if ('gen_ai.request.stop_sequences' in attrs) params.stop_sequences = attrs['gen_ai.request.stop_sequences'];
      if (Object.keys(params).length > 0) {
        attrs['llm.invocation_parameters'] = JSON.stringify(params);
      }
    }

    // Operation id → gen_ai.operation.name (helps RERANKER detection)
    if ('ai.operationId' in attrs && !('gen_ai.operation.name' in attrs)) {
      attrs['gen_ai.operation.name'] = attrs['ai.operationId'];
    }

    // Response text → output message 0
    if (
      'ai.response.text' in attrs &&
      !('llm.output_messages.0.message.content' in attrs)
    ) {
      attrs['llm.output_messages.0.message.role'] = 'assistant';
      attrs['llm.output_messages.0.message.content'] = attrs['ai.response.text'];
    }

    // generateObject/streamObject emit ai.response.object (structured), not
    // ai.response.text — build the same output message from it so the doGenerate
    // LLM child shows the object instead of a blank output.
    if (
      'ai.response.object' in attrs &&
      !('llm.output_messages.0.message.content' in attrs)
    ) {
      const obj = attrs['ai.response.object'];
      attrs['llm.output_messages.0.message.role'] = 'assistant';
      attrs['llm.output_messages.0.message.content'] =
        typeof obj === 'string' ? obj : JSON.stringify(obj);
    }

    // Response finish reason / id
    if ('ai.response.finishReason' in attrs && !('llm.response.finish_reason' in attrs)) {
      attrs['llm.response.finish_reason'] = attrs['ai.response.finishReason'];
    }
    if ('ai.response.id' in attrs && !('gen_ai.response.id' in attrs)) {
      attrs['gen_ai.response.id'] = attrs['ai.response.id'];
    }

    // Prompt messages → exploded indexed keys
    const rawMessages = attrs['ai.prompt.messages'];
    if (typeof rawMessages === 'string') {
      try {
        const parsed = JSON.parse(rawMessages);
        if (Array.isArray(parsed)) {
          parsed.forEach((msg, i) => {
            if (msg && typeof msg === 'object') {
              if (typeof msg.role === 'string') {
                attrs[`llm.input_messages.${i}.message.role`] = msg.role;
              }
              if (typeof msg.content === 'string') {
                attrs[`llm.input_messages.${i}.message.content`] = msg.content;
              } else if (msg.content !== undefined) {
                attrs[`llm.input_messages.${i}.message.content`] = JSON.stringify(msg.content);
              }
            }
          });
        }
      } catch {
        // Leave the raw string in place if parse fails
      }
    }

    // Response toolCalls → exploded under output message 0
    const rawToolCalls = attrs['ai.response.toolCalls'];
    if (typeof rawToolCalls === 'string') {
      try {
        const parsed = JSON.parse(rawToolCalls);
        if (Array.isArray(parsed)) {
          parsed.forEach((tc, i) => {
            if (tc && typeof tc === 'object') {
              if (tc.toolName !== undefined) {
                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.function.name`] = tc.toolName;
              }
              if (tc.args !== undefined) {
                const argStr =
                  typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.function.arguments`] = argStr;
              }
              if (tc.toolCallId !== undefined) {
                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.id`] = tc.toolCallId;
              }
            }
          });
        }
      } catch {
        // Ignore parse failure
      }
    }

    // Embedding input: Vercel AI SDK JSON.stringify()s each value for OTel transport — unwrap
    if ('ai.value' in attrs && typeof attrs['ai.value'] === 'string') {
      try { attrs['ai.value'] = JSON.parse(attrs['ai.value']); } catch {}
    }
    if ('ai.values' in attrs && Array.isArray(attrs['ai.values'])) {
      attrs['ai.values'] = JSON.stringify(attrs['ai.values'].map((v: unknown) => {
        if (typeof v === 'string') { try { return JSON.parse(v); } catch {} }
        return v;
      }));
    }

    // Tool span attributes
    if (spanName === 'ai.toolCall') {
      if ('ai.toolCall.name' in attrs && !('tool.name' in attrs)) {
        attrs['tool.name'] = attrs['ai.toolCall.name'];
      }
      // Normalize args/result to JSON strings so downstream parsers
      // (e.g. extractToolCallIdFromOutput) can JSON.parse them safely.
      if ('ai.toolCall.args' in attrs && !('input.value' in attrs)) {
        const raw = attrs['ai.toolCall.args'];
        attrs['input.value'] = typeof raw === 'string' ? raw : JSON.stringify(raw);
      }
      if ('ai.toolCall.result' in attrs && !('output.value' in attrs)) {
        const raw = attrs['ai.toolCall.result'];
        attrs['output.value'] = typeof raw === 'string' ? raw : JSON.stringify(raw);
      }
    }
  }

  // ── CrewAI-specific ─────────────────────────────────

  private addCrewaiTokenUsageFallback(attrs: Record<string, any>): void {
    const usage = attrs['neatlogs.crew.token_usage'];
    if (typeof usage !== 'string' || !usage) return;

    if (
      'llm.token_count.prompt' in attrs ||
      'llm.token_count.completion' in attrs ||
      'llm.token_count.total' in attrs
    ) {
      return;
    }

    const parsed: Record<string, number> = {};
    const re = /([a-zA-Z_]+)=(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(usage)) !== null) {
      parsed[match[1]] = parseInt(match[2], 10);
    }

    if ('prompt_tokens' in parsed) {
      attrs['llm.token_count.prompt'] = parsed['prompt_tokens'];
    }
    if ('completion_tokens' in parsed) {
      attrs['llm.token_count.completion'] = parsed['completion_tokens'];
    }
    if ('total_tokens' in parsed) {
      attrs['llm.token_count.total'] = parsed['total_tokens'];
    }
    if ('cached_prompt_tokens' in parsed) {
      attrs['llm.token_count.prompt_details.cache_read'] = parsed['cached_prompt_tokens'];
    }
  }

  private addReasoningTokensFromOutputValue(attrs: Record<string, any>): void {
    if ('llm.token_count.completion_details.reasoning' in attrs) return;
    if ('llm.usage.reasoning_tokens' in attrs) return;

    const outputValue = attrs['output.value'];
    if (typeof outputValue !== 'string') return;

    try {
      const parsed = JSON.parse(outputValue);
      const usage = parsed?.usage ?? {};
      const details = usage.completion_tokens_details ?? {};
      const reasoning = details.reasoning_tokens;
      if (reasoning && reasoning > 0) {
        attrs['llm.token_count.completion_details.reasoning'] = reasoning;
      }
    } catch {
      // ignore
    }
  }

  private addCrewaiKickoffTelemetry(attrs: Record<string, any>): void {
    const spanName = String(attrs['_span_name'] ?? '');
    if (!(spanName.startsWith('Crew_') && spanName.endsWith('.kickoff'))) return;

    if (!('crew_number_of_tasks' in attrs)) {
      const count = this.coerceCollectionCount(attrs['crew_tasks']);
      if (count !== null) {
        attrs['crew_number_of_tasks'] = count;
      }
    }

    if (!('crew_number_of_agents' in attrs)) {
      const count = this.coerceCollectionCount(attrs['crew_agents']);
      if (count !== null) {
        attrs['crew_number_of_agents'] = count;
      }
    }
  }

  private coerceCollectionCount(value: any): number | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.floor(value) : null;
    }
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'object' && value !== null) return Object.keys(value).length;

    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) return null;

      // Direct integer string
      if (/^\d+$/.test(s)) {
        return parseInt(s, 10);
      }

      // Try JSON parse
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.length;
        if (typeof parsed === 'object' && parsed !== null) return Object.keys(parsed).length;
      } catch {
        // ignore
      }
    }

    return null;
  }

  // ── Operational metrics ─────────────────────────────

  private extractOperationalMetrics(
    spanDict: SpanDict,
    attrs: Record<string, any>,
  ): Record<string, any> {
    const computed: Record<string, any> = {};

    const startTime =
      typeof spanDict.start_time === 'number' ? spanDict.start_time : Number(spanDict.start_time);
    const endTime =
      typeof spanDict.end_time === 'number' ? spanDict.end_time : Number(spanDict.end_time);

    const durationNs = endTime - startTime;
    computed['neatlogs.metrics.duration_ms'] = durationNs / 1_000_000;

    // Skip event-based TTFT computation if already set live by streaming patch
    if (attrs['neatlogs.llm.metrics.ttft_ms'] !== undefined) {
      return computed;
    }

    // Google GenAI emits "gen_ai.content.chunk" on every text chunk — use for TTFT
    const chunkTimestamps: number[] = [];
    if (spanDict.events) {
      for (const event of spanDict.events) {
        if (event.name === 'gen_ai.content.chunk') {
          const ts =
            typeof event.timestamp === 'number' ? event.timestamp : Number(event.timestamp);
          chunkTimestamps.push(ts);
        }
      }
    }

    if (chunkTimestamps.length > 0) {
      const firstNs = chunkTimestamps[0];
      const ttftMs = Math.round(((firstNs - startTime) / 1_000_000) * 1000) / 1000;
      computed['neatlogs.llm.metrics.ttft_ms'] = ttftMs;

      if (chunkTimestamps.length >= 2) {
        const lastNs = chunkTimestamps[chunkTimestamps.length - 1];
        const stgMs = Math.round(((lastNs - firstNs) / 1_000_000) * 1000) / 1000;
        computed['neatlogs.llm.metrics.streaming_time_to_generate_ms'] = stgMs;
      }
    }

    return computed;
  }

  // ── Event upcycling ─────────────────────────────────

  private upcycleEvents(spanDict: SpanDict): Record<string, any> {
    const upcycled: Record<string, any> = {};
    const retrieverDocs: Array<Record<string, any>> = [];

    if (!spanDict.events) return upcycled;

    for (const event of spanDict.events) {
      const eAttrs = event.attributes ?? {};

      if (event.name === 'db.query.result') {
        const doc: Record<string, any> = {
          timestamp: String(event.timestamp),
        };
        if ('db.query.result.id' in eAttrs) doc['id'] = eAttrs['db.query.result.id'];
        if ('db.query.result.distance' in eAttrs)
          doc['distance'] = eAttrs['db.query.result.distance'];
        if ('db.query.result.document' in eAttrs)
          doc['document'] = eAttrs['db.query.result.document'];
        if ('db.query.result.metadata' in eAttrs) {
          const metadata = eAttrs['db.query.result.metadata'];
          if (typeof metadata === 'string') {
            doc['metadata'] = safeParse(metadata) ?? String(metadata);
          } else {
            doc['metadata'] = metadata;
          }
        }
        for (const field of ['_id', 'title', 'text', 'category', '_score']) {
          if (field in eAttrs) doc[field] = eAttrs[field];
        }
        retrieverDocs.push(doc);
      } else if (event.name === 'db.search.result') {
        const doc: Record<string, any> = {
          timestamp: String(event.timestamp),
        };
        if ('db.search.query.id' in eAttrs) doc['query_id'] = eAttrs['db.search.query.id'];
        if ('db.search.result.id' in eAttrs) doc['result_id'] = eAttrs['db.search.result.id'];
        if ('db.search.result.distance' in eAttrs)
          doc['distance'] = eAttrs['db.search.result.distance'];
        if ('db.search.result.entity' in eAttrs)
          doc['entity'] = eAttrs['db.search.result.entity'];
        retrieverDocs.push(doc);
      } else if (event.name === 'db.query.embeddings') {
        const vector =
          eAttrs['db.query.embeddings.vector'] ?? eAttrs['vector'];
        if (vector && (Array.isArray(vector) || ArrayBuffer.isView(vector))) {
          upcycled['neatlogs.db.query.embeddings.dimension'] = (vector as any).length;
          if (this.debug) {
            logger.debug(`Calculated embedding dimension: ${(vector as any).length}`);
          }
        }
      }
    }

    if (retrieverDocs.length > 0) {
      upcycled['retrieval_documents'] = JSON.stringify(retrieverDocs);
    }

    return upcycled;
  }

  // ── Namespace mapping ───────────────────────────────

  private applyNamespaceMapping(attrs: Record<string, any>): Record<string, any> {
    // Use the AttributeMapper for the heavy lifting
    const unified = this.mapper.mapAttributes(attrs);

    // Ensure neatlogs.span.kind is meaningful (not 'unknown')
    const currentKind = unified['neatlogs.span.kind'];
    if (!currentKind || currentKind === 'unknown') {
      const oiKind = attrs['openinference.span.kind'];
      if (oiKind) {
        unified['neatlogs.span.kind'] = String(oiKind).toLowerCase();
      } else {
        // Fallback: infer from span name — skip for framework-internal spans (e.g. next.js routes)
        const scopeName = attrs['neatlogs.instrumentation.name'] ?? '';
        const spanName = attrs['_span_name'] ?? '';
        if (spanName && scopeName !== 'next.js') {
          const inferred = inferSpanKindFromName(spanName).toLowerCase();
          unified['neatlogs.span.kind'] = inferred;
        }
      }
    }

    // Detect RERANKER operations (only infer if kind wasn't explicitly set)
    const llmRequestType = (attrs['llm.request.type'] ?? '').toLowerCase();
    const genAiOperation = (attrs['gen_ai.operation.name'] ?? '').toLowerCase();
    const spanNameLower = (attrs['_span_name'] ?? '').toLowerCase();
    const hasExplicitKind = 'openinference.span.kind' in attrs || 'traceloop.span.kind' in attrs;

    if (
      !hasExplicitKind && (
        llmRequestType === 'rerank' ||
        genAiOperation === 'rerank' ||
        spanNameLower.includes('rerank')
      )
    ) {
      unified['neatlogs.span.kind'] = 'reranker';
    }

    // Remove vectordb.embedding_model for non-vector span kinds
    const spanKind = (
      attrs['neatlogs.span.kind'] ?? attrs['openinference.span.kind'] ?? ''
    ).toLowerCase();
    if (!['embedding', 'retriever', 'vector_store'].includes(spanKind)) {
      delete unified['neatlogs.vectordb.embedding_model'];
    }

    if (this.debug) {
      logger.debug(
        `[ScopeDetectionFinal] span_name=${attrs['_span_name']} ` +
          `scope=${attrs['neatlogs.instrumentation.name']} ` +
          `framework=${unified['neatlogs.framework']}`,
      );
    }

    // Fill provider/system gaps
    this.fillProviderGaps(attrs, unified);

    return unified;
  }

  // ── Provider/system gap filling ─────────────────────

  private fillProviderGaps(attrs: Record<string, any>, unified: Record<string, any>): void {
    // --- neatlogs.llm.provider ---
    if (!unified['neatlogs.llm.provider']) {
      const scopeProvider = unified['neatlogs.provider'] ?? attrs['neatlogs.provider'] ?? '';
      if (scopeProvider) {
        unified['neatlogs.llm.provider'] = scopeProvider;
      } else {
        const model = String(
          attrs['llm.model_name'] ??
            attrs['gen_ai.request.model'] ??
            attrs['llm.model'] ??
            '',
        );
        const inferred = this.inferProviderFromModel(model);
        if (inferred) {
          unified['neatlogs.llm.provider'] = inferred;
        }
      }
    }

    // --- neatlogs.llm.system ---
    if (!unified['neatlogs.llm.system']) {
      const provider = (
        unified['neatlogs.llm.provider'] ??
        unified['neatlogs.provider'] ??
        ''
      ).toLowerCase();
      const system = PROVIDER_TO_SYSTEM[provider] ?? '';
      if (system) {
        unified['neatlogs.llm.system'] = system;
      }
    }
  }

  private inferProviderFromModel(model: string): string {
    if (!model) return '';
    const m = model.toLowerCase();

    // OpenAI model families
    if (/^(gpt-|o1-|o3-|o4-|text-embedding-|text-davinci-)/.test(m)) return 'openai';
    // Anthropic
    if (m.startsWith('claude-')) return 'anthropic';
    // Google
    if (m.startsWith('gemini-') || m.startsWith('gemma-')) return 'google';
    // Mistral
    if (m.startsWith('mistral-') || m.startsWith('mixtral-')) return 'mistralai';
    // Cohere
    if (m.startsWith('command-') || m.startsWith('embed-english') || m.startsWith('embed-multilingual'))
      return 'cohere';
    // Bedrock model IDs
    if (
      m.startsWith('anthropic.') ||
      m.startsWith('meta.') ||
      m.startsWith('amazon.') ||
      m.startsWith('nova-') ||
      m.startsWith('titan-')
    )
      return 'aws';
    // xAI
    if (m.startsWith('grok-')) return 'xai';
    // DeepSeek
    if (m.startsWith('deepseek-')) return 'deepseek';

    return '';
  }

  // ── Intermediate ReAct steps ────────────────────────

  private addIntermediateSteps(unified: Record<string, any>): void {
    if ('neatlogs.llm.intermediate_steps' in unified) return;
    if (String(unified['neatlogs.span.kind'] ?? '').toLowerCase() !== 'llm') return;

    const steps = this.extractReactStepsFromMessages(unified);
    if (steps.length === 0) return;

    unified['neatlogs.llm.intermediate_steps'] = JSON.stringify(steps);
  }

  private extractReactStepsFromMessages(unified: Record<string, any>): Array<Record<string, string>> {
    // Try output messages first
    const outputTexts = this.collectRoleTexts(
      unified,
      'neatlogs.llm.output_messages',
      'assistant',
    );
    const steps = this.parseReactSteps(outputTexts);
    if (steps.length > 0) return steps;

    // Fallback to input messages
    const inputTexts = this.collectRoleTexts(
      unified,
      'neatlogs.llm.input_messages',
      'assistant',
    );
    return this.parseReactSteps(inputTexts);
  }

  private collectRoleTexts(
    unified: Record<string, any>,
    prefix: string,
    role: string,
  ): string[] {
    const idxRe = new RegExp(`^${escapeRegExp(prefix)}\\.(\\d+)\\.content$`);
    const idxs = new Set<number>();
    for (const k of Object.keys(unified)) {
      const m = idxRe.exec(k);
      if (m) {
        idxs.add(parseInt(m[1], 10));
      }
    }

    const texts: string[] = [];
    for (const i of [...idxs].sort((a, b) => a - b)) {
      const r = unified[`${prefix}.${i}.role`];
      if (typeof r !== 'string' || r.toLowerCase() !== role) continue;
      const c = unified[`${prefix}.${i}.content`];
      if (typeof c === 'string' && c.toLowerCase().includes('thought:')) {
        texts.push(c);
      }
    }
    return texts;
  }

  private parseReactSteps(texts: string[]): Array<Record<string, string>> {
    if (texts.length === 0) return [];

    const markerRe = /(?:^|\n)\s*(Thought|Context|Action|Action Input|Observation|Final Answer)\s*:\s*/gim;

    const allSteps: Array<Record<string, string>> = [];

    for (const text of texts) {
      const matches: Array<{ label: string; start: number; matchStart: number }> = [];
      let m: RegExpExecArray | null;
      // Reset lastIndex for global regex
      markerRe.lastIndex = 0;
      while ((m = markerRe.exec(text)) !== null) {
        matches.push({
          label: m[1].trim().toLowerCase(),
          start: m.index + m[0].length,
          matchStart: m.index,
        });
      }

      if (matches.length === 0) continue;

      let cur: Record<string, string> = {};

      const commit = () => {
        if (Object.keys(cur).length === 0) return;
        if (!Object.values(cur).some((v) => v)) {
          cur = {};
          return;
        }
        if (allSteps.length > 0) {
          const last = allSteps[allSteps.length - 1];
          if (JSON.stringify(last) === JSON.stringify(cur)) {
            cur = {};
            return;
          }
        }
        allSteps.push(cur);
        cur = {};
      };

      for (let idx = 0; idx < matches.length; idx++) {
        const { label, start: contentStart } = matches[idx];
        const contentEnd = idx + 1 < matches.length ? matches[idx + 1].matchStart : text.length;
        const value = text.slice(contentStart, contentEnd).trim();

        if (label === 'thought' && Object.keys(cur).length > 0) {
          commit();
        }

        if (label === 'thought') {
          cur['thought'] = truncate(value, 600);
        } else if (label === 'context') {
          cur['context'] = truncate(value, 500);
        } else if (label === 'action') {
          cur['action'] = truncate(value, 200);
        } else if (label === 'action input') {
          cur['action_input'] = truncate(value, 1000);
        } else if (label === 'observation') {
          cur['observation'] = truncate(value, 500);
        } else if (label === 'final answer') {
          cur['final_answer'] = truncate(value, 1200);
        }
      }

      commit();
    }

    return allSteps;
  }

  // ── I/O sanitization ────────────────────────────────

  /**
   * Remove Python object reprs from input.value / output.value JSON strings.
   * Also drops the top-level "self" key that CrewAI injects.
   */
  sanitizeIoValue(val: any): any {
    if (typeof val !== 'string') return val;

    try {
      const parsed = JSON.parse(val);
      const cleaned = cleanPythonReprs(parsed);
      if (typeof cleaned === 'object' && cleaned !== null && !Array.isArray(cleaned)) {
        delete cleaned['self'];
      }
      if (JSON.stringify(cleaned) !== JSON.stringify(parsed)) {
        return JSON.stringify(cleaned);
      }
    } catch {
      // not JSON, return as-is
    }
    return val;
  }

  // ── Embedding vector filter ─────────────────────────

  private filterEmbeddingVectors(attrs: Record<string, any>): Record<string, any> {
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(attrs)) {
      // Skip embedding vector keys
      if (key.includes('.embedding.vector') || key.includes('.embeddings.') || key === 'ai.embeddings' || key === 'ai.embedding') {
        if (this.debug) {
          logger.debug(`[FILTER] Dropped embedding vector key: ${key}`);
        }
        continue;
      }

      // Skip large arrays (likely embedding vectors)
      if ((Array.isArray(value) || ArrayBuffer.isView(value)) && (value as any).length > 1000) {
        if (this.debug) {
          logger.debug(`[FILTER] Dropped large array (${(value as any).length} elements): ${key}`);
        }
        continue;
      }

      filtered[key] = value;
    }
    return filtered;
  }

  // ── Helpers ─────────────────────────────────────────

  private looksLikeHttp(attrs: Record<string, any>): boolean {
    for (const k of ['http.method', 'http.url', 'http.status_code', 'http.route']) {
      if (k in attrs) return true;
    }
    return Object.keys(attrs).some((key) => key.startsWith('http.'));
  }

  /**
   * Check if the raw span kind indicates CLIENT (OTel SpanKind.CLIENT = 3).
   */
  private isHttpLikeSpanKind(kind: number | string): boolean {
    if (typeof kind === 'number') return kind === 3; // SpanKind.CLIENT = 3
    return String(kind).toUpperCase() === 'CLIENT';
  }
}

// ────────────────────────────────────────────────────────
// Utility functions
// ────────────────────────────────────────────────────────

function truncate(val: string, maxLen: number): string {
  val = (val ?? '').trim();
  if (val.length <= maxLen) return val;
  return val.slice(0, maxLen) + `...(truncated,len=${val.length})`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
