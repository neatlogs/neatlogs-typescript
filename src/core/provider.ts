/**
 * Neatlogs-owned tracing state.
 *
 * Spans are created by the private Neatlogs provider and their parent is carried
 * in a private context key. The process-global OpenTelemetry span is
 * deliberately left untouched so other observability SDKs cannot export or
 * become parents of Neatlogs spans.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  ROOT_CONTEXT,
  INVALID_SPAN_CONTEXT,
  createContextKey,
  trace as otelTrace,
  type Context,
  type Span,
  type SpanOptions,
  type Tracer,
  type TracerProvider,
} from '@opentelemetry/api';

// Carries the trace-ROOT span down the private context so descendants can target
// it (e.g. setTraceOutput). getActiveNeatlogsSpan() returns the innermost span,
// which is not the root once nested; this key preserves the root reference.
const NEATLOGS_ROOT_SPAN_KEY = createContextKey('neatlogs.root_span');

// Entry points are bundled independently (`neatlogs`, `neatlogs/openai`,
// `neatlogs/ai`, `neatlogs/mastra`, … each in both CJS and ESM), so every piece
// of shared tracing state — the private span store AND the resolved provider /
// provider — must live on `globalThis` behind a `Symbol.for` key.
// Otherwise `init()` (run from the `neatlogs` bundle) sets `_provider` in ITS
// module copy while a wrapper imported from `neatlogs/openai` reads a different,
// still-null copy and silently falls back to the foreign global provider.
const PRIVATE_SPAN_STORAGE_KEY = Symbol.for(
  'neatlogs.private_span_async_local_storage',
);
const PRIVATE_PROVIDER_STATE_KEY = Symbol.for(
  'neatlogs.private_provider_state',
);
interface PrivateProviderState {
  provider: TracerProvider | null;
}
type NeatlogsGlobal = typeof globalThis & {
  [PRIVATE_SPAN_STORAGE_KEY]?: AsyncLocalStorage<Context>;
  [PRIVATE_PROVIDER_STATE_KEY]?: PrivateProviderState;
};
const neatlogsGlobal = globalThis as NeatlogsGlobal;
// Stores the full Neatlogs Context (parent span PLUS any threaded values such as
// trace()'s prompt-template keys), not just the span. We never
// activate the OTel global context, so this private store is the ONLY channel
// through which those values propagate down to descendant spans.
const privateContextStorage =
  neatlogsGlobal[PRIVATE_SPAN_STORAGE_KEY] ??
  (neatlogsGlobal[PRIVATE_SPAN_STORAGE_KEY] = new AsyncLocalStorage<Context>());
const providerState: PrivateProviderState =
  neatlogsGlobal[PRIVATE_PROVIDER_STATE_KEY] ??
  (neatlogsGlobal[PRIVATE_PROVIDER_STATE_KEY] = {
    provider: null,
  });
// Wrappers may be constructed or accidentally invoked before init(). They must
// never fall back to a foreign process-global provider, so pre-init calls use a
// local no-op tracer and safely emit no exported spans.
const preInitTracer: Tracer = {
  startSpan(): Span {
    return otelTrace.wrapSpanContext(INVALID_SPAN_CONTEXT);
  },
  startActiveSpan<F extends (span: Span) => unknown>(
    _name: string,
    arg2?: SpanOptions | Context | F,
    arg3?: Context | F,
    arg4?: F,
  ): ReturnType<F> {
    const fn =
      typeof arg2 === 'function'
        ? arg2
        : typeof arg3 === 'function'
          ? arg3
          : arg4;
    return fn!(otelTrace.wrapSpanContext(INVALID_SPAN_CONTEXT)) as ReturnType<F>;
  },
};

/** @internal Configure the provider used by Neatlogs-created spans. */
export function _setNeatlogsProvider(provider: TracerProvider | null): void {
  providerState.provider = provider;
}

/** Resolve a tracer from the private provider when one is configured. */
export function getNeatlogsTracer(name: string): Tracer {
  return providerState.provider?.getTracer(name) ?? preInitTracer;
}

/**
 * @internal The private Neatlogs provider, or null before
 * init(). Used by integrations that must repoint a self-instrumenting library's
 * captured provider onto ours.
 */
export function getNeatlogsProvider(): TracerProvider | null {
  return providerState.provider;
}

/**
 * Wrap a tracer so that spans it creates parent from — and, for
 * `startActiveSpan`, activate on — the PRIVATE Neatlogs context instead of the
 * global one.
 *
 * We hand this to libraries that create their own spans off a tracer we give
 * them (the Vercel AI SDK's `experimental_telemetry.tracer`, which calls
 * `tracer.startActiveSpan()` internally). Without the facade the AI SDK's native
 * spans would parent from `context.active()` — the foreign co-tenant's context —
 * and `startActiveSpan` would push them onto the GLOBAL context, so a foreign
 * tracer's next span reads our native span as its parent. Both directions leak.
 *
 */
