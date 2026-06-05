/**
 * Neatlogs Claude Agent SDK integration.
 *
 * Wraps Anthropic's `@anthropic-ai/claude-agent-sdk` so every `query()` run is
 * traced. The SDK's `query()` returns an async-iterable of SDKMessages
 * (system init → assistant (text + tool_use) → user (tool_result) → … →
 * result). Each message carries `parent_tool_use_id`: null for the main
 * (orchestrator) agent, or the id of the spawning Task tool call for a subagent.
 * We translate that into a neatlogs span tree:
 *
 *   AGENT  claude_agent.query                (orchestrator = trace root)
 *     ↳ LLM   orchestrator turn              (one per model turn; text + tool_calls)
 *     ↳ TOOL  Read / Edit / Bash …
 *     ↳ TOOL  Task                           (spawns a subagent)
 *          ↳ AGENT  claude_agent.subagent.<type>   (each subagent, nested)
 *               ↳ LLM   subagent turn
 *               ↳ TOOL  subagent tool call
 *
 * The orchestrator is the single root AGENT span — there is NO redundant WORKFLOW
 * wrapper. Subagents (Task-tool invocations, e.g. the wizard's parallel per-file
 * edits) get their own AGENT spans nested under the Task TOOL span that spawned
 * them, so a multi-agent run is represented faithfully and each agent's I/O is
 * distinct.
 *
 * Usage:
 *   import { init } from 'neatlogs';
 *   import { wrapClaudeAgentSDK } from 'neatlogs/claude-agent-sdk';
 *   import * as claudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
 *
 *   await init({ apiKey, workflowName });
 *   const { query } = wrapClaudeAgentSDK(claudeAgentSDK);
 *   for await (const msg of query({ prompt: 'Hello', options: {...} })) { ... }
 *
 * Conversation tracking: Claude's `session_id` is captured on the root AGENT span
 * as `neatlogs.conversation.id`. Tool calls are traced only through the wrapped
 * `query` — calling the unwrapped SDK directly produces no tracing.
 */

import { trace, context as otelContext, SpanStatusCode, type Span, type Context } from '@opentelemetry/api';

const TRACER_NAME = 'neatlogs.claude_agent_sdk';
const ROOT_SCOPE = '__root__';

export interface WrapClaudeAgentSDKOptions {
  /** Logical grouping for traces (also settable globally via init({ workflowName })). */
  workflowName?: string;
}

/**
 * Wrap the Claude Agent SDK module. Returns a shallow copy of the module with an
 * instrumented `query`; all other exports (createSdkMcpServer, tool, the built-in
 * Tool helpers, etc.) are passed through unchanged.
 */
export function wrapClaudeAgentSDK<T extends Record<string, any>>(
  sdk: T,
  options: WrapClaudeAgentSDKOptions = {},
): T {
  if (!sdk || typeof sdk.query !== 'function') return sdk;
  if ((sdk as any)._neatlogsWrapped) return sdk;

  const wrapped: Record<string, any> = { ...sdk };
  wrapped.query = wrapQuery(sdk.query.bind(sdk), options);

  try {
    Object.defineProperty(wrapped, '_neatlogsWrapped', {
      value: true,
      enumerable: false,
      configurable: true,
    });
  } catch {
    wrapped._neatlogsWrapped = true;
  }

  return wrapped as T;
}

// ---------------------------------------------------------------------------
// query() wrapping
// ---------------------------------------------------------------------------

