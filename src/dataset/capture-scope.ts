import { AsyncLocalStorage } from 'node:async_hooks';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { getNeatlogsProvider } from '../core/provider.js';
import { isHttpSpan } from '../core/http-span.js';

interface CapturedSpan {
  traceId: string;
  spanId: string;
  root: boolean;
  ended: boolean;
  delivered: boolean;
  excluded: boolean;
}

export interface CaptureScope {
  accepting: boolean;
  spans: Map<string, CapturedSpan>;
  exportFailed: boolean;
  oversized: boolean;
  flushers: Set<() => Promise<boolean>>;
}

const key = Symbol.for('neatlogs.dataset_capture_scope');
type CaptureGlobal = typeof globalThis & {
  [key]?: {
    storage: AsyncLocalStorage<CaptureScope>;
    owners: Map<string, CaptureScope>;
    traces: Map<string, CaptureScope>;
    providers: WeakMap<object, { sampleRate: number; valueLengthLimited: boolean; flush: () => Promise<boolean> }>;
  };
};
const shared = globalThis as CaptureGlobal;
const state = shared[key] ?? (shared[key] = {
  storage: new AsyncLocalStorage<CaptureScope>(),
  owners: new Map<string, CaptureScope>(),
  traces: new Map<string, CaptureScope>(),
  providers: new WeakMap<object, { sampleRate: number; valueLengthLimited: boolean; flush: () => Promise<boolean> }>(),
});
const spanKey = (span: ReadableSpan) => {
  const context = span.spanContext();
  return `${context.traceId}:${context.spanId}`;
};

export function registerCaptureProvider(provider: object, sampleRate: number, flush: () => Promise<boolean>): void {
  const valueLengthLimited = ['OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT', 'OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT'].some((key) => {
    const value = process.env[key]?.trim();
    return value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  });
  state.providers.set(provider, { sampleRate, valueLengthLimited, flush });
}

export function assertCaptureProvider(provider: object): () => Promise<boolean> {
  const config = state.providers.get(provider);
  if (!config || config.sampleRate !== 1) throw new Error('Dataset capture requires a Neatlogs-owned provider with sampleRate: 1.');
  if (config.valueLengthLimited) throw new Error('Dataset capture requires unclipped span attribute values.');
  return config.flush;
}

export function useCaptureProvider(provider: object): void {
  const scope = state.storage.getStore();
  if (!scope?.accepting) return;
  scope.flushers.add(assertCaptureProvider(provider));
}

export function assertCaptureNotNested(): void {
  if (state.storage.getStore()) throw new Error('Nested dataset captures are not supported.');
}

export function createCaptureScope(provider: object): CaptureScope {
  return { accepting: true, spans: new Map(), exportFailed: false, oversized: false, flushers: new Set([assertCaptureProvider(provider)]) };
}

export function runInCaptureScope<T>(scope: CaptureScope, run: () => T): T {
  return state.storage.run(scope, run);
}

export function captureSpanStarted(span: ReadableSpan): void {
  const scope = state.storage.getStore();
  if (!scope?.accepting || span.name === 'neatlogs.trace.complete') return;
  const provider = getNeatlogsProvider();
  if (provider) useCaptureProvider(provider);
  const context = span.spanContext();
  const id = spanKey(span);
  // A 64 KiB manifest cannot hold 4096 sixteen-character span IDs.
  if (scope.spans.size >= 4096) { scope.oversized = true; return; }
  scope.spans.set(id, {
    traceId: context.traceId,
    spanId: context.spanId,
    root: !span.parentSpanId,
    ended: false,
    delivered: false,
    excluded: isHttpSpan(span) || span.instrumentationLibrary.name === 'next.js',
  });
  state.owners.set(id, scope);
  state.traces.set(context.traceId, scope);
}

export function captureSpanEnded(span: ReadableSpan): void {
  if (state.owners.size === 0) return;
  const scope = state.owners.get(spanKey(span));
  const record = scope?.spans.get(spanKey(span));
  if (!record) return;
  record.ended = true;
  record.excluded = isHttpSpan(span) || span.instrumentationLibrary.name === 'next.js';
  if (!record.excluded && scope && (span.droppedAttributesCount > 0 || span.droppedEventsCount > 0 || span.droppedLinksCount > 0)) scope.exportFailed = true;
}

export function captureExportSettled(
  original: readonly ReadableSpan[],
  prepared: readonly ReadableSpan[],
  succeeded: boolean,
): void {
  if (state.owners.size === 0) return;
  const exported = new Map<string, ReadableSpan>();
  for (const span of prepared) exported.set(spanKey(span), span);
  for (const span of original) {
    if (span.name === 'neatlogs.trace.complete') {
      const scope = state.traces.get(span.spanContext().traceId);
      if (scope && (!succeeded || !exported.has(spanKey(span)))) scope.exportFailed = true;
      continue;
    }
    const id = spanKey(span);
    const scope = state.owners.get(id);
    const record = scope?.spans.get(id);
    if (!record || !scope || record.excluded) continue;
    const preparedSpan = exported.get(id);
    const incompleteMedia = preparedSpan && Object.entries(preparedSpan.attributes).some(([name, value]) =>
      name.endsWith('.media.capture_error') ||
      (/\.media\.\d+\.state$/.test(name) && (value === 'failed' || value === 'pending-upload')) ||
      (typeof value === 'string' && value.includes('[REDACTED_MEDIA_STRUCTURE]')),
    );
    record.delivered = succeeded && exported.has(id) && !incompleteMedia;
    if (!record.delivered) scope.exportFailed = true;
  }
}

export async function flushCaptureScope(scope: CaptureScope, timeoutMillis: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.all([...scope.flushers].map((flush) => Promise.resolve().then(flush))).then((results) => results.every(Boolean)),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMillis); }),
    ]);
  } catch { return false; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

export function captureScopeIncomplete(scope: CaptureScope): boolean {
  return [...scope.spans.values()].some((span) => !span.excluded && !span.ended);
}

export function captureScopeDeliveryFailed(scope: CaptureScope): boolean {
  return scope.oversized || scope.exportFailed || [...scope.spans.values()].some(
    (span) => !span.excluded && !span.delivered,
  );
}

export function capturedTraces(scope: CaptureScope): Array<{ traceId: string; spanIds: string[] }> {
  const roots = new Set([...scope.spans.values()]
    .filter((span) => span.root && !span.excluded && span.delivered)
    .map((span) => span.traceId));
  const traces = new Map<string, string[]>();
  for (const span of scope.spans.values()) {
    if (span.excluded || !span.delivered) continue;
    if (!roots.has(span.traceId)) throw new Error('Dataset capture requires root traces created inside its callback.');
    const ids = traces.get(span.traceId) ?? [];
    ids.push(span.spanId);
    traces.set(span.traceId, ids);
  }
  if (traces.size === 0) throw new Error('Capture produced no recorded root traces.');
  if (traces.size > 2000) throw new Error('Capture exceeds 2000 root traces.');
  return [...traces].map(([traceId, spanIds]) => ({ traceId, spanIds }));
}

export function releaseCaptureScope(scope: CaptureScope): void {
  scope.accepting = false;
  for (const [id, span] of scope.spans) {
    state.owners.delete(id);
    if (state.traces.get(span.traceId) === scope) state.traces.delete(span.traceId);
  }
  scope.spans.clear();
  scope.flushers.clear();
}

