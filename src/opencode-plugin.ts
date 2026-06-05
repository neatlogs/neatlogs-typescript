/**
 * Neatlogs opencode plugin.
 *
 * opencode loads plugins from its config (`opencode.json` → `"plugin": [...]`)
 * or from local `.opencode/plugin/*.ts` files. A plugin is an async factory that
 * receives an app context and returns lifecycle hooks. This plugin instruments
 * opencode automatically — no per-call wiring — translating opencode's run into
 * a neatlogs span tree:
 *
 *   LLM   assistant turn        (from `message.updated` completion events)
 *   TOOL  tool execution        (tool.execute.before → tool.execute.after)
 *
 * Every span carries `neatlogs.conversation.id` = the opencode session ID.
 *
 * Setup — either:
 *   • npm package, in opencode.json: `{ "plugin": ["neatlogs"] }`, OR
 *   • local file `.opencode/plugin/neatlogs.ts` (project) or
 *     `~/.config/opencode/plugin/neatlogs.ts` (global):
 *       export { NeatlogsOpencodePlugin as default } from 'neatlogs/opencode';
 *
 * Then set NEATLOGS_API_KEY in the environment. The plugin bootstraps neatlogs
 * tracing on load (it runs inside opencode's own process, so it initializes the
 * SDK itself rather than relying on a user `init()` call).
 *
 * Optional env:
 *   NEATLOGS_API_KEY            required to export
 *   NEATLOGS_WORKFLOW_NAME      logical grouping (default: "opencode")
 *   NEATLOGS_CAPTURE_SYSTEM_PROMPT=true  capture system prompt text (default off)
 */

import { trace, context as otelContext, SpanStatusCode, type Span } from '@opentelemetry/api';
import { init, flush, isDebugEnabled } from './init.js';

const TRACER_NAME = 'neatlogs.opencode';

interface SessionState {
  /** TOOL spans keyed by opencode callID. */
  toolSpans: Map<string, Span>;
  /** Accumulated text per assistant messageID (built from part updates). */
  messageText: Map<string, string>;
  /** messageIDs we've already emitted an LLM span for (completion can fire twice). */
  emitted: Set<string>;
  /** Most recent user-message text, used as LLM input. */
  lastUserText: string;
}

let _initialized = false;

async function ensureInitialized(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  try {
    await init({
      apiKey: process.env.NEATLOGS_API_KEY,
      // The plugin bootstraps itself inside opencode's process — there is no user
      // init() to pass an endpoint, so honor NEATLOGS_ENDPOINT from the env (e.g.
      // a local backend). init() otherwise defaults to the hosted cloud.
      ...(process.env.NEATLOGS_ENDPOINT
        ? { endpoint: process.env.NEATLOGS_ENDPOINT }
        : {}),
      workflowName: process.env.NEATLOGS_WORKFLOW_NAME || 'opencode',
      // opencode is long-running and event-driven; keep auto session off so each
      // span's conversation id is the opencode session id we set explicitly.
      autoSession: false,
    });
  } catch {
    // If init fails (already initialized, missing key), tracing degrades to no-op.
  }
}

/**
 * opencode Plugin factory. opencode calls this with its app context and uses the
 * returned hook object. Typed loosely to avoid a hard dependency on
 * `@opencode-ai/plugin`.
 */
