/**
 * Neatlogs Pi Agent integration.
 *
 * Usage:
 *   import { init } from 'neatlogs';
 *   import { piAgentHooks } from 'neatlogs/pi-agent';
 *   import { Agent } from '@mariozechner/pi-agent-core';
 *
 *   await init({ apiKey, workflowName });
 *   const agent = piAgentHooks(new Agent({ initialState: { systemPrompt, model } }));
 *   await agent.prompt('Hello');
 *
 * Pi Agent's `Agent` exposes a first-class `subscribe(listener)` API and emits
 * AgentEvents for its run lifecycle (message_*, tool_execution_*, turn_*,
 * agent_*). It does NOT emit its own OpenTelemetry spans — so we LISTEN to those
 * events (no monkey-patching) and translate them into neatlogs OTel spans:
 *
 *   AGENT  agent run                    (agent_start → agent_end)
 *     ↳ LLM   assistant message         (each assistant message_end)
 *     ↳ TOOL  tool call                 (tool_execution_start → tool_execution_end)
 *
 * The AGENT span is opened as the active span so the LLM/TOOL children nest under
 * it (and under any user @span / trace() block active when prompt() is called).
 */

import {
  trace,
  context as otelContext,
  SpanStatusCode,
  type Span,
  type Context,
} from '@opentelemetry/api';

const TRACER_NAME = 'neatlogs.pi-agent';
const PATCH_FLAG = '_neatlogs_patched';

// Minimal structural types for the Pi Agent event surface (we duck-type — no
// hard dependency on the pi-agent-core package).
interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}
interface PiToolCall {
  type: 'toolCall';
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}
interface PiAssistantMessage {
  role: 'assistant';
  content?: Array<{ type: string; text?: string; name?: string; arguments?: unknown }>;
  model?: string;
  provider?: string;
  usage?: PiUsage;
  stopReason?: string;
}
interface PiAgentEvent {
  type: string;
  message?: any;
  messages?: any[];
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}

interface PerAgentState {
  agentSpan?: Span;
  agentCtx?: Context;
  toolSpans: Map<string, Span>;
  /** Running conversation (system/user/tool turns) to use as LLM-span input.
   *  Pi Agent's assistant message_end carries only the response, not the prompt. */
  inputMessages: Array<{ role: string; content: string }>;
}

/**
 * Subscribe neatlogs tracing to a Pi Agent instance. Returns the same agent
 * (marked so re-subscribing is a no-op). Idempotent per agent.
 */
export function piAgentHooks<T extends object>(agent: T): T {
  if (!agent || (agent as any)[PATCH_FLAG]) return agent;
  const a = agent as any;
  if (typeof a.subscribe !== 'function') return agent; // not a Pi Agent — leave alone

  const state: PerAgentState = { toolSpans: new Map(), inputMessages: [] };
  const tracer = trace.getTracer(TRACER_NAME);

  a.subscribe((event: PiAgentEvent) => {
    try {
      handleEvent(tracer, state, event);
    } catch {
      // never let tracing break the agent run
    }
  });

  markPatched(a);
  return agent;
}

function handleEvent(
  tracer: ReturnType<typeof trace.getTracer>,
  state: PerAgentState,
  event: PiAgentEvent,
): void {
  switch (event.type) {
    case 'agent_start': {
      // Open the AGENT (run) span as the active span so children nest under it.
      const span = tracer.startSpan(
        'pi_agent.run',
        { attributes: { 'neatlogs.span.kind': 'AGENT' } },
        otelContext.active(),
      );
      state.agentSpan = span;
      state.agentCtx = trace.setSpan(otelContext.active(), span);
      state.inputMessages = [];
      break;
    }

    case 'message_end': {
      const msg = event.message as any;
      if (!msg) return;
      if (msg.role === 'assistant') {
        // Assistant message = the LLM response. Emit an LLM span using the
        // accumulated conversation as input, then record the assistant turn too.
        emitLlmSpan(tracer, state, msg as PiAssistantMessage);
        const { text } = splitAssistantContent(msg.content);
        if (text) state.inputMessages.push({ role: 'assistant', content: text });
      } else {
        // user / toolResult turns — accumulate as input context for later LLM spans.
        const role = msg.role === 'toolResult' ? 'tool' : String(msg.role || 'user');
        const content = messageText(msg);
        if (content) state.inputMessages.push({ role, content });
      }
      break;
    }

    case 'tool_execution_start': {
      const parent = state.agentCtx ?? otelContext.active();
      const span = tracer.startSpan(
        `pi_agent.tool.${event.toolName ?? 'tool'}`,
        {
          attributes: {
            'neatlogs.span.kind': 'TOOL',
            ...(event.toolName ? { 'neatlogs.tool.name': String(event.toolName) } : {}),
            ...(event.args !== undefined
              ? { 'input.value': safeStringify(event.args).slice(0, 10000) }
              : {}),
          },
        },
        parent,
      );
      if (event.toolCallId) state.toolSpans.set(event.toolCallId, span);
      break;
    }

    case 'tool_execution_end': {
      const span = event.toolCallId ? state.toolSpans.get(event.toolCallId) : undefined;
      if (!span) return;
      if (event.result !== undefined) {
        span.setAttribute('output.value', safeStringify(event.result).slice(0, 10000));
      }
      if (event.isError) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('neatlogs.tool.is_error', true);
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
      if (event.toolCallId) state.toolSpans.delete(event.toolCallId);
      break;
    }

    case 'agent_end': {
      // Close any tool spans that never received an end event, then the agent span.
      for (const ts of state.toolSpans.values()) {
        try {
          ts.end();
        } catch {
          /* ignore */
        }
      }
      state.toolSpans.clear();
      if (state.agentSpan) {
        // Agent input = the first user message of the run; output = final answer.
        const firstUser = state.inputMessages.find((m) => m.role === 'user');
        if (firstUser) state.agentSpan.setAttribute('input.value', firstUser.content.slice(0, 10000));
        const finalText = lastAssistantText(event.messages);
        if (finalText) state.agentSpan.setAttribute('output.value', finalText.slice(0, 10000));
        state.agentSpan.setStatus({ code: SpanStatusCode.OK });
        state.agentSpan.end();
        state.agentSpan = undefined;
        state.agentCtx = undefined;
      }
      break;
    }

    default:
      break;
  }
}

