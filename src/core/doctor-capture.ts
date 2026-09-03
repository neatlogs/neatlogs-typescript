import { SpanStatusCode, type AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { AttributeMapper } from '../config/attribute-mapper.js';
import { utf8ByteLength } from '../constants.js';
import type { DiagnosticEnvelope, DiagnosticSpan } from '../doctor-v2.js';

const MAX_TRACES = 16;
const MAX_SPANS_PER_TRACE = 64;
const MAX_BYTES_PER_TRACE = 256 * 1024;
const MAX_STREAM_EVENTS_PER_SPAN = 128;
const COMPLETION_MARKER = 'neatlogs.trace.complete';
const mapper = new AttributeMapper();

type CapturedTrace = {
  readonly spans: Map<string, DiagnosticSpan>;
  readonly spanBytes: Map<string, number>;
  bytes: number;
  droppedSpans: number;
};

const traces = new Map<string, CapturedTrace>();
let latestTraceId: string | null = null;

function jsonValue(value: AttributeValue | undefined): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0] ?? '')) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function first(
  attributes: Readonly<Record<string, AttributeValue | undefined>>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (attributes[key] !== undefined) return jsonValue(attributes[key]);
  }
  return undefined;
}

function arrayValue(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function indexedMessages(
  attributes: Readonly<Record<string, AttributeValue | undefined>>,
  direction: 'input' | 'output',
): readonly Readonly<Record<string, unknown>>[] | undefined {
  const messages = new Map<number, Record<string, unknown>>();
  const pattern = new RegExp(
    `^neatlogs\\.llm\\.${direction}_messages\\.(\\d+)\\.(role|content|tool_call_id|name)$`,
  );
  for (const [key, value] of Object.entries(attributes)) {
    const match = pattern.exec(key);
    if (!match || value === undefined) continue;
    const index = Number(match[1]);
    const message = messages.get(index) ?? {};
    message[match[2] as string] = jsonValue(value);
    messages.set(index, message);
  }
  const normalized = [...messages.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, message]) => Object.freeze(message));
  return normalized.length ? Object.freeze(normalized) : undefined;
}

function payloadReferences(
  attributes: Readonly<Record<string, AttributeValue | undefined>>,
): readonly Readonly<{ digest: string; size: number; mime_type: string }>[] | undefined {
  const references = new Map<string, { sha256?: string; byte_length?: number; mime_type?: string }>();
  const pattern = /^neatlogs\.llm\.(?:input|output)_messages\.(\d+)\.media\.(\d+)\.(sha256|byte_length|mime_type)$/;
  for (const [key, value] of Object.entries(attributes)) {
    const match = pattern.exec(key);
    if (!match) continue;
    const referenceKey = `${match[1]}:${match[2]}:${key.includes('.input_messages.') ? 'input' : 'output'}`;
    const reference = references.get(referenceKey) ?? {};
    if (match[3] === 'sha256' && typeof value === 'string') reference.sha256 = value;
    if (match[3] === 'byte_length' && typeof value === 'number') reference.byte_length = value;
    if (match[3] === 'mime_type' && typeof value === 'string') reference.mime_type = value;
    references.set(referenceKey, reference);
  }
  const normalized = [...references.values()].flatMap((reference) =>
    reference.sha256 && Number.isFinite(reference.byte_length) && (reference.byte_length ?? 0) > 0 && reference.mime_type
      ? [{
          digest: `sha256:${reference.sha256}`,
          size: reference.byte_length as number,
          mime_type: reference.mime_type,
        }]
      : []);
  return normalized.length ? Object.freeze(normalized.map((reference) => Object.freeze(reference))) : undefined;
}

function durationNs(span: ReadableSpan): number {
  return span.duration[0] * 1_000_000_000 + span.duration[1];
}

