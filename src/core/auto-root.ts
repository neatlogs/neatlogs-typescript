/**
 * Auto-root for direct-provider wrappers.
 *
 * The backend only renders a trace once it contains a *parentless* span of a
 * root-eligible kind (WORKFLOW / CHAIN / AGENT / MCP_TOOL / LLM). Direct-provider
 * wrappers may emit either a root-eligible LLM span or a non-root span
 * (EMBEDDING / TOOL). A bare non-root call still needs a workflow parent so the
 * trace can finalize.
 *
 * `getProviderTracer(name)` returns a Tracer facade used *only* by those
 * direct-provider wrappers: when `startSpan` would otherwise produce a
 * parentless, non-root span, it transparently opens a WORKFLOW root (named
 * after the configured `workflowName`) and ends it when the provider span
 * ends. Every wrapper path — non-streaming, streaming finalize, error —
 * funnels through `span.end()`, so wrapping `end()` covers them all with no
 * changes to the wrappers' streaming code.
 *
 * Framework wrappers (langchain, mastra, openai-agents, ai-sdk, ...) keep
 * using `trace.getTracer(...)` directly — they already emit their own root and
 * thread context explicitly, so auto-root must never fire for them.
 */

import {
  trace as otelTrace,
  type Tracer,
  type Span,
  type Context,
  type SpanOptions,
} from '@opentelemetry/api';

import { getSessionConfig } from './context.js';
import { applySessionAttributes } from './session.js';
import { applyEndUserAttributes } from './end-user.js';
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  getActiveNeatlogsSpan,
  withNeatlogsSpan,
} from './provider.js';
import { getActiveClient } from './active-client.js';
import { aliasMediaCaptureSpan } from './media.js';

const boundAutoRoots = new WeakMap<object, Span>();

// A parentless span of one of these kinds already satisfies the backend's
// root requirement, so it must NOT be wrapped in another root.
const ROOT_KINDS = new Set(['workflow', 'chain', 'agent', 'mcp_tool', 'llm']);

function autoRootEnabled(): boolean {
  const val = (process.env.NEATLOGS_AUTO_ROOT ?? '').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(val);
}

function resolveRootWorkflowName(): string {
  const clientName = getActiveClient()?.workflowName;
  if (typeof clientName === 'string' && clientName.trim()) return clientName;
  try {
    const name = getSessionConfig()?.workflowName;
    if (typeof name === 'string' && name.trim()) return name;
  } catch {
    /* ignore */
  }
  return 'workflow';
}

/**
 * Stamp request-scoped identify() identity onto a freshly-created auto-root.
 * The auto-root IS the trace root, and wrapper-only code has no user-controlled
 * root to put trace()/span() args on, so identity comes purely from the
 * identify() context (passed undefined per-call values fall back to it).
 */
function stampRootIdentity(root: Span): void {
  applySessionAttributes(root, undefined, true);
  applyEndUserAttributes(root, undefined, undefined, true);
}

/**
 * Wrap a provider span so that ending it also ends the auto-created WORKFLOW
 * root. A Proxy keeps this transparent across OTel versions: every property /
 * method except `end` passes straight through to the child span.
 */
