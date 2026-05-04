/**
 * InstrumentationManager — auto-discover and instrument libraries.
 *
 * Ported from Python: neatlogs/instrumentation/manager.py
 *
 * Priority order for each library:
 *   1. neatlogs custom instrumentor (if available)
 *   2. OpenInference (primary — rich semantic attributes)
 *   3. Skip — no instrumentor available
 */

import type { TracerProvider } from '@opentelemetry/api';
import { getLogger } from '../core/logger.js';
import { getLibraryInfo } from './registry.js';

const logger = getLogger();

export interface InstrumentationManagerOptions {
  provider: TracerProvider;
  debug?: boolean;
  excludedUrls?: string[];
}

export class InstrumentationManager {
  private provider: TracerProvider;
  private debug: boolean;
  private excludedUrls: string[];
  private _instrumented: string[] = [];

  constructor(options: InstrumentationManagerOptions) {
    this.provider = options.provider;
    this.debug = options.debug ?? false;
    this.excludedUrls = options.excludedUrls ?? [];
  }

  /** Get list of successfully instrumented libraries. */
  get instrumented(): string[] {
    return [...this._instrumented];
  }

  /**
   * Instrument HTTP (fetch/undici) for W3C traceparent context propagation.
   * Always called by init().
   */
  async instrumentHttp(): Promise<void> {
    // Build a hook that suppresses tracing for the SDK's own HTTP calls
    // (OTLP exporter, NeatlogsExporter batch endpoint, prompt client).
    const excludedUrls = this.excludedUrls;
    const ignoreOutgoingRequestHook = excludedUrls.length > 0
      ? (request: any) => {
          try {
            const url = typeof request === 'string'
              ? request
              : (request?.href ?? request?.path ?? '');
            return excludedUrls.some((excluded) => url.includes(excluded));
          } catch {
            return false;
          }
        }
      : undefined;

    try {
      // Instrument Node.js http/https modules for context propagation
      const { HttpInstrumentation } = await import(
        '@opentelemetry/instrumentation-http'
      );
      const httpInstr = new HttpInstrumentation({
        ...(ignoreOutgoingRequestHook ? { ignoreOutgoingRequestHook } : {}),
      });
      httpInstr.setTracerProvider(this.provider);
      httpInstr.enable();
      logger.debug('Instrumented http/https for context propagation');
    } catch {
      logger.debug('http instrumentation not available — skipping');
    }

    try {
      // Instrument undici (Node.js native fetch backend)
      const { UndiciInstrumentation } = await import(
        '@opentelemetry/instrumentation-undici'
      );
      const ignoreUndiciHook = excludedUrls.length > 0
        ? (request: any) => {
            try {
              const url = `${request?.origin ?? ''}${request?.path ?? ''}`;
              return excludedUrls.some((excluded) => url.includes(excluded));
            } catch {
              return false;
            }
          }
        : undefined;
      const undiciInstr = new UndiciInstrumentation({
        ...(ignoreUndiciHook ? { ignoreRequestHook: ignoreUndiciHook } : {}),
      });
      undiciInstr.setTracerProvider(this.provider);
      undiciInstr.enable();
      logger.debug('Instrumented undici for context propagation');
    } catch {
      logger.debug('undici instrumentation not available — skipping');
    }
  }

  /**
   * Instrument the specified libraries.
   * Priority: neatlogs custom > OpenInference > skip
   */
  async instrument(libraries: string[]): Promise<void> {
    for (const lib of libraries) {
      const info = getLibraryInfo(lib);
      if (!info) {
        logger.warn(
          `Unknown library '${lib}' — not in instrumentation registry. Skipping.`,
        );
        continue;
      }

      // Try neatlogs custom instrumentor first
      if (info.neatlogs) {
        try {
          const mod = await import(info.neatlogs);
          const InstrumentorClass =
            mod.default ?? mod[Object.keys(mod)[0]];
          if (InstrumentorClass && typeof InstrumentorClass === 'function') {
            const instrumentor = new (InstrumentorClass as new () => any)();
            if (typeof instrumentor.instrument === 'function') {
              instrumentor.instrument({ tracerProvider: this.provider });
              this._instrumented.push(lib);
              logger.debug(
                `Instrumented '${lib}' via neatlogs custom instrumentor`,
              );
              continue;
            }
          }
          logger.debug(
            `neatlogs instrumentor for '${lib}' loaded but has no instrument() method — trying OpenInference`,
          );
        } catch (err) {
          logger.debug(
            `neatlogs instrumentor for '${lib}' failed to load: ${err} — trying OpenInference`,
          );
        }
      }

      // Try OpenInference instrumentor
      if (info.openinference) {
        try {
          const mod = await import(info.openinference);
          // OpenInference instrumentors typically export a class named like OpenAIInstrumentation
          const InstrumentorClass =
            mod.default ??
            Object.values(mod).find(
              (v: unknown) =>
                typeof v === 'function' &&
                (v as { prototype?: { instrument?: unknown } }).prototype
                  ?.instrument,
            );
          if (InstrumentorClass && typeof InstrumentorClass === 'function') {
            const instrumentor = new (InstrumentorClass as new () => any)();
            if (typeof instrumentor.instrument === 'function') {
              instrumentor.instrument({ tracerProvider: this.provider });
              this._instrumented.push(lib);
              logger.debug(`Instrumented '${lib}' via OpenInference`);
              continue;
            }
          }
          // Some OpenInference packages export an instrumentor function directly
          if (
            typeof (mod as { instrument?: unknown }).instrument === 'function'
          ) {
            (mod as { instrument: (opts: { tracerProvider: TracerProvider }) => void }).instrument({
              tracerProvider: this.provider,
            });
            this._instrumented.push(lib);
            logger.debug(`Instrumented '${lib}' via OpenInference`);
            continue;
          }
          logger.warn(
            `OpenInference package for '${lib}' loaded but could not find instrumentor class`,
          );
        } catch (err) {
          logger.debug(
            `OpenInference instrumentor for '${lib}' not available: ${err}`,
          );
        }
      }

      // No instrumentor available
      if (!info.openinference && !info.neatlogs) {
        logger.debug(
          `'${lib}' instrumentation not yet available for TypeScript — skipping`,
        );
      }
    }

    if (this._instrumented.length > 0) {
      logger.info(`Instrumented: ${this._instrumented.join(', ')}`);
    }
  }
}