function attributeBytes(value: AttributeValue | undefined, limit: number): number {
  limit = Math.max(0, limit);
  if (value === undefined) return 0;
  if (typeof value === 'string') return utf8ByteLength(value, limit);
  if (Array.isArray(value)) {
    let bytes = 0;
    for (const item of value) {
      bytes += typeof item === 'string' ? utf8ByteLength(item, limit - bytes) : 16;
      if (bytes > limit) return limit + 1;
    }
    return bytes;
  }
  return 16;
}

function exceedsRawProjectionBudget(span: ReadableSpan, limit: number): boolean {
  // Reject a hostile diagnostic field before JSON parsing or projection can
  // duplicate it. The complete span still belongs to the normal exporter.
  let bytes = 512;
  if (limit <= bytes) return true;
  for (const [key, value] of Object.entries(span.attributes)) {
    if (!(
      key === 'input.value' || key === 'output.value' ||
      key === 'openinference.span.kind' || key === 'neatlogs.span.kind' ||
      key.startsWith('neatlogs.doctor') || key.startsWith('telemetry.sdk.') ||
      key === 'service.name' || key.startsWith('neatlogs.llm.input_messages.') ||
      key.startsWith('neatlogs.llm.output_messages.') ||
      key.startsWith('neatlogs.llm.tool_calls.') ||
      key.startsWith('neatlogs.llm.token_count.')
    )) continue;
    const remaining = Math.max(0, limit - bytes);
    bytes += utf8ByteLength(key, remaining) + attributeBytes(value, remaining);
    if (bytes > limit) return true;
  }
  let streamEvents = 0;
  for (const event of span.events) {
    if (event.name !== 'neatlogs.stream.chunk') continue;
    streamEvents += 1;
    if (streamEvents > MAX_STREAM_EVENTS_PER_SPAN) break;
    bytes += attributeBytes(
      event.attributes?.['neatlogs.stream.chunk.summary'],
      Math.max(0, limit - bytes),
    );
    if (bytes > limit) return true;
  }
  return false;
}

function startNs(span: ReadableSpan): number {
  return span.startTime[0] * 1_000_000_000 + span.startTime[1];
}

function normalizeKind(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/^Neatlogs\./i, '').toUpperCase()
    : 'INTERNAL';
}

function indexedToolCalls(
  attributes: Readonly<Record<string, AttributeValue | undefined>>,
): readonly Readonly<{
  id: string;
  name?: string;
  arguments?: unknown;
  choice_index?: number;
  tool_call_index?: number;
}>[] | undefined {
  const calls = new Map<number, Record<string, unknown>>();
  for (const [key, value] of Object.entries(attributes)) {
    const match = /^neatlogs\.llm\.tool_calls\.(\d+)\.(id|name|arguments|choice_index|tool_call_index)$/.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const call = calls.get(index) ?? {};
    call[match[2] as string] = jsonValue(value);
    calls.set(index, call);
  }
  const normalized = [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, call]) => typeof call.id === 'string'
      ? [{
          id: call.id,
          ...(typeof call.name === 'string' ? { name: call.name } : {}),
          ...(call.arguments !== undefined ? { arguments: call.arguments } : {}),
          ...(typeof call.choice_index === 'number' ? { choice_index: call.choice_index } : {}),
          ...(typeof call.tool_call_index === 'number' ? { tool_call_index: call.tool_call_index } : {}),
        }]
      : []);
  return normalized.length ? normalized : undefined;
}

function normalizedChoices(
  value: unknown,
  attributes: Readonly<Record<string, AttributeValue | undefined>>,
): readonly Readonly<Record<string, unknown>>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const choices = value.map((raw, index) => {
    const record: Record<string, unknown> =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : { content: raw };
    const explicitIndex = typeof record.index === 'number' ? record.index : index;
    const message = record.message && typeof record.message === 'object' && !Array.isArray(record.message)
      ? record.message
      : Object.fromEntries(
        ['role', 'content', 'name', 'tool_call_id']
          .filter((key) => record[key] !== undefined)
          .map((key) => [key, record[key]]),
      );
    const finish = attributes[`neatlogs.llm.choices.${explicitIndex}.finish_reason`] ??
      record.finish_reason;
    return Object.freeze({
      index: explicitIndex,
      message: Object.freeze({ ...(message as Record<string, unknown>) }),
      ...(finish !== undefined ? { finish_reason: jsonValue(finish as AttributeValue) } : {}),
    });
  });
  return choices.length ? Object.freeze(choices) : undefined;
}

