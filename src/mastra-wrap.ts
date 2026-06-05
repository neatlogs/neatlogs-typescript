/**
 * Neatlogs Mastra wrapper — full nested tracing via method-wrapping.
 *
 * Usage:
 *   import { wrapMastra } from 'neatlogs/mastra';
 *   import { Agent } from '@mastra/core/agent';
 *   const agent = wrapMastra(new Agent({ ... }));
 *   const result = await agent.generate('Hello');
 *
 * Philosophy (same as wrapAISDK): we own the capturing layer. Instead of
 * depending on Mastra's internal observability bus or @mastra/observability,
 * we wrap Mastra's own methods and emit OpenTelemetry spans ourselves. Every
 * parent span is opened as the ACTIVE span, so child operations (LLM calls,
 * tool executions, workflow steps) nest automatically.
 *
 * Coverage (duck-typed by the methods present on the entity):
 *   - Agent.generate()/stream()        → AGENT  (parent)
 *       ↳ resolved model doGenerate/doStream → LLM   (child, per model step)
 *       ↳ each tool's execute()              → TOOL  (child, per tool call)
 *   - Workflow.createRun().start()/resume() → WORKFLOW
 *   - MastraVector.query()                  → RETRIEVER
 *   - MastraVector.upsert/update/delete()   → VECTOR_STORE
 *   - MastraMemory.recall/saveMessages/...  → CHAIN (memory ops)
 *   - MDocument.chunk()                     → CHAIN
 *   - rerank() (standalone fn)              → RERANKER
 *   - root Mastra (getAgent + getWorkflow)  → proxy that wraps what it returns
 */

