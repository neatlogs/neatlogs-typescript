/**
 * Neatlogs Pi Agent integration.
 *
 * Usage:
 *   import { init } from 'neatlogs';
 *   import { piAgentHooks } from 'neatlogs/pi-agent';
 *   import { Agent } from '@earendil-works/pi-agent-core';
 *
 *   await init({ apiKey, workflowName });
 *   const agent = piAgentHooks(new Agent({ initialState: { systemPrompt, model } }));
 *   await agent.prompt('Hello');
 *
 * Pi Agent's `Agent` and `AgentHarness` expose a first-class
 * `subscribe(listener)` API and emit
 * AgentEvents for its run lifecycle (message_*, tool_execution_*, turn_*,
 * agent_*). It does NOT emit its own OpenTelemetry spans — so we LISTEN to those
 * events (no monkey-patching) and translate them into neatlogs OTel spans:
 *
 *   AGENT  agent run                    (agent_start → agent_end)
 *     ↳ CHAIN turn                      (turn_start → turn_end)
 *       ↳ LLM   assistant message       (message_start → message_end)
 *       ↳ TOOL  tool call               (tool_execution_start → tool_execution_end)
 *
 * The AGENT span is opened as the active span so the turn/LLM/TOOL children nest
 * under it (and under any user @span / trace() block active when prompt() is
 * called).
 *
 * The LLM span spans the REAL model call: it opens on the assistant
 * `message_start` and closes on `message_end`, so its duration is the provider
 * latency (opening it at message_end only would report ~0ms). Streaming is the
 * default in Pi, so we also record time-to-first-token from the first content
 * delta and carry pi-ai's exact per-call `usage.cost` through instead of letting
 * the backend re-derive it from tokens.
 *
 * For the low-level functional API (`agentLoop`/`agentLoopContinue`/
 * `runAgentLoop`, which have no `subscribe()`), use `tracePiAgentEvents()` to
 * wrap the event sink / iterate the event stream. One layer below that — a bare
 * `streamFn` such as `streamProxy` called outside any loop — use
 * `tracePiStream()`. Both are documented below.
 */

import {
  trace,
  SpanStatusCode,
  type Span,
  type Context,
} from '@opentelemetry/api';
import { getNeatlogsTracer, getNeatlogsParentContext } from './core/provider.js';

const TRACER_NAME = 'neatlogs.pi-agent';
const PATCH_FLAG = '_neatlogs_patched';
const HARNESS_METHOD_FLAG = '_neatlogs_harness_methods_patched';

// Minimal structural types for the Pi Agent event surface (we duck-type — no
// hard dependency on the pi-agent-core package).
interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  /** pi-ai computes exact per-call cost — carry it through rather than re-deriving. */
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
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
  responseModel?: string;
  provider?: string;
  api?: string;
  usage?: PiUsage;
  stopReason?: string;
  errorMessage?: string;
  /** Epoch ms, stamped by pi when it begins the model-call step. */
  timestamp?: number;
}
interface PiAgentEvent {
  type: string;
  message?: any;
  messages?: any[];
  toolResults?: any[];
  assistantMessageEvent?: { type?: string };
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  partialResult?: unknown;
  isError?: boolean;
}

/** An in-flight assistant (LLM) span: opened at message_start, closed at message_end. */
interface LlmInFlight {
  span: Span;
  startHr: number;
  /** Epoch ms the span was backdated to (pi's own call-start), when usable. */
  callStartEpochMs?: number;
  /** ms from span start to the first content delta (TTFT). */
  ttftMs?: number;
  /** Input snapshot taken at message_start, before the response mutates state. */
  inputMessages: Array<{ role: string; content: string }>;
}

interface PerAgentState {
  agentSpan?: Span;
  agentCtx?: Context;
  /** Current turn (CHAIN) span — turn_start → turn_end. */
  turnSpan?: Span;
  turnCtx?: Context;
  turnIndex: number;
  /** Whether the current turn span already got its input stamped. */
  turnHasInput?: boolean;
  /** When the turn span was opened — a child LLM span may not start before it. */
  turnStartEpochMs?: number;
  /** The assistant LLM span currently streaming, if any. */
  llm?: LlmInFlight;
  toolSpans: Map<string, Span>;
  /** Running conversation (system/user/tool turns) to use as LLM-span input.
   *  Pi Agent's assistant message_end carries only the response, not the prompt. */
  inputMessages: Array<{ role: string; content: string }>;
  /** First user message of the CURRENT run, for the AGENT span's input. */
  runInput?: string;
  /** Set when the run ends abnormally (aborted / provider error). */
  runError?: { stopReason: string; message?: string };
}

/**
 * Subscribe neatlogs tracing to a Pi Agent instance. Returns the same agent
 * (marked so re-subscribing is a no-op). Idempotent per agent.
 */
