/**
 * Neatlogs opencode plugin.
 *
 * opencode loads plugins from its config (`opencode.json` → `"plugin": [...]`)
 * or from local `.opencode/plugin/*.ts` files. A plugin is an async factory that
 * receives an app context and returns lifecycle hooks. This plugin instruments
 * opencode automatically — no per-call wiring — turning an opencode session into
 * a neatlogs span tree:
 *
 *   AGENT  opencode.session       (one per user turn; parents that turn's spans)
 *     ↳ LLM   assistant turn      (per completed assistant message)
 *     ↳ TOOL  tool execution      (tool.execute.before → tool.execute.after)
 *
 * Every span carries `neatlogs.conversation.id` = the opencode session ID.
 *
 * Export model (mirrors @raindrop-ai/opencode-plugin and neatlogs-claude-code):
 * opencode loads the plugin in-process but `opencode run` is short-lived. Rather
 * than the OpenTelemetry BatchSpanProcessor (whose async, scheduled-delay export
 * + `beforeExit` shutdown races the teardown and drops spans), this plugin builds
 * spans directly and ships them via AWAITED `fetch(POST /v1/traces)` — and it
 * flushes after every completed assistant turn (incremental persistence) plus a
 * final flush on `session.idle`. A `neatlogs.trace.complete` marker is sent so
 * the backend enqueues the trace for finalization (simplification → UI).
 *
 * Setup — either:
 *   • npm package, in opencode.json: `{ "plugin": ["neatlogs/opencode"] }`, OR
 *   • local file `.opencode/plugin/neatlogs.ts`:
 *       export { NeatlogsOpencodePlugin as default } from 'neatlogs/opencode';
 *
 * Env:
 *   NEATLOGS_API_KEY            required to export
 *   NEATLOGS_ENDPOINT           backend base URL (default https://staging-cloud.neatlogs.com)
 *   NEATLOGS_WORKFLOW_NAME      logical grouping (default: "opencode")
 *   NEATLOGS_CAPTURE_SYSTEM_PROMPT=true  capture system prompt text (default off)
 */

import {
  TraceShipper,
  type OtlpSpan,
  type OtlpKeyValue,
  SpanStatusCode,
  generateTraceId,
  generateSpanId,
  nowNanoString,
  msToNanoString,
  attrStr,
  attrInt,
  attrDouble,
} from './opencode-trace-shipper.js';

const DEFAULT_ENDPOINT = 'https://staging-cloud.neatlogs.com';

/** A span being built incrementally — ended (and shipped) later. */
interface OpenSpan {
  spanId: Uint8Array;
  parentSpanId?: Uint8Array;
  name: string;
  startNano: string;
  attributes: OtlpKeyValue[];
}

interface SessionState {
  /** Per-session trace id — all spans in a session share it. */
  traceId: Uint8Array;
  /** The current turn's AGENT root span (created on chat.message, ended on idle). */
  rootSpan?: OpenSpan;
  /** Open TOOL spans keyed by callID → start time. */
  toolStarts: Map<string, { spanId: Uint8Array; startNano: string; tool: string; args: any }>;
  /** Accumulated assistant text per messageID (from text parts). */
  outputParts: Map<string, string>;
  /** Tool calls per assistant messageID (so a tool-only turn still has output). */
  toolCalls: Map<string, Array<{ name: string; input: any; callID: string }>>;
  /** assistant messageIDs already emitted (completion can fire repeatedly). */
  processed: Set<string>;
  /** Current user prompt (this turn's input). */
  currentInput: string;
  /** Captured system prompt (if enabled). */
  systemPrompt?: string;
  /** Latest assistant text — the AGENT root's output on close. */
  lastAssistantText: string;
}