import { trace, context as otelContext, SpanStatusCode, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'neatlogs.mastra';
const PATCH_FLAG = '_neatlogs_patched';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function wrapMastra<T extends object>(entity: T): T {
  if (!entity || (entity as any)[PATCH_FLAG]) return entity;

  const e = entity as any;
  const className = entity.constructor?.name ?? '';

  // Root Mastra: wrap the agents/workflows it hands out (it itself has neither
  // generate nor createRun). Detect by the getter pair.
  if (isRootMastra(e)) {
    const proxied = wrapRootMastra(e);
    markPatched(proxied);
    return proxied as T;
  }

  if (isAgent(e, className)) {
    patchAgent(e);
  } else if (isWorkflow(e, className)) {
    patchWorkflow(e);
  } else if (isVector(e, className)) {
    patchVector(e);
  } else if (isMemory(e, className)) {
    patchMemory(e);
  } else if (isDocument(e, className)) {
    patchDocument(e);
  }

  markPatched(e);
  return entity;
}

/**
 * Wrap a standalone `rerank()` function (from `@mastra/rag`) so each call emits
 * a RERANKER span. Returns a wrapped function; the original is unchanged.
 *
 *   import { rerank } from '@mastra/rag';
 *   const tracedRerank = wrapMastraRerank(rerank);
 */
export function wrapMastraRerank<F extends (...args: any[]) => any>(rerankFn: F): F {
  return (async function tracedRerank(...args: any[]) {
    return withSpan('mastra.rerank', { 'neatlogs.span.kind': 'RERANKER' }, (span) => {
      // rerank(results, query, model, options)
      const results = args?.[0];
      const query = args?.[1];
      const options = args?.[3];
      if (typeof query === 'string') {
        span.setAttribute('neatlogs.reranker.query', query);
        span.setAttribute('input.value', query);
      }
      if (Array.isArray(results)) span.setAttribute('neatlogs.reranker.input_documents', safeStringify(results));
      if (options?.topK != null) span.setAttribute('neatlogs.reranker.top_k', options.topK);
      return Promise.resolve(rerankFn(...args)).then((result) => {
        span.setAttribute('neatlogs.reranker.output_documents', safeStringify(result));
        span.setAttribute('output.value', safeStringify(result));
        return result;
      });
    });
  }) as unknown as F;
}

// ---------------------------------------------------------------------------
// Detection (duck-typed — robust across Mastra versions / build shapes)
// ---------------------------------------------------------------------------

function isRootMastra(e: any): boolean {
  return typeof e.getAgent === 'function' && typeof e.getWorkflow === 'function';
}

function isAgent(e: any, className: string): boolean {
  // An agent exposes generate()/stream(). getLLM()/listTools() are wrapped
  // opportunistically when present (installAgentLlmHook/installAgentToolHooks
  // no-op otherwise), so they are not required for detection.
  return className === 'Agent' || typeof e.generate === 'function' || typeof e.stream === 'function';
}

function isWorkflow(e: any, className: string): boolean {
  return className === 'Workflow' || typeof e.createRun === 'function';
}

function isVector(e: any, className: string): boolean {
  return /Vector/.test(className) || (typeof e.query === 'function' && typeof e.upsert === 'function');
}

function isMemory(e: any, className: string): boolean {
  return /Memory/.test(className) || (typeof e.recall === 'function' && typeof e.saveMessages === 'function');
}

function isDocument(e: any, className: string): boolean {
  return className === 'MDocument' || (typeof e.chunk === 'function' && typeof e.getDocs === 'function');
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

function patchAgent(agent: any): void {
  patchAgentMethod(agent, 'generate', false);
  patchAgentMethod(agent, 'stream', true);
}

/**
 * Wrap generate()/stream() with an AGENT parent span. Before delegating, also
 * install child-span hooks on this agent's resolved model (LLM) and tools
 * (TOOL) so they nest under the AGENT span. Hooks are installed lazily/once.
 */
function patchAgentMethod(agent: any, method: 'generate' | 'stream', streaming: boolean): void {
  if (typeof agent[method] !== 'function') return;
  const orig = agent[method].bind(agent);

  agent[method] = async function tracedAgentMethod(input: any, opts?: any): Promise<any> {
    const agentName = agent.name ?? agent.id ?? 'mastra_agent';
    const model = extractModelId(agent.model);

    // Ensure LLM + TOOL child hooks are present (idempotent).
    installAgentLlmHook(agent);
    installAgentToolHooks(agent);

    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'AGENT',
      'neatlogs.agent.name': agentName,
      'input.value': toInputValue(input),
    };
    if (model) attrs['neatlogs.llm.model_name'] = model;
    if (agent.instructions && typeof agent.instructions === 'string') {
      attrs['neatlogs.llm.system_prompt'] = agent.instructions;
    }
    if (streaming) attrs['neatlogs.llm.is_streaming'] = true;

    if (streaming) {
      // stream() returns immediately; the model only runs when the caller drains
      // the stream. Keep the AGENT span open + active across the whole stream so
      // doStream (LLM) children nest, and finalize when the output completes.
      const tracer = trace.getTracer(TRACER_NAME);
      const span = tracer.startSpan(`mastra.agent.${agentName}`, { attributes: attrs }, otelContext.active());
      const ctx = trace.setSpan(otelContext.active(), span);
      try {
        const result = await otelContext.with(ctx, () => orig(input, opts));
        return wrapStreamingOutput(result, span, ctx);
      } catch (err) {
        recordError(span, err);
        span.end();
        throw err;
      }
    }

    return withActiveSpan(`mastra.agent.${agentName}`, attrs, async (span) => {
      const result = await orig(input, opts);
      finalizeAgentResult(span, result);
      return result;
    });
  };
}

/**
 * Patch agent.getLLM so the model it returns has doGenerate/doStream wrapped
 * (emitting LLM child spans). Mastra calls this.getLLM() inside generate/stream,
 * and the resolved model is the single chokepoint for the real provider call.
 */
function installAgentLlmHook(agent: any): void {
  if (agent.__neatlogs_llm_hook || typeof agent.getLLM !== 'function') return;
  agent.__neatlogs_llm_hook = true;

  const origGetLLM = agent.getLLM.bind(agent);
  agent.getLLM = function patchedGetLLM(...args: any[]): any {
    const out = origGetLLM(...args);
    return Promise.resolve(out).then((llm: any) => {
      try {
        const model = typeof llm?.getModel === 'function' ? llm.getModel() : llm;
        patchModelInPlace(model);
      } catch {
        /* best-effort */
      }
      return llm;
    });
  };
}

/** Wrap a resolved language model's doGenerate/doStream in place (idempotent). */
function patchModelInPlace(model: any): void {
  if (!model || model.__neatlogs_model_patched) return;
  model.__neatlogs_model_patched = true;
  const modelId = model.modelId ?? model.modelName ?? '';
  const provider = model.provider ?? '';

  for (const fn of ['doGenerate', 'doStream'] as const) {
    if (typeof model[fn] !== 'function') continue;
    const orig = model[fn].bind(model);
    const isStream = fn === 'doStream';

    model[fn] = function tracedModelCall(callOpts: any): any {
      const attrs: Record<string, any> = { 'neatlogs.span.kind': 'LLM' };
      if (modelId) attrs['neatlogs.llm.model_name'] = modelId;
      if (provider) attrs['neatlogs.llm.provider'] = provider;
      if (isStream) attrs['neatlogs.llm.is_streaming'] = true;
      const promptInput = callOpts?.prompt ?? callOpts?.messages;
      if (promptInput !== undefined) attrs['input.value'] = safeStringify(promptInput);
      captureInvocationParams(attrs, callOpts);

      return withActiveSpan(`mastra.llm.${modelId || 'model'}.${fn}`, attrs, async (span) => {
        const result = await orig(callOpts);
        if (!isStream) finalizeModelResult(span, result);
        // Streaming doGenerate-style results serialize lazily; record what we can.
        else if (result?.usage) recordUsage(span, result.usage);
        return result;
      });
    };
  }
}

/** Patch each tool's execute() so tool calls become TOOL child spans. */
function installAgentToolHooks(agent: any): void {
  if (agent.__neatlogs_tool_hook) return;
  let tools: Record<string, any> | undefined;
  try {
    tools = typeof agent.listTools === 'function' ? agent.listTools() : undefined;
  } catch {
    tools = undefined;
  }
  if (!tools || typeof tools !== 'object') return;
  agent.__neatlogs_tool_hook = true;

  for (const [key, tool] of Object.entries<any>(tools)) {
    patchToolExecute(tool, key);
  }
}

function patchToolExecute(tool: any, key: string): void {
  if (!tool || typeof tool.execute !== 'function' || tool.__neatlogs_tool_patched) return;
  tool.__neatlogs_tool_patched = true;
  const toolName = tool.id ?? key;
  const orig = tool.execute.bind(tool);

  tool.execute = function tracedToolExecute(params: any, options?: any): any {
    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'TOOL',
      'neatlogs.tool.name': toolName,
      'input.value': safeStringify(params),
    };
    if (tool.description) attrs['neatlogs.tool.description'] = String(tool.description);

    return withActiveSpan(`mastra.tool.${toolName}`, attrs, async (span) => {
      const result = await orig(params, options);
      span.setAttribute('output.value', safeStringify(result));
      return result;
    });
  };
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

function patchWorkflow(workflow: any): void {
  if (typeof workflow.createRun !== 'function') return;
  const origCreateRun = workflow.createRun.bind(workflow);
  const workflowName = workflow.name ?? workflow.id ?? 'mastra_workflow';

  workflow.createRun = async function tracedCreateRun(...args: any[]): Promise<any> {
    const run = await origCreateRun(...args);
    if (!run) return run;
    patchRunMethod(run, 'start', workflowName);
    patchRunMethod(run, 'resume', workflowName);
    return run;
  };
}

function patchRunMethod(run: any, method: 'start' | 'resume', workflowName: string): void {
  if (typeof run[method] !== 'function') return;
  const orig = run[method].bind(run);

  run[method] = async function tracedRunMethod(startOpts: any): Promise<any> {
    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'WORKFLOW',
      'neatlogs.workflow.name': workflowName,
    };
    if (startOpts?.inputData !== undefined) {
      attrs['input.value'] = safeStringify(startOpts.inputData);
    }

    return withActiveSpan(`mastra.workflow.${workflowName}`, attrs, async (span) => {
      const result = await orig(startOpts);
      if (result?.status) span.setAttribute('neatlogs.metadata', safeStringify({ status: result.status }));
      if (result?.result !== undefined) {
        span.setAttribute('output.value', safeStringify(result.result));
      }
      return result;
    });
  };
}

