import { SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * A stop the caller asked for: an AbortController abort, or the OpenAI /
 * Anthropic SDK's own user-abort error (which has no distinct `name`).
 */
export function isAbortError(error: unknown): boolean {
  const e = error as { name?: unknown; constructor?: { name?: unknown } } | null | undefined;
  return e?.name === 'AbortError' || e?.constructor?.name === 'APIUserAbortError';
}

/** A deliberate stop (break / return() / abort) is never an error. Does not end the span. */
export function markCancelled(span: Span): void {
  span.setAttribute('neatlogs.stream.cancelled', true);
  span.setStatus({ code: SpanStatusCode.UNSET });
}

/**
 * A failure the provider reported inside its reply instead of throwing. There
 * is no Error to pass to recordException, so emit the same `exception` event
 * by hand. Does not end the span.
 */
export function recordReportedFailure(span: Span, type: string, message: string): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.addEvent('exception', {
    'exception.type': type,
    'exception.message': message,
  });
}

/** ERROR + exception for a thrown value; cancelled for an abort. Does not end the span. */
export function recordFailure(span: Span, error: unknown): void {
  if (isAbortError(error)) {
    markCancelled(span);
    return;
  }
  if (error instanceof Error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    return;
  }
  const reported = error as { name?: unknown; code?: unknown; message?: unknown } | null | undefined;
  if (reported && typeof reported === 'object' && typeof reported.message === 'string') {
    recordReportedFailure(span, String(reported.name ?? reported.code ?? 'Error'), reported.message);
    return;
  }
  span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
}
