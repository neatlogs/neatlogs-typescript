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
import { getLibraryInfo, type LibraryInfo } from './registry.js';

const logger = getLogger();

export interface InstrumentationManagerOptions {
  provider: TracerProvider;
  debug?: boolean;
}

/**
 * Build the rejection message for a manager-loaded instrumentor
 * that isn't isolation-safe. Names the explicit, fully-isolated wrapper when the
 * registry knows one.
 */
function isolationRejectionMessage(lib: string, info: LibraryInfo): string {
  const alt = info.explicitWrapper
    ? `Use ${info.explicitWrapper} for isolated tracing`
    : `Use an explicit Neatlogs wrapper for isolated tracing if one exists`;
  return (
    `The "${lib}" auto-instrumentation uses the global OpenTelemetry context ` +
    `and cannot guarantee isolation from other tracing SDKs (Datadog, etc.).\n\n` +
    `${alt}. Neatlogs does not support shared global-context instrumentation.`
  );
}

/**
 * Throw if any requested library's auto-instrumentor would drive the global OTel
 * context under isolation. A PURE function of the registry + the requested set —
 * it touches no provider or module state — so `init()` can call it BEFORE creating
 * or installing the private provider, keeping initialization atomic: a rejected
 * `init()` leaves no abandoned provider or half-set state behind. The manager's
 * own instance gate delegates here too (for direct manager users).
 */
export function assertInstrumentationsIsolationSafe(libraries: string[]): void {
  for (const lib of libraries) {
    const info = getLibraryInfo(lib);
    // Only reject libs that actually LOAD an instrumentor (openinference or
    // neatlogs package set). A registry entry with both null is a no-op kept only
    // for scope detection/tagging — it patches nothing, so nothing can leak
    // through the global context. Unknown libs (info undefined) likewise can't leak.
    const loadsInstrumentor = !!(info && (info.openinference || info.neatlogs));
    if (info && loadsInstrumentor && !info.isolationSafe) {
      throw new Error(isolationRejectionMessage(lib, info));
    }
  }
}

export class InstrumentationManager {
  private provider: TracerProvider;
  private _instrumented: string[] = [];
  // Retained so shutdown() can disable them (unpatch the target module) — else a
  // stale instrumentor stays bound to the shut-down provider across reinit.
  private _instances: Array<{ lib: string; instance: any }> = [];

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
   *
   * This first rejects (throws) any requested library whose
   * registry entry is not `isolationSafe`: those instrumentors create/activate
   * spans on the global OTel context, which a private provider cannot isolate in
   * either direction. Failing here (before patching anything) keeps the isolation
   * guarantee strict rather than best-effort.
   */
  async instrument(libraries: string[]): Promise<void> {
    assertInstrumentationsIsolationSafe(libraries);

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
              this._instances.push({ lib, instance: instrumentor });
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
              this._instances.push({ lib, instance: instrumentor });
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
              this._instances.push({ lib, instance: instrumentor });
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
                  this._instances.push({ lib, instance: instrumentor });
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
              this._instances.push({ lib, instance: instrumentor });
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

  /**
   * Disable every instrumentor this manager installed, unpatching the target
   * modules so they stop emitting spans against the (now shut-down) provider.
   * Called from shutdown() so a subsequent init() rebinds cleanly instead of
   * leaving a stale instrumentor pointed at a dead provider.
   */
  disable(): void {
    for (const { lib, instance } of this._instances) {
      try {
        if (typeof instance.disable === 'function') {
          instance.disable();
        } else if (typeof instance.uninstrument === 'function') {
          instance.uninstrument();
        }
      } catch (e) {
        logger.debug(`Failed to disable instrumentor for '${lib}': ${e}`);
      }
    }
    this._instances = [];
    this._instrumented = [];
  }
}
