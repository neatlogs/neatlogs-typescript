import { SpanKind, type Attributes } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

const HTTP_SCOPE_PREFIXES = [
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-fetch',
  '@opentelemetry/instrumentation-undici',
];

const HTTP_ATTRIBUTE_KEYS = [
  'http.method',
  'http.request.method',
  'http.url',
  'http.route',
  'url.full',
];

const SEMANTIC_AI_KINDS = new Set([
  'WORKFLOW',
  'AGENT',
  'CHAIN',
  'TOOL',
  'RETRIEVER',
  'EMBEDDING',
  'GUARDRAIL',
  'LLM',
  'RERANKER',
  'VECTOR_STORE',
  'TASK',
  'EVALUATOR',
  'LOG',
  'MEMORY',
  'MCP_TOOL',
]);

/** True only for transport HTTP spans, not semantic AI spans carrying HTTP metadata. */
export function isHttpSpan(
  span: ReadableSpan,
  attributes: Attributes = span.attributes ?? {},
): boolean {
  const neatlogsKind = String(attributes['neatlogs.span.kind'] ?? '').trim().toUpperCase();
  const openInferenceKind = String(attributes['openinference.span.kind'] ?? '')
    .trim()
    .toUpperCase();

  if (neatlogsKind === 'HTTP') return true;
  if (SEMANTIC_AI_KINDS.has(neatlogsKind)) return false;
  if (openInferenceKind === 'HTTP') return true;
  if (SEMANTIC_AI_KINDS.has(openInferenceKind)) return false;

  const scopeName = span.instrumentationLibrary.name ?? '';
  if (HTTP_SCOPE_PREFIXES.some((prefix) => scopeName.startsWith(prefix))) return true;

  return span.kind === SpanKind.CLIENT && HTTP_ATTRIBUTE_KEYS.some((key) => key in attributes);
}
