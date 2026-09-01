import { span } from './decorators/orchestration.js';
import { trace, setTraceOutput } from './core/context.js';
import { doctorCapturedLocalV2, DOCTOR_V2_FORMAT_VERSION } from './doctor-v2.js';
import { flush, init, shutdown } from './init.js';
import { disableLogging, enableLogging } from './core/logger.js';

export type DoctorCliIO = Readonly<{ stdout: (line: string) => void; stderr: (line: string) => void; fetch: typeof globalThis.fetch; env: NodeJS.ProcessEnv; sleep: (milliseconds: number) => Promise<void> }>;
const defaultIO: DoctorCliIO = { stdout: (line) => process.stdout.write(`${line}\n`), stderr: (line) => process.stderr.write(`${line}\n`), fetch: globalThis.fetch, env: process.env, sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) };

async function localResult(env: NodeJS.ProcessEnv) {
  const flushTimeoutMs = 5_000;
  const started = Date.now();
  let traceId = '';
  disableLogging();
  try {
    await init({
      apiKey: env.NEATLOGS_API_KEY,
      workflowName: 'neatlogs.doctor.v2',
      disableExport: true,
      diagnosticCapture: true,
      registerShutdownHandlers: false,
      batchSize: 32,
      flushInterval: 60,
    });
    const diagnosticTool = span(
      { kind: 'TOOL', name: 'doctor.tool', toolName: 'diagnostic_tool' },
      async (input: { value: number }) => ({ value: input.value + 1 }),
    );
    await trace({ name: 'doctor.workflow', kind: 'WORKFLOW', sessionId: 'neatlogs-doctor-local' }, async (root) => {
      traceId = root.spanContext().traceId;
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

const REQUIRED_PROBE_STAGES = ['auth', 'schema_decode', 'pii', 'kafka', 'raw_durable', 'root_resolution', 'simplified_durable', 'visibility'] as const;
type SafeStage = Readonly<{ stage: string; status: string; reason_code: string; at?: string; span_count?: number; parent_mismatches?: number; missing_ids?: readonly string[]; missing_fields?: readonly string[]; semantic_digest?: string }>;

function safeStages(value: unknown): SafeStage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const stage = item as Record<string, unknown>;
    if (typeof stage.stage !== 'string' || typeof stage.status !== 'string' || typeof stage.reason_code !== 'string') return [];
    return [{ stage: stage.stage, status: stage.status, reason_code: stage.reason_code,
      ...(typeof stage.at === 'string' ? { at: stage.at } : {}),
      ...(Number.isInteger(stage.span_count) && (stage.span_count as number) >= 0 ? { span_count: stage.span_count as number } : {}),
      ...(Number.isInteger(stage.parent_mismatches) && (stage.parent_mismatches as number) >= 0 ? { parent_mismatches: stage.parent_mismatches as number } : {}),
      ...(Array.isArray(stage.missing_ids) ? { missing_ids: stage.missing_ids.filter((id): id is string => typeof id === 'string') } : {}),
      ...(Array.isArray(stage.missing_fields) ? { missing_fields: stage.missing_fields.filter((field): field is string => typeof field === 'string') } : {}),
      ...(typeof stage.semantic_digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(stage.semantic_digest) ? { semantic_digest: stage.semantic_digest } : {}),
    }];
  });
}

function safeSession(value: unknown): { diagnosticId?: string; probeToken?: string; createdAt?: string; expiresAt?: string; fixtureVersion?: string } {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  return {
    ...(typeof input.diagnostic_id === 'string' ? { diagnosticId: input.diagnostic_id } : {}),
    ...(typeof input.probe_token === 'string' ? { probeToken: input.probe_token } : {}),
    ...(typeof input.created_at === 'string' ? { createdAt: input.created_at } : {}),
    ...(typeof input.expires_at === 'string' ? { expiresAt: input.expires_at } : {}),
    ...(typeof input.fixture_version === 'string' ? { fixtureVersion: input.fixture_version } : {}),
  };
}

function safeReceipt(value: unknown): { status: string; firstFailure: string | null; diagnosticId?: string; createdAt?: string; expiresAt?: string; stages: SafeStage[]; localDigest?: string; backendDigest?: string } {
  if (!value || typeof value !== 'object') return { status: 'pending', firstFailure: null, stages: [] };
  const input = value as Record<string, unknown>;
  return {
    status: typeof input.status === 'string' ? input.status : 'pending',
    firstFailure: typeof input.first_failure === 'string' ? input.first_failure : null,
    ...(typeof input.diagnostic_id === 'string' ? { diagnosticId: input.diagnostic_id } : {}),
    ...(typeof input.created_at === 'string' ? { createdAt: input.created_at } : {}),
    ...(typeof input.expires_at === 'string' ? { expiresAt: input.expires_at } : {}),
    ...(typeof input.local_semantic_digest === 'string' ? { localDigest: input.local_semantic_digest } : {}),
    ...(typeof input.backend_semantic_digest === 'string' ? { backendDigest: input.backend_semantic_digest } : {}),
    stages: safeStages(input.stages),
  };
}

function probeResult(local: Awaited<ReturnType<typeof localResult>>, sessionId: string, receipt: ReturnType<typeof safeReceipt>) {
  const failed = receipt.stages.find((stage) => stage.status === 'failed');
  const digestMismatch =
    (!!receipt.localDigest && receipt.localDigest !== local.capture?.semantic_digest) ||
    (!!receipt.backendDigest && receipt.backendDigest !== local.capture?.semantic_digest);
  const completed = !digestMismatch && receipt.status === 'pass' && REQUIRED_PROBE_STAGES.every((required) => receipt.stages.some((stage) => stage.stage === required && stage.status === 'accepted'));
  const incomplete = receipt.status === 'expired' ? 'DIAGNOSTIC_EXPIRED' : 'STAGE_PENDING';
  const reason = digestMismatch ? 'DIGEST_MISMATCH' : receipt.firstFailure ?? failed?.reason_code ?? (completed ? null : incomplete);
  const probeCheck = completed
    ? { name: 'probe_visibility', status: 'pass', reason_code: 'DIAGNOSTIC_VISIBLE', remediation_code: 'NONE', message: 'The diagnostic trace reached the authenticated read path' }
    : { name: 'probe_visibility', status: 'fail', reason_code: reason ?? incomplete, remediation_code: digestMismatch ? 'CONTACT_SUPPORT' : 'WAIT_FOR_RECEIPT', message: 'The backend diagnostic did not reach confirmed visibility' };
  return {
    ...local,
    mode: 'probe',
    status: completed ? 'pass' : 'fail',
    first_failure: reason,
    probe: {
      diagnostic_id: sessionId,
      receipt_status: receipt.status,
      ...(receipt.expiresAt ? { expires_at: receipt.expiresAt } : {}),
      stages: receipt.stages,
    },
    checks: [...local.checks, probeCheck],
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
      remediation_code: reasonCode === 'AUTH_FAILED' ? 'CHECK_INGEST_CREDENTIAL' : 'CHECK_DIAGNOSTIC_ENDPOINT',
      message: reasonCode === 'AUTH_FAILED'
        ? 'The authenticated diagnostic session was rejected'
        : 'The backend diagnostic session is unavailable',
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
  try { endpoint = new URL(io.env.NEATLOGS_ENDPOINT?.trim() || 'https://ingest.neatlogs.com'); } catch {
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
  endpoint.pathname = '/api/diagnostics/v2/sessions'; endpoint.search = ''; endpoint.hash = '';
  let local: Awaited<ReturnType<typeof localResult>> | null = null;
  try {
    local = await localResult(io.env);
    if (!local.capture || local.status === 'fail') throw new Error('Local diagnostic capture failed');
    const headers = { 'content-type': 'application/json', 'x-api-key': apiKey };
    const response = await io.fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({
      envelope_digest: local.capture.semantic_digest,
      fixture_version: 'doctor-v2',
      trace_id: local.capture.trace_id,
    }) });
    if (!response.ok) {
      const result = failedProbeResult(local, response.status === 401 || response.status === 403 ? 'AUTH_FAILED' : 'BACKEND_PROBE_UNAVAILABLE');
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
      return 3;
    }
    const created = safeSession(await response.json().catch(() => ({})));
    if (!created.diagnosticId || !/^diag_[A-Za-z0-9_-]{16,128}$/.test(created.diagnosticId)) throw new Error('Diagnostic session creation failed');
    const sessionId = created.diagnosticId;
    const receiptUrl = new URL(`${endpoint.pathname}/${encodeURIComponent(sessionId)}`, endpoint);
    let current = safeReceipt({ diagnostic_id: sessionId, status: 'pending', stages: [] });
    try {
      const maxAttempts = 40; // 10-second bounded receipt window.
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const read = await io.fetch(receiptUrl, { method: 'GET', headers: { 'x-api-key': apiKey, ...(created.probeToken ? { 'x-neatlogs-diagnostic-token': created.probeToken } : {}) } });
        if (!read.ok) break;
        current = safeReceipt(await read.json().catch(() => ({})));
        const state = probeResult(local, sessionId, current);
        if (state.status === 'pass' || current.stages.some((stage) => stage.status === 'failed')) break;
        if (attempt < maxAttempts - 1) await io.sleep(250);
      }
      const result = probeResult(local, sessionId, current);
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
      return result.status === 'pass' ? 0 : 3;
    } finally {
      void io.fetch(receiptUrl, { method: 'DELETE', headers: { 'x-api-key': apiKey } }).catch(() => undefined);
    }
  } catch {
    const result = local
      ? failedProbeResult(local, 'BACKEND_PROBE_UNAVAILABLE')
      : { format_version: DOCTOR_V2_FORMAT_VERSION, mode: 'probe', status: 'fail', first_failure: 'BACKEND_PROBE_UNAVAILABLE', reason_codes: ['BACKEND_PROBE_UNAVAILABLE'] } as const;
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result)); return 3;
  }
}