export const NeatlogsOpencodePlugin = async (_ctx: any): Promise<Record<string, any>> => {
  const apiKey = (process.env.NEATLOGS_API_KEY ?? '').trim();
  const endpoint = (process.env.NEATLOGS_ENDPOINT ?? DEFAULT_ENDPOINT).trim();
  const workflowName = process.env.NEATLOGS_WORKFLOW_NAME || 'opencode';
  const captureSystemPrompt =
    String(process.env.NEATLOGS_CAPTURE_SYSTEM_PROMPT || '').toLowerCase() === 'true';
  const debug = String(process.env.NEATLOGS_DEBUG || '').toLowerCase() === 'true';

  const shipper = new TraceShipper({ apiKey, endpoint, workflowName, debug });
  const sessions = new Map<string, SessionState>();

  function stateFor(sessionID: string): SessionState {
    let s = sessions.get(sessionID);
    if (!s) {
      s = {
        traceId: generateTraceId(),
        toolStarts: new Map(),
        outputParts: new Map(),
        toolCalls: new Map(),
        processed: new Set(),
        currentInput: '',
        lastAssistantText: '',
      };
      sessions.set(sessionID, s);
    }
    return s;
  }

  /** Start the per-turn AGENT root span (idempotent within a turn). */
  function startRoot(st: SessionState, sessionID: string): void {
    if (st.rootSpan) return;
    st.rootSpan = {
      spanId: generateSpanId(),
      name: 'opencode.session',
      startNano: nowNanoString(),
      attributes: [
        { key: 'neatlogs.span.kind', value: { stringValue: 'AGENT' } },
        { key: 'neatlogs.agent.framework', value: { stringValue: 'opencode' } },
        { key: 'neatlogs.conversation.id', value: { stringValue: sessionID } },
      ],
    };
  }

  /** End + enqueue the AGENT root, send the completion marker, and flush. */
  async function closeAndFlush(st: SessionState, sessionID: string): Promise<void> {
    if (st.rootSpan) {
      const attrs = st.rootSpan.attributes.slice();
      setIO(attrs, 'AGENT', st.currentInput || undefined, st.lastAssistantText || undefined);
      shipper.enqueue({
        traceId: st.traceId,
        spanId: st.rootSpan.spanId,
        name: st.rootSpan.name,
        kind: 1,
        startTimeUnixNano: st.rootSpan.startNano,
        endTimeUnixNano: nowNanoString(),
        attributes: attrs,
        status: { code: SpanStatusCode.OK },
      });
      // Completion marker — the backend only finalizes (simplifies → UI) a trace
      // once it sees a `neatlogs.trace.complete` span. Parented to the root.
      const m = nowNanoString();
      shipper.enqueue({
        traceId: st.traceId,
        spanId: generateSpanId(),
        parentSpanId: st.rootSpan.spanId,
        name: 'neatlogs.trace.complete',
        kind: 1,
        startTimeUnixNano: m,
        endTimeUnixNano: m,
        attributes: [
          { key: 'neatlogs.trace.complete', value: { boolValue: true } },
          { key: 'neatlogs.internal', value: { boolValue: true } },
          { key: 'neatlogs.span.kind', value: { stringValue: 'Neatlogs.INTERNAL' } },
        ],
      });
      st.rootSpan = undefined;
    }
    await shipper.flush();
    void sessionID;
  }

  return {
    /** Fired when the user submits a prompt — open the turn's AGENT root. */
    'chat.message': async (_input: any, output: any) => {
      try {
        const sessionID = String(_input?.sessionID ?? output?.sessionID ?? '');
        if (!sessionID) return;
        const st = stateFor(sessionID);
        const parts = output?.parts ?? [];
        const text = Array.isArray(parts)
          ? parts
              .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
              .map((p: any) => p.text)
              .join('\n')
          : '';
        if (text) st.currentInput = text;
        startRoot(st, sessionID);
      } catch {
        /* ignore */
      }
    },

    /** Capture the system prompt (opt-in). */
    'experimental.chat.system.transform': async (_input: any, output: any) => {
      try {
        if (!captureSystemPrompt) return;
        const sessionID = String(_input?.sessionID ?? '');
        const parts = output?.system ?? output?.parts ?? output;
        const joined = Array.isArray(parts) ? parts.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('\n') : String(parts ?? '');
        if (sessionID && joined) stateFor(sessionID).systemPrompt = joined;
      } catch {
        /* ignore */
      }
    },

    /** Global event bus — message parts, assistant completions, session idle. */
    event: async ({ event }: { event: any }) => {
      try {
        await handleEvent(shipper, sessions, stateFor, startRoot, closeAndFlush, event);
      } catch {
        // never break opencode over tracing
      }
    },

    /** Tool start — record start time + args (span built atomically in `after`). */
    'tool.execute.before': async (input: any, output: any) => {
      try {
        const sessionID = String(input?.sessionID ?? '');
        if (!sessionID) return;
        const st = stateFor(sessionID);
        startRoot(st, sessionID);
        const callID = String(input?.callID ?? input?.tool ?? '');
        st.toolStarts.set(callID, {
          spanId: generateSpanId(),
          startNano: nowNanoString(),
          tool: String(input?.tool ?? 'tool'),
          args: output?.args,
        });
      } catch {
        /* ignore */
      }
    },

    /** Tool end — enqueue the completed TOOL span (parented to the turn root). */
    'tool.execute.after': async (input: any, result: any) => {
      try {
        const sessionID = String(input?.sessionID ?? '');
        if (!sessionID) return;
        const st = stateFor(sessionID);
        const callID = String(input?.callID ?? input?.tool ?? '');
        const start = st.toolStarts.get(callID);
        if (!start) return;
        st.toolStarts.delete(callID);

        const attrs: OtlpKeyValue[] = [
          { key: 'neatlogs.span.kind', value: { stringValue: 'TOOL' } },
          { key: 'neatlogs.tool.name', value: { stringValue: start.tool } },
          { key: 'neatlogs.conversation.id', value: { stringValue: sessionID } },
        ];
        if (start.args !== undefined) {
          // The shipper bypasses the SDK attribute-processor, so emit the
          // already-namespaced keys the backend consumer reads directly
          // (neatlogs.tool.input / .output and the generic neatlogs.input.value),
          // not the raw input.value/output.value the processor would map.
          setIO(attrs, 'TOOL', safeStringify(start.args), undefined);
          push(attrs, attrStr('neatlogs.tool.input', safeStringify(start.args)));
        }
        if (result?.title) push(attrs, attrStr('neatlogs.tool.title', String(result.title)));
        const out = result?.output ?? result?.result;
        if (out !== undefined) {
          const o = typeof out === 'string' ? out : safeStringify(out);
          setIO(attrs, 'TOOL', undefined, o);
          push(attrs, attrStr('neatlogs.tool.output', o));
        }
        if (result?.metadata !== undefined) {
          push(attrs, attrStr('neatlogs.tool.metadata', safeStringify(result.metadata)));
        }

        shipper.enqueue({
          traceId: st.traceId,
          spanId: start.spanId,
          parentSpanId: st.rootSpan?.spanId,
          name: `opencode.tool.${start.tool}`,
          kind: 1,
          startTimeUnixNano: start.startNano,
          endTimeUnixNano: nowNanoString(),
          attributes: attrs,
          status: { code: SpanStatusCode.OK },
        });
      } catch {
        /* ignore */
      }
    },
  };
};