// ---------------------------------------------------------------------------
// Vector store
// ---------------------------------------------------------------------------

const VECTOR_READ_OPS = ['query'];
const VECTOR_WRITE_OPS = ['upsert', 'updateVector', 'deleteVector', 'createIndex', 'deleteIndex'];

function patchVector(vector: any): void {
  for (const op of VECTOR_READ_OPS) patchVectorOp(vector, op, 'RETRIEVER');
  for (const op of VECTOR_WRITE_OPS) patchVectorOp(vector, op, 'VECTOR_STORE');
}

function patchVectorOp(vector: any, op: string, kind: 'RETRIEVER' | 'VECTOR_STORE'): void {
  if (typeof vector[op] !== 'function') return;
  const orig = vector[op].bind(vector);
  const dbName = vector.constructor?.name ?? 'vector';

  vector[op] = async function tracedVectorOp(params: any): Promise<any> {
    const attrs: Record<string, any> = {
      'neatlogs.span.kind': kind,
      'neatlogs.db.system': dbName,
      'neatlogs.db.operation': op,
      'input.value': safeStringify(params),
    };
    const indexName = params?.indexName;
    if (indexName) attrs['neatlogs.vectordb.index_name'] = String(indexName);
    if (kind === 'RETRIEVER' && params?.topK != null) attrs['neatlogs.retriever.top_k'] = params.topK;
    return withActiveSpan(`mastra.vector.${op}`, attrs, async (span) => {
      const result = await orig(params);
      span.setAttribute('output.value', safeStringify(result));
      return result;
    });
  };
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

const MEMORY_OPS = ['recall', 'saveMessages', 'updateWorkingMemory', 'deleteMessages'];

function patchMemory(memory: any): void {
  for (const op of MEMORY_OPS) {
    if (typeof memory[op] !== 'function') continue;
    const orig = memory[op].bind(memory);
    memory[op] = async function tracedMemoryOp(...args: any[]): Promise<any> {
      const attrs: Record<string, any> = {
        'neatlogs.span.kind': 'CHAIN',
        'neatlogs.db.operation': op,
        'input.value': safeStringify(args?.[0]),
      };
      return withActiveSpan(`mastra.memory.${op}`, attrs, async (span) => {
        const result = await orig(...args);
        span.setAttribute('output.value', safeStringify(result));
        return result;
      });
    };
  }
}

// ---------------------------------------------------------------------------
// MDocument
// ---------------------------------------------------------------------------

function patchDocument(doc: any): void {
  if (typeof doc.chunk !== 'function') return;
  const orig = doc.chunk.bind(doc);
  doc.chunk = async function tracedChunk(...args: any[]): Promise<any> {
    const attrs: Record<string, any> = {
      'neatlogs.span.kind': 'CHAIN',
      'neatlogs.db.operation': 'chunk',
    };
    return withActiveSpan('mastra.document.chunk', attrs, async (span) => {
      const result = await orig(...args);
      if (Array.isArray(result)) span.setAttribute('neatlogs.db.documents_count', result.length);
      return result;
    });
  };
}

// ---------------------------------------------------------------------------
// Root Mastra proxy
// ---------------------------------------------------------------------------

function wrapRootMastra(mastra: any): any {
  const AGENT_GETTERS = new Set(['getAgent', 'getAgentById']);
  const WORKFLOW_GETTERS = new Set(['getWorkflow', 'getWorkflowById']);

  return new Proxy(mastra, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const name = String(prop);

      if (AGENT_GETTERS.has(name) || WORKFLOW_GETTERS.has(name)) {
        return (...args: any[]) => {
          const entity = value.apply(target, args);
          return entity && typeof entity === 'object' ? wrapMastra(entity) : entity;
        };
      }
      return value.bind(target);
    },
  });
}