export function piAgentHooks<T extends object>(agent: T): T {
  if (!agent || (agent as any)[PATCH_FLAG]) return agent;
  const a = agent as any;
  if (typeof a.subscribe !== 'function') return agent; // not a Pi Agent — leave alone

  const listener = tracePiAgentEvents(() => a.state?.messages);
  a.subscribe((event: PiAgentEvent) => listener(event));

  // The maintained Pi package's AgentHarness has two model-producing operations
  // outside the normal AgentEvent loop. Trace those calls explicitly; ordinary
  // prompt/skill/template turns still flow through the subscriber above.
  wrapHarnessModelOperations(a);

  markPatched(a);
  return agent;
}

/**
 * AgentHarness sends ordinary prompts through the same AgentEvent surface as
 * Agent, but `compact()` and summarizing `navigateTree()` call the model outside
 * that loop. Wrap those two public methods so their provider work is visible too.
 */
function wrapHarnessModelOperations(harness: any): void {
  if (harness[HARNESS_METHOD_FLAG]) return;
  const isHarness =
    typeof harness.compact === 'function' &&
    typeof harness.navigateTree === 'function' &&
    typeof harness.getModel === 'function';
  if (!isHarness) return;

  patchHarnessMethod(harness, 'compact', (args) => ({ customInstructions: args[0] }));
  patchHarnessMethod(harness, 'navigateTree', (args) => ({ targetId: args[0], options: args[1] }));
  try {
    Object.defineProperty(harness, HARNESS_METHOD_FLAG, { value: true });
  } catch {
    harness[HARNESS_METHOD_FLAG] = true;
  }
}

function patchHarnessMethod(
  harness: any,
  method: 'compact' | 'navigateTree',
  inputOf: (args: any[]) => unknown,
): void {
  const original = harness[method].bind(harness);
  harness[method] = async (...args: any[]) => {
    const startedAt = Date.now();
    const parent = getNeatlogsParentContext();
    const input = inputOf(args);
    let observedModelCall: boolean | undefined;
    let stopObserving: (() => void) | undefined;
    try {
      stopObserving = harness.subscribe((event: any) => {
        if (method === 'compact' && event?.type === 'session_compact') {
          observedModelCall = !event.fromHook;
        } else if (method === 'navigateTree' && event?.type === 'session_tree') {
          observedModelCall = Boolean(event.summaryEntry) && !event.fromHook;
        }
      });
    } catch {
      // Older compatible harnesses may not allow another listener here.
    }
    let result: any;
    let failure: unknown;
    try {
      result = await original(...args);
      return result;
    } catch (err) {
      failure = err;
      throw err;
    } finally {
      stopObserving?.();
      try {
        emitHarnessOperation(
          method,
          input,
          result,
          failure,
          harness.getModel?.(),
          parent,
          startedAt,
          Date.now(),
          observedModelCall,
        );
      } catch {
        // Observability must not change harness behavior.
      }
    }
  };
}

function emitHarnessOperation(
  method: 'compact' | 'navigateTree',
  input: unknown,
  result: any,
  failure: unknown,
  model: any,
  capturedParent: Context,
  startedAt: number,
  endedAt: number,
  observedModelCall?: boolean,
): void {
  const tracer = getNeatlogsTracer(TRACER_NAME);
  let parent = capturedParent;
  let root: Span | undefined;
  const inputText = safeStringify(input ?? {});
  const outputText = failure
    ? `[error] ${failure instanceof Error ? failure.message : String(failure)}`
    : harnessOperationOutput(method, result);

  if (!trace.getSpan(parent)?.isRecording()) {
    root = tracer.startSpan(
      `pi_agent.harness.${method}`,
      {
        startTime: startedAt,
        attributes: {
          'neatlogs.span.kind': 'WORKFLOW',
          'input.value': inputText,
        },
      },
      parent,
    );
    parent = trace.setSpan(parent, root);
  }

  const chain = tracer.startSpan(
    `pi_agent.harness.${method}`,
    {
      startTime: startedAt,
      attributes: {
        'neatlogs.span.kind': 'CHAIN',
        'neatlogs.pi.operation': method,
        'input.value': inputText,
      },
    },
    parent,
  );
  const chainCtx = trace.setSpan(parent, chain);

  const usage = harnessOperationUsage(method, result);
  const madeModelCall =
    observedModelCall ??
    (failure
      ? isHarnessSummarizationFailure(failure)
      : method === 'compact'
        ? Boolean(result?.usage)
        : Boolean(result?.summaryEntry) && result.summaryEntry.fromHook !== true);
  if (madeModelCall || failure) {
    const llm = openLlmSpan(
      tracer,
      {
        toolSpans: new Map(),
        inputMessages: [{ role: 'user', content: inputText }],
        turnIndex: 0,
        turnCtx: chainCtx,
        turnStartEpochMs: startedAt,
      },
      {
        role: 'assistant',
        model: model?.id ?? model?.model,
        provider: model?.provider,
        timestamp: startedAt,
      },
    );
    if (failure) {
      closeLlmFailure(llm, failure, endedAt);
    } else {
      finishLlmSpan(
        llm,
        {
          role: 'assistant',
          model: model?.id ?? model?.model,
          provider: model?.provider,
          content: outputText ? [{ type: 'text', text: outputText }] : [],
          usage,
          stopReason: 'stop',
        },
        endedAt,
      );
    }
  }

  if (outputText) chain.setAttribute('output.value', outputText);
  if (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    chain.setAttribute('neatlogs.error.message', message);
    chain.setStatus({ code: SpanStatusCode.ERROR, message });
  } else {
    chain.setStatus({ code: SpanStatusCode.OK });
  }
  chain.end(endedAt);

  if (root) {
    if (outputText) root.setAttribute('output.value', outputText);
    if (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      root.setAttribute('neatlogs.error.message', message);
      root.setStatus({ code: SpanStatusCode.ERROR, message });
    } else {
      root.setStatus({ code: SpanStatusCode.OK });
    }
    root.end(endedAt);
  }
}

