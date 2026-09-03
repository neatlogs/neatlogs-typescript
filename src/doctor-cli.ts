import { SpanStatusCode } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { getCapturedEnvelope, getDoctorCaptureStats } from './core/doctor-capture.js';
import { trace, setTraceOutput } from './core/context.js';
import { disableLogging, enableLogging } from './core/logger.js';
import { getActiveNeatlogsSpan, getRoutingNeatlogsTracer } from './core/provider.js';
import { span } from './decorators/orchestration.js';
import { doctorCapturedLocalV2, DOCTOR_V2_FORMAT_VERSION } from './doctor-v2.js';
import { flush, init, shutdown } from './init.js';
import { __version__ } from './version.js';

const DOCTOR_SERVICE = 'neatlogs.doctor.v2';
const DOCTOR_MARKER_VERSION = 'v1';
const PROBE_TIMEOUT_MS = 48_000;
const REQUEST_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 1_000;
const EXPECTED_TOKENS = [11, 7, 18] as const;

const EXPECTED_TYPES = new Map([
  ['doctor.probe.root', 'workflow'],
  ['doctor.probe.agent', 'agent_action'],
  ['doctor.probe.llm', 'llm'],
  ['doctor.probe.tool', 'tool_call'],
]);

const EXPECTED_SPAN_TYPES = new Map([
  ['doctor.probe.root', 'WORKFLOW'],
  ['doctor.probe.agent', 'AGENT'],
  ['doctor.probe.llm', 'LLM'],
  ['doctor.probe.tool', 'TOOL'],
]);

const EXPECTED_IO = new Map<string, Readonly<{ input: unknown; output: unknown }>>([
  ['doctor.probe.root', {
    input: { prompt: 'generated diagnostic input' },
    output: { result: { value: 2 } },
  }],
  ['doctor.probe.agent', {
    input: { prompt: 'generated diagnostic input' },
    output: { text: 'generated diagnostic output' },
  }],
  ['doctor.probe.llm', {
    input: { messages: [{ role: 'user', content: 'generated diagnostic input' }] },
    output: { text: 'generated diagnostic output' },
  }],
  ['doctor.probe.tool', { input: { value: 1 }, output: { value: 2 } }],
]);

// The v3 read path intentionally returns the UI-facing simplified view. It may
// preserve normalized JSON or render the same deterministic semantic value for
// display. Keep this allowlist identical across SDKs.
const EXPECTED_PERSISTED_IO = new Map<string, Readonly<{
  inputs: readonly unknown[];
  outputs: readonly unknown[];
}>>([
  ['doctor.probe.root', {
    inputs: [{ prompt: 'generated diagnostic input' }, 'generated diagnostic input'],
    outputs: [{ result: { value: 2 } }, 'Value: 2'],
  }],
  ['doctor.probe.agent', {
    inputs: [{ prompt: 'generated diagnostic input' }, 'Prompt: generated diagnostic input'],
    outputs: [{ text: 'generated diagnostic output' }],
  }],
  ['doctor.probe.llm', {
    inputs: [
      { messages: [{ role: 'user', content: 'generated diagnostic input' }] },
      { prompt: 'generated diagnostic input' },
    ],
    outputs: [{ text: 'generated diagnostic output' }, 'Text: generated diagnostic output'],
  }],
  ['doctor.probe.tool', {
    inputs: [{ value: 1 }, 'Value: 1'],
    outputs: [{ value: 2 }, 'Value: 2'],
  }],
]);

export type DoctorCliIO = Readonly<{
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  fetch: typeof globalThis.fetch;
  env: NodeJS.ProcessEnv;
  sleep: (milliseconds: number) => Promise<void>;
  probeExporter?: SpanExporter;
  probeTimeoutMs: number;
  requestTimeoutMs: number;
  pollIntervalMs: number;
}>;

const defaultIO: DoctorCliIO = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  fetch: globalThis.fetch,
  env: process.env,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  probeTimeoutMs: PROBE_TIMEOUT_MS,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  pollIntervalMs: POLL_INTERVAL_MS,
};

