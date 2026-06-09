/**
 * Neatlogs LangChain/LangGraph callback handler.
 *
 * Usage:
 *   import { langchainHandler } from 'neatlogs/langchain';
 *   const result = await chain.invoke(input, { callbacks: [langchainHandler()] });
 *
 * Creates spans: CHAIN (chain/graph runs), LLM (model calls), TOOL (tool invocations).
 * Works with LangChain, LangGraph, and Deep Agents (same callback interface).
 */

import { trace, context as otelContext, SpanStatusCode, type Span, type Context } from '@opentelemetry/api';
import { maybeOpenAutoRoot, endAutoRoot } from './core/auto-root.js';

const TRACER_NAME = 'neatlogs.langchain';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LangchainHandlerOptions {
  workflowName?: string;
}

export function langchainHandler(opts?: LangchainHandlerOptions): any {
  return new NeatlogsCallbackHandler(opts);
}

// ---------------------------------------------------------------------------
// Callback Handler
// ---------------------------------------------------------------------------

class NeatlogsCallbackHandler {
  name = 'neatlogs';
  private _spans: Map<string, Span> = new Map();
  // Auto-root spans keyed by the run-id of the child that triggered them.
  private _autoRoots: Map<string, Span> = new Map();
  private _workflowName: string | undefined;

  constructor(opts?: LangchainHandlerOptions) {
    this._workflowName = opts?.workflowName;
  }

  // --- Self-rooting ----------------------------------------------------------
  //
  // A LangChain run can begin with ANY callback. When it begins with a non-root
  // kind (a bare `llm.invoke()` fires handleChatModelStart/handleLLMStart with no
  // chain above it; a standalone tool/retriever similarly), the span we create is
  // parentless and non-root -> the backend can't anchor the trace and it never
  // renders. Open a WORKFLOW root transparently in that case so just adding the
  // handler yields a complete trace. A top-level CHAIN is already root-eligible.
  private _startCtx(parentRunId: string | undefined, runId: string, kind: string): Context {
    const parentSpan = parentRunId ? this._spans.get(parentRunId) : undefined;
    if (parentSpan) {
      return trace.setSpan(otelContext.active(), parentSpan);
    }
    const tracer = trace.getTracer(TRACER_NAME);
    const { root, ctx } = maybeOpenAutoRoot(tracer, kind, otelContext.active());
    if (root) this._autoRoots.set(runId, root);
    return ctx;
  }

  private _endAutoRoot(runId: string): void {
    const root = this._autoRoots.get(runId);
    if (root) {
      endAutoRoot(root);
      this._autoRoots.delete(runId);
    }
  }

  // --- Chain/Graph callbacks ---

  async handleChainStart(
    serialized: Record<string, any>,
    inputs: Record<string, any>,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, any>,
  ): Promise<void> {
    const tracer = trace.getTracer(TRACER_NAME);
    const name = serialized?.name ?? serialized?.id?.at(-1) ?? 'chain';

    const parentCtx = this._startCtx(parentRunId, runId, 'chain');

    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'CHAIN',
      'neatlogs.chain.name': name,
    };
    if (this._workflowName) attrs['neatlogs.workflow.name'] = this._workflowName;
    if (inputs) attrs['input.value'] = safeStringify(inputs);
    if (tags?.length) attrs['neatlogs.tags'] = tags.join(',');