export function isolateTracer(tracer: Tracer): Tracer {
  const facade: Tracer = {
    startSpan(name: string, options?: SpanOptions, context?: Context): Span {
      const parent = context ?? getNeatlogsActiveContext();
      return tracer.startSpan(name, options, parent);
    },
    startActiveSpan<F extends (span: Span) => unknown>(
      name: string,
      arg2?: SpanOptions | Context | F,
      arg3?: Context | F,
      arg4?: F,
    ): ReturnType<F> {
      // Normalize the 2/3/4-arg overloads of startActiveSpan.
      let options: SpanOptions | undefined;
      let context: Context | undefined;
      let fn: F;
      if (typeof arg2 === 'function') {
        fn = arg2 as F;
      } else if (typeof arg3 === 'function') {
        options = arg2 as SpanOptions;
        fn = arg3 as F;
      } else {
        options = arg2 as SpanOptions;
        context = arg3 as Context;
        fn = arg4 as F;
      }
      const parent = context ?? getNeatlogsActiveContext();
      const span = tracer.startSpan(name, options, parent);
      return withNeatlogsSpan(span, () => fn(span), parent) as ReturnType<F>;
    },
  };
  return facade;
}

/**
 * The base context to build new Neatlogs spans and values on. NEVER contains a
 * foreign provider's span: it reads our private store, or ROOT_CONTEXT when
 * nothing is active.
 */
export function getNeatlogsActiveContext(): Context {
  return privateContextStorage.getStore() ?? ROOT_CONTEXT;
}

/** Return only the active Neatlogs span (never a foreign provider's span). */
export function getActiveNeatlogsSpan(): Span | undefined {
  return otelTrace.getSpan(getNeatlogsActiveContext());
}

/**
 * Return the trace-ROOT Neatlogs span, or undefined when no trace is active.
 *
 * Unlike {@link getActiveNeatlogsSpan} (innermost), this is the outermost span
 * of the current trace — the one the backend derives trace-level output from
 * (`parent_span_id=''`). It is stashed on the private context the first time a
 * span becomes active, so nested calls still resolve to the root.
 */
export function getNeatlogsRootSpan(): Span | undefined {
  return getNeatlogsActiveContext().getValue(NEATLOGS_ROOT_SPAN_KEY) as
    | Span
    | undefined;
}

/**
 * Build a parent context that cannot contain a foreign provider's span.
 *
 * The active Neatlogs context already carries the parent span AND any values
 * the caller threaded in upstream (e.g. `trace()`'s prompt-template values), so
 * those values reach the span processor via `onStart(parentContext)`. An
 * explicit `baseContext` (a caller's own value-carrying context) is honored as-is.
 */
export function getNeatlogsParentContext(baseContext?: Context): Context {
  return baseContext ?? getNeatlogsActiveContext();
}

/**
 * A base context for callers that thread parent linkage themselves
 * (callback/event handlers that keep their own run-id → span map: LangChain,
 * OpenAI-Agents, Claude Agent SDK).
 *
 * This is the ACTIVE Neatlogs context — the private store's
 * context if a Neatlogs `trace()`/`span()` encloses this call, else
 * ROOT_CONTEXT. So a handler's own root/entry span nests under an enclosing
 * Neatlogs trace (preserving its session + end-user id) when one exists, and
 * auto-roots cleanly when one doesn't. A foreign provider's active span can
 * never leak in as an ancestor because the global context is never read.
 */
export function getNeatlogsBaseContext(baseContext?: Context): Context {
  return baseContext ?? getNeatlogsActiveContext();
}

/**
 * Build an execution context for a Neatlogs span while preserving the active
 * foreign context. The span rides our private context store.
 */
export function getNeatlogsExecutionContext(
  span: Span,
  baseContext: Context = ROOT_CONTEXT,
): Context {
  return otelTrace.setSpan(baseContext, span);
}

/**
 * Run a callback with a Neatlogs span active under the appropriate policy.
 *
 * The stored context is `setSpan(base, span)` — carrying the span PLUS whatever
 * values `base` holds — so threaded values (prompt templates)
 * propagate to descendant spans through our private store instead of the global
 * OTel context we deliberately never touch.
 */
export function withNeatlogsSpan<T>(
  span: Span,
  fn: () => T,
  baseContext?: Context,
): T {
  const base = baseContext ?? getNeatlogsActiveContext();
  let ctx = otelTrace.setSpan(base, span);
  // The first span activated in a context with no root recorded IS the root of
  // this trace; remember it so descendants (setTraceOutput) can target it.
  if (base.getValue(NEATLOGS_ROOT_SPAN_KEY) === undefined) {
    ctx = ctx.setValue(NEATLOGS_ROOT_SPAN_KEY, span);
  }
  return privateContextStorage.run(ctx, fn);
}

/**
 * @internal Run with a private Neatlogs parent without treating that parent as
 * a locally-recording trace root. This is used for an extracted remote parent:
 * the first local recording span should remain the target for local trace-level
 * output, while still inheriting the remote trace/span IDs.
 */
export function withNeatlogsRemoteParent<T>(span: Span, fn: () => T): T {
  return privateContextStorage.run(otelTrace.setSpan(ROOT_CONTEXT, span), fn);
}
