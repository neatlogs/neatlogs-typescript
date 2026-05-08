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
export function applyMask(
  spanData: Record<string, any>,
  globalMask: MaskFunction | null | undefined,
): Record<string, any> | null {
  const maskId = spanData?.attributes?.['neatlogs.mask_id'];
  let maskFn: MaskFunction | undefined | null = null;

  if (maskId) {
    maskFn = _MASK_REGISTRY.get(String(maskId)) ?? null;
  }

  if (!maskFn) {
    maskFn = globalMask ?? null;
  }

  if (!maskFn) {
    return spanData;
  }

  try {
    const result = maskFn(spanData);
    // null means "drop this span entirely"; undefined means "keep original"
    if (result === null) return null;
    return result !== undefined ? result : spanData;
  } catch (exc) {
    logger.warn(
      `mask callable raised an exception for span '${spanData?.name}': ${exc} — original span data will be exported unchanged.`,
    );
    return spanData;
  }
}

/**
 * Clear all registered masks. Used for testing.
 * @internal
 */
export function _clearMaskRegistry(): void {
  _MASK_REGISTRY.clear();
  _nextId = 0;
}