function emitLlmSpan(
  tracer: ReturnType<typeof trace.getTracer>,
  state: PerAgentState,
  msg: PiAssistantMessage,
): void {
  const attrs: Record<string, any> = { 'neatlogs.span.kind': 'LLM' };
  if (msg.model) attrs['neatlogs.llm.model_name'] = String(msg.model);
  if (msg.provider) attrs['neatlogs.llm.provider'] = String(msg.provider);
  if (msg.stopReason) attrs['neatlogs.llm.stop_reason'] = String(msg.stopReason);

  // Input = the conversation accumulated up to this assistant turn (system +
  // user + prior assistant/tool messages). Pi Agent's message_end doesn't carry
  // the prompt, so we reconstruct it from the running inputMessages list.
  const inMsgs = state.inputMessages;
  if (inMsgs.length) {
    inMsgs.forEach((m, i) => {
      attrs[`neatlogs.llm.input_messages.${i}.role`] = m.role;
      attrs[`neatlogs.llm.input_messages.${i}.content`] = m.content.slice(0, 10000);
    });
    attrs['neatlogs.llm.input'] = safeStringify({ messages: inMsgs }).slice(0, 20000);
    attrs['input.value'] = safeStringify({ messages: inMsgs }).slice(0, 10000);
  }

  const { text, toolCalls } = splitAssistantContent(msg.content);
  // Output: text if present, else a readable tool-call summary so the span isn't blank.
  const outText = text || toolCalls.map((tc) => `${tc.name}(${safeStringify(tc.arguments)})`).join('\n');
  if (outText || toolCalls.length) {
    attrs['neatlogs.llm.output_messages.0.role'] = 'assistant';
    attrs['neatlogs.llm.output_messages.0.content'] = (outText || '').slice(0, 10000);
    const outBlob: Record<string, unknown> = { role: 'assistant', content: outText || '' };
    if (toolCalls.length) {
      outBlob.tool_calls = toolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments }));
      toolCalls.forEach((tc, j) => {
        if (tc.name) attrs[`neatlogs.llm.tool_calls.${j}.name`] = tc.name;
        if (tc.arguments !== undefined)
          attrs[`neatlogs.llm.tool_calls.${j}.arguments`] = safeStringify(tc.arguments);
        if (tc.id) attrs[`neatlogs.llm.tool_calls.${j}.id`] = String(tc.id);
      });
    }
    attrs['neatlogs.llm.output'] = safeStringify(outBlob).slice(0, 20000);
    attrs['output.value'] = (outText || '').slice(0, 10000);
  }

  const usage = msg.usage;
  if (usage) {
    if (usage.input != null) attrs['neatlogs.llm.token_count.prompt'] = usage.input;
    if (usage.output != null) attrs['neatlogs.llm.token_count.completion'] = usage.output;
    const total = usage.totalTokens ?? ((usage.input ?? 0) + (usage.output ?? 0));
    if (total) attrs['neatlogs.llm.token_count.total'] = total;
    if (usage.cacheRead) attrs['neatlogs.llm.token_count.cache_read'] = usage.cacheRead;
    if (usage.cacheWrite) attrs['neatlogs.llm.token_count.cache_write'] = usage.cacheWrite;
  }

  const parent = state.agentCtx ?? otelContext.active();
  const span = tracer.startSpan(
    `pi_agent.llm.${msg.model || 'model'}`,
    { attributes: attrs },
    parent,
  );
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

function splitAssistantContent(
  content: PiAssistantMessage['content'],
): { text: string; toolCalls: PiToolCall[] } {
  const texts: string[] = [];
  const toolCalls: PiToolCall[] = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
      else if (block.type === 'toolCall')
        toolCalls.push(block as unknown as PiToolCall);
      // thinking blocks intentionally omitted from the main output text
    }
  } else if (typeof content === 'string') {
    texts.push(content);
  }
  return { text: texts.join(''), toolCalls };
}

/** Flatten any message's content (string or block array) to readable text. */
function messageText(msg: any): string {
  if (!msg) return '';
  const c = msg.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  const parts: string[] = [];
  for (const block of c) {
    if (typeof block === 'string') parts.push(block);
    else if (block && typeof block === 'object') {
      if (typeof block.text === 'string') parts.push(block.text);
      else if (block.type === 'toolCall') parts.push(`${block.name ?? 'tool'}(${safeStringify(block.arguments)})`);
    }
  }
  return parts.join('');
}

function lastAssistantText(messages: any[] | undefined): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'assistant') {
      const { text } = splitAssistantContent(m.content);
      if (text) return text;
    }
  }
  return '';
}

function markPatched(e: any): void {
  try {
    Object.defineProperty(e, PATCH_FLAG, { value: true, enumerable: false, configurable: true });
  } catch {
    e[PATCH_FLAG] = true;
  }
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
