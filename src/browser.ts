/**
 * Neatlogs Browser SDK — `neatlogs/browser`
 *
 * A minimal, browser-safe client for sending traces to Neatlogs from web apps.
 * It has ZERO dependencies (no OpenTelemetry, no Node APIs) — only `fetch` — so
 * it bundles cleanly into front-end apps. It POSTs plain JSON to the backend's
 * simple trace endpoint (`/v1/trace`); the backend generates trace/span ids,
 * builds the hierarchy from nesting, infers cost from model+tokens, and pushes
 * through the normal pipeline. Nothing here streams OTLP.
 *
 * Usage:
 *   import { Neatlogs } from 'neatlogs/browser';
 *   const nl = new Neatlogs({ apiKey: 'nl_...' });
 *
 *   // one-shot AI interaction
 *   await nl.trackAI({ name: 'chat', model: 'gpt-4o', input, output,
 *                      tokens: { prompt: 10, completion: 5 } });
 *
 *   // a full nested trace (same shape the backend's POST /v1/trace accepts)
 *   await nl.trace({ name: 'support-chat', children: [
 *     { name: 'retrieve', query, documents },
 *     { name: 'answer', model: 'gpt-4o', input, output },
 *   ]});
 *
 *   // streaming: open, accumulate, finish
 *   const t = nl.startTrace({ name: 'chat', model: 'gpt-4o', input });
 *   t.finish({ output: full, tokens: { prompt, completion } });
 */

const DEFAULT_ENDPOINT = "https://staging-cloud.neatlogs.com";

// Canonical end-user attribute keys (inlined — this file stays dependency-free).
const END_USER_ID_KEY = "neatlogs.end_user.id";
const END_USER_METADATA_KEY = "neatlogs.end_user.metadata";

// --- the simple trace shape the backend (/v1/trace) accepts --------------------
// Mirrors the server-side SimpleSpan; kept local so this file has no imports.

export interface NeatlogsLog {
  level?: string;
  message: string;
  timestamp?: string;
}

/**
 * Span kinds the backend accepts (the canonical set). `kind` is optional — when
 * omitted the backend infers it from the fields present.
 */
export type NeatlogsKind =
  | "WORKFLOW" | "AGENT" | "CHAIN" | "TOOL" | "RETRIEVER" | "RERANKER"
  | "EMBEDDING" | "LLM" | "GUARDRAIL" | "MCP_TOOL" | "TASK"
  | "VECTOR_STORE" | "EVALUATOR" | "HTTP";

export interface NeatlogsSpan {
  name: string;
  /** Optional — the backend infers the kind from fields when omitted. */
  kind?: NeatlogsKind | string;
  input?: unknown;
  output?: unknown;
  model?: string;
  tokens?: { prompt?: number; completion?: number; total?: number };
  query?: unknown;
  documents?: unknown;
  tool_name?: string;
  passed?: boolean;
  score?: number;
  metadata?: Record<string, unknown>;
  status?: string;
  error?: string;
  start?: string;
  end?: string;
  /** Simplest way to record latency — the backend derives end from start + this. */
  duration_ms?: number;
  /**
   * Full canonical-attribute escape hatch. Send ANY neatlogs.* attribute the SDK
   * supports — e.g. { "neatlogs.llm.temperature": 0.7, "neatlogs.agent.role":
   * "researcher", "neatlogs.tool.parameters": {...} }. Non-canonical keys are
   * dropped server-side. The fields above (model/tokens/query/...) are shortcuts
   * for the common ones; explicit `attributes` win on conflict.
   */
  attributes?: Record<string, unknown>;
  children?: NeatlogsSpan[];
  logs?: NeatlogsLog[];
  /**
   * END-USER this trace belongs to — only meaningful on the ROOT of a trace
   * (overrides the client default). One end-user per trace; the backend rolls it
   * up to the trace and its session. Ignored on child spans.
   */
  endUser?: string;
  /** Arbitrary end-user fields for the trace root (overrides the client default). */
  endUserMetadata?: Record<string, unknown>;
}

/** The root of a trace = a span node (its `name` becomes the workflow name). */
export type NeatlogsTrace = NeatlogsSpan;

export interface NeatlogsOptions {
  /**
   * Your Neatlogs WRITE key (`nlw_…`) — an ingest-only credential safe to embed in
   * browser code. (A full project key also works but should not be exposed client-side,
   * since it can read data.)
   */
  apiKey: string;
  /**
   * Project NAME to ingest into. REQUIRED when using a write key (the key identifies
   * you, not a project). Sent as the root `project` field on every trace. Ignored for
   * a full project key (already project-scoped).
   */
  project?: string;
  /** Backend base URL. Defaults to the same host the SDKs use. */
  endpoint?: string;
  /** Set false to validate calls without sending (default true). */
  enabled?: boolean;
  /** Called on transport errors instead of throwing (default: console.warn). */
  onError?: (err: unknown) => void;
  /**
   * Default END-USER identity for every trace this client sends — the user of
   * your app, not the operator. One end-user per trace; the backend rolls it up
   * to the trace and its session. A per-call `endUser` (on trace()/trackAI())
   * overrides this. Set it once after login, e.g. `new Neatlogs({ apiKey, endUser })`.
   */
  endUser?: string;
  /** Default arbitrary end-user fields stored as JSON (e.g. { plan: 'pro' }). */
  endUserMetadata?: Record<string, unknown>;
}

export interface TrackResult {
  ok: boolean;
  trace_id?: string;
  spans?: number;
  error?: string;
}