function wrapQuery(original: (...args: any[]) => any, options: WrapClaudeAgentSDKOptions) {
  return function (params: any, ...rest: any[]): any {
    const tracer = trace.getTracer(TRACER_NAME);
    const workflowName = options.workflowName ?? 'claude_agent.query';

    // Shared ref the input-tap fills with the first user-prompt text. In
    // streaming-input mode the prompt is an async generator fed into the SDK
    // subprocess and is NOT echoed back as a `user` output message before the
    // first assistant turn — so without tapping it, the first LLM span has no
    // input. The tap reads prompt text as the SDK pulls it.
    const promptRef: { text: string } = { text: '' };

    // The orchestrator AGENT is the trace ROOT (no WORKFLOW wrapper — a single
    // query() is one agent run; subagents nest below as their own AGENT spans).
    const agentSpan = tracer.startSpan(
      'claude_agent.query',
      { attributes: { 'neatlogs.span.kind': 'AGENT', 'neatlogs.workflow.name': workflowName } },
      otelContext.active(),
    );

    // Input: a string prompt is captured directly. A streaming-input prompt (an
    // async iterable) is tapped — promptRef.text fills as the SDK pulls the
    // first user message — so the agent input and the first LLM span's input are
    // populated even before any `user` message echoes back through the output.
    const promptText = extractPromptText(params?.prompt);
    if (promptText) {
      promptRef.text = promptText;
      agentSpan.setAttribute('input.value', promptText);
    } else if (params && isAsyncIterable(params.prompt)) {
      params = { ...params, prompt: tapPromptStream(params.prompt, promptRef) };
    }

    const agentCtx = trace.setSpan(otelContext.active(), agentSpan);

    // Call the original query inside the AGENT context so any SDK-internal OTel
    // spans (and our child spans) nest under it.
    const queryObj = otelContext.with(agentCtx, () => original(params, ...rest));

    return instrumentQueryIterable(queryObj, agentSpan, agentCtx, tracer, promptRef);
  };
}

/** True for an async iterable (streaming-input prompt). */
function isAsyncIterable(v: any): boolean {
  return Boolean(v) && typeof v[Symbol.asyncIterator] === 'function';
}

/**
 * Pass-through wrapper over a streaming-input prompt that records the first
 * user message's text into `ref` as the SDK consumes it. Never alters what the
 * SDK receives.
 */
async function* tapPromptStream(prompt: any, ref: { text: string }): AsyncGenerator<any> {
  // userMessageText is fully defensive (returns '' for any non-text shape), so
  // no try/catch is needed — the message is always yielded through untouched.
  for await (const message of prompt) {
    if (!ref.text) {
      const text = userMessageText(message);
      if (text) ref.text = text;
    }
    yield message;
  }
}

interface ToolCallAccum {
  id: string;
  name: string;
  input: unknown;
}

interface AssistantTurnBuffer {
  textParts: string[];
  thinkingParts: string[];
  toolCalls: ToolCallAccum[];
  usage: any;
  model?: string;
  stopReason?: string;
}

/**
 * One agent's tracing scope. There is always a root scope (the orchestrator,
 * keyed ROOT_SCOPE). Each subagent — identified by the `parent_tool_use_id` of
 * the Task tool call that spawned it — gets its own scope created lazily, with
 * its AGENT span nested under that Task TOOL span. Per-scope state keeps each
 * agent's conversation/turn buffer independent.
 */
interface AgentScope {
  /** The AGENT span for this scope (root = orchestrator; others = subagents). */
  span: Span;
  /** OTel context whose active span is this scope's AGENT span (children nest here). */
  ctx: Context;
  /** Running conversation (user/tool/assistant turns) — each LLM span's input. */
  inputMessages: Array<{ role: string; content: string }>;
  /** In-progress model turn, coalesced from multiple `assistant` messages. */
  assistantBuffer: AssistantTurnBuffer | null;
  /** Last assistant text seen (subagent output = its final text). */
  finalText: string;
  /** Whether input.value has been set on this scope's AGENT span. */
  inputCaptured: boolean;
}

interface QueryState {
  /** TOOL spans keyed by tool_use_id, closed by the matching tool_result. */
  toolSpans: Map<string, Span>;
  /** Agent scopes keyed by parent_tool_use_id (ROOT_SCOPE for the orchestrator). */
  scopes: Map<string, AgentScope>;
  sessionId?: string;
  model?: string;
  finished: boolean;
  /** Lazily-filled prompt text from a streaming-input tap. */
  promptRef: { text: string };
}

/**
 * Wrap the Query object so iteration is instrumented while preserving its own
 * methods (interrupt, setPermissionMode, …). The SDK returns an async-iterable
 * object, not a bare generator.
 */
