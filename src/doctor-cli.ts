import { SpanStatusCode } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { span } from './decorators/orchestration.js';
import { trace, setTraceOutput } from './core/context.js';
import { getRoutingNeatlogsTracer } from './core/provider.js';
import { doctorCapturedLocalV2, DOCTOR_V2_FORMAT_VERSION } from './doctor-v2.js';
import { flush, init, shutdown } from './init.js';
import { disableLogging, enableLogging } from './core/logger.js';
import { getActiveNeatlogsSpan } from './core/provider.js';
import { __version__ } from './version.js';

export type DoctorCliIO = Readonly<{ stdout: (line: string) => void; stderr: (line: string) => void; fetch: typeof globalThis.fetch; env: NodeJS.ProcessEnv; sleep: (milliseconds: number) => Promise<void>; probeExporter?: SpanExporter }>;
const defaultIO: DoctorCliIO = { stdout: (line) => process.stdout.write(`${line}\n`), stderr: (line) => process.stderr.write(`${line}\n`), fetch: globalThis.fetch, env: process.env, sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) };

function markDoctorSpan(spanType: 'WORKFLOW' | 'AGENT' | 'LLM' | 'TOOL'): void {
  getActiveNeatlogsSpan()?.setAttributes({
    'neatlogs.doctor': true,
    'neatlogs.doctor.version': 'v1',
    'service.name': 'neatlogs.doctor.v2',
    'telemetry.sdk.language': 'typescript',
    'telemetry.sdk.version': __version__,
    'neatlogs.span.type': spanType,
  });
}

async function localResult(
  env: NodeJS.ProcessEnv,
  options: Readonly<{ exportProbe?: boolean; probeExporter?: SpanExporter }> = {},
) {
  const flushTimeoutMs = 5_000;
  const started = Date.now();
  let traceId = '';
  disableLogging();
  try {
    await init({
      apiKey: env.NEATLOGS_API_KEY,
      workflowName: 'neatlogs.doctor.v2',
      endpoint: options.exportProbe ? env.NEATLOGS_ENDPOINT : undefined,
      disableExport: !options.exportProbe,
      diagnosticCapture: true,
      doctorProbe: options.exportProbe === true,
      doctorProbeExporter: options.probeExporter,
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
        return (
        getRoutingNeatlogsTracer('neatlogs.doctor').startActiveSpan(
          'doctor.probe.llm',
          {
            attributes: {
              'openinference.span.kind': 'LLM',
              'input.value': JSON.stringify({ messages: [{ role: 'user', content: input.prompt }] }),
              'neatlogs.llm.token_count.prompt': 11,
              'neatlogs.llm.token_count.completion': 7,
              'neatlogs.llm.token_count.total': 18,
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
        ));
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
      setTraceOutput({ result: output });
    });
    const flushed = await Promise.race([
      flush(),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), flushTimeoutMs)),
    ]);
    const result = doctorCapturedLocalV2({
      traceId,
      flushOutcome: flushed ? 'success' : 'timeout',
      flushTimeoutMs,
      flushDurationMs: Date.now() - started,
    });
    if (!result) throw new Error('Diagnostic envelope was not captured');
    return result;
  } finally {
    await shutdown('doctor-local-complete').catch(() => false);
    enableLogging();
  }
}

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
  spanCount?: unknown;
  promptTokens?: unknown;
  completionTokens?: unknown;
  totalTokensUsed?: unknown;
  workflowName?: unknown;
  spans?: unknown;
}>;