    const span = tracer.startSpan(`langchain.chain.${name}`, { attributes: attrs }, parentCtx);
    this._spans.set(runId, span);
  }

  async handleChainEnd(
    outputs: Record<string, any>,
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    if (outputs) span.setAttribute('output.value', safeStringify(outputs));
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }

  async handleChainError(
    error: Error,
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }

  // --- LLM callbacks ---

  async handleLLMStart(
    serialized: Record<string, any>,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, any>,
  ): Promise<void> {
    const tracer = trace.getTracer(TRACER_NAME);
    const model = serialized?.kwargs?.model_name ?? serialized?.kwargs?.model ?? serialized?.name ?? '';

    const parentCtx = this._startCtx(parentRunId, runId, 'llm');

    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'LLM',
      'neatlogs.llm.provider': detectProvider(model),
      'neatlogs.llm.model_name': model,
    };

    for (let i = 0; i < prompts.length; i++) {
      attrs[`neatlogs.llm.input_messages.${i}.role`] = 'user';
      attrs[`neatlogs.llm.input_messages.${i}.content`] = prompts[i];
    }

    if (extraParams?.invocation_params) {
      const p = extraParams.invocation_params;
      if (p.temperature != null) attrs['neatlogs.llm.temperature'] = p.temperature;
      if (p.max_tokens != null) attrs['neatlogs.llm.max_tokens'] = p.max_tokens;
      if (p.model_name) attrs['neatlogs.llm.model_name'] = p.model_name;
    }

    const span = tracer.startSpan('langchain.llm', { attributes: attrs }, parentCtx);
    this._spans.set(runId, span);
  }

  async handleChatModelStart(
    serialized: Record<string, any>,
    messages: any[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, any>,
  ): Promise<void> {
    const tracer = trace.getTracer(TRACER_NAME);
    const model = serialized?.kwargs?.model_name ?? serialized?.kwargs?.model ?? serialized?.name ?? '';

    const parentCtx = this._startCtx(parentRunId, runId, 'llm');

    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'LLM',
      'neatlogs.llm.provider': detectProvider(model),
      'neatlogs.llm.model_name': model,
    };

    const flatMessages = messages.flat();
    for (let i = 0; i < flatMessages.length; i++) {
      const msg = flatMessages[i];
      const role = msg?.role ?? msg?._getType?.() ?? msg?.constructor?.name ?? 'unknown';
      const content = typeof msg?.content === 'string' ? msg.content : safeStringify(msg?.content);
      attrs[`neatlogs.llm.input_messages.${i}.role`] = mapRole(role);
      attrs[`neatlogs.llm.input_messages.${i}.content`] = content;
    }

    if (extraParams?.invocation_params) {
      const p = extraParams.invocation_params;
      if (p.temperature != null) attrs['neatlogs.llm.temperature'] = p.temperature;
      if (p.max_tokens != null) attrs['neatlogs.llm.max_tokens'] = p.max_tokens;
      if (p.model_name) attrs['neatlogs.llm.model_name'] = p.model_name;
    }

    const span = tracer.startSpan('langchain.chat_model', { attributes: attrs }, parentCtx);
    this._spans.set(runId, span);
  }

  async handleLLMEnd(
    output: any,
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    const generations = output?.generations ?? [];
    for (let i = 0; i < generations.length; i++) {
      const gen = generations[i];
      if (!Array.isArray(gen)) continue;
      for (let j = 0; j < gen.length; j++) {
        const msg = gen[j]?.message ?? gen[j];
        const content = msg?.content ?? msg?.text ?? '';
        span.setAttribute(`neatlogs.llm.output_messages.${i}.role`, 'assistant');
        span.setAttribute(`neatlogs.llm.output_messages.${i}.content`, String(content));

        const toolCalls = msg?.tool_calls ?? msg?.additional_kwargs?.tool_calls;
        if (toolCalls && Array.isArray(toolCalls)) {
          for (let k = 0; k < toolCalls.length; k++) {
            const tc = toolCalls[k];
            span.setAttribute(`neatlogs.llm.tool_calls.${k}.id`, tc.id ?? '');
            span.setAttribute(`neatlogs.llm.tool_calls.${k}.name`, tc.name ?? tc.function?.name ?? '');
            span.setAttribute(`neatlogs.llm.tool_calls.${k}.arguments`, tc.args ? safeStringify(tc.args) : (tc.function?.arguments ?? ''));
          }
        }
      }
    }

    const usage = output?.llmOutput?.tokenUsage ?? output?.llmOutput?.usage;
    if (usage) {
      if (usage.promptTokens != null || usage.prompt_tokens != null) {
        span.setAttribute('neatlogs.llm.token_count.prompt', usage.promptTokens ?? usage.prompt_tokens);
      }
      if (usage.completionTokens != null || usage.completion_tokens != null) {
        span.setAttribute('neatlogs.llm.token_count.completion', usage.completionTokens ?? usage.completion_tokens);
      }
      if (usage.totalTokens != null || usage.total_tokens != null) {
        span.setAttribute('neatlogs.llm.token_count.total', usage.totalTokens ?? usage.total_tokens);
      }
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }

  async handleLLMNewToken(
    _token: string,
    _idx: any,
    _runId: string,
  ): Promise<void> {}

  async handleLLMError(
    error: Error,
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }

  // --- Tool callbacks ---

  async handleToolStart(
    serialized: Record<string, any>,
    input: string,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
    toolCallId?: string,
  ): Promise<void> {
    const tracer = trace.getTracer(TRACER_NAME);
    // LangChain 1.x: serialized.name is absent and serialized.id is the class
    // name (e.g. "DynamicStructuredTool"); the real tool name arrives as `runName`.
    // Prefer serialized.name (older LC), then runName, then the class id, then 'tool'.
    const name =
      serialized?.name ||
      runName ||
      (Array.isArray(serialized?.id) ? serialized.id[serialized.id.length - 1] : undefined) ||
      'tool';

    const parentCtx = this._startCtx(parentRunId, runId, 'tool');

    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'TOOL',
      'neatlogs.tool.name': name,
      'input.value': String(input),
    };
    if (toolCallId) attrs['neatlogs.tool_call.id'] = toolCallId;

    const span = tracer.startSpan(`langchain.tool.${name}`, { attributes: attrs }, parentCtx);
    this._spans.set(runId, span);
  }

  async handleToolEnd(
    output: string,
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    span.setAttribute('output.value', String(output));
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }

  async handleToolError(
    error: Error,
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }

  // --- Retriever callbacks ---

  async handleRetrieverStart(
    serialized: Record<string, any>,
    query: string,
    runId: string,
    parentRunId?: string,
  ): Promise<void> {
    const tracer = trace.getTracer(TRACER_NAME);
    const name = serialized?.name ?? 'retriever';

    const parentCtx = this._startCtx(parentRunId, runId, 'retriever');

    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'RETRIEVER',
      'neatlogs.retriever.name': name,
      'input.value': query,
    };

    const span = tracer.startSpan(`langchain.retriever.${name}`, { attributes: attrs }, parentCtx);
    this._spans.set(runId, span);
  }

  async handleRetrieverEnd(
    documents: any[],
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    if (documents?.length) {
      span.setAttribute('neatlogs.retriever.document_count', documents.length);
      for (let i = 0; i < Math.min(documents.length, 10); i++) {
        const doc = documents[i];
        if (doc?.pageContent) {
          span.setAttribute(`neatlogs.retriever.documents.${i}.content`, doc.pageContent);
        }
      }
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }

  async handleRetrieverError(
    error: Error,
    runId: string,
  ): Promise<void> {
    const span = this._spans.get(runId);
    if (!span) return;

    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.end();
    this._spans.delete(runId);
    this._endAutoRoot(runId);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function detectProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('o4')) return 'openai';
  if (m.includes('claude')) return 'anthropic';
  if (m.includes('gemini')) return 'google';
  if (m.includes('command')) return 'cohere';
  if (m.includes('llama') || m.includes('mixtral')) return 'meta';
  return 'unknown';
}

function mapRole(role: string): string {
  const r = role.toLowerCase();
  if (r === 'human' || r === 'humanmessage') return 'user';
  if (r === 'ai' || r === 'aimessage') return 'assistant';
  if (r === 'system' || r === 'systemmessage') return 'system';
  if (r === 'function' || r === 'functionmessage') return 'function';
  if (r === 'tool' || r === 'toolmessage') return 'tool';
  return role;
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return '';
  }
}