type PersistedSpan = Readonly<{
  span_id?: unknown;
  parent_span_id?: unknown;
  node_name?: unknown;
  span_name?: unknown;
  node_type?: unknown;
  span_type?: unknown;
  data?: unknown;
  span_metadata?: unknown;
}>;

type PersistedTrace = Readonly<{
  _id?: unknown;
  status?: unknown;
  finalizationStatus?: unknown;
  spanCount?: unknown;
  promptTokens?: unknown;
  completionTokens?: unknown;
  totalTokensUsed?: unknown;
  workflowName?: unknown;
  spans?: unknown;
}>;

type ProbeCheck = Readonly<{
  name: string;
  status: 'pass' | 'fail';
  reason_code: string;
  remediation_code: string;
  message: string;
}>;

class ProbeReadError extends Error {
  constructor(readonly reasonCode: 'AUTH_FAILED' | 'BACKEND_PROBE_UNAVAILABLE', message: string) {
    super(message);
  }
}

function markDoctorSpan(spanType: 'WORKFLOW' | 'AGENT' | 'LLM' | 'TOOL'): void {
  getActiveNeatlogsSpan()?.setAttributes({
    'neatlogs.doctor': true,
    'neatlogs.doctor.version': DOCTOR_MARKER_VERSION,
    'service.name': DOCTOR_SERVICE,
    'telemetry.sdk.language': 'typescript',
    'telemetry.sdk.version': __version__,
    'neatlogs.span.kind': spanType.toLowerCase(),
  });
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return canonicalize(JSON.parse(trimmed)); } catch { return value; }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function matchesMaterializedValue(value: unknown, expected: readonly unknown[]): boolean {
  return value !== null && value !== undefined &&
    expected.some((candidate) => sameValue(value, candidate));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function check(
  name: string,
  passed: boolean,
  passCode: string,
  failureCode: string,
  remediationCode: string,
  message: string,
): ProbeCheck {
  return {
    name,
    status: passed ? 'pass' : 'fail',
    reason_code: passed ? passCode : failureCode,
    remediation_code: passed ? 'NONE' : remediationCode,
    message,
  };
}

function validateLocalFixture(traceId: string): readonly ProbeCheck[] {
  const envelope = getCapturedEnvelope(traceId);
  const stats = getDoctorCaptureStats(traceId);
  if (!envelope) {
    return [check(
      'controlled_fixture', false, 'CONTROLLED_FIXTURE_VALID',
      'CONTROLLED_FIXTURE_MISSING', 'ENABLE_INSTRUMENTOR',
      'The controlled Doctor fixture was not captured',
    )];
  }

  const byName = new Map(envelope.spans.map((item) => [item.name, item]));
  const root = byName.get('doctor.probe.root');
  const agent = byName.get('doctor.probe.agent');
  const llm = byName.get('doctor.probe.llm');
  const tool = byName.get('doctor.probe.tool');
  const exactSet = envelope.spans.length === EXPECTED_SPAN_TYPES.size &&
    byName.size === EXPECTED_SPAN_TYPES.size &&
    [...EXPECTED_SPAN_TYPES].every(([name, kind]) => byName.get(name)?.kind === kind);
  const exactEdges = !!root && !!agent && !!llm && !!tool &&
    root.parent_span_id === null &&
    agent.parent_span_id === root.span_id &&
    llm.parent_span_id === agent.span_id &&
    tool.parent_span_id === root.span_id;
  const exactIo = [...EXPECTED_IO].every(([name, expected]) => {
    const item = byName.get(name);
    return !!item && sameValue(item.input, expected.input) && sameValue(item.output, expected.output);
  });
  const exactMetadata = [...EXPECTED_SPAN_TYPES].every(([name, spanType]) => {
    const attributes = byName.get(name)?.attributes ?? {};
    return attributes['neatlogs.doctor'] === true &&
      attributes['neatlogs.doctor.version'] === DOCTOR_MARKER_VERSION &&
      attributes['service.name'] === DOCTOR_SERVICE &&
      attributes['telemetry.sdk.language'] === 'typescript' &&
      attributes['telemetry.sdk.version'] === __version__ &&
      attributes['neatlogs.span.kind'] === spanType.toLowerCase();
  });
  const exactTokens = !!llm && [
    llm.attributes?.['neatlogs.llm.token_count.prompt'],
    llm.attributes?.['neatlogs.llm.token_count.completion'],
    llm.attributes?.['neatlogs.llm.token_count.total'],
  ].every((value, index) => typeof value === 'number' && value === EXPECTED_TOKENS[index]);

  return [
    check('controlled_fixture_spans', exactSet, 'CONTROLLED_SPANS_VALID', 'CONTROLLED_SPANS_INVALID', 'CHECK_SDK_INSTRUMENTATION', 'Doctor captured exactly the four expected semantic spans'),
    check('controlled_fixture_hierarchy', exactEdges, 'CONTROLLED_HIERARCHY_VALID', 'CONTROLLED_HIERARCHY_INVALID', 'CHECK_PARENT_CONTEXT', 'Doctor captured the exact root-agent-LLM and root-tool edges'),
    check('controlled_fixture_io', exactIo, 'CONTROLLED_IO_VALID', 'CONTROLLED_IO_INVALID', 'CHECK_PAYLOAD_MAPPING', 'Doctor captured the deterministic non-null input and output values'),
    check('controlled_fixture_metadata', exactMetadata, 'CONTROLLED_METADATA_VALID', 'CONTROLLED_METADATA_INVALID', 'CHECK_ATTRIBUTE_MAPPING', 'Doctor captured all versioned metadata on every semantic span'),
    check('controlled_fixture_tokens', exactTokens, 'CONTROLLED_TOKENS_VALID', 'CONTROLLED_TOKENS_INVALID', 'CHECK_TOKEN_MAPPING', 'Doctor captured the exact numeric token values'),
    check('controlled_fixture_bounds', stats.droppedSpans === 0, 'CONTROLLED_BOUNDS_VALID', 'CONTROLLED_CAPTURE_TRUNCATED', 'REDUCE_DIAGNOSTIC_CAPTURE', 'Doctor stayed inside the bounded capture budget'),
  ];
}

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new ProbeReadError('BACKEND_PROBE_UNAVAILABLE', 'Doctor operation timed out'));
        }, Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function localResult(
  env: NodeJS.ProcessEnv,
  options: Readonly<{
    exportProbe?: boolean;
    probeExporter?: SpanExporter;
    flushTimeoutMs?: number;
  }> = {},
) {
  const flushTimeoutMs = Math.max(1, options.flushTimeoutMs ?? 5_000);
  const started = Date.now();
  let traceId = '';
  disableLogging();
  try {
    await init({
      apiKey: env.NEATLOGS_API_KEY,
      workflowName: DOCTOR_SERVICE,
      endpoint: options.exportProbe ? env.NEATLOGS_ENDPOINT : undefined,
      disableExport: !options.exportProbe,
      diagnosticCapture: true,
      doctorProbe: options.exportProbe === true,
      doctorProbeExporter: options.probeExporter,
      doctorProbeTimeoutMillis: options.exportProbe ? flushTimeoutMs : undefined,
      registerShutdownHandlers: false,
      batchSize: 32,
      flushInterval: 60,
    });

    const diagnosticTool = span(
      { kind: 'TOOL', name: 'doctor.probe.tool' },
      async (input: { value: number }) => {
        markDoctorSpan('TOOL');
        return { value: input.value + 1 };
      },
    );
    const diagnosticAgent = span(
      { kind: 'AGENT', name: 'doctor.probe.agent', role: 'diagnostic-agent' },
      async (input: { prompt: string }) => {
        markDoctorSpan('AGENT');
        return getRoutingNeatlogsTracer('neatlogs.doctor').startActiveSpan(
          'doctor.probe.llm',
          {
            attributes: {
              'openinference.span.kind': 'LLM',
              'input.value': JSON.stringify({
                messages: [{ role: 'user', content: input.prompt }],
              }),
              'neatlogs.llm.token_count.prompt': EXPECTED_TOKENS[0],
              'neatlogs.llm.token_count.completion': EXPECTED_TOKENS[1],
              'neatlogs.llm.token_count.total': EXPECTED_TOKENS[2],
            },
          },
          (llm) => {
            markDoctorSpan('LLM');
            const output = { text: 'generated diagnostic output' };
            llm.setAttribute('output.value', JSON.stringify(output));
            llm.setStatus({ code: SpanStatusCode.OK });
            llm.end();
            return output;
          },
        );
      },
    );

    await trace({
      name: 'doctor.probe.root',
      kind: 'WORKFLOW',
      sessionId: 'neatlogs-doctor-probe',
      input: { prompt: 'generated diagnostic input' },
    }, async (root) => {
      markDoctorSpan('WORKFLOW');
      traceId = root.spanContext().traceId;
      await diagnosticAgent({ prompt: 'generated diagnostic input' });
      const output = await diagnosticTool({ value: 1 });
      const result = { result: output };
      setTraceOutput(result);
      root.setStatus({ code: SpanStatusCode.OK });
      return result;
    });

    let flushed = false;
    try {
      flushed = await withTimeout(flush, flushTimeoutMs);
    } catch {
      flushed = false;
    }
    const result = doctorCapturedLocalV2({
      traceId,
      flushOutcome: flushed ? 'success' : 'timeout',
      flushTimeoutMs,
      flushDurationMs: Date.now() - started,
    });
    if (!result) throw new Error('Diagnostic envelope was not captured');

    const fixtureChecks = validateLocalFixture(traceId);
    const fixtureFailure = fixtureChecks.find((item) => item.status === 'fail');
    return Object.freeze({
      ...result,
      status: fixtureFailure ? 'fail' : result.status,
      first_failure: fixtureFailure?.reason_code ?? result.first_failure,
      checks: Object.freeze([...result.checks, ...fixtureChecks]),
    });
  } finally {
    await shutdown('doctor-complete', flushTimeoutMs).catch(() => false);
    enableLogging();
  }
}