function instrumentQueryIterable(
  queryObj: any,
  agentSpan: Span,
  agentCtx: Context,
  tracer: ReturnType<typeof trace.getTracer>,
  promptRef: { text: string },
): any {
  const originalAsyncIterator = queryObj?.[Symbol.asyncIterator]?.bind(queryObj);
  if (!originalAsyncIterator) {
    // Not iterable — nothing to trace; close the root span immediately.
    agentSpan.setStatus({ code: SpanStatusCode.OK });
    agentSpan.end();
    return queryObj;
  }

  // The root scope is the orchestrator agent. Seed its conversation with the
  // prompt (known up front for string prompts; filled by the tap otherwise).
  const rootScope: AgentScope = {
    span: agentSpan,
    ctx: agentCtx,
    inputMessages: promptRef.text ? [{ role: 'user', content: promptRef.text }] : [],
    assistantBuffer: null,
    finalText: '',
    inputCaptured: Boolean(promptRef.text),
  };
  const state: QueryState = {
    toolSpans: new Map(),
    scopes: new Map([[ROOT_SCOPE, rootScope]]),
    finished: false,
    promptRef,
  };

  const finalizeAgent = (status: 'ok' | 'error', err?: unknown) => {
    if (state.finished) return;
    state.finished = true;
    // Flush every scope's in-progress turn, then close subagent AGENT spans
    // (deepest-first) and finally the root.
    for (const scope of state.scopes.values()) flushAssistantTurn(tracer, scope, state);
    // Close any tool spans that never got a matching result.
    for (const ts of state.toolSpans.values()) {
      try {
        ts.end();
      } catch {
        /* ignore */
      }
    }
    state.toolSpans.clear();
    // Close subagent scopes first (any still open), then the root.
    for (const [key, scope] of state.scopes) {
      if (key === ROOT_SCOPE) continue;
      closeScope(scope, 'ok');
    }
    if (rootScope.finalText) agentSpan.setAttribute('output.value', rootScope.finalText);
    if (status === 'error') {
      recordError(agentSpan, err);
    } else {
      agentSpan.setStatus({ code: SpanStatusCode.OK });
      agentSpan.end();
    }
  };

  const wrapped = Object.create(Object.getPrototypeOf(queryObj));
  Object.assign(wrapped, queryObj);

  wrapped[Symbol.asyncIterator] = function () {
    const iterator = originalAsyncIterator();
    return {
      async next(): Promise<IteratorResult<any>> {
        try {
          const result = await otelContext.with(agentCtx, () => iterator.next());
          if (result.done) {
            finalizeAgent('ok');
            return result;
          }
          try {
            handleMessage(tracer, state, result.value, finalizeAgent);
          } catch {
            /* never let tracing break the run */
          }
          return result;
        } catch (err) {
          finalizeAgent('error', err);
          throw err;
        }
      },
      async return(value?: any): Promise<IteratorResult<any>> {
        finalizeAgent('ok');
        return iterator.return?.(value) ?? { done: true, value: undefined };
      },
      async throw(err?: any): Promise<IteratorResult<any>> {
        finalizeAgent('error', err);
        if (iterator.throw) return iterator.throw(err);
        throw err;
      },
    };
  };

  return wrapped;
}

