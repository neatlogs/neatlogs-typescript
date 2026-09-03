import { createHash } from 'node:crypto';
import { TELEMETRY_SCHEMA_VERSION } from './schema-v2.js';
import { __version__ } from './version.js';
import { getCapturedEnvelope } from './core/doctor-capture.js';
import { _doctorRuntimeSnapshot } from './init.js';

export const DOCTOR_V2_FORMAT_VERSION = 'neatlogs.doctor/v2' as const;

export type DoctorV2Status = 'pass' | 'warn' | 'fail';
export type DoctorV2CheckStatus = DoctorV2Status | 'unknown';

export type DiagnosticSpan = Readonly<{
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status: string;
  input?: unknown;
  output?: unknown;
  choices?: readonly unknown[];
  expected_choice_count?: number;
  tool_calls?: readonly Readonly<{ id: string; name?: string }>[];
  tool_call?: Readonly<{ id: string; name?: string; result?: unknown }>;
  streaming?: boolean;
  stream_fragments?: readonly unknown[];
  oversized?: boolean;
  payload_references?: readonly Readonly<{ digest: string; size: number; mime_type: string }>[];
  sampled?: boolean;
  ended?: boolean;
  start_time_ns?: number;
  duration_ns?: number;
  attributes?: Readonly<Record<string, unknown>>;
}>;

export type DiagnosticEnvelope = Readonly<{
  trace_id: string;
  root_span_id: string;
  spans: readonly DiagnosticSpan[];
}>;

export type DoctorV2Check = Readonly<{
  name: string;
  status: DoctorV2CheckStatus;
  reason_code: string;
  remediation_code: string;
  message: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type DoctorV2Result = Readonly<{
  format_version: typeof DOCTOR_V2_FORMAT_VERSION;
  mode: 'local';
  status: DoctorV2Status;
  first_failure: string | null;
  runtime: Readonly<{
    language: 'typescript';
    sdk_version: string;
    schema_version: string;
    transport: 'otlp_http_protobuf';
  }>;
  capture?: Readonly<{
    trace_id: string;
    root_span_id: string;
    span_count: number;
    semantic_digest: string;
  }>;
  sampling: Readonly<{ effective_sampler: string; root_sample_rate: number; sampled: boolean }>;
  ownership: Readonly<{ provider: 'private' | 'ambiguous'; instrumentor_count: number }>;
  queue: Readonly<{ mode: 'batch' | 'diagnostic_capture'; pending_spans: number; dropped_spans: number; capacity: number | null }>;
  retry: Readonly<{ attempts: number; window_ms: number; exhausted: boolean }>;
  flush: Readonly<{ outcome: 'not_attempted' | 'success' | 'timeout' | 'failed'; timeout_ms: number; duration_ms: number | null }>;
  checks: readonly DoctorV2Check[];
}>;

const TRACE_ID = /^[0-9a-f]{32}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

const remediation: Readonly<Record<string, string>> = Object.freeze({
  TRACE_ID_INVALID: 'RECREATE_TRACE',
  SPAN_ID_INVALID: 'RECREATE_SPAN',
  SPAN_ID_DUPLICATE: 'RECREATE_SPAN',
  PARENT_ID_INVALID: 'FIX_PARENT_CONTEXT',
  PARENT_MISSING: 'FIX_PARENT_CONTEXT',
  ROOT_MISSING: 'CREATE_ROOT_SPAN',
  ROOT_MULTIPLE: 'USE_SINGLE_ROOT',
  ROOT_NOT_ENDED: 'END_ROOT_SPAN',
  INPUT_JSON_INVALID: 'SERIALIZE_INPUT_JSON',
  OUTPUT_JSON_INVALID: 'SERIALIZE_OUTPUT_JSON',
  TOOL_CALL_MISSING: 'CAPTURE_TOOL_REQUEST',
  TOOL_EXECUTION_MISSING: 'CAPTURE_TOOL_EXECUTION',
  CHOICE_LOSS: 'PRESERVE_ALL_CHOICES',
  STREAM_FRAGMENT_MISSING: 'PRESERVE_STREAM_FRAGMENTS',
  PAYLOAD_ATTACHMENT_REQUIRED: 'UPLOAD_PAYLOAD_ATTACHMENT',
  SAMPLING_INCONSISTENT: 'FIX_PARENT_BASED_SAMPLING',
  FLUSH_TIMEOUT: 'INCREASE_FLUSH_BUDGET',
  PROVIDER_OWNERSHIP_AMBIGUOUS: 'USE_PRIVATE_PROVIDER',
  LATENCY_OUTLIER: 'INVESTIGATE_SLOW_OPERATION',
  RATE_LIMITED: 'RESPECT_RETRY_AFTER',
  PII_DETECTED: 'MASK_SENSITIVE_CONTENT',
  LOCAL_ENVELOPE_VALID: 'NONE',
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) output[key] = canonicalize(item);
    }
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Diagnostic envelope contains a non-finite number');
  return value;
}

