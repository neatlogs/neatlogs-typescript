/**
 * End-user identity.
 *
 * The *end user* is the user of OUR CUSTOMER'S application — the person
 * interacting with the AI product our customer built. This is deliberately
 * distinct from the operator-level `userId` set in {@link init}, which identifies
 * whoever is running the SDK (a developer, a service account, a CI job).
 *
 * Model: **one end-user per trace.** Identity is declared once at a trace
 * boundary — `init()` (process-global default), `trace()` (per-request), or
 * `span()` (per root) — via new options on those existing constructs. There is
 * no separate `identify()` call and no nested per-span override: a trace belongs
 * to a single end-user.
 *
 * End-user identity belongs to the trace as a whole, so the SDK only stamps it
 * on the trace's ROOT span (any span kind, created via `trace()` / `span()`). A
 * non-root child span never carries it. The backend reads end-user from the root
 * span and rolls the value up to the trace (and its session) so
 * filtering/analytics are trace- and session-level, not per-span.
 *
 * Canonical span attributes:
 *   `neatlogs.end_user.id`        — the end-user identifier (string)
 *   `neatlogs.end_user.metadata`  — JSON object of arbitrary end-user fields
 */

import { trace as otelTrace, context as otelContext, type Span } from '@opentelemetry/api';
import { getLogger } from './logger.js';
import { currentEndUserId, currentEndUserMetadata } from './identity.js';

const logger = getLogger();

export const END_USER_ID_KEY = 'neatlogs.end_user.id';
export const END_USER_METADATA_KEY = 'neatlogs.end_user.metadata';

/** Coerce end-user metadata to a JSON string. Returns undefined when empty. */
export function normalizeEndUserMetadata(
  metadata: string | Record<string, any> | undefined | null,
): string | undefined {
  if (metadata === undefined || metadata === null) return undefined;
  if (typeof metadata === 'string') return metadata || undefined;
  try {
    return JSON.stringify(metadata);
  } catch {
    return JSON.stringify(String(metadata));
  }
}

/**
 * True when no recording span is currently active — i.e. a span created now
 * would be the trace root.
 */
export function isRootSpan(): boolean {
  const current = otelTrace.getSpan(otelContext.active());
  return !(current && current.isRecording());
}

/**
 * Stamp end-user id/metadata onto a ROOT span (best-effort). When `isRoot` is
 * false the span is a child and the value is ignored — the backend reads
 * end-user from the root span and rolls it up to the trace and session.
 */
export function applyEndUserAttributes(
  span: Span,
  endUserId?: string,
  endUserMetadata?: string | Record<string, any> | null,
  isRoot = true,
): void {
  // Resolution at the root (per field): explicit per-call arg wins, else the
  // identify() context (request-scoped). Non-root spans never carry identity.
  const resolvedId = isRoot ? (endUserId ?? currentEndUserId()) : endUserId;
  const resolvedMeta = isRoot
    ? (endUserMetadata ?? currentEndUserMetadata())
    : endUserMetadata;
  if (!resolvedId && !resolvedMeta) return;
  if (!isRoot) {
    logger.debug(
      '[end_user] Ignoring endUserId/endUserMetadata on a non-root span — ' +
        'declare it on the trace root (top-level trace()/span()) or identify().',
    );
    return;
  }
  if (resolvedId) {
    span.setAttribute(END_USER_ID_KEY, String(resolvedId));
  }
  const metaJson = normalizeEndUserMetadata(resolvedMeta);
  if (metaJson) {
    span.setAttribute(END_USER_METADATA_KEY, metaJson);
  }
}
