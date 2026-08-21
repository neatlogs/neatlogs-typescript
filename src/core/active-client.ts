import { AsyncLocalStorage } from 'node:async_hooks';
import type { Tracer, TracerProvider } from '@opentelemetry/api';

export interface ActiveNeatlogsClient {
  readonly workflowName: string;
  readonly tracerProvider: TracerProvider;
  getTracer(scope: string): Tracer;
  getLogger(): any | null;
}

const ACTIVE_CLIENT_STORAGE_KEY = Symbol.for(
  'neatlogs.active_client_async_local_storage',
);
type NeatlogsGlobal = typeof globalThis & {
  [ACTIVE_CLIENT_STORAGE_KEY]?: AsyncLocalStorage<ActiveNeatlogsClient>;
};
const neatlogsGlobal = globalThis as NeatlogsGlobal;
const storage =
  neatlogsGlobal[ACTIVE_CLIENT_STORAGE_KEY] ??
  (neatlogsGlobal[ACTIVE_CLIENT_STORAGE_KEY] =
    new AsyncLocalStorage<ActiveNeatlogsClient>());

export function getActiveClient(): ActiveNeatlogsClient | undefined {
  return storage.getStore();
}

export function runWithClient<T>(
  client: ActiveNeatlogsClient,
  fn: () => T,
): T {
  return storage.run(client, fn);
}