function isHarnessSummarizationFailure(failure: unknown): boolean {
  let current: any = failure;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current.code === 'summarization_failed') return true;
    current = current.cause;
  }
  return false;
}

function harnessOperationOutput(method: 'compact' | 'navigateTree', result: any): string {
  if (method === 'compact') return typeof result?.summary === 'string' ? result.summary : safeStringify(result ?? {});
  const summary = result?.summaryEntry?.summary;
  return typeof summary === 'string' ? summary : safeStringify(result ?? {});
}

function harnessOperationUsage(method: 'compact' | 'navigateTree', result: any): PiUsage | undefined {
  return method === 'compact' ? result?.usage : result?.summaryEntry?.usage;
}

function closeLlmFailure(llm: LlmInFlight, failure: unknown, endedAt?: number): void {
  const message = failure instanceof Error ? failure.message : String(failure);
  llm.span.setAttribute('output.value', `[error] ${message}`);
  llm.span.setAttribute('neatlogs.error.message', message);
  llm.span.setStatus({ code: SpanStatusCode.ERROR, message });
  llm.span.end(endedAt);
}

/**
 * Build a standalone Pi AgentEvent listener that emits neatlogs spans.
 *
 * `piAgentHooks()` uses this internally. Reach for it directly when you drive
 * Pi's LOW-LEVEL functional API, which has no `subscribe()` to hook:
 *
 *   // runAgentLoop takes an event sink — hand it the tracing listener.
 *   const trace = tracePiAgentEvents(() => context.messages);
 *   await runAgentLoop(prompts, context, config, async (event) => {
 *     trace(event);
 *     await myOwnSink?.(event);
 *   });
 *
 *   // agentLoop / agentLoopContinue return an EventStream — iterate it.
 *   const stream = agentLoop(prompts, context, config);
 *   const trace = tracePiAgentEvents(() => context.messages);
 *   for await (const event of stream) trace(event);
 *   const messages = await stream.result();
 *
 * @param getTranscript Optional accessor for the live transcript. Used to
 *   recover the run's input when `continue()` (or a continuation loop) starts
 *   from a transcript that already holds the user turn, so no new user message
 *   is emitted during the run.
 */
export function tracePiAgentEvents(
  getTranscript?: () => any[] | undefined,
): (event: unknown) => void {
  const state: PerAgentState = { toolSpans: new Map(), inputMessages: [], turnIndex: 0 };
  return (event: unknown) => {
    try {
      const tracer = getNeatlogsTracer(TRACER_NAME);
      handleEvent(tracer, state, event as PiAgentEvent, getTranscript);
    } catch {
      // never let tracing break the agent run
    }
  };
}

/**
 * Wrap a Pi `StreamFn` so every model call it makes gets an LLM span.
 *
 * The event surface above covers the agent loop, but a raw stream function is
 * one layer below it — reach for this when you call pi-ai directly, or when your
 * `streamFn` is NOT the one the loop wraps in agent events, e.g. `streamProxy`
 * used standalone:
 *
 *   import { streamProxy } from '@earendil-works/pi-agent-core';
 *   const stream = tracePiStream(streamProxy);
 *   const result = await stream(model, context, { authToken, proxyUrl }).result();
 *
 * Do not pass it as an `Agent`'s `streamFn`: the loop already emits message
 * events for the same call, so that would double-count. Prefer
 * `piAgentHooks()` there and keep this for the standalone path.
 *
 * Called with no enclosing `span()`/`trace()`, the LLM span would be the trace
 * root — which the backend does not accept as one — so a WORKFLOW root is opened
 * around it. Inside an existing trace no extra root is added.
 */
export function tracePiStream<
  F extends (model: any, context: any, options?: any) => any,
