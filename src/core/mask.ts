/**
 * PII masking support for Neatlogs spans.
 *
 * Users supply a callable that receives the full span dict and returns
 * the (possibly modified) span dict. Return null to drop the span entirely.
 */

import type { MaskFunction } from '../types.js';
import { getLogger } from './logger.js';

const logger = getLogger();

/** Module-level registry: key -> mask function */
const _MASK_REGISTRY = new Map<string, MaskFunction>();
const _MASK_RESULTS = new WeakMap<object, Promise<Record<string, any> | null>>();
const DEFAULT_MASK_TIMEOUT_MS = 5_000;

let _nextId = 0;

/**
 * Register a mask function and return its lookup key.
 */
export function registerMask(fn: MaskFunction): string {
  const key = String(++_nextId);
  _MASK_REGISTRY.set(key, fn);
  return key;
}

/**
 * Apply the effective mask function to span data.
 *
 * Per-span mask (stored in attributes["neatlogs.mask_id"]) takes
 * precedence over the global mask. Returns the (possibly modified) dict.
 */
function effectiveMask(
  spanData: Record<string, any>,
  globalMask: MaskFunction | null | undefined,
): MaskFunction | null {
  const maskId = spanData?.attributes?.['neatlogs.mask_id'];
  let maskFn: MaskFunction | undefined | null = null;

  if (maskId) {
    maskFn = _MASK_REGISTRY.get(String(maskId)) ?? null;
  }

  if (!maskFn) {
    maskFn = globalMask ?? null;
  }

  return maskFn;
}

export async function applyMask(
  spanData: Record<string, any>,
  globalMask: MaskFunction | null | undefined,
  timeoutMs = DEFAULT_MASK_TIMEOUT_MS,
): Promise<Record<string, any> | null> {
  const maskFn = effectiveMask(spanData, globalMask);
  if (!maskFn) return spanData;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const invocation = Promise.resolve().then(() => maskFn(spanData));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`mask timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    const result = await Promise.race([invocation, timeout]);
    // null means "drop this span entirely"; undefined means "keep original"
    if (result === null) return null;
    return result !== undefined ? result : spanData;
  } catch (exc) {
    logger.error(
      `mask callable failed for span '${spanData?.name}': ${exc} — dropping the span to prevent unmasked export.`,
    );
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function scheduleMask(
  span: object,
  spanData: Record<string, any>,
  globalMask: MaskFunction | null | undefined,
  timeoutMs?: number,
): Promise<Record<string, any> | null> {
  const result = applyMask(spanData, globalMask, timeoutMs);
  _MASK_RESULTS.set(span, result);
  return result;
}

export function getScheduledMask(
  span: object,
): Promise<Record<string, any> | null> | undefined {
  return _MASK_RESULTS.get(span);
}

/**
 * Clear all registered masks. Used for testing.
 * @internal
 */
export function _clearMaskRegistry(): void {
  _MASK_REGISTRY.clear();
  _nextId = 0;
}
