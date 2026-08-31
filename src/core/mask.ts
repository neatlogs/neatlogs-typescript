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
const MAX_MASK_VALUE_DEPTH = 32;

let _nextId = 0;

type SerializedShape =
  | { kind: 'json'; inner: SerializedShape }
  | { kind: 'array'; children: SerializedShape[] }
  | { kind: 'object'; children: Record<string, SerializedShape> }
  | { kind: 'scalar' };

/**
 * Clone a telemetry envelope and materialize JSON-encoded values for the mask
 * callback. OTel attributes commonly contain JSON strings; treating those as
 * opaque text is an easy way for an otherwise-recursive redactor to miss a
 * nested credential. The matching shape restores the wire representation after
 * the callback without ever mutating application-owned data.
 */
function prepareMaskValue(value: any, depth = 0): [any, SerializedShape] {
  if (depth >= MAX_MASK_VALUE_DEPTH) {
    // Keep over-depth values opaque without exposing application-owned mutable
    // references to the callback.
    return [structuredClone(value), { kind: 'scalar' }];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        const [prepared, inner] = prepareMaskValue(parsed, depth + 1);
        return [prepared, { kind: 'json', inner }];
      } catch {
        // Ordinary strings and malformed JSON remain ordinary strings.
      }
    }
    return [value, { kind: 'scalar' }];
  }
  if (Array.isArray(value)) {
    const pairs = value.map((item) => prepareMaskValue(item, depth + 1));
    return [pairs.map(([item]) => item), { kind: 'array', children: pairs.map(([, shape]) => shape) }];
  }
  if (value && typeof value === 'object') {
    const output: Record<string, any> = {};
    const children: Record<string, SerializedShape> = {};
    for (const [key, item] of Object.entries(value)) {
      const [prepared, shape] = prepareMaskValue(item, depth + 1);
      output[key] = prepared;
      children[key] = shape;
    }
    return [output, { kind: 'object', children }];
  }
  return [value, { kind: 'scalar' }];
}

function restoreMaskValue(value: any, shape: SerializedShape, depth = 0): any {
  if (depth >= MAX_MASK_VALUE_DEPTH) return value;
  if (shape.kind === 'json') {
    if (value === undefined) return undefined;
    // Preserve whole-value replacements made using the existing string wire
    // contract; serializing again here would produce a quoted JSON string.
    if (typeof value === 'string') return value;
    return JSON.stringify(restoreMaskValue(value, shape.inner, depth + 1));
  }
  if (shape.kind === 'array' && Array.isArray(value)) {
    return value.map((item, index) =>
      restoreMaskValue(item, shape.children[index] ?? { kind: 'scalar' }, depth + 1));
  }
  if (shape.kind === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const output: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = restoreMaskValue(item, shape.children[key] ?? { kind: 'scalar' }, depth + 1);
    }
    return output;
  }
  return value;
}

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
    const [candidate, shape] = prepareMaskValue(spanData);
    const candidateBeforeMask = JSON.stringify(candidate);
    const invocation = Promise.resolve().then(() => maskFn(candidate));
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`mask timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    const result = await Promise.race([invocation, timeout]);
    // null means "drop this span entirely"; undefined means "keep original"
    if (result === null) return null;
    if (result === undefined) return spanData;
    if (result === candidate && JSON.stringify(candidate) === candidateBeforeMask) {
      return spanData;
    }
    const masked = result;
    if (!masked || typeof masked !== 'object' || Array.isArray(masked)) {
      throw new TypeError('mask must return a span object or null');
    }
    return restoreMaskValue(masked, shape);
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