>(streamFn: F): F {
  return ((model: any, context: any, options?: any) => {
    const tracer = getNeatlogsTracer(TRACER_NAME);
    let llm: LlmInFlight | undefined;
    let root: Span | undefined;
    try {
      const state: PerAgentState = { toolSpans: new Map(), inputMessages: [], turnIndex: 0 };
      state.inputMessages = promptMessagesOf(context);

      let parent = getNeatlogsParentContext();
      if (!trace.getSpan(parent)?.isRecording()) {
        root = tracer.startSpan(
          'pi_agent.stream',
          { attributes: { 'neatlogs.span.kind': 'WORKFLOW' } },
          parent,
        );
        parent = trace.setSpan(parent, root);
        const rootInput = state.inputMessages.length
          ? safeStringify({ messages: state.inputMessages })
          : undefined;
        if (rootInput) root.setAttribute('input.value', rootInput);
      }
      state.turnCtx = parent;

      llm = openLlmSpan(tracer, state, {
        role: 'assistant',
        model: model?.id ?? model?.model,
        provider: model?.provider,
      });
    } catch {
      /* tracing must never block the call */
    }

    let returned: any;
    try {
      returned = streamFn(model, context, options);
    } catch (err) {
      closeStreamFailure(llm, root, err);
      throw err;
    }

    // StreamFn explicitly permits EventStream | Promise<EventStream>. Preserve
    // that exact return shape while attaching tracing after an async stream
    // factory resolves. A rejected factory is outside Pi's recommended contract,
    // but still closes both spans rather than leaking them.
    if (isThenable(returned)) {
      return returned.then(
        (stream: any) => attachStreamResult(stream, llm, root),
        (err: unknown) => {
          closeStreamFailure(llm, root, err);
          throw err;
        },
      );
    }
    return attachStreamResult(returned, llm, root);
  }) as F;
}

function attachStreamResult(
  stream: any,
  llm: LlmInFlight | undefined,
  root: Span | undefined,
): any {
  if (!llm || !stream || typeof stream.result !== 'function') {
    closeStreamRoot(root);
    return stream;
  }

  observeStreamDeltas(stream, llm);
  stream.result().then(
    (msg: any) => {
      const message = msg ?? { role: 'assistant' };
      finishLlmSpan(llm, message);
      closeStreamRoot(root, message);
    },
    (err: unknown) => closeStreamFailure(llm, root, err),
  );
  return stream;
}

/** Observe caller-consumed chunks without consuming or buffering the stream ourselves. */
function observeStreamDeltas(stream: any, llm: LlmInFlight): void {
  const original = stream?.[Symbol.asyncIterator];
  if (typeof original !== 'function' || original.__neatlogsObserved) return;
  const observed = function (this: any): AsyncIterator<any> {
    const iterator = original.call(this) as AsyncIterator<any>;
    return {
      next: async (...args: [] | [undefined]) => {
        const item = await iterator.next(...(args as []));
        if (!item.done && isContentDelta(item.value?.type)) markFirstStreamDelta(llm);
        return item;
      },
      return: iterator.return?.bind(iterator),
      throw: iterator.throw?.bind(iterator),
    };
  };
  Object.defineProperty(observed, '__neatlogsObserved', { value: true });
  try {
    stream[Symbol.asyncIterator] = observed;
  } catch {
    // A frozen stream still gets result-based tracing; only TTFT is unavailable.
  }
}

function markFirstStreamDelta(llm: LlmInFlight): void {
  llm.span.setAttribute('neatlogs.llm.is_streaming', true);
  if (llm.ttftMs !== undefined) return;
  llm.ttftMs =
    llm.callStartEpochMs !== undefined
      ? Date.now() - llm.callStartEpochMs
      : nowMs() - llm.startHr;
}

function closeStreamFailure(
  llm: LlmInFlight | undefined,
  root: Span | undefined,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  try {
    llm?.span.setAttribute('output.value', `[error] ${message}`);
    llm?.span.setAttribute('neatlogs.error.message', message);
    llm?.span.setStatus({ code: SpanStatusCode.ERROR, message });
    llm?.span.end();
  } catch {
    /* ignore */
  }
  closeStreamRoot(root, undefined, message);
}

function isThenable(value: any): value is PromiseLike<any> {
  return value != null && typeof value.then === 'function';
}

/** Close the synthetic WORKFLOW root `tracePiStream` opens when it has no parent. */
function closeStreamRoot(root: Span | undefined, msg?: PiAssistantMessage, error?: string): void {
  if (!root) return;
  try {
    if (msg) {
      const { text, toolCalls } = splitAssistantContent(msg.content);
      const out =
        text ||
        toolCalls.map((tc) => `${tc.name}(${safeStringify(tc.arguments)})`).join('\n') ||
        terminalSummary(msg);
      if (out) root.setAttribute('output.value', out);
      applyStopReasonStatus(root, msg);
    } else if (error) {
      root.setAttribute('output.value', `[error] ${error}`);
      root.setAttribute('neatlogs.error.message', error);
      root.setStatus({ code: SpanStatusCode.ERROR, message: error });
    }
    root.end();
  } catch {
    /* ignore */
  }
}

