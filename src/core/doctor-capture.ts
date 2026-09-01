import { SpanStatusCode, type AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { DiagnosticEnvelope, DiagnosticSpan } from '../doctor-v2.js';

const MAX_TRACES = 16;
const traces = new Map<string, Map<string, DiagnosticSpan>>();
let latestTraceId: string | null = null;

function jsonValue(value: AttributeValue | undefined): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0] ?? '')) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function first(attributes: Readonly<Record<string, AttributeValue | undefined>>, keys: readonly string[]): unknown {
  for (const key of keys) if (attributes[key] !== undefined) return jsonValue(attributes[key]);
  return undefined;
}

function arrayValue(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function durationNs(span: ReadableSpan): number {
  return span.duration[0] * 1_000_000_000 + span.duration[1];
}

function startNs(span: ReadableSpan): number {
  return span.startTime[0] * 1_000_000_000 + span.startTime[1];
}

function normalizeKind(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/^Neatlogs\./i, '').toUpperCase()
    : 'INTERNAL';
}

function explodedToolCalls(attributes: Readonly<Record<string, AttributeValue | undefined>>): readonly Readonly<{ id: string; name?: string }>[] | undefined {
  const calls = new Map<number, { id?: string; name?: string }>();
  for (const [key, value] of Object.entries(attributes)) {
    const match = /^(?:neatlogs\.)?llm\.tool_calls\.(\d+)\.(id|name)$/.exec(key);
    if (!match || typeof value !== 'string') continue;
    const index = Number(match[1]);
    const call = calls.get(index) ?? {};
    call[match[2] as 'id' | 'name'] = value;
    calls.set(index, call);
  }
  const normalized = [...calls.entries()].sort(([left], [right]) => left - right).flatMap(([, call]) =>
    call.id ? [{ id: call.id, ...(call.name ? { name: call.name } : {}) }] : []);
  return normalized.length ? normalized : undefined;
}

function toDiagnosticSpan(span: ReadableSpan): DiagnosticSpan {
  const context = span.spanContext();
  const attributes = span.attributes;
  const choices = arrayValue(first(attributes, ['gen_ai.response.choices', 'neatlogs.llm.choices']));
  const toolCalls = arrayValue(first(attributes, ['gen_ai.assistant.tool_calls', 'neatlogs.llm.tool_calls']));
  const normalizedToolCalls = toolCalls?.filter((call): call is { id: string; name?: string } => !!call && typeof call === 'object' && typeof (call as { id?: unknown }).id === 'string') ?? explodedToolCalls(attributes);
  const streamFragments = arrayValue(first(attributes, ['gen_ai.stream.fragments', 'neatlogs.stream.fragments']));
  const kind = normalizeKind(attributes['neatlogs.span.kind'] ?? attributes['openinference.span.kind']);
  const toolCallId = first(attributes, ['neatlogs.tool.call_id', 'neatlogs.tool_call.id', 'tool_call_id']);
  const streaming = attributes['neatlogs.llm.is_streaming'] === true || attributes['neatlogs.tool.is_streaming'] === true || !!streamFragments;
  return Object.freeze({
    span_id: context.spanId,
    parent_span_id: span.parentSpanId ?? null,
    name: span.name,
    kind,
    status: span.status.code === SpanStatusCode.ERROR ? 'ERROR' : span.status.code === SpanStatusCode.OK ? 'OK' : 'UNSET',
    input: first(attributes, ['gen_ai.input.messages', 'input.value', 'neatlogs.input', 'neatlogs.llm.input']),
    output: first(attributes, ['gen_ai.output.messages', 'output.value', 'neatlogs.output', 'neatlogs.llm.output']),
    ...(choices ? { choices } : {}),
    ...(normalizedToolCalls?.length ? { tool_calls: normalizedToolCalls } : {}),
    ...(kind === 'TOOL' && typeof toolCallId === 'string' ? { tool_call: { id: toolCallId, ...(typeof attributes['neatlogs.tool.name'] === 'string' ? { name: attributes['neatlogs.tool.name'] } : {}) } } : {}),
    ...(streaming ? { streaming: true, ...(streamFragments ? { stream_fragments: streamFragments } : {}) } : {}),
    sampled: (context.traceFlags & 1) === 1,
    ended: true,
    start_time_ns: startNs(span),
    duration_ns: durationNs(span),
    attributes: Object.freeze({ ...attributes }),
  });
}

/** Capture the exact masked batch presented to the network exporter. */
export function capturePreparedSpans(spans: readonly ReadableSpan[]): void {
  for (const span of spans) {
    const traceId = span.spanContext().traceId;
    const current = traces.get(traceId) ?? new Map<string, DiagnosticSpan>();
    current.set(span.spanContext().spanId, toDiagnosticSpan(span));
    traces.delete(traceId);
    traces.set(traceId, current);
    latestTraceId = traceId;
  }
  while (traces.size > MAX_TRACES) traces.delete(traces.keys().next().value as string);
}

export function getCapturedEnvelope(traceId = latestTraceId ?? ''): DiagnosticEnvelope | null {
  const spans = traces.get(traceId);
  if (!spans?.size) return null;
  const values = [...spans.values()];
  const root = values.find((span) => span.parent_span_id === null);
  if (!root) return null;
  return Object.freeze({ trace_id: traceId, root_span_id: root.span_id, spans: Object.freeze(values) });
}

/** @internal Test/lifecycle reset. */
export function clearDoctorCapture(): void {
  traces.clear();
  latestTraceId = null;
}
