/**
 * Neatlogs trace doctor — input/output attribute checks.
 *
 * Per-kind rules (from Section 4.9 of the handoff):
 *
 *   llm        Input  = neatlogs.llm.input_messages.N.content (any non-empty
 *                      string), OR neatlogs.llm.input, OR a non-empty
 *                      neatlogs.llm.system_prompt. Output = at least one
 *                      neatlogs.llm.output_messages.N.content (non-empty), OR
 *                      a non-empty neatlogs.llm.output. ROLE alone does
 *                      not count (that's metadata).
 *   tool       Input  = neatlogs.tool.input OR neatlogs.tool.parameters,
 *                      non-empty after JSON-decode (if it's a string) or
 *                      non-{} dict. Output = neatlogs.tool.output, same rule.
 *   retriever  Input  = neatlogs.retriever.input OR neatlogs.retriever.query,
 *                      non-empty string. Output = neatlogs.retriever.output
 *                      OR any neatlogs.retriever.documents.* entry.
 *   embedding  Input  = neatlogs.embedding.text (non-empty string). Output
 *                      = neatlogs.embedding.dimensions OR
 *                      neatlogs.embedding.count.
 */

import { truncate } from './visibility.js';
import type { SpanDict } from './types.js';

/** Read a value that may be a JSON string or a structured value. */
function asJsonValue(v: unknown): unknown {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as unknown;
    } catch {
      return v;
    }
  }
  return v;
}

/** True if the value is "non-empty" (not null/empty string/empty array/empty object). */
function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  if (typeof v === 'number' || typeof v === 'boolean') return true;
  return false;
}

/** True if the LLM span has a meaningful input. */
function llmHasMeaningfulInput(attrs: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(attrs)) {
    if (!key.startsWith('neatlogs.llm.input_messages.') || !key.endsWith('.content')) {
      continue;
    }
    if (typeof value === 'string' && value.trim()) return true;
    // Structured content (list / dict) also counts — but not bool.
    if (value !== null && value !== undefined && typeof value !== 'boolean') {
      const decoded = asJsonValue(value);
      if (isNonEmpty(decoded)) return true;
    }
  }
  // Fall back to single-input / system-prompt keys.
  for (const key of ['neatlogs.llm.input', 'neatlogs.llm.system_prompt']) {
    const v = attrs[key];
    if (typeof v === 'string' && v.trim()) return true;
    if (v !== null && v !== undefined && typeof v !== 'boolean') {
      const decoded = asJsonValue(v);
      if (isNonEmpty(decoded)) return true;
    }
  }
  return false;
}

/** True if the LLM span has a meaningful output. */
function llmHasMeaningfulOutput(attrs: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(attrs)) {
    if (!key.startsWith('neatlogs.llm.output_messages.') || !key.endsWith('.content')) {
      continue;
    }
    if (typeof value === 'string' && value.trim()) return true;
    if (value !== null && value !== undefined) {
      const decoded = asJsonValue(value);
      if (isNonEmpty(decoded)) return true;
    }
  }
  const v = attrs['neatlogs.llm.output'];
  if (v === null || v === undefined) return false;
  const decoded = asJsonValue(v);
  return isNonEmpty(decoded);
}

/** Per-kind: does this span have a meaningful input attribute? */
export function hasInput(kind: string, attrs: Record<string, unknown>): boolean {
  if (kind === 'llm') return llmHasMeaningfulInput(attrs);
  if (kind === 'embedding') {
    const v = attrs['neatlogs.embedding.text'];
    return typeof v === 'string' && v.trim().length > 0;
  }
  if (kind === 'tool') {
    for (const key of ['neatlogs.tool.input', 'neatlogs.tool.parameters']) {
      const v = attrs[key];
      if (v === null || v === undefined) continue;
      if (v === '' || v === '[]' || v === '{}') continue;
      const decoded = asJsonValue(v);
      if (isNonEmpty(decoded)) return true;
    }
    return false;
  }
  if (kind === 'retriever') {
    for (const key of ['neatlogs.retriever.input', 'neatlogs.retriever.query']) {
      const v = attrs[key];
      if (typeof v === 'string' && v.trim()) return true;
    }
    return false;
  }
  return false;
}

/** Per-kind: does this span have a meaningful output attribute? */
export function hasOutput(kind: string, attrs: Record<string, unknown>): boolean {
  if (kind === 'llm') return llmHasMeaningfulOutput(attrs);
  if (kind === 'tool') {
    const v = attrs['neatlogs.tool.output'];
    if (v === null || v === undefined) return false;
    const decoded = asJsonValue(v);
    return isNonEmpty(decoded);
  }
  if (kind === 'retriever') {
    const v = attrs['neatlogs.retriever.output'];
    if (v !== null && v !== undefined) {
      const decoded = asJsonValue(v);
      if (isNonEmpty(decoded)) return true;
    }
    for (const [key, value] of Object.entries(attrs)) {
      if (!key.startsWith('neatlogs.retriever.documents.')) continue;
      if (value === null || value === undefined) continue;
      const decoded = asJsonValue(value);
      if (isNonEmpty(decoded)) return true;
    }
    return false;
  }
  if (kind === 'embedding') {
    if (attrs['neatlogs.embedding.dimensions'] !== undefined) return true;
    if (attrs['neatlogs.embedding.count'] !== undefined) return true;
    return false;
  }
  return false;
}

/** Read the span's attributes dict, returning {} when absent or wrong type. */
export function readAttrs(span: SpanDict): Record<string, unknown> {
  const attrs = span.attributes;
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    return attrs as Record<string, unknown>;
  }
  return {};
}

/** Re-export `truncate` so callers can grab it from one module. */
export { truncate };