/** Flatten a live transcript into prompt-context rows for LLM-span input. */
function transcriptRows(messages: any[] | undefined): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages)) return [];
  const rows: Array<{ role: string; content: string }> = [];
  for (const m of messages) {
    const content = messageText(m);
    if (!content) continue;
    rows.push({ role: m?.role === 'toolResult' ? 'tool' : String(m?.role ?? 'user'), content });
  }
  return rows;
}

/** Flatten a pi-ai Context (systemPrompt + messages) into LLM-span input rows. */
function promptMessagesOf(context: any): Array<{ role: string; content: string }> {
  const rows: Array<{ role: string; content: string }> = [];
  if (typeof context?.systemPrompt === 'string' && context.systemPrompt) {
    rows.push({ role: 'system', content: context.systemPrompt });
  }
  if (Array.isArray(context?.messages)) {
    for (const m of context.messages) {
      const content = messageText(m);
      if (content) rows.push({ role: String(m?.role ?? 'user'), content });
    }
  }
  return rows;
}

function handleEvent(
  tracer: ReturnType<typeof trace.getTracer>,
  state: PerAgentState,
  event: PiAgentEvent,
  getTranscript?: () => any[] | undefined,
): void {
  switch (event.type) {
    case 'agent_start': {
      // Open the AGENT (run) span as the active span so children nest under it.
      const base = getNeatlogsParentContext();
      const span = tracer.startSpan(
        'pi_agent.run',
        { attributes: { 'neatlogs.span.kind': 'AGENT' } },
        base,
      );
      state.agentSpan = span;
      state.agentCtx = trace.setSpan(base, span);
      // A continuation resumes an existing transcript and emits no user message,
      // so seed the prompt context from it — otherwise the first LLM span of the
      // run would report no input at all.
      state.inputMessages = transcriptRows(getTranscript?.());
      state.turnIndex = 0;
      state.runInput = undefined;
      state.runError = undefined;
      break;
    }

    case 'turn_start': {
      // One CHAIN span per turn, so a multi-turn run keeps its turn boundaries
      // instead of flattening every LLM/TOOL child under the run.
      const parent = state.agentCtx ?? getNeatlogsParentContext();
      state.turnIndex += 1;
      // What prompted this turn? If the transcript already ends in a user or tool
      // message it is that message (a tool-result turn, or a continuation). If it
      // ends in an assistant message the prompt has not arrived yet — pi emits
      // turn_start before it — so message_end stamps it instead.
      const pending = state.inputMessages[state.inputMessages.length - 1];
      const priorInput =
        pending && (pending.role === 'user' || pending.role === 'tool') ? pending.content : undefined;
      const span = tracer.startSpan(
        `pi_agent.turn.${state.turnIndex}`,
        {
          attributes: {
            'neatlogs.span.kind': 'CHAIN',
            'neatlogs.chain.turn_index': state.turnIndex,
            ...(priorInput ? { 'input.value': priorInput } : {}),
          },
        },
        parent,
      );
      state.turnSpan = span;
      state.turnCtx = trace.setSpan(parent, span);
      state.turnHasInput = !!priorInput;
      state.turnStartEpochMs = Date.now();
      break;
    }

    case 'turn_end': {
      if (!state.turnSpan) break;
      const msg = event.message as PiAssistantMessage | undefined;
      const { text, toolCalls } = splitAssistantContent(msg?.content);
      // A tool-use turn produces no assistant text — describe the calls it made
      // rather than leaving the turn's output blank. An aborted turn has neither,
      // so report why it ended.
      const out =
        text ||
        toolCalls.map((tc) => `${tc.name}(${safeStringify(tc.arguments)})`).join('\n') ||
        terminalSummary(msg);
      if (out) state.turnSpan.setAttribute('output.value', out);
      if (Array.isArray(event.toolResults) && event.toolResults.length) {
        state.turnSpan.setAttribute('neatlogs.chain.tool_result_count', event.toolResults.length);
      }
      applyStopReasonStatus(state.turnSpan, msg);
      state.turnSpan.end();
      state.turnSpan = undefined;
      state.turnCtx = undefined;
      state.turnHasInput = false;
      state.turnStartEpochMs = undefined;
      break;
    }

    case 'message_start': {
      const msg = event.message as any;
      if (!msg || msg.role !== 'assistant') break;
      // Open the LLM span HERE so its duration covers the real provider call.
      // (Opening it at message_end would always report ~0ms.)
      state.llm = openLlmSpan(tracer, state, msg);
      break;
    }

    case 'message_update': {
      // First content delta = time to first token.
      const llm = state.llm;
      if (!llm) break;
      llm.span.setAttribute('neatlogs.llm.is_streaming', true);
      if (llm.ttftMs === undefined && isContentDelta(event.assistantMessageEvent?.type)) {
        // Measure from the same instant the span starts at, so TTFT stays
        // consistent with the span's own duration.
        llm.ttftMs =
          llm.callStartEpochMs !== undefined
            ? Date.now() - llm.callStartEpochMs
            : nowMs() - llm.startHr;
      }
      break;
    }

    case 'message_end': {
      const msg = event.message as any;
      if (!msg) return;
      if (msg.role === 'assistant') {
        // Finish the LLM span opened at message_start. If that event was missed,
        // open one now so the call is still recorded (duration reads ~0ms).
        const llm = state.llm ?? openLlmSpan(tracer, state, msg);
        state.llm = undefined;
        state.runError = finishLlmSpan(llm, msg as PiAssistantMessage) ?? state.runError;
        const { text } = splitAssistantContent(msg.content);
        if (text) state.inputMessages.push({ role: 'assistant', content: text });
      } else {
        // user / toolResult turns — accumulate as input context for later LLM spans.
        const role = msg.role === 'toolResult' ? 'tool' : String(msg.role || 'user');
        const content = messageText(msg);
        if (content) {
          state.inputMessages.push({ role, content });
          if (role === 'user' && state.runInput === undefined) state.runInput = content;
          // turn_start fires before the message that prompts the turn, so the
          // first such message is this turn's input.
          if (state.turnSpan && !state.turnHasInput) {
            state.turnSpan.setAttribute('input.value', content);
            state.turnHasInput = true;
          }
        }
      }
      break;
    }

    case 'tool_execution_start': {
      const parent = state.turnCtx ?? state.agentCtx ?? getNeatlogsParentContext();
      const span = tracer.startSpan(
        `pi_agent.tool.${event.toolName ?? 'tool'}`,
        {
          attributes: {
            'neatlogs.span.kind': 'TOOL',
            ...(event.toolName ? { 'neatlogs.tool.name': String(event.toolName) } : {}),
            ...(event.toolCallId ? { 'neatlogs.tool.call_id': String(event.toolCallId) } : {}),
            ...(event.args !== undefined
              ? { 'input.value': safeStringify(event.args) }
              : {}),
          },
        },
        parent,
      );
      if (event.toolCallId) state.toolSpans.set(event.toolCallId, span);
      break;
    }

    case 'tool_execution_update': {
      // Streaming tool progress — record that partials arrived without
      // rewriting output.value (the final result lands at tool_execution_end).
      const span = event.toolCallId ? state.toolSpans.get(event.toolCallId) : undefined;
      if (!span) break;
      span.setAttribute('neatlogs.tool.is_streaming', true);
      break;
    }

    case 'tool_execution_end': {
      const span = event.toolCallId ? state.toolSpans.get(event.toolCallId) : undefined;
      if (!span) return;
      if (event.result !== undefined) {
        span.setAttribute('output.value', safeStringify(event.result));
      }
      if (event.isError) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: toolErrorText(event.result) });
        span.setAttribute('neatlogs.tool.is_error', true);
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
      if (event.toolCallId) state.toolSpans.delete(event.toolCallId);
      break;
    }

    case 'agent_end': {
      // Close any tool spans that never received an end event, then the LLM span
      // (an abort can end the run mid-stream), the turn span, and the run span.
      for (const ts of state.toolSpans.values()) {
        try {
          ts.setStatus({ code: SpanStatusCode.ERROR, message: 'run ended before tool completed' });
          ts.end();
        } catch {
          /* ignore */
        }
      }
      state.toolSpans.clear();

      if (state.llm) {
        try {
          state.llm.span.setAttribute('output.value', '[incomplete] run ended mid-stream');
          state.llm.span.setStatus({ code: SpanStatusCode.ERROR, message: 'run ended mid-stream' });
          state.llm.span.end();
        } catch {
          /* ignore */
        }
        state.llm = undefined;
      }

      if (state.turnSpan) {
        try {
          state.turnSpan.end();
        } catch {
          /* ignore */
        }
        state.turnSpan = undefined;
        state.turnCtx = undefined;
        state.turnStartEpochMs = undefined;
      }

      if (state.agentSpan) {
        // Agent input = this run's first user message. A continuation
        // (`continue()`, agentLoopContinue) emits NO new user message — the turn
        // is already in the transcript — so fall back to the live transcript.
        const input = state.runInput ?? lastUserTextFrom(event.messages) ?? lastUserTextFrom(getTranscript?.());
        if (input) state.agentSpan.setAttribute('input.value', input);

        // Output = final assistant text. On an aborted/errored run there may be
        // none, so fall back to the terminal reason rather than leaving it blank.
        const finalText = lastAssistantText(event.messages);
        const err = state.runError ?? terminalErrorFrom(event.messages);
        if (finalText) {
          state.agentSpan.setAttribute('output.value', finalText);
        } else if (err) {
          state.agentSpan.setAttribute('output.value', `[${err.stopReason}]${err.message ? ` ${err.message}` : ''}`);
        }

        if (err) {
          state.agentSpan.setAttribute('neatlogs.agent.stop_reason', err.stopReason);
          if (err.message) state.agentSpan.setAttribute('neatlogs.error.message', err.message);
          state.agentSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message ?? err.stopReason });
        } else {
          state.agentSpan.setStatus({ code: SpanStatusCode.OK });
        }
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

