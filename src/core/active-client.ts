/**
 * Request-scoped "which Client is active" pointer.
 *
 * Port of Python's `_active_client` ContextVar (neatlogs/_wrap_utils.py:40).
 *
 * `init()` installs ONE process-wide pipeline. A `Client` is a second,
 * independent pipeline (its own API key, provider, and exporters) that only
 * applies inside `client.activate(...)`. Tracer resolution consults this
 * storage first and falls back to the `init()` pipeline when nothing is active,
 * so code that never touches `Client` is completely unaffected.
 *
 * Backed by `AsyncLocalStorage` so it propagates across `await` boundaries,
 * exactly like OpenTelemetry's own context.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { Client } from './client.js';

// The storage MUST be shared across module instances. This package ships dual
// CJS/ESM builds, so a plain module-level `new AsyncLocalStorage()` would be
// DUPLICATED per format: a client activated through the ESM copy would be
// invisible to a tracer resolved through the CJS copy, and spans would silently
// route to the wrong pipeline with no error. Keying off `globalThis` with a
// `Symbol.for()` registry symbol gives every copy the same instance.
// (Same pattern as core/identity.ts.)
const ACTIVE_CLIENT_STORAGE_KEY = Symbol.for('neatlogs.active_client_storage');

type NeatlogsGlobal = typeof globalThis & {
  [ACTIVE_CLIENT_STORAGE_KEY]?: AsyncLocalStorage<Client>;
};

const neatlogsGlobal = globalThis as NeatlogsGlobal;

const storage: AsyncLocalStorage<Client> =
  neatlogsGlobal[ACTIVE_CLIENT_STORAGE_KEY] ??
  (neatlogsGlobal[ACTIVE_CLIENT_STORAGE_KEY] = new AsyncLocalStorage<Client>());

/**
 * The `Client` active in this execution context, or `undefined` when spans
 * should use the `init()` pipeline.
 */
export function getActiveClient(): Client | undefined {
  return storage.getStore();
}

/**
 * Run `fn` with `client` selected as the active pipeline.
 *
 * Nesting is supported: an inner `runWithClient` wins for its duration and the
 * outer client is restored on exit. The return value (including a rejected
 * promise) is passed through untouched.
 */
export function runWithClient<T>(client: Client, fn: () => T): T {
  return storage.run(client, fn);
}