function persistedProbeResult(
  local: Awaited<ReturnType<typeof localResult>>,
  traceValue: PersistedTrace,
) {
  const spans = Array.isArray(traceValue.spans)
    ? traceValue.spans.filter((value): value is PersistedSpan =>
      !!value && typeof value === 'object')
    : [];
  const normalized = spans.map((item) => ({
    id: typeof item.span_id === 'string' ? item.span_id : '',
    parentId: typeof item.parent_span_id === 'string' ? item.parent_span_id : null,
    name: String(item.node_name ?? item.span_name ?? ''),
    type: String(item.node_type ?? item.span_type ?? '').toLowerCase(),
    data: objectValue(item.data),
    metadata: objectValue(item.span_metadata),
  }));
  const byName = new Map(normalized.map((item) => [item.name, item]));
  const root = byName.get('doctor.probe.root');
  const agent = byName.get('doctor.probe.agent');
  const llm = byName.get('doctor.probe.llm');
  const tool = byName.get('doctor.probe.tool');
  const ids = normalized.map((item) => item.id);
  const duplicateSpanCount = ids.length - new Set(ids).size;
  const meaningfulRootCount = normalized.filter((item) =>
    item.name !== 'neatlogs.trace.complete' && item.parentId === null).length;
  const readbackSpanCount = typeof traceValue.spanCount === 'number'
    ? traceValue.spanCount
    : spans.length;

  const readbackTraceId = typeof traceValue._id === 'string' ? traceValue._id : null;
  const visible = readbackTraceId === local.capture?.trace_id;
  const finalized = traceValue.status === 'success' &&
    (traceValue.finalizationStatus === undefined || traceValue.finalizationStatus === 'finalized');
  const exactSet = spans.length === EXPECTED_TYPES.size &&
    readbackSpanCount === EXPECTED_TYPES.size &&
    byName.size === EXPECTED_TYPES.size &&
    ids.every((id) => /^[0-9a-f]{16}$/.test(id)) &&
    duplicateSpanCount === 0 &&
    [...EXPECTED_TYPES].every(([name, type]) => byName.get(name)?.type === type);
  const exactEdges = !!root && !!agent && !!llm && !!tool &&
    root.parentId === null &&
    agent.parentId === root.id &&
    llm.parentId === agent.id &&
    tool.parentId === root.id;
  const exactIo = [...EXPECTED_PERSISTED_IO].every(([name, expected]) => {
    const data = byName.get(name)?.data ?? {};
    return matchesMaterializedValue(data.input_value, expected.inputs) &&
      matchesMaterializedValue(data.output_value, expected.outputs);
  });
  const exactMetadata = [...EXPECTED_SPAN_TYPES].every(([name, spanType]) => {
    const metadata = byName.get(name)?.metadata ?? {};
    return metadata['neatlogs.doctor'] === true &&
      metadata['neatlogs.doctor.version'] === DOCTOR_MARKER_VERSION &&
      metadata['service.name'] === DOCTOR_SERVICE &&
      metadata['telemetry.sdk.language'] === 'typescript' &&
      metadata['telemetry.sdk.version'] === __version__ &&
      metadata['neatlogs.span.kind'] === spanType.toLowerCase();
  });
  const exactTokens = [
    traceValue.promptTokens,
    traceValue.completionTokens,
    traceValue.totalTokensUsed,
  ].every((value, index) =>
    typeof value === 'number' && Number.isFinite(value) && value === EXPECTED_TOKENS[index]);

  const probeChecks = [
    check('probe_visibility', visible, 'TRACE_VISIBLE', 'TRACE_ID_MISMATCH', 'WAIT_FOR_TRACE', 'The read-back trace ID exactly matches the exported Doctor trace ID'),
    check('probe_finalization', finalized, 'TRACE_FINALIZED', 'TRACE_NOT_FINALIZED', 'WAIT_FOR_TRACE', 'The Doctor trace reached a successful finalized state'),
    check('probe_root_count', meaningfulRootCount === 1, 'ROOT_COUNT_VALID', 'ROOT_COUNT_INVALID', 'CHECK_TRACE_FINALIZER', 'The persisted Doctor trace has exactly one meaningful root'),
    check('probe_duplicates', duplicateSpanCount === 0, 'NO_DUPLICATE_SPANS', 'DUPLICATE_SPANS', 'CHECK_TRACE_FINALIZER', 'The persisted Doctor trace contains no duplicate span IDs'),
    check('probe_span_set', exactSet, 'SPAN_SET_VALID', 'TRACE_INCOMPLETE', 'WAIT_FOR_TRACE', 'The exact four-span Doctor trace is visible through the authenticated trace API'),
    check('probe_hierarchy', exactEdges, 'HIERARCHY_VALID', 'HIERARCHY_INVALID', 'CHECK_TRACE_FINALIZER', 'The persisted Doctor trace retains the exact semantic parent edges'),
    check('probe_attributes', exactSet, 'ATTRIBUTES_VALID', 'ATTRIBUTES_INVALID', 'CHECK_ATTRIBUTE_MAPPING', 'The persisted Doctor span names and semantic types are exact'),
    check('probe_input_output', exactIo, 'INPUT_OUTPUT_VALID', 'INPUT_OUTPUT_INVALID', 'CHECK_PAYLOAD_MAPPING', 'The persisted Doctor spans retain the exact non-null deterministic input and output'),
    check('probe_metadata', exactMetadata, 'METADATA_VALID', 'METADATA_INVALID', 'CHECK_METADATA_FINALIZATION', 'All versioned Doctor SDK metadata survived finalization'),
    check('probe_typed_tokens', exactTokens, 'TYPED_TOKENS_VALID', 'TYPED_TOKENS_INVALID', 'CHECK_TOKEN_MAPPING', 'Persisted token totals remain exact numeric values'),
  ];
  const firstFailure = probeChecks.find((item) => item.status === 'fail');

  return {
    ...local,
    mode: 'probe',
    status: firstFailure || local.status !== 'pass' ? 'fail' : 'pass',
    first_failure: firstFailure?.reason_code ??
      (local.status === 'fail' ? local.first_failure : null),
    probe: {
      ingest_route: '/v1/traces',
      marker_header: 'x-neatlogs-doctor',
      marker_version: DOCTOR_MARKER_VERSION,
      visible,
      readback_trace_id: readbackTraceId,
      finalized,
      meaningful_root_count: meaningfulRootCount,
      duplicate_span_count: duplicateSpanCount,
      readback_span_count: readbackSpanCount,
      hierarchy_valid: exactEdges,
      attributes_valid: exactSet,
      input_output_valid: exactIo,
      metadata_valid: exactMetadata,
      typed_tokens_valid: exactTokens,
    },
    checks: [...local.checks, ...probeChecks],
  } as const;
}

