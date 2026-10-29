import { SpanStatusCode, type Span } from "@opentelemetry/api";

/**
 * After a caller asks for the raw `Response` (`asResponse()`), the span stays
 * open instead of draining the body ourselves. It is finished by whichever of
 * these happens first:
 *
 * - the caller awaits the SDK promise (the parsed result finalizes it),
 * - the caller reads the body with `json()` or `text()` (we tap the parsed
 *   value they asked for, nothing is read early),
 * - the caller touches `body` (a raw stream we do not read),
 * - a grace period passes with none of the above (HTTP status only).
 *
 * The response object keeps its identity; only its read methods are wrapped.
 */
export const RAW_RESPONSE_GRACE_MS = 30_000;

export function observeRawResponse(
  response: any,
  span: Span,
  opts: { isStream: boolean; isTraced: () => boolean; finalize: (body: any) => void },
): void {
  let closed = false;
  const close = (body?: unknown) => {
    if (closed) return;
    // Once the caller awaits the SDK promise, its own parse owns the span.
    if (opts.isTraced()) {
      closed = true;
      clearTimeout(timer);
      return;
    }
    closed = true;
    clearTimeout(timer);
    if (!span.isRecording()) return;
    if (body !== undefined && !opts.isStream) {
      opts.finalize(body);
      return;
    }
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  };
  const timer = setTimeout(() => close(), RAW_RESPONSE_GRACE_MS);
  (timer as any).unref?.();

  try {
    const json = response.json?.bind(response);
    if (json) {
      response.json = () =>
        json().then(
          (body: unknown) => {
            close(body);
            return body;
          },
          (err: unknown) => {
            close();
            throw err;
          },
        );
    }
    const text = response.text?.bind(response);
    if (text) {
      response.text = () =>
        text().then(
          (raw: string) => {
            let body: unknown;
            try {
              body = JSON.parse(raw);
            } catch {
              body = undefined;
            }
            close(body);
            return raw;
          },
          (err: unknown) => {
            close();
            throw err;
          },
        );
    }
    const bodyOwner = Object.getPrototypeOf(response);
    const desc = bodyOwner && Object.getOwnPropertyDescriptor(bodyOwner, "body");
    if (desc?.get) {
      Object.defineProperty(response, "body", {
        configurable: true,
        get() {
          close();
          return desc.get!.call(response);
        },
      });
    }
  } catch {
    close();
  }
}
