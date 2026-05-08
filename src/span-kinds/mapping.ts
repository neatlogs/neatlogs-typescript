/**
 * Span kind constants and inference from span names.
 * Mirrors Python span_kinds/mapping.py.
 */

import type { SpanKind } from '../types.js';
import { VECTOR_DB_NAMES, RETRIEVAL_OPS } from './constants.js';

/** All valid span kinds for the span() decorator. */
export const VALID_SPAN_KINDS = new Set<SpanKind>([
  'WORKFLOW',
  'AGENT',
  'CHAIN',
  'TOOL',
  'RETRIEVER',
  'EMBEDDING',
  'MCP_TOOL',
  'GUARDRAIL',
]);

/** Extended span kinds that can appear in processed spans (from OpenInference). */
export const ALL_SPAN_KINDS = new Set<string>([
  ...VALID_SPAN_KINDS,
  'LLM',
  'RERANKER',
  'EVALUATOR',
  'VECTOR_STORE',
]);

/**
 * Infer OpenInference span kind from span name.
 * Distinguishes RETRIEVER (read ops) vs VECTOR_STORE (write ops) for vector DBs.
 */
export function inferSpanKindFromName(spanName: string): string {
  const nameLower = spanName.toLowerCase();

  // LLM operations
  if (
    ['openai', 'anthropic', 'cohere', 'bedrock', 'chat', 'completion', 'llm', 'gemini', 'google_genai'].some(
      (kw) => nameLower.includes(kw),
    )
  ) {
    return 'LLM';
  }

  // Embedding operations
  if (nameLower.includes('embed')) {
    return 'EMBEDDING';
  }

  // Vector DB: Distinguish RETRIEVER (read) vs VECTOR_STORE (write)
  if (VECTOR_DB_NAMES.some((db) => nameLower.includes(db))) {
    if (RETRIEVAL_OPS.some((kw) => nameLower.includes(kw))) {
      return 'RETRIEVER';
    }
    return 'VECTOR_STORE';
  }

  // Generic retrieval
  if (['retriev', 'search', 'query'].some((kw) => nameLower.includes(kw))) {
    return 'RETRIEVER';
  }

  // Reranker
  if (nameLower.includes('rerank')) {
    return 'RERANKER';
  }

  // Agent
  if (nameLower.includes('agent')) {
    return 'AGENT';
  }

  // Tool/function
  if (['tool', 'function'].some((kw) => nameLower.includes(kw))) {
    return 'TOOL';
  }

  // Guardrail
  if (['guardrail', 'validate', 'moderate', 'safety'].some((kw) => nameLower.includes(kw))) {
    return 'GUARDRAIL';
  }

  // Evaluator
  if (['evaluat', 'score', 'metric'].some((kw) => nameLower.includes(kw))) {
    return 'EVALUATOR';
  }

  // Default
  return 'CHAIN';
}