export function doctorSemanticDigest(envelope: DiagnosticEnvelope): string {
  const namesById = new Map(envelope.spans.map((span) => [span.span_id, span.name]));
  const stableFields = [
    'name',
    'kind',
    'status',
    'input',
    'output',
    'choices',
    'expected_choice_count',
    'tool_calls',
    'tool_call',
    'streaming',
    'oversized',
    'payload_references',
    'sampled',
    'ended',
  ] as const;
  const projection = {
    spans: envelope.spans
      .filter((span) => span.name !== 'neatlogs.trace.complete')
      .map((span) => {
        const item: Record<string, unknown> = {};
        for (const field of stableFields) {
          if (span[field] !== undefined) item[field] = span[field];
        }
        item.parent = span.parent_span_id === null
          ? null
          : namesById.get(span.parent_span_id) ?? null;
        return item;
      })
      .sort((left, right) => {
        const leftKey = `${String(left.name)}\u0000${String(left.kind)}`;
        const rightKey = `${String(right.name)}\u0000${String(right.kind)}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
  };
  const bytes = JSON.stringify(canonicalize(projection));
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

function failure(name: string, reason_code: keyof typeof remediation, message: string, details?: Record<string, string | number | boolean | null>): DoctorV2Check {
  return Object.freeze({ name, status: 'fail', reason_code, remediation_code: remediation[reason_code], message, ...(details ? { details: Object.freeze(details) } : {}) });
}

function warning(name: string, reason_code: keyof typeof remediation, message: string, details?: Record<string, string | number | boolean | null>): DoctorV2Check {
  return Object.freeze({ name, status: 'warn', reason_code, remediation_code: remediation[reason_code], message, ...(details ? { details: Object.freeze(details) } : {}) });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function latencyWarnings(envelope: DiagnosticEnvelope): DoctorV2Check[] {
  const groups = new Map<string, Array<{ span: DiagnosticSpan; index: number }>>();
  envelope.spans.forEach((span, index) => {
    if (span.kind.toUpperCase() !== 'LLM' || !Number.isFinite(span.duration_ns) || (span.duration_ns ?? 0) < 0) return;
    const operation = typeof span.attributes?.['gen_ai.operation.name'] === 'string'
      ? span.attributes['gen_ai.operation.name'] as string
      : span.name;
    const group = groups.get(operation) ?? [];
    group.push({ span, index });
    groups.set(operation, group);
  });
  const checks: DoctorV2Check[] = [];
  for (const [operation, group] of groups) {
    if (group.length < 3) continue;
    const ordered = [...group].sort((left, right) =>
      (left.span.start_time_ns ?? left.index) - (right.span.start_time_ns ?? right.index));
    const baseline = median(group.map(({ span }) => span.duration_ns ?? 0));
    const threshold = Math.max(500_000_000, baseline * 3);
    for (const { span } of ordered.slice(1)) {
      if ((span.duration_ns ?? 0) > threshold) {
        checks.push(warning('latency', 'LATENCY_OUTLIER', 'LLM latency is an outlier for this operation', {
          span_id: span.span_id,
          operation,
          duration_ns: span.duration_ns ?? 0,
          median_ns: baseline,
          threshold_ns: threshold,
        }));
      }
    }
  }
  return checks;
}

const THROTTLE_CODES = new Set([
  'rate_limit_exceeded', 'rate_limit_error', 'resource_exhausted',
  'throttlingexception', 'toomanyrequests', 'too_many_requests',
]);

function rateLimitSignal(attributes: Readonly<Record<string, unknown>> | undefined): string | null {
  if (!attributes) return null;
  for (const [rawKey, value] of Object.entries(attributes)) {
    const key = rawKey.toLowerCase();
    const normalized = String(value).toLowerCase();
    if ((key.includes('http') || key.includes('status')) && (normalized === '429' || normalized === '503')) return 'http_status';
    if (key.includes('retry-after') || key.includes('retry_after')) return 'retry_after';
    if (THROTTLE_CODES.has(normalized)) return 'provider_code';
    if (key.includes('rate_limit_remaining') || key.includes('ratelimit_remaining')) {
      const remaining = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(remaining) && remaining <= 1) return 'rate_limit_remaining';
    }
  }
  return null;
}

function rateLimitWarnings(envelope: DiagnosticEnvelope): DoctorV2Check[] {
  return envelope.spans.flatMap((span) => {
    const signal = rateLimitSignal(span.attributes);
    return signal
      ? [warning('rate_limit', 'RATE_LIMITED', 'Span contains a provider throttling signal', { span_id: span.span_id, signal })]
      : [];
  });
}

const PII_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['us_phone', /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/],
  ['us_ssn', /\b\d{3}-\d{2}-\d{4}\b/],
  ['credit_card', /\b(?:\d[ -]*?){13,19}\b/],
];

function piiCategories(value: unknown): Set<string> {
  const categories = new Set<string>();
  const seen = new WeakSet<object>();
  let visited = 0;
  const walk = (item: unknown, depth: number): void => {
    if (depth > 12 || visited++ > 10_000) return;
    if (typeof item === 'string') {
      for (const [category, pattern] of PII_PATTERNS) if (pattern.test(item)) categories.add(category);
      return;
    }
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) for (const child of item) walk(child, depth + 1);
    else for (const child of Object.values(item as Record<string, unknown>)) walk(child, depth + 1);
  };
  walk(value, 0);
  return categories;
}

function piiWarnings(envelope: DiagnosticEnvelope): DoctorV2Check[] {
  return envelope.spans.flatMap((span) => {
    const categories = piiCategories(span.attributes);
    return categories.size > 0
      ? [warning('privacy', 'PII_DETECTED', 'Span attributes contain potential sensitive data', {
        span_id: span.span_id,
        categories: [...categories].sort().join(','),
      })]
      : [];
  });
}

function jsonSafe(value: unknown): boolean {
  try { JSON.stringify(canonicalize(value)); return true; } catch { return false; }
}

function collectNestedToolRequestIds(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const child of value) collectNestedToolRequestIds(child, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'tool_calls' && Array.isArray(child)) {
      for (const call of child) {
        if (call && typeof call === 'object' && typeof (call as Record<string, unknown>).id === 'string') {
          output.add((call as Record<string, unknown>).id as string);
        }
      }
    }
    collectNestedToolRequestIds(child, output);
  }
}

/** Validate the finished, masked, normalized envelope captured before network send. */
export function doctorLocalV2(
  envelope: DiagnosticEnvelope,
  options: Readonly<{ flushOutcome?: 'not_attempted' | 'success' | 'timeout' | 'failed'; flushTimeoutMs?: number; flushDurationMs?: number | null; privateProvider?: boolean; instrumentorCount?: number; checkPii?: boolean; effectiveSampler?: string; rootSampleRate?: number; queueMode?: 'batch' | 'diagnostic_capture'; queueMaxSize?: number | null; pendingSpans?: number; droppedSpans?: number; retryAttempts?: number; retryWindowMs?: number; retryExhausted?: boolean }> = {},
): DoctorV2Result {
  const checks: DoctorV2Check[] = [];
  if (!TRACE_ID.test(envelope.trace_id)) checks.push(failure('trace_id', 'TRACE_ID_INVALID', 'Trace ID must be 32 lowercase hexadecimal characters'));
  const ids = new Set<string>();
  for (const span of envelope.spans) {
    if (!SPAN_ID.test(span.span_id)) checks.push(failure('span_id', 'SPAN_ID_INVALID', 'Span ID must be 16 lowercase hexadecimal characters', { span_name: span.name }));
    if (ids.has(span.span_id)) checks.push(failure('span_id', 'SPAN_ID_DUPLICATE', 'Span IDs must be unique', { span_id: span.span_id }));
    ids.add(span.span_id);
  }
  const roots = envelope.spans.filter((span) => span.parent_span_id === null);
  if (roots.length === 0 || !ids.has(envelope.root_span_id)) checks.push(failure('root', 'ROOT_MISSING', 'Exactly one declared root span is required'));
  else if (roots.length > 1 || roots[0]?.span_id !== envelope.root_span_id) checks.push(failure('root', 'ROOT_MULTIPLE', 'The envelope must contain one declared root span'));
  else if (roots[0].ended !== true) checks.push(failure('root', 'ROOT_NOT_ENDED', 'The root span must be ended before capture'));
  for (const span of envelope.spans) {
    if (span.parent_span_id !== null && !SPAN_ID.test(span.parent_span_id)) checks.push(failure('parent', 'PARENT_ID_INVALID', 'Parent ID must be a valid span ID', { span_id: span.span_id }));
    else if (span.parent_span_id !== null && !ids.has(span.parent_span_id)) checks.push(failure('parent', 'PARENT_MISSING', 'Parent span is absent from the envelope', { span_id: span.span_id }));
    if (span.input !== undefined && !jsonSafe(span.input)) checks.push(failure('input', 'INPUT_JSON_INVALID', 'Span input is not canonical JSON', { span_id: span.span_id }));
    if (span.output !== undefined && !jsonSafe(span.output)) checks.push(failure('output', 'OUTPUT_JSON_INVALID', 'Span output is not canonical JSON', { span_id: span.span_id }));
    if (span.expected_choice_count !== undefined && (span.choices?.length ?? 0) < span.expected_choice_count) checks.push(failure('choices', 'CHOICE_LOSS', 'The normalized response lost one or more model choices', { span_id: span.span_id }));
    if (span.streaming && (span.stream_fragments?.length ?? 0) === 0) checks.push(failure('stream', 'STREAM_FRAGMENT_MISSING', 'Streaming span has no captured fragments', { span_id: span.span_id }));
    if (span.oversized && !(span.payload_references?.some((reference) => reference.size > 0 && DIGEST.test(reference.digest) && reference.mime_type.length > 0))) checks.push(failure('payload', 'PAYLOAD_ATTACHMENT_REQUIRED', 'Oversized content requires a valid payload reference', { span_id: span.span_id }));
  }
  const requested = new Set(envelope.spans.flatMap((span) => span.tool_calls ?? []).map((call) => call.id));
  for (const span of envelope.spans) collectNestedToolRequestIds(span.choices, requested);
  const executed = new Set(envelope.spans.flatMap((span) => span.tool_call ? [span.tool_call.id] : []));
  for (const callId of requested) if (!executed.has(callId)) checks.push(failure('tools', 'TOOL_EXECUTION_MISSING', 'Assistant-requested tool call has no execution span', { call_id: callId }));
  for (const callId of executed) if (!requested.has(callId)) checks.push(failure('tools', 'TOOL_CALL_MISSING', 'Tool execution has no preserved assistant request', { call_id: callId }));
  const sampling = new Set(envelope.spans.map((span) => span.sampled).filter((value): value is boolean => value !== undefined));
  if (sampling.size > 1) checks.push(failure('sampling', 'SAMPLING_INCONSISTENT', 'All spans in a trace must share the root sampling decision'));
  if (options.privateProvider === false) checks.push(failure('ownership', 'PROVIDER_OWNERSHIP_AMBIGUOUS', 'Doctor could not prove private provider ownership'));
  const flushOutcome = options.flushOutcome ?? 'success';
  if (flushOutcome === 'timeout') checks.push(failure('flush', 'FLUSH_TIMEOUT', 'Diagnostic capture did not flush within the configured deadline'));
  checks.push(...latencyWarnings(envelope), ...rateLimitWarnings(envelope));
  if (options.checkPii === true) checks.push(...piiWarnings(envelope));

  if (checks.length === 0) checks.push(Object.freeze({ name: 'local_envelope', status: 'pass', reason_code: 'LOCAL_ENVELOPE_VALID', remediation_code: 'NONE', message: 'The final normalized local envelope is valid' }));
  const first = checks.find((check) => check.status === 'fail');
  const hasWarning = checks.some((check) => check.status === 'warn');
  let digest: string | undefined;
  try { digest = doctorSemanticDigest(envelope); } catch { /* an existing JSON failure is safer than emitting a partial digest */ }
  return Object.freeze({
    format_version: DOCTOR_V2_FORMAT_VERSION,
    mode: 'local',
    status: first ? 'fail' : hasWarning ? 'warn' : 'pass',
    first_failure: first?.reason_code ?? null,
    runtime: Object.freeze({ language: 'typescript', sdk_version: __version__, schema_version: String(TELEMETRY_SCHEMA_VERSION), transport: 'otlp_http_protobuf' }),
    ...(digest && TRACE_ID.test(envelope.trace_id) && SPAN_ID.test(envelope.root_span_id) ? { capture: Object.freeze({ trace_id: envelope.trace_id, root_span_id: envelope.root_span_id, span_count: envelope.spans.length, semantic_digest: digest }) } : {}),
    sampling: Object.freeze({ effective_sampler: options.effectiveSampler ?? 'parentbased_traceidratio', root_sample_rate: options.rootSampleRate ?? 1, sampled: envelope.spans.find((span) => span.sampled !== undefined)?.sampled ?? true }),
    ownership: Object.freeze({ provider: options.privateProvider === false ? 'ambiguous' : 'private', instrumentor_count: options.instrumentorCount ?? 0 }),
    queue: Object.freeze({ mode: options.queueMode ?? 'diagnostic_capture', pending_spans: options.pendingSpans ?? 0, dropped_spans: options.droppedSpans ?? 0, capacity: options.queueMaxSize ?? 2_048 }),
    retry: Object.freeze({ attempts: options.retryAttempts ?? 0, window_ms: options.retryWindowMs ?? 0, exhausted: options.retryExhausted ?? false }),
    flush: Object.freeze({ outcome: flushOutcome, timeout_ms: options.flushTimeoutMs ?? 5_000, duration_ms: options.flushDurationMs ?? null }),
    checks: Object.freeze(checks),
  });
}

/** Inspect the latest trace captured at the final masked export boundary. */
export function doctorCapturedLocalV2(
  options: Readonly<{ traceId?: string; flushOutcome?: 'not_attempted' | 'success' | 'timeout' | 'failed'; flushTimeoutMs?: number; flushDurationMs?: number | null; checkPii?: boolean }> = {},
): DoctorV2Result | null {
  const envelope = getCapturedEnvelope(options.traceId);
  if (!envelope) return null;
  const runtime = _doctorRuntimeSnapshot();
  return doctorLocalV2(envelope, {
    flushOutcome: options.flushOutcome,
    flushTimeoutMs: options.flushTimeoutMs,
    flushDurationMs: options.flushDurationMs,
    privateProvider: runtime.ownsTracerProvider,
    effectiveSampler: runtime.effectiveSampler.split(':')[0],
    rootSampleRate: Number(runtime.effectiveSampler.split(':').at(-1)) || 0,
    queueMode: runtime.exportEnabled ? 'batch' : 'diagnostic_capture',
    queueMaxSize: runtime.queueMaxSize,
    droppedSpans: runtime.exportHealth?.droppedSpans ?? 0,
    checkPii: options.checkPii,
  });
}
