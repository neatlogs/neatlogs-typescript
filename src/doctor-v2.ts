import { createHash } from 'node:crypto';
import { TELEMETRY_SCHEMA_VERSION } from './schema-v2.js';
import { __version__ } from './version.js';

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
  sampling: Readonly<{ effective_sampler: string; consistent: boolean }>;
  ownership: Readonly<{ provider: 'private' | 'ambiguous' }>;
  queue: Readonly<{ mode: 'diagnostic_capture'; dropped_spans: number }>;
  retry: Readonly<{ attempts: 0; window_ms: 0 }>;
  flush: Readonly<{ outcome: 'success' | 'timeout' | 'failed'; timeout_ms: number }>;
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
  const projection = {
    trace_id: envelope.trace_id,
    root_span_id: envelope.root_span_id,
    spans: [...envelope.spans].sort((left, right) => left.span_id.localeCompare(right.span_id)),
  };
  const bytes = JSON.stringify(canonicalize(projection));
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

function failure(name: string, reason_code: keyof typeof remediation, message: string, details?: Record<string, string | number | boolean | null>): DoctorV2Check {
  return Object.freeze({ name, status: 'fail', reason_code, remediation_code: remediation[reason_code], message, ...(details ? { details: Object.freeze(details) } : {}) });
}

function jsonSafe(value: unknown): boolean {
  try { JSON.stringify(canonicalize(value)); return true; } catch { return false; }
}

/** Validate the finished, masked, normalized envelope captured before network send. */
export function doctorLocalV2(
  envelope: DiagnosticEnvelope,
  options: Readonly<{ flushOutcome?: 'success' | 'timeout' | 'failed'; flushTimeoutMs?: number; privateProvider?: boolean }> = {},
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
  const executed = new Set(envelope.spans.flatMap((span) => span.tool_call ? [span.tool_call.id] : []));
  for (const callId of requested) if (!executed.has(callId)) checks.push(failure('tools', 'TOOL_EXECUTION_MISSING', 'Assistant-requested tool call has no execution span', { call_id: callId }));
  for (const callId of executed) if (!requested.has(callId)) checks.push(failure('tools', 'TOOL_CALL_MISSING', 'Tool execution has no preserved assistant request', { call_id: callId }));
  const sampling = new Set(envelope.spans.map((span) => span.sampled).filter((value): value is boolean => value !== undefined));
  if (sampling.size > 1) checks.push(failure('sampling', 'SAMPLING_INCONSISTENT', 'All spans in a trace must share the root sampling decision'));
  if (options.privateProvider === false) checks.push(failure('ownership', 'PROVIDER_OWNERSHIP_AMBIGUOUS', 'Doctor could not prove private provider ownership'));
  const flushOutcome = options.flushOutcome ?? 'success';
  if (flushOutcome === 'timeout') checks.push(failure('flush', 'FLUSH_TIMEOUT', 'Diagnostic capture did not flush within the configured deadline'));

  if (checks.length === 0) checks.push(Object.freeze({ name: 'local_envelope', status: 'pass', reason_code: 'LOCAL_ENVELOPE_VALID', remediation_code: 'NONE', message: 'The final normalized local envelope is valid' }));
  const first = checks.find((check) => check.status === 'fail');
  let digest: string | undefined;
  try { digest = doctorSemanticDigest(envelope); } catch { /* an existing JSON failure is safer than emitting a partial digest */ }
  return Object.freeze({
    format_version: DOCTOR_V2_FORMAT_VERSION,
    mode: 'local',
    status: first ? 'fail' : 'pass',
    first_failure: first?.reason_code ?? null,
    runtime: Object.freeze({ language: 'typescript', sdk_version: __version__, schema_version: String(TELEMETRY_SCHEMA_VERSION), transport: 'otlp_http_protobuf' }),
    ...(digest && TRACE_ID.test(envelope.trace_id) && SPAN_ID.test(envelope.root_span_id) ? { capture: Object.freeze({ trace_id: envelope.trace_id, root_span_id: envelope.root_span_id, span_count: envelope.spans.length, semantic_digest: digest }) } : {}),
    sampling: Object.freeze({ effective_sampler: 'parentbased_traceidratio', consistent: sampling.size <= 1 }),
    ownership: Object.freeze({ provider: options.privateProvider === false ? 'ambiguous' : 'private' }),
    queue: Object.freeze({ mode: 'diagnostic_capture', dropped_spans: 0 }),
    retry: Object.freeze({ attempts: 0 as const, window_ms: 0 as const }),
    flush: Object.freeze({ outcome: flushOutcome, timeout_ms: options.flushTimeoutMs ?? 5_000 }),
    checks: Object.freeze(checks),
  });
}