/** End a subagent scope's AGENT span, setting its output to the subagent's final text. */
function closeScope(scope: AgentScope, status: 'ok' | 'error'): void {
  try {
    if (scope.finalText) scope.span.setAttribute('output.value', scope.finalText);
    scope.span.setStatus({ code: status === 'ok' ? SpanStatusCode.OK : SpanStatusCode.ERROR });
    scope.span.end();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

/**
 * Resolve the agent scope for a message. `parent_tool_use_id` is null for the
 * orchestrator (root scope) and the spawning Task tool_use_id for a subagent.
 * Subagent scopes are created lazily, with their AGENT span nested under the
 * Task TOOL span (looked up by that id) so the hierarchy is
 * orchestrator → Task TOOL → subagent AGENT.
 */
function getScope(
  tracer: ReturnType<typeof trace.getTracer>,
  state: QueryState,
  msg: any,
): AgentScope {
  const parentId = msg?.parent_tool_use_id ?? null;
  if (!parentId) return state.scopes.get(ROOT_SCOPE)!;

  const existing = state.scopes.get(parentId);
  if (existing) return existing;

  // New subagent. Its spawning Task tool_use may still be buffered in the root
  // turn (the SDK emits subagent messages before the Task's tool_result closes
  // the parent turn). Flush the root turn first so the Task TOOL span exists and
  // this subagent AGENT can nest under it.
  const root = state.scopes.get(ROOT_SCOPE)!;
  if (!state.toolSpans.has(parentId) && root.assistantBuffer) {
    flushAssistantTurn(tracer, root, state);
  }

  // Nest the subagent AGENT span under the spawning Task TOOL span if we have it;
  // otherwise under the root agent.
  const parentToolSpan = state.toolSpans.get(parentId);
  const parentCtx = parentToolSpan
    ? trace.setSpan(otelContext.active(), parentToolSpan)
    : state.scopes.get(ROOT_SCOPE)!.ctx;

  const subType = msg?.subagent_type ? String(msg.subagent_type) : 'subagent';
  const attrs: Record<string, any> = {
    'neatlogs.span.kind': 'AGENT',
    'neatlogs.agent.name': subType,
  };
  if (msg?.task_description) attrs['input.value'] = String(msg.task_description);
  const span = tracer.startSpan(`claude_agent.subagent.${subType}`, { attributes: attrs }, parentCtx);

  const scope: AgentScope = {
    span,
    ctx: trace.setSpan(otelContext.active(), span),
    inputMessages: msg?.task_description ? [{ role: 'user', content: String(msg.task_description) }] : [],
    assistantBuffer: null,
    finalText: '',
    inputCaptured: Boolean(msg?.task_description),
  };
  state.scopes.set(parentId, scope);
  return scope;
}

function handleMessage(
  tracer: ReturnType<typeof trace.getTracer>,
  state: QueryState,
  msg: any,
  finalizeAgent: (status: 'ok' | 'error', err?: unknown) => void,
): void {
  if (!msg || typeof msg !== 'object') return;

  const rootScope = state.scopes.get(ROOT_SCOPE)!;

  // Backfill root input from the tapped streaming-input prompt as soon as it's
  // available (it fills before the first assistant turn).
  if (!rootScope.inputCaptured && state.promptRef.text) {
    rootScope.inputCaptured = true;
    rootScope.span.setAttribute('input.value', state.promptRef.text);
  }

  switch (msg.type) {
    case 'system': {
      // init message — carries session_id, model, available tools.
      if (msg.session_id) {
        state.sessionId = msg.session_id;
        rootScope.span.setAttribute('neatlogs.conversation.id', String(msg.session_id));
      }
      if (msg.model) {
        state.model = msg.model;
        rootScope.span.setAttribute('neatlogs.agent.model', String(msg.model));
      }
      break;
    }

    case 'user': {
      // A `user` message (prompt, or tool_result turns) is a turn boundary for
      // its scope: flush the buffered turn as ONE LLM span first.
      const scope = getScope(tracer, state, msg);
      flushAssistantTurn(tracer, scope, state);

      const userText = userMessageText(msg);
      if (userText) {
        if (!scope.inputCaptured) {
          scope.inputCaptured = true;
          scope.span.setAttribute('input.value', userText);
        }
        scope.inputMessages.push({ role: 'user', content: userText });
      }
      closeToolSpansFromUser(state, scope, msg);
      break;
    }

    case 'assistant': {
      // Don't emit yet — the SDK delivers one model turn as multiple `assistant`
      // messages (text block, then tool_use block, …). Buffer them per scope;
      // the next user/result boundary flushes the turn as a single LLM span.
      const scope = getScope(tracer, state, msg);
      bufferAssistantMessage(scope, msg);
      break;
    }

    case 'result': {
      // The run is complete. Flush the root turn (a final text answer may have no
      // trailing user message), then finalize.
      flushAssistantTurn(tracer, rootScope, state);

      const text = typeof msg.result === 'string' ? msg.result : '';
      if (text) rootScope.finalText = text;
      if (msg.session_id && !state.sessionId) {
        rootScope.span.setAttribute('neatlogs.conversation.id', String(msg.session_id));
      }
      const usage = msg.usage;
      if (usage) setUsage(rootScope.span, usage);
      if (msg.total_cost_usd != null) rootScope.span.setAttribute('neatlogs.agent.cost_usd', msg.total_cost_usd);
      if (msg.num_turns != null) rootScope.span.setAttribute('neatlogs.agent.num_turns', msg.num_turns);
      if (msg.is_error) rootScope.span.setAttribute('neatlogs.agent.is_error', true);

      finalizeAgent(msg.is_error ? 'error' : 'ok', msg.is_error ? new Error(String(text || 'agent run failed')) : undefined);
      break;
    }

    default:
      break;
  }
}

/**
 * Append one `assistant` SDK message to the in-progress turn buffer. The SDK
 * splits a single model turn into multiple assistant messages (a text block,
 * then tool_use blocks); they share token usage. We merge their text, thinking,
 * and tool_use blocks so the turn becomes ONE LLM span on flush.
 */
function bufferAssistantMessage(scope: AgentScope, msg: any): void {
  const message = msg.message ?? msg;
  const content = message?.content ?? [];

  if (!scope.assistantBuffer) {
    scope.assistantBuffer = { textParts: [], thinkingParts: [], toolCalls: [], usage: undefined };
  }
  const buf = scope.assistantBuffer;
  if (message?.model) buf.model = message.model;
  if (message?.stop_reason) buf.stopReason = message.stop_reason;
  // Usage is reported per assistant message but is the SAME turn total — keep
  // the largest/last non-empty one rather than summing (summing double-counts).
  if (message?.usage) buf.usage = message.usage;

  for (const block of Array.isArray(content) ? content : []) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') buf.textParts.push(block.text);
    else if (block.type === 'thinking' && typeof block.thinking === 'string') buf.thinkingParts.push(block.thinking);
    else if (block.type === 'tool_use') {
      buf.toolCalls.push({ id: block.id ?? '', name: block.name ?? '', input: block.input });
    }
  }
}

/**
 * Emit the buffered model turn as a SINGLE LLM span, then open TOOL spans for
 * its tool calls. No-op if no turn is buffered. This is what makes one LLM span
 * per real model turn (not per SDK assistant message).
 */
function flushAssistantTurn(
  tracer: ReturnType<typeof trace.getTracer>,
  scope: AgentScope,
  state: QueryState,
): void {
  const buf = scope.assistantBuffer;
  if (!buf) return;
  scope.assistantBuffer = null;

  const model = buf.model ?? state.model ?? '';

  const attrs: Record<string, any> = {
    'neatlogs.span.kind': 'LLM',
    'neatlogs.llm.provider': 'anthropic',
    'neatlogs.llm.system': 'anthropic',
  };
  if (model) attrs['neatlogs.llm.model_name'] = String(model);

  // If this is the root scope's first turn and no user message was recorded yet
  // (streaming-input mode), seed input from the tapped prompt text.
  if (scope.inputMessages.length === 0 && state.promptRef.text) {
    scope.inputMessages.push({ role: 'user', content: state.promptRef.text });
  }

  // Input = the exact accumulated conversation up to this turn. Emitted BOTH as
  // structured indexed input_messages.* AND as the flat `input.value` blob —
  // per neatlogs/config/attribute-mapping.json, the main UI panel renders
  // `neatlogs.{span_kind}.input` (mapped from `input.value`); the indexed
  // messages alone do NOT populate it. Without input.value the LLM Input is blank.
  scope.inputMessages.forEach((m, i) => {
    attrs[`neatlogs.llm.input_messages.${i}.role`] = m.role;
    attrs[`neatlogs.llm.input_messages.${i}.content`] = m.content;
  });
  if (scope.inputMessages.length) {
    attrs['input.value'] = safeStringify({ messages: scope.inputMessages });
  }

  // Output = the turn's actual assistant content. Prefer the model's text; for a
  // tool-only turn (no text) the output IS the tool call(s), so render them as
  // the exact `name(arguments)` the model emitted (not a vague summary). The
  // structured tool_calls.* below still carry the same data for programmatic use.
  // `output.value` is the flat blob the UI maps to `neatlogs.{span_kind}.output`.
  const outText = buf.textParts.join('');
  const outValue =
    outText ||
    buf.toolCalls.map((tc) => `${tc.name}(${safeStringify(tc.input ?? {})})`).join('\n');
  if (outValue) {
    attrs['neatlogs.llm.output_messages.0.role'] = 'assistant';
    attrs['neatlogs.llm.output_messages.0.content'] = outValue;
    attrs['output.value'] = outValue;
  }
  if (buf.thinkingParts.length) {
    attrs['neatlogs.llm.output_messages.0.thinking'] = buf.thinkingParts.join('');
  }
  buf.toolCalls.forEach((tc, j) => {
    attrs[`neatlogs.llm.tool_calls.${j}.id`] = tc.id;
    attrs[`neatlogs.llm.tool_calls.${j}.name`] = tc.name;
    attrs[`neatlogs.llm.tool_calls.${j}.arguments`] = safeStringify(tc.input ?? {});
  });
  if (buf.stopReason) attrs['neatlogs.llm.finish_reason'] = String(buf.stopReason);

  // The LLM span nests under THIS scope's AGENT span.
  const span = tracer.startSpan(`claude_agent.llm.${model || 'model'}`, { attributes: attrs }, scope.ctx);
  if (buf.usage) setUsage(span, buf.usage);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();

  // Track this scope's latest text as its output (the subagent/orchestrator
  // final answer is the last assistant text).
  if (outText) scope.finalText = outText;

  // Record this assistant turn so the NEXT turn's LLM span sees it as context.
  const turnParts: string[] = [];
  if (outText) turnParts.push(outText);
  for (const tc of buf.toolCalls) turnParts.push(`[tool_call ${tc.name} ${safeStringify(tc.input ?? {})}]`);
  if (turnParts.length) scope.inputMessages.push({ role: 'assistant', content: turnParts.join('\n') });

  // Open TOOL spans for this turn's tool calls, nested under THIS scope's AGENT
  // span (closed by their tool_result). A Task tool's id becomes the key a
  // subagent's messages resolve to (see getScope).
  for (const tc of buf.toolCalls) {
    const toolSpan = tracer.startSpan(
      `claude_agent.tool.${tc.name || 'tool'}`,
      {
        attributes: {
          'neatlogs.span.kind': 'TOOL',
          'neatlogs.tool.name': String(tc.name ?? ''),
          ...(tc.id ? { 'neatlogs.tool_call.id': String(tc.id) } : {}),
          'input.value': safeStringify(tc.input ?? {}),
        },
      },
      scope.ctx,
    );
    if (tc.id) state.toolSpans.set(tc.id, toolSpan);
  }
}

function closeToolSpansFromUser(state: QueryState, scope: AgentScope, msg: any): void {
  const content = (msg.message ?? msg)?.content ?? [];
  for (const block of Array.isArray(content) ? content : []) {
    if (block?.type !== 'tool_result') continue;
    const id = block.tool_use_id ?? '';
    const out = block.content;
    const outText = (typeof out === 'string' ? out : safeStringify(out));
    // Feed the tool result into THIS scope's conversation so the next LLM span's
    // input reflects what the model actually saw.
    if (outText) scope.inputMessages.push({ role: 'tool', content: outText });
    const span = state.toolSpans.get(id);
    if (!span) continue;
    span.setAttribute('output.value', outText);
    if (block.is_error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.setAttribute('neatlogs.tool.is_error', true);
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
    state.toolSpans.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the human/text content of a `user` SDK message — the prompt, not
 * tool_result blocks (those are handled separately as tool outputs).
 */
function userMessageText(msg: any): string {
  const content = (msg.message ?? msg)?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'string') parts.push(block);
    else if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('\n');
}

function setUsage(span: Span, usage: any): void {
  if (!usage) return;
  if (usage.input_tokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.input_tokens);
  if (usage.output_tokens != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.output_tokens);
  if (usage.input_tokens != null && usage.output_tokens != null) {
    span.setAttribute('neatlogs.llm.token_count.total', usage.input_tokens + usage.output_tokens);
  }
  if (usage.cache_read_input_tokens != null) {
    span.setAttribute('neatlogs.llm.token_count.cache_read', usage.cache_read_input_tokens);
  }
  if (usage.cache_creation_input_tokens != null) {
    span.setAttribute('neatlogs.llm.token_count.cache_write', usage.cache_creation_input_tokens);
  }
}

function extractPromptText(prompt: any): string {
  if (typeof prompt === 'string') return prompt;
  // Streaming-input mode passes an async iterable of messages; we can't read it
  // synchronously without consuming it, so leave input.value unset in that case.
  return '';
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
  span.end();
}