// ---------------------------------------------------------------------------
// Streaming output wrapping
// ---------------------------------------------------------------------------

/**
 * Finalize the AGENT span for a streaming result.
 *
 * Mastra's `stream()` returns a `MastraModelOutput` (NOT a plain async-iterable):
 * the model only runs when the caller drains `.textStream`/`.fullStream` or
 * awaits `.text`. We therefore:
 *   1. Re-establish the AGENT span's context around stream consumption so the
 *      model's `doStream` (LLM) child nests under it.
 *   2. Tap the `.text`/`.usage`/`.finishReason` promises — which resolve when the
 *      stream completes regardless of how the caller consumes — to record output
 *      and end the span exactly once.
 * Falls back to legacy async-iterable / thenable shapes for older Mastra.
 */
function wrapStreamingOutput(output: any, span: Span, ctx: ReturnType<typeof otelContext.active>): any {
  if (!output) {
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return output;
  }

  let ended = false;
  const endOnce = (err?: unknown) => {
    if (ended) return;
    ended = true;
    if (err) recordError(span, err);
    else span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  };

  // MastraModelOutput: has awaitable .text (thenable). Tap completion promises.
  if (output.text && typeof output.text.then === 'function') {
    const finalize = async () => {
      try {
        const [text, usage, finishReason] = await Promise.all([
          Promise.resolve(output.text).catch(() => undefined),
          Promise.resolve(output.usage).catch(() => undefined),
          Promise.resolve(output.finishReason).catch(() => undefined),
        ]);
        if (typeof text === 'string' && text) {
          span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
          span.setAttribute('neatlogs.llm.output_messages.0.content', text);
        }
        if (usage) recordUsage(span, usage);
        if (finishReason) span.setAttribute('neatlogs.llm.stop_reason', normalizeFinishReason(finishReason));
        endOnce();
      } catch (err) {
        endOnce(err);
      }
    };
    // Drive finalization without requiring the caller to consume; the promises
    // resolve when Mastra finishes the stream internally.
    void finalize();

    // Re-establish span context around stream getters so doStream children nest.
    return rebindStreamContext(output, ctx);
  }

  // Legacy async-iterable
  if (output[Symbol.asyncIterator]) {
    const origIterator = output[Symbol.asyncIterator].bind(output);
    const textParts: string[] = [];
    const wrapped = Object.create(Object.getPrototypeOf(output));
    Object.assign(wrapped, output);
    wrapped[Symbol.asyncIterator] = function () {
      const iterator = origIterator();
      const finish = () => {
        if (textParts.length) {
          span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
          span.setAttribute('neatlogs.llm.output_messages.0.content', textParts.join(''));
        }
        endOnce();
      };
      return {
        async next(): Promise<IteratorResult<any>> {
          try {
            const r = await iterator.next();
            if (r.done) { finish(); return r; }
            const chunk = r.value;
            if (typeof chunk === 'string') textParts.push(chunk);
            else if (chunk?.text) textParts.push(chunk.text);
            else if (chunk?.delta) textParts.push(chunk.delta);
            return r;
          } catch (err) { endOnce(err); throw err; }
        },
        async return(value?: any): Promise<IteratorResult<any>> {
          finish();
          return iterator.return?.(value) ?? { done: true, value: undefined };
        },
        async throw(err?: any): Promise<IteratorResult<any>> {
          endOnce(err);
          return iterator.throw?.(err) ?? { done: true, value: undefined };
        },
      };
    };
    return wrapped;
  }

  // Thenable (awaited result)
  if (typeof output.then === 'function') {
    return output
      .then((resolved: any) => { finalizeAgentResult(span, resolved); endOnce(); return resolved; })
      .catch((err: any) => { endOnce(err); throw err; });
  }

  endOnce();
  return output;
}