class ProbeReadError extends Error {
  constructor(readonly reasonCode: string, message: string) {
    super(message);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function persistedProbeResult(
  local: Awaited<ReturnType<typeof localResult>>,
  trace: PersistedTrace,
) {
  const spans = Array.isArray(trace.spans)
    ? trace.spans.filter((value): value is PersistedSpan => !!value && typeof value === 'object')
    : [];
  const ids = spans.map((item) => typeof item.span_id === 'string' ? item.span_id : '');
  const idSet = new Set(ids);
  const roots = spans.filter((item) => !item.parent_span_id);
  const hierarchyValid =
    roots.length === 1 &&
    ids.every((id) => /^[0-9a-f]{16}$/.test(id)) &&
    idSet.size === spans.length &&
    spans.every((item) => !item.parent_span_id || idSet.has(String(item.parent_span_id)));
  const expectedTypes = new Map([
    ['doctor.probe.root', 'workflow'],
    ['doctor.probe.agent', 'agent_action'],
    ['doctor.probe.llm', 'llm'],
    ['doctor.probe.tool', 'tool_call'],
  ]);
  const normalized = spans.map((item) => ({
    raw: item,
    name: String(item.node_name ?? item.span_name ?? ''),
    type: String(item.node_type ?? item.span_type ?? '').toLowerCase(),
    data: objectValue(item.data),
    metadata: objectValue(item.span_metadata),
  }));
  const attributesValid = [...expectedTypes].every(([name, type]) =>
    normalized.some((item) => item.name === name && item.type === type));
  const inputOutputValid = [...expectedTypes.keys()].every((name) => {
    const data = normalized.find((item) => item.name === name)?.data ?? {};
    return data.input_value !== undefined && data.output_value !== undefined;
  });
  const expectedSpans = normalized.filter((item) => expectedTypes.has(item.name));
  const metadataValid = expectedSpans.length === expectedTypes.size && expectedSpans.every((item) =>
      item.metadata['neatlogs.doctor'] === true &&
      item.metadata['neatlogs.doctor.version'] === 'v1' &&
      item.metadata['telemetry.sdk.language'] === 'typescript');
  const tokenValues = [trace.promptTokens, trace.completionTokens, trace.totalTokensUsed];
  const typedTokensValid = tokenValues.every((value, index) =>
    typeof value === 'number' && Number.isFinite(value) && value === [11, 7, 18][index]);
  const readbackSpanCount = typeof trace.spanCount === 'number'
    ? trace.spanCount
    : spans.length;
  const visible = trace._id === local.capture?.trace_id;

  const validations = [
    ['probe_visibility', visible && readbackSpanCount >= (local.capture?.span_count ?? 0), 'TRACE_VISIBLE', 'WAIT_FOR_TRACE', 'The exact Doctor trace is visible through the authenticated trace API'],
    ['probe_hierarchy', hierarchyValid, 'HIERARCHY_VALID', 'CHECK_TRACE_FINALIZER', 'The persisted Doctor hierarchy has one root and valid parents'],
    ['probe_attributes', attributesValid, 'ATTRIBUTES_VALID', 'CHECK_ATTRIBUTE_MAPPING', 'The persisted Doctor span names and types are complete'],
    ['probe_input_output', inputOutputValid, 'INPUT_OUTPUT_VALID', 'CHECK_PAYLOAD_MAPPING', 'The persisted Doctor spans retain input and output'],
    ['probe_metadata', metadataValid, 'METADATA_VALID', 'CHECK_METADATA_FINALIZATION', 'The versioned Doctor SDK metadata survived finalization'],
    ['probe_typed_tokens', typedTokensValid, 'TYPED_TOKENS_VALID', 'CHECK_TOKEN_MAPPING', 'Persisted token totals remain numeric'],
  ] as const;
  const probeChecks = validations.map(([name, passed, passCode, remediationCode, message]) => ({
    name,
    status: passed ? 'pass' : 'fail',
    reason_code: passed ? passCode : `${passCode}_FAILED`,
    remediation_code: passed ? 'NONE' : remediationCode,
    message,
  }));
  const firstFailure = probeChecks.find((check) => check.status === 'fail');
  return {
    ...local,
    mode: 'probe',
    status: firstFailure || local.status !== 'pass' ? 'fail' : 'pass',
    first_failure: firstFailure?.reason_code ?? (local.status === 'fail' ? local.first_failure : null),
    probe: {
      ingest_route: '/v1/traces',
      marker_header: 'x-neatlogs-doctor',
      marker_version: 'v1',
      visible,
      readback_span_count: readbackSpanCount,
      hierarchy_valid: hierarchyValid,
      attributes_valid: attributesValid,
      input_output_valid: inputOutputValid,
      metadata_valid: metadataValid,
      typed_tokens_valid: typedTokensValid,
    },
    checks: [...local.checks, ...probeChecks],
  } as const;
}

function failedProbeResult(local: Awaited<ReturnType<typeof localResult>>, reasonCode: 'AUTH_FAILED' | 'BACKEND_PROBE_UNAVAILABLE') {
  return {
    ...local,
    mode: 'probe',
    status: 'fail',
    first_failure: reasonCode,
    checks: [...local.checks, {
      name: 'probe_transport', status: 'fail', reason_code: reasonCode,
      remediation_code: reasonCode === 'AUTH_FAILED' ? 'CHECK_INGEST_CREDENTIAL' : 'CHECK_TRACE_ENDPOINT',
      message: reasonCode === 'AUTH_FAILED'
        ? 'The project key was rejected by the existing trace API'
        : 'The existing trace ingestion or read path is unavailable',
    }],
  } as const;
}

function human(result: { status: string; first_failure?: unknown; checks?: readonly Readonly<{ status: string; reason_code: string; message: string }>[]; note?: string }): string {
  const lines = [`Neatlogs Doctor: ${result.status.toUpperCase()}`];
  for (const check of result.checks ?? []) lines.push(`${check.status === 'pass' ? 'PASS' : check.status === 'fail' ? 'FAIL' : 'INFO'} ${check.reason_code}: ${check.message}`);
  if (result.first_failure) lines.push(`First failure: ${String(result.first_failure)}`);
  if (result.note) lines.push(result.note);
  return lines.join('\n');
}

/** Run the credential-safe Doctor CLI. Returns a stable process exit code. */
export async function runDoctorCli(argv: readonly string[], overrides: Partial<DoctorCliIO> = {}): Promise<number> {
  const io = { ...defaultIO, ...overrides };
  const json = argv.includes('--json');
  const modes = ['--local', '--probe'].filter((flag) => argv.includes(flag));
  if (argv.includes('--help') || argv.includes('-h')) { io.stdout('Usage: neatlogs doctor (--local | --probe) [--json]'); return 0; }
  if (argv[0] !== 'doctor' || modes.length !== 1 || argv.some((arg) => !['doctor', '--local', '--probe', '--json'].includes(arg))) { io.stderr('Usage: neatlogs doctor (--local | --probe) [--json]'); return 4; }
  if (modes[0] === '--local') {
    try {
      const result = await localResult(io.env);
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
      return result.status === 'fail' ? 2 : result.status === 'warn' ? 1 : 0;
    } catch {
      const result = { format_version: DOCTOR_V2_FORMAT_VERSION, mode: 'local', status: 'fail', first_failure: 'INSTRUMENTOR_INACTIVE', checks: [{ name: 'local_envelope', status: 'fail', reason_code: 'INSTRUMENTOR_INACTIVE', remediation_code: 'ENABLE_INSTRUMENTOR', message: 'Doctor could not capture a local diagnostic envelope' }] } as const;
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
      const result = {
        format_version: DOCTOR_V2_FORMAT_VERSION, mode: 'probe', status: 'fail',
        first_failure: 'INSTRUMENTOR_INACTIVE',
        runtime: { language: 'typescript', sdk_version: 'unknown', schema_version: '2', transport: 'otlp_http_protobuf' },
        checks: [{ name: 'local_envelope', status: 'fail', reason_code: 'INSTRUMENTOR_INACTIVE', remediation_code: 'ENABLE_INSTRUMENTOR', message: 'Doctor could not capture a local diagnostic envelope' }],
      } as const;
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
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
    try {
      const local = await localResult(io.env);
      const result = {
        ...local, mode: 'probe', status: 'fail', first_failure: 'ENDPOINT_INVALID',
        checks: [...local.checks, {
          name: 'endpoint', status: 'fail', reason_code: 'ENDPOINT_INVALID', remediation_code: 'SET_ENDPOINT',
          message: 'Configure an absolute HTTP or HTTPS diagnostic endpoint',
        }],
      } as const;
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
    } catch {
      io.stderr('Doctor could not validate NEATLOGS_ENDPOINT');
    }
    return 3;
  }
  let local: Awaited<ReturnType<typeof localResult>> | null = null;
  try {
    local = await localResult(io.env, {
      exportProbe: true,
      probeExporter: io.probeExporter,
    });
    if (!local.capture || local.status === 'fail') throw new Error('Local diagnostic capture failed');
    const readbackUrl = new URL(
      `/api/traces/v3/${encodeURIComponent(local.capture.trace_id)}`,
      endpoint.origin,
    );
    let persisted: PersistedTrace | null = null;
    // Stay below Wizard's 60-second subprocess budget so the SDK can emit a
    // structured timeout result instead of being killed mid-JSON.
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const response = await io.fetch(readbackUrl, {
        method: 'GET',
        headers: { 'x-api-key': apiKey },
      });
      if (response.ok && response.status !== 202) {
        const value: unknown = await response.json().catch(() => null);
        if (!value || typeof value !== 'object') {
          throw new ProbeReadError('BACKEND_PROBE_UNAVAILABLE', 'Trace read-back returned an invalid response');
        }
        persisted = value as PersistedTrace;
        break;
      }
      if (response.status === 401 || response.status === 403) {
        throw new ProbeReadError('AUTH_FAILED', 'Trace read-back rejected the project key');
      }
      if (![202, 404].includes(response.status)) {
        throw new ProbeReadError('BACKEND_PROBE_UNAVAILABLE', `Trace read-back failed with HTTP ${response.status}`);
      }
      if (attempt < 44) await io.sleep(1_000);
    }
    if (!persisted) {
      throw new ProbeReadError('BACKEND_PROBE_UNAVAILABLE', 'Timed out waiting for the exact Doctor trace');
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
      : { format_version: DOCTOR_V2_FORMAT_VERSION, mode: 'probe', status: 'fail', first_failure: 'BACKEND_PROBE_UNAVAILABLE', reason_codes: ['BACKEND_PROBE_UNAVAILABLE'] } as const;
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result)); return 3;
  }
}
