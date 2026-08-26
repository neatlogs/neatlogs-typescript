import { doctor, type DoctorCheck } from './doctor.js';
import { DOCTOR_V2_FORMAT_VERSION } from './doctor-v2.js';
import { TELEMETRY_SCHEMA_VERSION } from './schema-v2.js';
import { __version__ } from './version.js';

export type DoctorCliIO = Readonly<{ stdout: (line: string) => void; stderr: (line: string) => void; fetch: typeof globalThis.fetch; env: NodeJS.ProcessEnv; sleep: (milliseconds: number) => Promise<void> }>;
const defaultIO: DoctorCliIO = { stdout: (line) => process.stdout.write(`${line}\n`), stderr: (line) => process.stderr.write(`${line}\n`), fetch: globalThis.fetch, env: process.env, sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) };

function localResult(env: NodeJS.ProcessEnv) {
  const result = doctor({ endpoint: env.NEATLOGS_ENDPOINT });
  const exportDisabled = ['true', '1', 'yes'].includes((env.NEATLOGS_DISABLE_EXPORT ?? '').toLowerCase());
  const credentialCheck: DoctorCheck = exportDisabled
    ? { name: 'credentials', status: 'warn', reason_code: 'EXPORT_DISABLED', message: 'Export is explicitly disabled; no ingestion credential is required' }
    : env.NEATLOGS_API_KEY?.trim()
      ? { name: 'credentials', status: 'pass', reason_code: 'CREDENTIAL_PRESENT', message: 'A non-empty ingestion credential is configured' }
      : { name: 'credentials', status: 'fail', reason_code: 'MISSING_CREDENTIALS', message: 'Set NEATLOGS_API_KEY to enable telemetry export' };
  const checks = [credentialCheck, ...result.checks];
  const failed = checks.find((check) => check.status === 'fail');
  const warning = checks.some((check) => check.status === 'warn');
  return { format_version: DOCTOR_V2_FORMAT_VERSION, mode: 'local', status: failed ? 'fail' : warning ? 'warn' : 'pass', first_failure: failed?.reason_code ?? null, runtime: { language: 'typescript', sdk_version: __version__, schema_version: String(TELEMETRY_SCHEMA_VERSION), transport: 'otlp_http_protobuf' }, capture: null, checks, note: 'Standalone local mode is read-only. Call doctorCapturedLocalV2() inside the instrumented process to inspect its final masked export envelope.' } as const;
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

function probeResult(sessionId: string, receipt: ReturnType<typeof safeReceipt>) {
  const failed = receipt.stages.find((stage) => stage.status === 'failed');
  const completed = receipt.status === 'pass' && REQUIRED_PROBE_STAGES.every((required) => receipt.stages.some((stage) => stage.stage === required && stage.status === 'accepted'));
  const incomplete = receipt.status === 'expired' ? 'BACKEND_PROBE_EXPIRED' : 'BACKEND_PROBE_INCOMPLETE';
  return {
    format_version: DOCTOR_V2_FORMAT_VERSION,
    mode: 'probe',
    status: failed || !completed ? 'fail' : 'pass',
    diagnostic_session_id: sessionId,
    ...(receipt.createdAt ? { created_at: receipt.createdAt } : {}),
    ...(receipt.expiresAt ? { expires_at: receipt.expiresAt } : {}),
    ...(receipt.localDigest ? { local_semantic_digest: receipt.localDigest } : {}),
    ...(receipt.backendDigest ? { backend_semantic_digest: receipt.backendDigest } : {}),
    stages: receipt.stages,
    first_failure: receipt.firstFailure ?? failed?.reason_code ?? (completed ? null : incomplete),
    reason_codes: receipt.firstFailure ? [receipt.firstFailure] : failed ? [failed.reason_code] : completed ? [] : [incomplete],
  } as const;
}

function human(result: { status: string; first_failure?: unknown; checks?: readonly DoctorCheck[]; note?: string }): string {
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
    const result = localResult(io.env);
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
    return result.status === 'fail' ? 2 : result.status === 'warn' ? 1 : 0;
  }
  const apiKey = io.env.NEATLOGS_API_KEY?.trim();
  if (!apiKey) {
    const result = { format_version: DOCTOR_V2_FORMAT_VERSION, mode: 'probe', status: 'fail', first_failure: 'MISSING_CREDENTIALS', reason_codes: ['MISSING_CREDENTIALS'] };
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result)); return 3;
  }
  let endpoint: URL;
  try { endpoint = new URL(io.env.NEATLOGS_ENDPOINT?.trim() || 'https://ingest.neatlogs.com'); } catch { io.stderr('Invalid NEATLOGS_ENDPOINT'); return 4; }
  endpoint.pathname = '/api/diagnostics/v2/sessions'; endpoint.search = ''; endpoint.hash = '';
  try {
    const headers = { 'content-type': 'application/json', 'x-api-key': apiKey };
    const response = await io.fetch(endpoint, { method: 'POST', headers, body: '{}' });
    const created = safeSession(await response.json().catch(() => ({})));
    if (!response.ok || !created.diagnosticId || !/^diag_[A-Za-z0-9_-]{16,128}$/.test(created.diagnosticId)) throw new Error('Diagnostic session creation failed');
    const sessionId = created.diagnosticId;
    const receiptUrl = new URL(`${endpoint.pathname}/${encodeURIComponent(sessionId)}`, endpoint);
    let current = safeReceipt({ diagnostic_id: sessionId, status: 'pending', stages: [] });
    try {
      const maxAttempts = 40; // 10-second bounded receipt window.
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const read = await io.fetch(receiptUrl, { method: 'GET', headers: { 'x-api-key': apiKey, ...(created.probeToken ? { 'x-neatlogs-diagnostic-token': created.probeToken } : {}) } });
        if (!read.ok) break;
        current = safeReceipt(await read.json().catch(() => ({})));
        const state = probeResult(sessionId, current);
        if (state.status === 'pass' || current.stages.some((stage) => stage.status === 'failed')) break;
        if (attempt < maxAttempts - 1) await io.sleep(250);
      }
      const result = probeResult(sessionId, current);
      io.stdout(json ? JSON.stringify(result, null, 2) : human(result));
      return result.status === 'pass' ? 0 : 3;
    } finally {
      void io.fetch(receiptUrl, { method: 'DELETE', headers: { 'x-api-key': apiKey } }).catch(() => undefined);
    }
  } catch {
    const result = { format_version: DOCTOR_V2_FORMAT_VERSION, mode: 'probe', status: 'fail', first_failure: 'BACKEND_PROBE_UNAVAILABLE', reason_codes: ['BACKEND_PROBE_UNAVAILABLE'] };
    io.stdout(json ? JSON.stringify(result, null, 2) : human(result)); return 3;
  }
}
