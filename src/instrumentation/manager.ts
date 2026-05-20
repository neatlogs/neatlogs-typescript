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
}

export class InstrumentationManager {
  private provider: TracerProvider;
  private _instrumented: string[] = [];

  constructor(options: InstrumentationManagerOptions) {
    this.provider = options.provider;
  }

  /** Get list of successfully instrumented libraries. */
  get instrumented(): string[] {
    return [...this._instrumented];
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
          // When importing a CJS package from ESM, mod.default may be the
          // CJS namespace object (an object, not a function). Prefer a
          // function export explicitly to avoid picking the wrong value.
          const InstrumentorClass =
            (typeof mod.default === 'function' ? mod.default : undefined) ??
            Object.values(mod).find(
              (v: unknown) =>
                typeof v === 'function' &&
                (v as { prototype?: { instrument?: unknown } }).prototype
                  ?.instrument,
            ) ??
            (typeof mod[Object.keys(mod)[0]] === 'function' ? mod[Object.keys(mod)[0]] : undefined);
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
            if (typeof instrumentor.setTracerProvider === 'function' && typeof instrumentor.enable === 'function') {
              instrumentor.setTracerProvider(this.provider);
              instrumentor.enable();
              // Eagerly patch target module for ESM environments where
              // OTel module hooks don't fire (e.g. tsx, dynamic imports)
              if (typeof instrumentor.patchEager === 'function' && info.npm_package) {
                try {
                  const targetMod = await import(info.npm_package);
                  instrumentor.patchEager(targetMod);
                } catch (e) {
                  logger.debug(
                    `Eager patch for '${lib}' skipped — ${info.npm_package} not available: ${e}`,
                  );
                }
              }
              this._instrumented.push(lib);
              logger.debug(
                `Instrumented '${lib}' via neatlogs OTel instrumentor`,
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
          // OpenInference instrumentors export a class like LangChainInstrumentation, OpenAIInstrumentation
          const InstrumentorClass =
            mod.default ??
            Object.values(mod).find(
              (v: unknown) =>
                typeof v === 'function' &&
                (v as { prototype?: Record<string, unknown> }).prototype &&
                ('instrument' in (v as { prototype: Record<string, unknown> }).prototype ||
                 'manuallyInstrument' in (v as { prototype: Record<string, unknown> }).prototype),
            );
          if (InstrumentorClass && typeof InstrumentorClass === 'function') {
            const instrumentor = new (InstrumentorClass as new () => any)();
            // Pattern 1: instrument({ tracerProvider })
            if (typeof instrumentor.instrument === 'function') {
              instrumentor.instrument({ tracerProvider: this.provider });
              this._instrumented.push(lib);
              logger.debug(`Instrumented '${lib}' via OpenInference`);
              continue;
            }
            // Pattern 2: setTracerProvider + manuallyInstrument (OpenInference ESM pattern)
            if (typeof instrumentor.setTracerProvider === 'function' &&
                typeof instrumentor.manuallyInstrument === 'function') {
              instrumentor.setTracerProvider(this.provider);
              if (info.npm_package) {
                try {
                  const targetMod = await import(info.npm_package);
                  instrumentor.manuallyInstrument(targetMod);
                  this._instrumented.push(lib);
                  logger.debug(`Instrumented '${lib}' via OpenInference (manual patch)`);
                  continue;
                } catch (importErr) {
                  logger.debug(
                    `Could not import '${info.npm_package}' for manual instrumentation of '${lib}': ${importErr}`,
                  );
                }
              }
              // No npm_package or import failed — still mark as instrumented
              // since setTracerProvider was called (Node module hooks may still fire for CJS)
              this._instrumented.push(lib);
              logger.debug(`Instrumented '${lib}' via OpenInference (tracer set, awaiting module hook)`);
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