/**
 * Wrap the async-iterable getters on a MastraModelOutput so that draining the
 * stream runs inside the AGENT span's context (lets the model's doStream child
 * span attach to the right parent). Returns a proxy; non-stream props pass through.
 */
function rebindStreamContext(output: any, ctx: ReturnType<typeof otelContext.active>): any {
  const STREAM_PROPS = new Set(['textStream', 'fullStream', 'objectStream', 'elementStream']);
  return new Proxy(output, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === 'string' && STREAM_PROPS.has(prop) && value && value[Symbol.asyncIterator]) {
        const origIterator = value[Symbol.asyncIterator].bind(value);
        return {
          [Symbol.asyncIterator]() {
            return otelContext.with(ctx, () => origIterator());
          },
        };
      }
      if (typeof value === 'function') return value.bind(target);
      return value;
    },
  });
}

// ---------------------------------------------------------------------------
// Result finalization
// ---------------------------------------------------------------------------

function finalizeAgentResult(span: Span, result: any): void {
  if (!result) return;

  if (result.text) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', String(result.text));
  }

  if (Array.isArray(result.toolCalls)) {
    for (let i = 0; i < result.toolCalls.length; i++) {
      const tc = result.toolCalls[i];
      const p = tc.payload ?? tc;
      setToolCall(span, i, p.toolName ?? p.name, p.args ?? p.arguments, p.toolCallId ?? p.id);
    }
  }

  if (result.usage) recordUsage(span, result.usage);
  if (result.finishReason) span.setAttribute('neatlogs.llm.stop_reason', normalizeFinishReason(result.finishReason));
  if (result.model) span.setAttribute('neatlogs.llm.model_name', result.model);
}