function failedProbeResult(
  local: Awaited<ReturnType<typeof localResult>>,
  reasonCode: 'AUTH_FAILED' | 'BACKEND_PROBE_UNAVAILABLE',
) {
  return {
    ...local,
    mode: 'probe',
    status: 'fail',
    first_failure: reasonCode,
    checks: [...local.checks, {
      name: 'probe_transport',
      status: 'fail',
      reason_code: reasonCode,
      remediation_code: reasonCode === 'AUTH_FAILED'
        ? 'CHECK_INGEST_CREDENTIAL'
        : 'CHECK_TRACE_ENDPOINT',
      message: reasonCode === 'AUTH_FAILED'
        ? 'The project key was rejected by the existing trace API'
        : 'The existing trace ingestion or read path is unavailable',
    }],
  } as const;
}

function human(result: {
  status: string;
  first_failure?: unknown;
  checks?: readonly Readonly<{
    status: string;
    reason_code: string;
    message: string;
  }>[];
  note?: string;
}): string {
  const lines = [`Neatlogs Doctor: ${result.status.toUpperCase()}`];
  for (const item of result.checks ?? []) {
    lines.push(`${item.status === 'pass' ? 'PASS' : item.status === 'fail' ? 'FAIL' : 'INFO'} ${item.reason_code}: ${item.message}`);
  }
  if (result.first_failure) lines.push(`First failure: ${String(result.first_failure)}`);
  if (result.note) lines.push(result.note);
  return lines.join('\n');
}