// Convenience aliases so users can import under any common name.
export const neatlogsOpencodePlugin = NeatlogsOpencodePlugin;
export default NeatlogsOpencodePlugin;

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

function handleEvent(
  shipper: TraceShipper,
  sessions: Map<string, SessionState>,
  stateFor: (sessionID: string) => SessionState,
  startRoot: (st: SessionState, sessionID: string) => void,
  closeAndFlush: (st: SessionState, sessionID: string) => Promise<void>,
  event: any,
): Promise<unknown> | undefined {
  const type = event?.type;
  const props = event?.properties ?? {};

  // Accumulate text + tool-call parts on an assistant message.
  if (type === 'message.part.updated' || type === 'message.part.completed') {
    const part = props.part ?? props;
    const messageID = part?.messageID ?? part?.message_id;
    const sessionID = part?.sessionID ?? props.sessionID;
    if (!messageID || !sessionID) return undefined;
    const st = stateFor(String(sessionID));
    if (part?.type === 'text' && typeof part?.text === 'string') {
      st.outputParts.set(String(messageID), part.text);
    } else if (part?.type === 'tool' && part?.tool) {
      const list = st.toolCalls.get(String(messageID)) ?? [];
      const callID = String(part.callID ?? part.tool);
      const input = part?.state?.input ?? {};
      const existing = list.find((t) => t.callID === callID);
      if (existing) existing.input = input;
      else list.push({ name: String(part.tool), input, callID });
      st.toolCalls.set(String(messageID), list);
    }
    return undefined;
  }

  // Assistant message completed → emit the LLM span, then flush this turn.
  if (type === 'message.updated' || type === 'message.completed') {
    const info = props.info ?? props.message ?? props;
    const sessionID = info?.sessionID ?? info?.session_id;
    if (!sessionID) return undefined;
    if (info?.role !== 'assistant') return undefined;
    const completed = info?.time?.completed ?? info?.completed;
    const id = String(info?.id ?? '');
    if (!completed || !id) return undefined;
    const st = stateFor(String(sessionID));
    if (st.processed.has(id)) return undefined;
    st.processed.add(id);
    startRoot(st, String(sessionID));
    emitLlmSpan(shipper, st, info, String(sessionID));
    // Incremental persistence: ship this turn's spans now (don't wait for idle).
    return shipper.flush().catch(() => undefined);
  }

  // Session finished → end root, send completion marker, final flush.
  if (type === 'session.idle' || type === 'session.deleted') {
    const sessionID = props.sessionID ?? props.info?.id;
    if (!sessionID) return undefined;
    const st = sessions.get(String(sessionID));
    if (!st) return undefined;
    st.toolStarts.clear();
    const p = closeAndFlush(st, String(sessionID));
    if (type === 'session.deleted') sessions.delete(String(sessionID));
    return p;
  }

  return undefined;
}