/** Start an LLM span for an assistant message, snapshotting the prompt so far. */
function openLlmSpan(
  tracer: ReturnType<typeof trace.getTracer>,
  state: PerAgentState,
  msg: PiAssistantMessage,
): LlmInFlight {
  const parent = state.turnCtx ?? state.agentCtx ?? getNeatlogsParentContext();
  // Pi emits message_start only once the provider's first stream event lands, so
  // most of the call's latency has already elapsed by now — and an EventStream
  // consumer that lags (`for await` on agentLoop) can receive start/end in one
  // burst, collapsing the span to ~0ms. `msg.timestamp` is stamped when pi begins
  // the model-call step, so prefer it as the start time.
  const startTime = callStartFrom(msg, state.turnStartEpochMs);
  const span = tracer.startSpan(
    `pi_agent.llm.${msg.model || 'model'}`,
    {
      ...(startTime !== undefined ? { startTime } : {}),
      attributes: {
        'neatlogs.span.kind': 'LLM',
        // Pi streams by default; message_update deltas confirm it per call.
        'neatlogs.llm.is_streaming': false,
        ...(msg.model ? { 'neatlogs.llm.model_name': String(msg.model) } : {}),
        ...(msg.provider ? { 'neatlogs.llm.provider': String(msg.provider) } : {}),
      },
    },
    parent,
  );
  return {
    span,
    startHr: nowMs(),
    callStartEpochMs: startTime,
    inputMessages: state.inputMessages.slice(),
  };
}