function streamFragments(span: ReadableSpan): readonly unknown[] | undefined {
  const fragments = span.events
    .filter((event) => event.name === 'neatlogs.stream.chunk')
    .slice(0, MAX_STREAM_EVENTS_PER_SPAN)
    .map((event) => jsonValue(event.attributes?.['neatlogs.stream.chunk.summary']));
  return fragments.length ? fragments : undefined;
}

function diagnosticAttributes(
  attributes: Readonly<Record<string, AttributeValue | undefined>>,
): Readonly<Record<string, unknown>> {
  const allowed = [
    'neatlogs.doctor',
    'neatlogs.doctor.version',
    'service.name',
    'telemetry.sdk.language',
    'telemetry.sdk.version',
    'neatlogs.span.kind',
    'neatlogs.llm.token_count.prompt',
    'neatlogs.llm.token_count.completion',
    'neatlogs.llm.token_count.total',
    'gen_ai.operation.name',
    'http.response.status_code',
    'error.type',
    'retry-after',
    'retry_after',
    'neatlogs.llm.rate_limit_remaining',
  ] as const;
  return Object.freeze(Object.fromEntries(
    allowed.flatMap((key) => attributes[key] === undefined
      ? []
      : [[key, jsonValue(attributes[key])]]),
  ));
}

function toDiagnosticSpan(span: ReadableSpan): DiagnosticSpan {
  const context = span.spanContext();
  const attributes = mapper.mapAttributes({ ...span.attributes });
  const kind = normalizeKind(attributes['neatlogs.span.kind']);
  const kindKey = kind.toLowerCase();
  const choicesValue = jsonValue(attributes['neatlogs.llm.generation_choices']);
  const inputMessages = kind === 'LLM' ? indexedMessages(attributes, 'input') : undefined;
  const outputMessages = kind === 'LLM' ? indexedMessages(attributes, 'output') : undefined;
  const choices = normalizedChoices(arrayValue(choicesValue) ?? outputMessages, attributes);
  const expectedChoiceCount = typeof choicesValue === 'number' && Number.isInteger(choicesValue)
    ? choicesValue
    : choices?.length;
  const toolCalls = indexedToolCalls(attributes);
  const fragments = streamFragments(span);
  const references = payloadReferences(attributes);
  const oversized = attributes['neatlogs.capture.truncated'] === true;
  const toolCallId = first(attributes, ['neatlogs.tool_call.id']);
  const streaming = attributes['neatlogs.llm.is_streaming'] === true ||
    attributes['neatlogs.tool.is_streaming'] === true ||
    fragments !== undefined;

  return Object.freeze({
    span_id: context.spanId,
    parent_span_id: span.parentSpanId ?? null,
    name: span.name,
    kind,
    status: span.status.code === SpanStatusCode.ERROR
      ? 'ERROR'
      : span.status.code === SpanStatusCode.OK
        ? 'OK'
        : 'UNSET',
    input: first(attributes, [`neatlogs.${kindKey}.input`]) ?? inputMessages,
    output: first(attributes, [`neatlogs.${kindKey}.output`]) ?? outputMessages,
    ...(choices ? { choices } : {}),
    ...(expectedChoiceCount !== undefined ? { expected_choice_count: expectedChoiceCount } : {}),
    ...(toolCalls ? { tool_calls: toolCalls } : {}),
    ...(kind === 'TOOL' && typeof toolCallId === 'string'
      ? {
          tool_call: {
            id: toolCallId,
            ...(typeof attributes['neatlogs.tool.name'] === 'string'
              ? { name: attributes['neatlogs.tool.name'] }
              : {}),
          },
        }
      : {}),
    ...(streaming ? {
      streaming: true,
      ...(fragments ? { stream_fragments: fragments } : {}),
    } : {}),
    ...(references ? { payload_references: references } : {}),
    ...(oversized ? { oversized: true } : {}),
    sampled: (context.traceFlags & 1) === 1,
    ended: true,
    start_time_ns: startNs(span),
    duration_ns: durationNs(span),
    attributes: diagnosticAttributes(attributes),
  });
}