function emitLlmSpan(shipper: TraceShipper, st: SessionState, info: any, sessionID: string): void {
  const model = info?.modelID ?? info?.model ?? '';
  const provider = info?.providerID ?? info?.provider ?? '';

  const attrs: OtlpKeyValue[] = [
    { key: 'neatlogs.span.kind', value: { stringValue: 'LLM' } },
    { key: 'neatlogs.conversation.id', value: { stringValue: sessionID } },
  ];
  push(attrs, attrStr('neatlogs.llm.model_name', model ? String(model) : undefined));
  push(attrs, attrStr('neatlogs.llm.provider', provider ? String(provider) : undefined));

  let inIdx = 0;
  if (st.systemPrompt) {
    push(attrs, attrStr(`neatlogs.llm.input_messages.${inIdx}.role`, 'system'));
    push(attrs, attrStr(`neatlogs.llm.input_messages.${inIdx}.content`, st.systemPrompt));
    inIdx++;
  }
  if (st.currentInput) {
    push(attrs, attrStr(`neatlogs.llm.input_messages.${inIdx}.role`, 'user'));
    push(attrs, attrStr(`neatlogs.llm.input_messages.${inIdx}.content`, st.currentInput));
    setIO(attrs, 'LLM', st.currentInput, undefined);
  }

  const outText = st.outputParts.get(String(info?.id)) || messageText(info) || '';
  const toolCalls = st.toolCalls.get(String(info?.id)) ?? [];

  if (outText) {
    push(attrs, attrStr('neatlogs.llm.output_messages.0.role', 'assistant'));
    push(attrs, attrStr('neatlogs.llm.output_messages.0.content', outText));
    setIO(attrs, 'LLM', undefined, outText);
    st.lastAssistantText = outText;
  }
  // Tool-deciding turns often carry no text — render the tool call(s) as output.
  if (toolCalls.length) {
    toolCalls.forEach((tc, j) => {
      push(attrs, attrStr(`neatlogs.llm.tool_calls.${j}.name`, tc.name));
      push(attrs, attrStr(`neatlogs.llm.tool_calls.${j}.arguments`, safeStringify(tc.input ?? {})));
    });
    if (!outText) {
      const rendered = toolCalls.map((tc) => `→ ${tc.name}(${safeStringify(tc.input ?? {})})`).join('\n');
      push(attrs, attrStr('neatlogs.llm.output_messages.0.role', 'assistant'));
      push(attrs, attrStr('neatlogs.llm.output_messages.0.content', rendered));
      setIO(attrs, 'LLM', undefined, rendered);
    }
  }

  // Tokens: opencode message tokens { input, output, reasoning, cache:{read,write} }
  const tokens = info?.tokens;
  if (tokens) {
    push(attrs, attrInt('neatlogs.llm.token_count.prompt', tokens.input));
    push(attrs, attrInt('neatlogs.llm.token_count.completion', tokens.output));
    if (tokens.input != null && tokens.output != null) {
      push(attrs, attrInt('neatlogs.llm.token_count.total', tokens.input + tokens.output));
    }
    push(attrs, attrInt('neatlogs.llm.token_count.reasoning', tokens.reasoning));
    push(attrs, attrInt('neatlogs.llm.token_count.cache_read', tokens.cache?.read));
    push(attrs, attrInt('neatlogs.llm.token_count.cache_write', tokens.cache?.write));
  }
  push(attrs, attrDouble('neatlogs.llm.cost_usd', info?.cost));

  // Use opencode's real start time when available (else now).
  const createdMs = info?.time?.created;
  const startNano = typeof createdMs === 'number' ? msToNanoString(Math.floor(createdMs)) : nowNanoString();

  shipper.enqueue({
    traceId: st.traceId,
    spanId: generateSpanId(),
    parentSpanId: st.rootSpan?.spanId,
    name: `opencode.llm.${model || 'model'}`,
    kind: 1,
    startTimeUnixNano: startNano,
    endTimeUnixNano: nowNanoString(),
    attributes: attrs,
    status: { code: SpanStatusCode.OK },
  });

  // Reset accumulated parts for the next turn.
  if (info?.id) {
    st.outputParts.delete(String(info.id));
    st.toolCalls.delete(String(info.id));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function push(arr: OtlpKeyValue[], kv: OtlpKeyValue | undefined): void {
  if (kv) arr.push(kv);
}

/**
 * Set generic input/output on a span using the ALREADY-NAMESPACED keys the
 * backend consumer reads. The OTel-SDK wrappers rely on the attribute-processor
 * to map raw `input.value` → `neatlogs.{kind}.input`; this plugin ships spans
 * directly (no processor), so it must emit the namespaced keys itself:
 *   neatlogs.input.value / neatlogs.output.value  (generic)
 *   neatlogs.{kind}.input / neatlogs.{kind}.output (kind-specific)
 * We also keep the raw input.value/output.value for any consumer that maps it.
 */
function setIO(arr: OtlpKeyValue[], kind: string, input?: string, output?: string): void {
  const k = kind.toLowerCase();
  if (input !== undefined) {
    push(arr, attrStr('input.value', input));
    push(arr, attrStr('neatlogs.input.value', input));
    push(arr, attrStr(`neatlogs.${k}.input`, input));
  }
  if (output !== undefined) {
    push(arr, attrStr('output.value', output));
    push(arr, attrStr('neatlogs.output.value', output));
    push(arr, attrStr(`neatlogs.${k}.output`, output));
  }
}

/** Flatten an opencode message's parts/content to readable text. */
function messageText(info: any): string {
  if (!info) return '';
  if (typeof info.text === 'string') return info.text;
  const parts = info.parts ?? info.content;
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';
  const out: string[] = [];
  for (const p of parts) {
    if (typeof p === 'string') out.push(p);
    else if (p && typeof p === 'object' && typeof p.text === 'string') out.push(p.text);
  }
  return out.join('');
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}