function finalizeModelResult(span: Span, result: any): void {
  if (!result) return;
  // AI SDK v5 doGenerate result: { content[], finishReason, usage, ... }.
  // `content` is an array of typed parts (text / tool-call); `text` may be absent.
  if (typeof result.text === 'string' && result.text) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', result.text);
  } else if (Array.isArray(result.content)) {
    const text = result.content
      .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('');
    if (text) {
      span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
      span.setAttribute('neatlogs.llm.output_messages.0.content', text);
    }
    // Tool-call parts → indexed tool_calls
    const toolCalls = result.content.filter((p: any) => p?.type === 'tool-call');
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      setToolCall(span, i, tc.toolName, tc.input ?? tc.args, tc.toolCallId);
    }
    span.setAttribute('output.value', safeStringify(result.content));
  }
  if (result.usage) recordUsage(span, result.usage);
  span.setAttribute('neatlogs.llm.stop_reason', normalizeFinishReason(result.finishReason));
}

function normalizeFinishReason(fr: any): string {
  if (fr == null) return '';
  if (typeof fr === 'string') return fr;
  // AI SDK v5 raw model returns { unified: 'tool-calls', ... }
  return String(fr.unified ?? fr.reason ?? fr.type ?? safeStringify(fr));
}

/** Read a possibly-nested token count: 42, or { total: 42 }. */
function tokenValue(v: any): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v.total === 'number') return v.total;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Capture LLM sampling/invocation parameters from the model call options onto
 * the span, using only canonical neatlogs.* keys. Present-only — absent params
 * are skipped. Mirrors AI SDK LanguageModelV2CallOptions field names.
 */
function captureInvocationParams(attrs: Record<string, any>, callOpts: any): void {
  if (!callOpts) return;
  const map: Array<[string, string]> = [
    ['temperature', 'neatlogs.llm.temperature'],
    ['maxOutputTokens', 'neatlogs.llm.max_tokens'],
    ['maxTokens', 'neatlogs.llm.max_tokens'],
    ['topP', 'neatlogs.llm.top_p'],
    ['topK', 'neatlogs.llm.top_k'],
    ['frequencyPenalty', 'neatlogs.llm.frequency_penalty'],
    ['presencePenalty', 'neatlogs.llm.presence_penalty'],
  ];
  const invocation: Record<string, any> = {};
  for (const [src, target] of map) {
    const v = callOpts[src];
    if (v != null) {
      attrs[target] = v;
      invocation[src] = v;
    }
  }
  if (Array.isArray(callOpts.stopSequences) && callOpts.stopSequences.length) {
    attrs['neatlogs.llm.stop_sequences'] = safeStringify(callOpts.stopSequences);
    invocation.stopSequences = callOpts.stopSequences;
  }
  // Tool definitions advertised to the model → neatlogs.llm.tools.{i}
  if (Array.isArray(callOpts.tools)) {
    for (let i = 0; i < callOpts.tools.length; i++) {
      attrs[`neatlogs.llm.tools.${i}`] = safeStringify(callOpts.tools[i]);
    }
    invocation.toolChoice = callOpts.toolChoice;
  }
  if (Object.keys(invocation).length) {
    attrs['neatlogs.llm.invocation_parameters'] = safeStringify(invocation);
  }
}

