/**
 * Session identity.
 *
 * A *session* is one conversation / thread / journey — it groups the multiple
 * traces of a multi-turn interaction (one turn = one trace). Identity is
 * declared once at a trace boundary — `init()` (process-global default),
 * `trace()` (per-turn), or `span()` (per root) — via the `sessionId` option on
 * those existing constructs. The SDK stamps only the trace's ROOT span; the
 * backend rolls the value up to group the traces of a session together.
 *
 * For single-turn workflows a session maps 1:1 to a trace: when no session is
 * declared the backend backfills `session_id = trace_id`.
 *
 * Canonical span attribute:
 *   `neatlogs.session.id` — the session identifier (string)
 */

import { type Span } from '@opentelemetry/api';
import { getLogger } from './logger.js';
import {
  currentParentSessionId,
  currentSessionEntryPoint,
  currentSessionFeatureName,
  currentSessionId,
} from './identity.js';

const logger = getLogger();

export const SESSION_ID_KEY = 'neatlogs.session.id';
export const PARENT_SESSION_ID_KEY = 'neatlogs.session.parent_id';
export const SESSION_FEATURE_NAME_KEY = 'neatlogs.session.feature.name';
export const SESSION_ENTRY_POINT_KEY = 'neatlogs.session.entry_point';

export interface SessionAttributeOptions {
  parentSessionId?: string;
  sessionFeatureName?: string;
  sessionEntryPoint?: string;
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function setAttributeFailOpen(span: Span, key: string, value: string): void {
  try {
    span.setAttribute(key, value);
  } catch (error) {
    logger.debug(`[session] Failed to set ${key}: ${error}`);
  }
}

/**
 * Stamp the session id onto a ROOT span (best-effort). When `isRoot` is false
 * the span is a child and the value is ignored — the backend reads session from
 * the root span and groups traces by it.
 */
export function applySessionAttributes(
  span: Span,
  sessionId?: string,
  isRoot = true,
  options: SessionAttributeOptions = {},
): void {
  // Resolution at the root: explicit per-call arg wins, else the identify()
  // context (request-scoped). Non-root spans never carry session identity.
  if (!isRoot) {
    if (
      sessionId ||
      options.parentSessionId ||
      options.sessionFeatureName ||
      options.sessionEntryPoint
    ) {
      logger.debug(
        '[session] Ignoring session attributes on a non-root span — declare them on the ' +
          'trace root (top-level trace()/span()) or identify().',
      );
    }
    return;
  }

  const resolvedSessionId = sessionId ?? currentSessionId();
  if (resolvedSessionId) {
    try {
      span.setAttribute(SESSION_ID_KEY, String(resolvedSessionId));
    } catch (error) {
      logger.debug(`[session] Failed to set ${SESSION_ID_KEY}: ${error}`);
    }
  }

  const parentSessionId = cleanOptionalString(
    options.parentSessionId ?? currentParentSessionId(),
  );
  const comparableSessionId = cleanOptionalString(resolvedSessionId);
  if (parentSessionId && parentSessionId !== comparableSessionId) {
    setAttributeFailOpen(span, PARENT_SESSION_ID_KEY, parentSessionId);
  }

  const sessionFeatureName = cleanOptionalString(
    options.sessionFeatureName ?? currentSessionFeatureName(),
  );
  if (sessionFeatureName) {
    setAttributeFailOpen(span, SESSION_FEATURE_NAME_KEY, sessionFeatureName);
  }

  const sessionEntryPoint = cleanOptionalString(
    options.sessionEntryPoint ?? currentSessionEntryPoint(),
  );
  if (sessionEntryPoint) {
    setAttributeFailOpen(span, SESSION_ENTRY_POINT_KEY, sessionEntryPoint);
  }
}
