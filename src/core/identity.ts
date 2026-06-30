/**
 * Request-scoped session & end-user identity.
 *
 * Session and end-user identity are PER-REQUEST, not process-global, so they are
 * never set on `init()`. The primary way to set them is at the trace root
 * (`trace({ sessionId })` / `span({ sessionId })`). For code that only uses
 * `wrap()` — where the trace root is created internally by the wrapper and the
 * caller has no root to put arguments on — use the `identify()` context:
 *
 *     await neatlogs.identify(
 *       { sessionId: 'chat_123', endUserId: 'user_456', endUserMetadata: { plan: 'pro' } },
 *       async () => {
 *         await wrappedClient.chat.completions.create(...);  // auto-root reads this
 *       },
 *     );
 *
 * Resolution at the trace root (per field): explicit per-call argument wins, then
 * the `identify()` context, then nothing. Identity is stamped on the ROOT span
 * only; the backend rolls it up to the trace and its session.
 *
 * Backed by `AsyncLocalStorage` so it propagates across `await` boundaries (and
 * nested async tasks), exactly like OpenTelemetry's own context propagation.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface IdentityStore {
  sessionId?: string;
  endUserId?: string;
  endUserMetadata?: Record<string, any>;
}

export interface IdentifyOptions {
  sessionId?: string;
  endUserId?: string;
  endUserMetadata?: Record<string, any>;
}

// tsup bundles each entry point (index, openai, azure-openai, ...) separately,
// so a plain module-level `new AsyncLocalStorage()` would be DUPLICATED per
// bundle — identify() (in index) would write to a different store than a
// provider wrapper's auto-root (in e.g. azure-openai) reads, silently losing
// identity on the wrapper-only path. Pin a single instance on globalThis so all
// bundled copies (ESM + CJS) resolve to the same store.
const _GLOBAL_KEY = Symbol.for('neatlogs.identity.storage');
type _GlobalWithStore = typeof globalThis & {
  [_GLOBAL_KEY]?: AsyncLocalStorage<IdentityStore>;
};
const _g = globalThis as _GlobalWithStore;
const _storage: AsyncLocalStorage<IdentityStore> =
  _g[_GLOBAL_KEY] ?? (_g[_GLOBAL_KEY] = new AsyncLocalStorage<IdentityStore>());

export function currentSessionId(): string | undefined {
  return _storage.getStore()?.sessionId;
}

export function currentEndUserId(): string | undefined {
  return _storage.getStore()?.endUserId;
}

export function currentEndUserMetadata(): Record<string, any> | undefined {
  return _storage.getStore()?.endUserMetadata;
}

/**
 * Bind session / end-user identity for the duration of `fn`.
 *
 * Only defined fields are set, so a nested `identify()` overrides one field
 * without clearing the others (it merges onto the enclosing store). The previous
 * store is automatically restored when `fn` returns / rejects. Returns whatever
 * `fn` returns (sync value or Promise).
 *
 * @example
 * ```typescript
 * await neatlogs.identify({ sessionId: 'chat_123' }, async () => {
 *   await wrappedClient.chat.completions.create(...);
 * });
 * ```
 */
export function identify<T>(opts: IdentifyOptions, fn: () => T): T {
  const prev = _storage.getStore();
  const next: IdentityStore = { ...(prev ?? {}) };
  if (opts.sessionId !== undefined) next.sessionId = opts.sessionId;
  if (opts.endUserId !== undefined) next.endUserId = opts.endUserId;
  if (opts.endUserMetadata !== undefined) next.endUserMetadata = opts.endUserMetadata;
  return _storage.run(next, fn);
}