/**
 * The epoch-ms start of the model call, from pi's own message timestamp.
 *
 * Ignored if it isn't a plausible recent past instant — a clock skew or a
 * replayed transcript would otherwise produce a nonsense duration. Clamped to the
 * enclosing turn so a backdated child can never start before its parent.
 */
function callStartFrom(msg: PiAssistantMessage, turnStart: number | undefined): number | undefined {
  const ts = msg.timestamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return undefined;
  const now = Date.now();
  const age = now - ts;
  if (age < 0 || age > MAX_CALL_AGE_MS) return undefined;
  return turnStart !== undefined ? Math.max(ts, turnStart) : ts;
}

/** A single model call older than this is a stale/replayed timestamp, not a live call. */
const MAX_CALL_AGE_MS = 30 * 60_000;

/** `[aborted] Request was aborted` — output for a message that produced no content. */
function terminalSummary(msg: PiAssistantMessage | undefined): string {
  const reason = msg?.stopReason;
  if (reason !== 'aborted' && reason !== 'error') return '';
  return `[${reason}]${msg?.errorMessage ? ` ${msg.errorMessage}` : ''}`;
}

/** `aborted` / `error` stop reasons must not report OK. */
function applyStopReasonStatus(span: Span, msg: PiAssistantMessage | undefined): void {
  const reason = msg?.stopReason;
  if (reason === 'aborted' || reason === 'error') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: msg?.errorMessage ?? reason });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
}

/** Content deltas that mark the first streamed token. */
function isContentDelta(type: string | undefined): boolean {
  return type === 'text_delta' || type === 'thinking_delta' || type === 'toolcall_delta';
}

function nowMs(): number {
  // performance.now() where available (monotonic), else Date.now().
  const p = (globalThis as any).performance;
  return typeof p?.now === 'function' ? p.now() : Date.now();
}

/** Pull a readable error message out of a failed tool result. */
function toolErrorText(result: unknown): string {
  if (!result || typeof result !== 'object') return 'tool error';
  const content = (result as any).content;
  if (Array.isArray(content)) {
    const text = content
      .map((b: any) => (typeof b?.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (text) return text;
  }
  return 'tool error';
}

/** The most recent user message text in a transcript, if any. */
function lastUserTextFrom(messages: any[] | undefined): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') {
      const text = messageText(m);
      if (text) return text;
    }
  }
  return undefined;
}

/** If the run's last assistant turn aborted or errored, describe it. */
function terminalErrorFrom(
  messages: any[] | undefined,
): { stopReason: string; message?: string } | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'assistant') {
      if (m.stopReason === 'aborted' || m.stopReason === 'error') {
        return { stopReason: m.stopReason, message: m.errorMessage };
      }
      return undefined;
    }
  }
  return undefined;
}