async function boundedFetch(
  io: DoctorCliIO,
  input: URL,
  initOptions: RequestInit,
  deadline: number,
): Promise<Response> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new ProbeReadError('BACKEND_PROBE_UNAVAILABLE', 'Doctor probe deadline expired');
  }
  const controller = new AbortController();
  return withTimeout(
    () => io.fetch(input, { ...initOptions, signal: controller.signal }),
    Math.min(io.requestTimeoutMs, remaining),
    () => controller.abort(),
  );
}

async function boundedJson(
  response: Response,
  io: DoctorCliIO,
  deadline: number,
): Promise<unknown> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new ProbeReadError('BACKEND_PROBE_UNAVAILABLE', 'Doctor probe deadline expired');
  }
  return withTimeout(
    () => response.json(),
    Math.min(io.requestTimeoutMs, remaining),
  ).catch(() => null);
}

function usage(): string {
  return 'Usage: neatlogs doctor (--local | --probe) [--json]';
}

/** Run the credential-safe Doctor CLI. Returns a stable process exit code. */
export async function runDoctorCli(
  argv: readonly string[],
  overrides: Partial<DoctorCliIO> = {},
): Promise<number> {
  const io: DoctorCliIO = { ...defaultIO, ...overrides };
  const json = argv.includes('--json');
  const modes = ['--local', '--probe'].filter((flag) => argv.includes(flag));
  if (argv.includes('--help') || argv.includes('-h')) {
    io.stdout(usage());
    return 0;
  }
  if (argv[0] !== 'doctor' || modes.length !== 1 ||
      argv.some((arg) => !['doctor', '--local', '--probe', '--json'].includes(arg))) {
    io.stderr(usage());
    return 4;
  }

  if (modes[0] === '--local') {
    try {
      const result = await localResult(io.env);
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
      return result.status === 'fail' ? 2 : result.status === 'warn' ? 1 : 0;
    } catch {
      const result = {
        format_version: DOCTOR_V2_FORMAT_VERSION,
        mode: 'local',
        status: 'fail',
        first_failure: 'INSTRUMENTOR_INACTIVE',
        checks: [{
          name: 'local_envelope', status: 'fail',
          reason_code: 'INSTRUMENTOR_INACTIVE',
          remediation_code: 'ENABLE_INSTRUMENTOR',
          message: 'Doctor could not capture a local diagnostic envelope',
        }],
      } as const;
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
      return 2;
    }
  }

  const apiKey = io.env.NEATLOGS_API_KEY?.trim();
  if (!apiKey) {
    try {
      const local = await localResult(io.env);
      const result = {
        ...local,
        mode: 'probe',
        status: 'fail',
        first_failure: 'CREDENTIAL_MISSING',
        checks: [...local.checks, {
          name: 'credentials', status: 'fail', reason_code: 'CREDENTIAL_MISSING',
          remediation_code: 'SET_CREDENTIAL',
          message: 'Configure an ingestion credential to run a backend probe',
        }],
      } as const;
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
    } catch {
      io.stderr('Doctor could not capture its local preflight');
    }
    return 3;
  }

  let endpoint: URL;
  try {
    endpoint = new URL(io.env.NEATLOGS_ENDPOINT?.trim() || 'https://ingest.neatlogs.com');
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('Invalid endpoint');
    }
  } catch {
    const local = await localResult({ ...io.env, NEATLOGS_API_KEY: undefined });
    const result = {
      ...local,
      mode: 'probe',
      status: 'fail',
      first_failure: 'ENDPOINT_INVALID',
      checks: [...local.checks, {
        name: 'endpoint', status: 'fail', reason_code: 'ENDPOINT_INVALID',
        remediation_code: 'SET_ENDPOINT',
        message: 'Configure an absolute HTTP or HTTPS diagnostic endpoint',
      }],
    } as const;
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
    return 3;
  }

  let local: Awaited<ReturnType<typeof localResult>> | null = null;
  try {
    local = await localResult(io.env, {
      exportProbe: true,
      probeExporter: io.probeExporter,
      flushTimeoutMs: io.requestTimeoutMs,
    });
    const onlyExportFailed = local.status === 'fail' &&
      local.first_failure === 'FLUSH_TIMEOUT';
    if (!local.capture || (local.status === 'fail' && !onlyExportFailed)) {
      throw new ProbeReadError('BACKEND_PROBE_UNAVAILABLE', 'Local Doctor fixture failed');
    }

    const readbackUrl = new URL(
      `/api/traces/v3/${encodeURIComponent(local.capture.trace_id)}`,
      endpoint.origin,
    );
    const deadline = Date.now() + Math.max(1, io.probeTimeoutMs);
    let persisted: PersistedTrace | null = null;
    while (Date.now() < deadline) {
      const response = await boundedFetch(io, readbackUrl, {
        method: 'GET',
        headers: { 'x-api-key': apiKey },
      }, deadline);
      if (response.ok && response.status !== 202) {
        const value = await boundedJson(response, io, deadline);
        if (!value || typeof value !== 'object') {
          throw new ProbeReadError(
            'BACKEND_PROBE_UNAVAILABLE',
            'Trace read-back returned an invalid response',
          );
        }
        persisted = value as PersistedTrace;
        break;
      }
      if (response.status === 401 || response.status === 403) {
        throw new ProbeReadError('AUTH_FAILED', 'Trace read-back rejected the project key');
      }
      if (![202, 404].includes(response.status)) {
        throw new ProbeReadError(
          'BACKEND_PROBE_UNAVAILABLE',
          `Trace read-back failed with HTTP ${response.status}`,
        );
      }
      const delay = Math.min(io.pollIntervalMs, Math.max(0, deadline - Date.now()));
      if (delay > 0) await withTimeout(() => io.sleep(delay), delay + 100);
    }
    if (!persisted) {
      throw new ProbeReadError(
        'BACKEND_PROBE_UNAVAILABLE',
        'Timed out waiting for the exact Doctor trace',
      );
    }

    const result = persistedProbeResult(local, persisted);
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
    return result.status === 'pass' ? 0 : 3;
  } catch (error) {
    const reason = error instanceof ProbeReadError && error.reasonCode === 'AUTH_FAILED'
      ? 'AUTH_FAILED'
      : 'BACKEND_PROBE_UNAVAILABLE';
    const result = local
      ? failedProbeResult(local, reason)
      : {
          format_version: DOCTOR_V2_FORMAT_VERSION,
          mode: 'probe',
          status: 'fail',
          first_failure: reason,
          reason_codes: [reason],
        } as const;
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
    return 3;
  }
}