export function bindSpanToAutoRoot(child: Span, root: Span | undefined): Span {
  if (!root) return child;
  let ended = false;
  const proxy = new Proxy(child, {
    get(target, prop, _receiver) {
      if (prop === 'end') {
        return (...args: any[]): void => {
          if (ended) return;
          ended = true;
          try {
            (target.end as (...a: any[]) => void)(...args);
          } finally {
            try {
              root.end();
            } catch {
              /* ignore */
            }
          }
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  boundAutoRoots.set(proxy, root);
  aliasMediaCaptureSpan(proxy, child);
  return proxy;
}

/**
 * Self-root helper for callback/event-driven handlers (LangChain, etc.).
 *
 * A callback handler builds its own parent context per run-id rather than going
 * through {@link AutoRootTracer}. When a run BEGINS with a non-root kind (a bare
 * `llm.invoke()` fires the LLM callback with no chain above it; a standalone
 * tool/retriever similarly), the span it creates is parentless and non-root, so
 * the backend can't anchor the trace and it never renders. Call this when there
 * is no LangChain parent: if the kind is non-root and nothing is actively
 * recording in `baseCtx`, it opens a WORKFLOW root and returns it plus the
 * child context to create the span in. The caller MUST end the returned
 * `root` after the child span ends (see {@link endAutoRoot}).
 *
 * Returns `{ root, ctx }` when a root was opened, or `{ root: undefined, ctx: baseCtx }`
 * when no auto-root is needed (root-eligible kind, already-recording parent, or
 * disabled).
 */
export function maybeOpenAutoRoot(
  tracer: Tracer,
  kind: string,
  baseCtx: Context,
): { root: Span | undefined; ctx: Context } {
  const k = String(kind ?? '').toLowerCase();
  // A foreign provider's span must never count as our parent.
  const existing = getActiveNeatlogsSpan();
  if (
    !autoRootEnabled() ||
    ROOT_KINDS.has(k) ||
    (existing !== undefined && existing.isRecording())
  ) {
    return { root: undefined, ctx: baseCtx };
  }
  const root = tracer.startSpan(
    resolveRootWorkflowName(),
    { attributes: { 'neatlogs.span.kind': 'workflow', 'neatlogs.auto_root': true } },
    baseCtx,
  );
  stampRootIdentity(root);
  return { root, ctx: otelTrace.setSpan(baseCtx, root) };
}

/** End an auto-root opened by {@link maybeOpenAutoRoot}. Safe on undefined. */
export function endAutoRoot(root: Span | undefined): void {
  if (!root) return;
  try {
    root.end();
  } catch {
    /* ignore */
  }
}

class AutoRootTracer implements Tracer {
  constructor(private readonly _tracer: Tracer) {}

  startSpan(name: string, options?: SpanOptions, context?: Context): Span {
    const kind = String(
      (options?.attributes as Record<string, unknown> | undefined)?.[
        'neatlogs.span.kind'
      ] ?? '',
    ).toLowerCase();

    // Parent from our private context, never the foreign global.
    const hasExplicitContext = context !== undefined;
    const ctx = context ?? getNeatlogsParentContext();
    const parent = getActiveNeatlogsSpan();
    const isParentless =
      !hasExplicitContext && !(parent !== undefined && parent.isRecording());
    const needsRoot =
      autoRootEnabled() &&
      !ROOT_KINDS.has(kind) &&
      isParentless;

    if (!needsRoot) {
      const span = this._tracer.startSpan(name, options, ctx);
      if (isParentless && ROOT_KINDS.has(kind)) stampRootIdentity(span);
      return span;
    }

    const root = this._tracer.startSpan(
      resolveRootWorkflowName(),
      { attributes: { 'neatlogs.span.kind': 'workflow', 'neatlogs.auto_root': true } },
      ctx,
    );
    stampRootIdentity(root);
    const childCtx = otelTrace.setSpan(ctx, root);
    const child = this._tracer.startSpan(name, options, childCtx);
    return bindSpanToAutoRoot(child, root);
  }

  startActiveSpan = ((name: string, ...args: any[]) => {
    const callback = args.at(-1);
    if (typeof callback !== 'function') {
      throw new TypeError('startActiveSpan requires a callback');
    }
    const options = args.length >= 2 ? args[0] : undefined;
    const parentContext =
      args.length >= 3 ? args[1] : getNeatlogsParentContext();
    const span = args.length >= 3
      ? this.startSpan(name, options, parentContext)
      : this.startSpan(name, options);
    return withNeatlogsSpan(
      span,
      () => callback(span),
      parentContext,
      boundAutoRoots.get(span as object),
    );
  }) as Tracer['startActiveSpan'];
}

/**
 * Tracer for direct-provider wrappers (wrapOpenAI, wrapAnthropic, ...).
 * Identical to `trace.getTracer(name)` but adds transparent auto-root so a
 * bare `wrapOpenAI(new OpenAI())` renders a trace without a manual `span()` /
 * `trace()` wrapper. Do NOT use for framework wrappers.
 */
export function getProviderTracer(name: string): Tracer {
  // Resolve from the private provider.
  return new AutoRootTracer(getNeatlogsTracer(name));
}
