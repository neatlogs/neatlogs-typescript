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
import { currentSessionId } from './identity.js';

const logger = getLogger();

export const SESSION_ID_KEY = 'neatlogs.session.id';

/**
 * Stamp the session id onto a ROOT span (best-effort). When `isRoot` is false
 * the span is a child and the value is ignored — the backend reads session from
 * the root span and groups traces by it.
 */
export function applySessionAttributes(
  span: Span,
  sessionId?: string,
  isRoot = true,
): void {
  // Resolution at the root: explicit per-call arg wins, else the identify()
  // context (request-scoped). Non-root spans never carry session identity.
  const resolved = isRoot ? (sessionId ?? currentSessionId()) : sessionId;
  if (!resolved) return;
  if (!isRoot) {
    logger.debug(
      '[session] Ignoring sessionId on a non-root span — declare it on the ' +
        'trace root (top-level trace()/span()) or identify().',
    );
    return;
  }
  span.setAttribute(SESSION_ID_KEY, String(resolved));
}