function encodedBytes(value: DiagnosticSpan): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Capture a Doctor-only, bounded projection at the final masked export boundary. */
export function capturePreparedSpans(spans: readonly ReadableSpan[]): void {
  for (const span of spans) {
    // The backend folds this transport control record out of the materialized trace.
    if (span.name === COMPLETION_MARKER) continue;

    const traceId = span.spanContext().traceId;
    const current = traces.get(traceId) ?? {
      spans: new Map<string, DiagnosticSpan>(),
      spanBytes: new Map<string, number>(),
      bytes: 0,
      droppedSpans: 0,
    };
    const spanId = span.spanContext().spanId;
    const previousBytes = current.spanBytes.get(spanId) ?? 0;
    const isNewSpan = !current.spans.has(spanId);
    const remainingBytes = MAX_BYTES_PER_TRACE - current.bytes + previousBytes;
    if ((isNewSpan && current.spans.size >= MAX_SPANS_PER_TRACE) ||
        exceedsRawProjectionBudget(span, remainingBytes)) {
      current.droppedSpans += 1;
      traces.delete(traceId);
      traces.set(traceId, current);
      latestTraceId = traceId;
      while (traces.size > MAX_TRACES) {
        traces.delete(traces.keys().next().value as string);
      }
      continue;
    }
    const projected = toDiagnosticSpan(span);
    const bytes = encodedBytes(projected);
    const nextBytes = current.bytes - previousBytes + bytes;

    if (nextBytes > MAX_BYTES_PER_TRACE) {
      current.droppedSpans += 1;
    } else {
      current.spans.set(spanId, projected);
      current.spanBytes.set(spanId, bytes);
      current.bytes = nextBytes;
    }

    traces.delete(traceId);
    traces.set(traceId, current);
    latestTraceId = traceId;
    while (traces.size > MAX_TRACES) {
      traces.delete(traces.keys().next().value as string);
    }
  }
}

export function getCapturedEnvelope(traceId = latestTraceId ?? ''): DiagnosticEnvelope | null {
  const trace = traces.get(traceId);
  if (!trace?.spans.size) return null;
  const values = [...trace.spans.values()];
  const root = values.find((span) => span.parent_span_id === null);
  if (!root) return null;
  return Object.freeze({
    trace_id: traceId,
    root_span_id: root.span_id,
    spans: Object.freeze(values),
  });
}

/** @internal Credential-free capture accounting for tests and Doctor output. */
export function getDoctorCaptureStats(traceId = latestTraceId ?? ''): Readonly<{
  traceCount: number;
  spanCount: number;
  bytes: number;
  droppedSpans: number;
  maxTraces: number;
  maxSpansPerTrace: number;
  maxBytesPerTrace: number;
}> {
  const trace = traces.get(traceId);
  return Object.freeze({
    traceCount: traces.size,
    spanCount: trace?.spans.size ?? 0,
    bytes: trace?.bytes ?? 0,
    droppedSpans: trace?.droppedSpans ?? 0,
    maxTraces: MAX_TRACES,
    maxSpansPerTrace: MAX_SPANS_PER_TRACE,
    maxBytesPerTrace: MAX_BYTES_PER_TRACE,
  });
}

/** @internal Test/lifecycle reset. */
export function clearDoctorCapture(): void {
  traces.clear();
  latestTraceId = null;
}