/**
 * Close the LLM span opened at `message_start`, stamping the response.
 *
 * The span is already open, so its duration is the real provider latency; here we
 * only attach what the completed message carries: I/O, tokens, pi-ai's exact
 * cost, TTFT, and the terminal status.
 */
function finishLlmSpan(
  llm: LlmInFlight,
  msg: PiAssistantMessage,
  endTime?: number,
): { stopReason: string; message?: string } | undefined {
  const span = llm.span;

  if (msg.model) span.setAttribute('neatlogs.llm.model_name', String(msg.model));
  if (msg.provider) span.setAttribute('neatlogs.llm.provider', String(msg.provider));
  // The provider may answer with a different snapshot than the one requested.
  if (msg.responseModel) span.setAttribute('neatlogs.llm.response_model', String(msg.responseModel));
  if (msg.api) span.setAttribute('neatlogs.llm.api', String(msg.api));
  if (msg.stopReason) span.setAttribute('neatlogs.llm.stop_reason', String(msg.stopReason));

  // Input = the conversation as it stood when the call was issued (snapshotted at
  // message_start). Pi Agent's message_end carries only the response, not the prompt.
  const inMsgs = llm.inputMessages;
  if (inMsgs.length) {
    inMsgs.forEach((m, i) => {
      span.setAttribute(`neatlogs.llm.input_messages.${i}.role`, m.role);
      span.setAttribute(`neatlogs.llm.input_messages.${i}.content`, m.content);
    });
    const inBlob = safeStringify({ messages: inMsgs });
    span.setAttribute('neatlogs.llm.input', inBlob);
    span.setAttribute('input.value', inBlob);
  }

  const { text, toolCalls } = splitAssistantContent(msg.content);
  // Output: text if present, else a readable tool-call summary so the span isn't
  // blank. A call that was aborted or failed has neither — report why instead.
  const outText =
    text ||
    toolCalls.map((tc) => `${tc.name}(${safeStringify(tc.arguments)})`).join('\n') ||
    terminalSummary(msg);
  if (outText || toolCalls.length) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', outText || '');
    const outBlob: Record<string, unknown> = { role: 'assistant', content: outText || '' };
    if (toolCalls.length) {
      outBlob.tool_calls = toolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments }));
      toolCalls.forEach((tc, j) => {
        if (tc.name) span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, tc.name);
        if (tc.arguments !== undefined)
          span.setAttribute(`neatlogs.llm.tool_calls.${j}.arguments`, safeStringify(tc.arguments));
        if (tc.id) span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, String(tc.id));
      });
    }
    span.setAttribute('neatlogs.llm.output', safeStringify(outBlob));
    span.setAttribute('output.value', outText || '');
  }

  const usage = msg.usage;
  if (usage) {
    if (usage.input != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.input);
    if (usage.output != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.output);
    const total = usage.totalTokens ?? ((usage.input ?? 0) + (usage.output ?? 0));
    if (total) span.setAttribute('neatlogs.llm.token_count.total', total);
    if (usage.cacheRead) span.setAttribute('neatlogs.llm.token_count.cache_read', usage.cacheRead);
    if (usage.cacheWrite) span.setAttribute('neatlogs.llm.token_count.cache_write', usage.cacheWrite);

    // pi-ai prices the call itself against its model registry — carry that exact
    // figure through rather than letting the backend re-derive it from tokens.
    const cost = usage.cost;
    if (cost) {
      const totalCost =
        cost.total ??
        [cost.input, cost.output, cacheReadOf(cost), cost.cacheWrite].reduce<number>(
          (sum, v) => sum + (typeof v === 'number' ? v : 0),
          0,
        );
      if (typeof totalCost === 'number' && totalCost > 0) {
        span.setAttribute('neatlogs.llm.cost_usd', totalCost);
      }
      if (typeof cost.input === 'number') span.setAttribute('neatlogs.llm.cost.prompt', cost.input);
      if (typeof cost.output === 'number') span.setAttribute('neatlogs.llm.cost.completion', cost.output);
    }
  }

  if (llm.ttftMs !== undefined) {
    span.setAttribute('neatlogs.llm.metrics.ttft_ms', Math.round(llm.ttftMs));
  }

  if (msg.errorMessage) span.setAttribute('neatlogs.error.message', String(msg.errorMessage));
  applyStopReasonStatus(span, msg);
  span.end(endTime);

  // Report an abnormal terminal state back to the caller: the AGENT span sees
  // only the transcript and would otherwise report a blank, SUCCESSful run.
  return msg.stopReason === 'aborted' || msg.stopReason === 'error'
    ? { stopReason: msg.stopReason, message: msg.errorMessage }
    : undefined;
}

/** pi-ai has used both `cacheRead` and (older) `cacheReads` for the cost breakdown. */
function cacheReadOf(cost: Record<string, any>): number | undefined {
  return typeof cost.cacheRead === 'number' ? cost.cacheRead : cost.cacheReads;
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
