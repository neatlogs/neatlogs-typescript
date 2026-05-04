/**
 * Structured logging for Neatlogs traces.
 *
 * The log() function captures timestamped steps within a trace,
 * emitting OTel LogRecords that are associated with the active span.
 */

import { context, trace } from '@opentelemetry/api';
import { getLogger } from './logger.js';

const logger = getLogger();

// Module-level reference to the OTel Logger, set during init()
let _otelLogger: any = null;
let _debugMode = false;

/**
 * Set the OTel logger instance. Called by init().
 * @internal
 */
export function _setOtelLogger(otelLogger: any, debug: boolean): void {
  _otelLogger = otelLogger;
  _debugMode = debug;
}

/**
 * Capture a timestamped log step within the current trace.
 *
 * @param msgTemplate - Message template with {key} placeholders
 * @param options - Optional key-value pairs for template rendering and attributes
 *
 * @example
 * ```typescript
 * log('Processing query: {query}', { query: 'What is TypeScript?', level: 'info' });
 * ```
 */
export function log(
  msgTemplate: string,
  options?: Record<string, any>,
): void {
  const { level = 'info', ...variables } = options ?? {};

  // Render template
  let rendered = msgTemplate;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }

  // Echo to console in debug mode
  if (_debugMode) {
    console.log(`[neatlogs:log] ${rendered}`);
  }

  // Emit OTel LogRecord if logger is available
  if (_otelLogger) {
    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();

    const attributes: Record<string, any> = {
      'log.template': msgTemplate,
      'log.level': level,
    };

    // Add template variables as log.{key} attributes
    for (const [key, value] of Object.entries(variables)) {
      attributes[`log.${key}`] = String(value);
    }

    try {
      _otelLogger.emit({
        body: rendered,
        attributes,
        ...(spanContext ? { spanContext } : {}),
      });
    } catch (err) {
      logger.warn(`Failed to emit log record: ${err}`);
    }
  }
}

/**
 * Capture stdout (console.log) within a callback and route to OTel logger.
 *
 * @internal — Not re-exported from the public API. Exposed only for testing.
 * @param fn - The function to execute while capturing stdout
 * @returns The return value of fn
 */
export async function captureStdout<T>(fn: () => T | Promise<T>): Promise<T> {
  if (!_otelLogger) {
    return fn();
  }

  const originalLog = console.log;
  const activeSpan = trace.getSpan(context.active());
  const spanContext = activeSpan?.spanContext();

  console.log = (...args: any[]) => {
    // Still output to console
    originalLog.apply(console, args);

    // Also emit as OTel log record
    const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    try {
      _otelLogger.emit({
        body: message,
        attributes: {
          'log.source': 'stdout',
          'log.level': 'info',
        },
        ...(spanContext ? { spanContext } : {}),
      });
    } catch {
      // Ignore errors in log capture
    }
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}