export const NeatlogsOpencodePlugin = async (_ctx: any): Promise<Record<string, any>> => {
  await ensureInitialized();

  const sessions = new Map<string, SessionState>();
  const tracer = trace.getTracer(TRACER_NAME);
  const captureSystemPrompt = String(process.env.NEATLOGS_CAPTURE_SYSTEM_PROMPT || '').toLowerCase() === 'true';

  function stateFor(sessionID: string): SessionState {
    let s = sessions.get(sessionID);
    if (!s) {
      s = { toolSpans: new Map(), messageText: new Map(), emitted: new Set(), lastUserText: '' };
      sessions.set(sessionID, s);
    }
    return s;
  }

  return {
    /**
     * Global event bus. opencode emits message + session lifecycle events here.
     * We use it to emit an LLM span when an assistant message completes, and to
     * track user-message text + assistant text from part updates.
     */
    event: async ({ event }: { event: any }) => {
      try {
        // handleEvent returns a flush promise on session-idle/deleted; await it
        // so spans export before opencode's short-lived `run` process exits.
        await handleEvent(tracer, sessions, stateFor, captureSystemPrompt, event);
      } catch {
        // never break opencode over tracing
      }
    },

    /** Fired before a tool runs: open a TOOL span keyed by callID. */
    'tool.execute.before': async (input: any, output: any) => {
      try {
        const sessionID = input?.sessionID ?? '';
        const callID = input?.callID ?? input?.tool ?? '';
        const st = stateFor(sessionID);
        const span = tracer.startSpan(
          `opencode.tool.${input?.tool ?? 'tool'}`,
          {
            attributes: {
              'neatlogs.span.kind': 'TOOL',
              'neatlogs.tool.name': String(input?.tool ?? ''),
              ...(sessionID ? { 'neatlogs.conversation.id': String(sessionID) } : {}),
              ...(output?.args !== undefined
                ? { 'input.value': safeStringify(output.args) }
                : {}),
            },
          },
          otelContext.active(),
        );
        if (callID) st.toolSpans.set(String(callID), span);
      } catch {
        /* ignore */
      }
    },

    /** Fired after a tool runs: close the matching TOOL span. */
    'tool.execute.after': async (input: any, output: any) => {
      try {
        const sessionID = input?.sessionID ?? '';
        const callID = String(input?.callID ?? input?.tool ?? '');
        const st = stateFor(sessionID);
        const span = st.toolSpans.get(callID);
        if (!span) return;
        if (output?.title) span.setAttribute('neatlogs.tool.title', String(output.title));
        const out = output?.output ?? output?.result;
        if (out !== undefined) {
          span.setAttribute('output.value', (typeof out === 'string' ? out : safeStringify(out)));
        }
        if (output?.metadata !== undefined) {
          span.setAttribute('neatlogs.tool.metadata', safeStringify(output.metadata));
        }
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        st.toolSpans.delete(callID);
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
  tracer: ReturnType<typeof trace.getTracer>,
  sessions: Map<string, SessionState>,
  stateFor: (sessionID: string) => SessionState,
  captureSystemPrompt: boolean,
  event: any,
): Promise<unknown> | undefined {
  const type = event?.type;
  const props = event?.properties ?? {};

  // Accumulate text emitted as message parts (text deltas / final text).
  if (type === 'message.part.updated' || type === 'message.part.completed') {
    const part = props.part ?? props;
    const messageID = part?.messageID ?? part?.message_id;
    const sessionID = part?.sessionID ?? props.sessionID;
    if (part?.type === 'text' && typeof part?.text === 'string' && messageID && sessionID) {
      const st = stateFor(String(sessionID));
      st.messageText.set(String(messageID), part.text);
    }
    return;
  }

  if (type === 'message.updated' || type === 'message.completed') {
    const info = props.info ?? props.message ?? props;
    const sessionID = info?.sessionID ?? info?.session_id;
    if (!sessionID) return;
    const st = stateFor(String(sessionID));

    if (info?.role === 'user') {
      const text = messageText(info) || st.messageText.get(String(info?.id)) || '';
      if (text) st.lastUserText = text;
      return;
    }

    if (info?.role === 'assistant') {
      const completed = info?.time?.completed ?? info?.completed;
      const id = String(info?.id ?? '');
      if (!completed || st.emitted.has(id)) return; // wait for completion; emit once
      st.emitted.add(id);
      emitLlmSpan(tracer, st, captureSystemPrompt, info, String(sessionID));
    }
    return;
  }

  if (type === 'session.idle' || type === 'session.deleted') {
    // Turn/session finished: close any dangling tool spans for this session.
    const sessionID = props.sessionID ?? props.info?.id;
    if (!sessionID) return undefined;
    const st = sessions.get(String(sessionID));
    if (!st) return undefined;
    for (const ts of st.toolSpans.values()) {
      try {
        ts.end();
      } catch {
        /* ignore */
      }
    }
    st.toolSpans.clear();
    if (type === 'session.deleted') sessions.delete(String(sessionID));

    // Flush so spans export before opencode exits. `opencode run` is a
    // short-lived process that tears down as soon as the session goes idle —
    // the batch span processor would otherwise be killed before its async
    // export fires, dropping the whole trace. Returned so the event hook awaits.
    return flush().catch(() => false);
  }

  return undefined;
}

function emitLlmSpan(
  tracer: ReturnType<typeof trace.getTracer>,
  st: SessionState,
  captureSystemPrompt: boolean,
  info: any,
  sessionID: string,
): void {
  const model = info?.modelID ?? info?.model ?? '';
  const provider = info?.providerID ?? info?.provider ?? '';

  const attrs: Record<string, any> = {
    'neatlogs.span.kind': 'LLM',
    'neatlogs.conversation.id': sessionID,
  };
  if (model) attrs['neatlogs.llm.model_name'] = String(model);
  if (provider) attrs['neatlogs.llm.provider'] = String(provider);

  if (captureSystemPrompt && info?.system) {
    const sys = Array.isArray(info.system) ? info.system.join('\n') : String(info.system);
    attrs['neatlogs.llm.input_messages.0.role'] = 'system';
    attrs['neatlogs.llm.input_messages.0.content'] = sys;
  }

  let inIdx = captureSystemPrompt && info?.system ? 1 : 0;
  if (st.lastUserText) {
    attrs[`neatlogs.llm.input_messages.${inIdx}.role`] = 'user';
    attrs[`neatlogs.llm.input_messages.${inIdx}.content`] = st.lastUserText;
    inIdx++;
  }

  const outText = messageText(info) || st.messageText.get(String(info?.id)) || '';
  if (outText) {
    attrs['neatlogs.llm.output_messages.0.role'] = 'assistant';
    attrs['neatlogs.llm.output_messages.0.content'] = outText;
  }

  // Tokens: opencode message tokens { input, output, reasoning, cache: { read, write } }
  const tokens = info?.tokens;
  if (tokens) {
    if (tokens.input != null) attrs['neatlogs.llm.token_count.prompt'] = tokens.input;
    if (tokens.output != null) attrs['neatlogs.llm.token_count.completion'] = tokens.output;
    if (tokens.input != null && tokens.output != null) {
      attrs['neatlogs.llm.token_count.total'] = tokens.input + tokens.output;
    }
    if (tokens.reasoning != null) attrs['neatlogs.llm.token_count.reasoning'] = tokens.reasoning;
    if (tokens.cache?.read != null) attrs['neatlogs.llm.token_count.cache_read'] = tokens.cache.read;
    if (tokens.cache?.write != null) attrs['neatlogs.llm.token_count.cache_write'] = tokens.cache.write;
  }
  if (info?.cost != null) attrs['neatlogs.llm.cost_usd'] = info.cost;

  const span = tracer.startSpan(`opencode.llm.${model || 'model'}`, { attributes: attrs }, otelContext.active());
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();

  // Reset accumulated text for the next turn.
  if (info?.id) st.messageText.delete(String(info.id));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    return '';
  }
}

// Touch isDebugEnabled so the import is retained for parity with other modules
// that gate verbose logging; opencode plugins stay silent unless debugging.
void isDebugEnabled;
