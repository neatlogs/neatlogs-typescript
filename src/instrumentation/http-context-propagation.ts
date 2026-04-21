/**
 * HTTP context propagation utilities.
 * The actual instrumentation is handled by @opentelemetry/instrumentation-fetch
 * and @opentelemetry/instrumentation-undici in InstrumentationManager.
 */

export const SUPPRESS_INSTRUMENTATION_KEY = Symbol.for(
  'OpenTelemetry SDK suppress instrumentation',
);