/**
 * Emit an indexed tool call directly in the neatlogs target namespace
 * `neatlogs.llm.tool_calls.{i}.{id,name,arguments}` — matching how the validated
 * openai/anthropic wrappers (src/openai.ts) emit them. The backend's
 * tool_calls.{i} target is an indexed object with these sub-fields.
 */
function setToolCall(span: Span, i: number, name: any, args: any, id: any): void {
  span.setAttribute(`neatlogs.llm.tool_calls.${i}.name`, name ?? '');
  span.setAttribute(`neatlogs.llm.tool_calls.${i}.arguments`, safeStringify(args ?? {}));
  if (id) span.setAttribute(`neatlogs.llm.tool_calls.${i}.id`, id);
}

function recordUsage(span: Span, usage: any): void {
  if (!usage) return;
  // Shapes seen:
  //  - AISDK v5 raw model: { inputTokens: {total}, outputTokens: {total} }
  //  - Mastra result:      { inputTokens, outputTokens, totalTokens }
  //  - AISDK v3:           { promptTokens, completionTokens, totalTokens }
  const prompt = tokenValue(usage.promptTokens ?? usage.inputTokens ?? usage.input_tokens);
  const completion = tokenValue(usage.completionTokens ?? usage.outputTokens ?? usage.output_tokens);
  const total = tokenValue(usage.totalTokens);
  if (prompt != null) span.setAttribute('neatlogs.llm.token_count.prompt', prompt);
  if (completion != null) span.setAttribute('neatlogs.llm.token_count.completion', completion);
  if (total != null) span.setAttribute('neatlogs.llm.token_count.total', total);
  else if (prompt != null && completion != null) {
    span.setAttribute('neatlogs.llm.token_count.total', prompt + completion);
  }
}

// ---------------------------------------------------------------------------
// Span helpers
// ---------------------------------------------------------------------------

/**
 * Open a span as the ACTIVE span for the duration of `fn`, so any spans created
 * inside `fn` (model calls, tool executions, workflow steps) nest under it.
 */
function withActiveSpan<T>(name: string, attrs: Record<string, any>, fn: (span: Span) => Promise<T>): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  const span = tracer.startSpan(name, { attributes: attrs }, otelContext.active());
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      recordError(span, err);
      throw err;
    } finally {
      // Stream wrappers end the span themselves once the stream drains; guard
      // against double-end via the OTel SDK (ending twice is a no-op there).
      span.end();
    }
  });
}

/** Like withActiveSpan but for non-async-context-sensitive leaf operations. */
function withSpan<T>(name: string, attrs: Record<string, any>, fn: (span: Span) => Promise<T> | T): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  const span = tracer.startSpan(name, { attributes: attrs }, otelContext.active());
  return Promise.resolve()
    .then(() => fn(span))
    .then((result) => {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    })
    .catch((err) => {
      recordError(span, err);
      span.end();
      throw err;
    });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function markPatched(e: any): void {
  try {
    Object.defineProperty(e, PATCH_FLAG, { value: true, enumerable: false, configurable: true });
  } catch {
    e[PATCH_FLAG] = true;
  }
}

function extractModelId(model: any): string {
  if (!model) return '';
  if (typeof model === 'string') return model;
  return model.modelId ?? model.name ?? '';
}

function toInputValue(input: any): string {
  return (typeof input === 'string' ? input : safeStringify(input));
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function recordError(span: Span, err: unknown): void {
  if (err instanceof Error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.recordException(err);
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  }
}