/** Shorthand for a single AI interaction → a one-span trace. */
export interface TrackAIInput {
  name: string;
  input?: unknown;
  output?: unknown;
  model?: string;
  tokens?: { prompt?: number; completion?: number; total?: number };
  metadata?: Record<string, unknown>;
  duration_ms?: number;
  /** Any canonical neatlogs.* attributes (see NeatlogsSpan.attributes). */
  attributes?: Record<string, unknown>;
  /** Override the inferred kind (defaults to LLM for trackAI). */
  kind?: NeatlogsKind | string;
  /** END-USER for this trace (overrides the client default). One per trace. */
  endUser?: string;
  /** Arbitrary end-user fields for this trace (overrides the client default). */
  endUserMetadata?: Record<string, unknown>;
}

export class Neatlogs {
  private readonly apiKey: string;
  private readonly project?: string;
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly onError: (err: unknown) => void;
  private readonly endUser?: string;
  private readonly endUserMetadata?: Record<string, unknown>;

  constructor(opts: NeatlogsOptions) {
    if (!opts || !opts.apiKey) {
      throw new Error("Neatlogs: apiKey is required");
    }
    this.apiKey = opts.apiKey;
    this.project = opts.project;
    // Use the origin of the configured endpoint (same convention as the Node SDK),
    // so passing a full /v1/traces URL or a bare host both work.
    const endpoint = opts.endpoint || DEFAULT_ENDPOINT;
    this.baseUrl = safeOrigin(endpoint) || DEFAULT_ENDPOINT;
    this.enabled = opts.enabled !== false;
    this.endUser = opts.endUser;
    this.endUserMetadata = opts.endUserMetadata;
    this.onError =
      opts.onError ||
      ((err) => {
        // eslint-disable-next-line no-console
        if (typeof console !== "undefined") console.warn("[neatlogs] send failed:", err);
      });
  }

  /** Send a full (optionally nested) trace. Returns the backend's result. */
  async trace(trace: NeatlogsTrace): Promise<TrackResult> {
    return this.post(trace);
  }

  /** Send a single AI interaction as a one-span trace (kind defaults to LLM). */
  async trackAI(ai: TrackAIInput): Promise<TrackResult> {
    const { name, kind, ...rest } = ai;
    return this.post({ name, kind: kind ?? "LLM", ...rest });
  }

  /**
   * Begin a trace you'll complete later (e.g. streaming). Buffers the partial
   * input; call `.finish()` with the final output/tokens to send it. Nothing is
   * sent until `finish()`.
   */
  startTrace(initial: TrackAIInput): {
    finish: (final?: Partial<TrackAIInput>) => Promise<TrackResult>;
  } {
    const startedAt = nowIso();
    return {
      finish: (final?: Partial<TrackAIInput>) => {
        const merged: TrackAIInput = { ...initial, ...(final ?? {}) };
        const { name, kind, ...rest } = merged;
        return this.post({
          name,
          kind: kind ?? "LLM",
          start: startedAt,
          end: nowIso(),
          ...rest,
        });
      },
    };
  }

  /**
   * Fold end-user identity onto the trace ROOT as canonical attributes, and
   * strip the convenience `endUser`/`endUserMetadata` fields so they aren't sent
   * as raw root fields. Per-call values win over the client defaults; explicit
   * `attributes` win over both. One end-user per trace — only the root carries it.
   */
  private applyEndUser(body: NeatlogsTrace): NeatlogsTrace {
    const { endUser, endUserMetadata, ...rest } = body as NeatlogsTrace & {
      endUser?: string;
      endUserMetadata?: Record<string, unknown>;
    };
    const id = endUser ?? this.endUser;
    const meta = endUserMetadata ?? this.endUserMetadata;
    if (id === undefined && meta === undefined) return rest;

    const attributes: Record<string, unknown> = { ...(rest.attributes ?? {}) };
    if (id !== undefined && attributes[END_USER_ID_KEY] === undefined) {
      attributes[END_USER_ID_KEY] = String(id);
    }
    if (meta !== undefined && attributes[END_USER_METADATA_KEY] === undefined) {
      attributes[END_USER_METADATA_KEY] =
        typeof meta === "string" ? meta : JSON.stringify(meta);
    }
    return { ...rest, attributes };
  }

  /** POST the trace JSON to the backend's /v1/trace endpoint. */
  private async post(body: NeatlogsTrace): Promise<TrackResult> {
    if (!this.enabled) return { ok: true };
    // Fold end-user identity onto the root before anything else.
    body = this.applyEndUser(body);
    // Inject the configured project name into the root (required for write keys;
    // ignored server-side for full project keys). A `project` already on the body wins.
    const payload =
      this.project && (body as any).project === undefined
        ? { ...body, project: this.project }
        : body;
    try {
      const res = await fetch(`${this.baseUrl}/v1/trace`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        // keepalive lets the request survive a page unload (e.g. on navigation).
        keepalive: true,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const result = { ok: false, error: `HTTP ${res.status}${text ? `: ${text}` : ""}` };
        this.onError(new Error(result.error));
        return result;
      }
      const data = (await res.json().catch(() => ({}))) as Partial<TrackResult>;
      return { ok: true, trace_id: data.trace_id, spans: data.spans };
    } catch (err) {
      // Never throw into the host app over telemetry.
      this.onError(err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

// --- helpers (kept local, no imports) -----------------------------------------

function safeOrigin(endpoint: string): string | null {
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export default Neatlogs;
