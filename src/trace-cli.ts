export type TraceCliIO = Readonly<{
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  fetch: typeof globalThis.fetch;
  env: NodeJS.ProcessEnv;
  requestTimeoutMs: number;
}>;

export const defaultTraceIO: TraceCliIO = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  fetch: globalThis.fetch,
  env: process.env,
  requestTimeoutMs: 5_000,
};

type Span = Record<string, unknown>;

export type TraceCheck = Readonly<{ name: string; status: 'pass' | 'fail'; message: string }>;

const DEFAULT_ENDPOINT = 'https://ingest.neatlogs.com';

export function traceUsage(): string {
  return 'Usage: neatlogs trace get <trace_id> [--json]\n' +
    'Reads a trace back with NEATLOGS_API_KEY (and optional NEATLOGS_ENDPOINT) and checks it.';
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Checks over a trace as the backend returns it.
export function checkTrace(trace: Record<string, unknown>): TraceCheck[] {
  const spans: Span[] = Array.isArray(trace.spans)
    ? trace.spans.filter((s): s is Span => !!s && typeof s === 'object')
    : [];
  const checks: TraceCheck[] = [];
  const add = (name: string, ok: boolean, message: string) =>
    checks.push({ name, status: ok ? 'pass' : 'fail', message });

  add('has_spans', spans.length > 0, `${spans.length} span(s) returned`);
  if (typeof trace.spanCount === 'number') {
    add('span_count_matches', trace.spanCount === spans.length,
      `spanCount=${trace.spanCount}, returned=${spans.length}`);
  }
  const ids = new Set(spans.map((s) => str(s.span_id)).filter(Boolean));
  const orphans = spans.filter((s) => {
    const parent = str(s.parent_span_id);
    return parent !== undefined && !ids.has(parent);
  });
  add('parents_resolve', orphans.length === 0,
    orphans.length === 0 ? 'every parent span is present' : `${orphans.length} span(s) point at a missing parent`);
  const unnamed = spans.filter((s) => !str(s.span_name) && !str(s.node_name));
  add('spans_named', unnamed.length === 0,
    unnamed.length === 0 ? 'every span has a name' : `${unnamed.length} span(s) have no name`);
  const llm = spans.filter((s) => /llm/i.test(String(s.node_type ?? s.span_type ?? '')));
  if (llm.length > 0 && typeof trace.totalTokensUsed === 'number') {
    add('llm_token_usage', trace.totalTokensUsed >= 0,
      `LLM span(s): ${llm.length}, totalTokensUsed=${trace.totalTokensUsed} (0 can mean the provider sent no usage)`);
  }
  if (trace.finalizationStatus !== undefined) {
    add('finalized', trace.finalizationStatus === 'finalized', `finalizationStatus=${String(trace.finalizationStatus)}`);
  }
  return checks;
}

// neatlogs trace get <trace_id>
// exit: 0 ok, 1 check failed, 2 not ready or not found, 3 key, 4 usage, 5 error (incl. 409 failed ingestion)
export async function runTraceCli(
  argv: readonly string[],
  overrides: Partial<TraceCliIO> = {},
): Promise<number> {
  const io: TraceCliIO = { ...defaultTraceIO, ...overrides };
  const json = argv.includes('--json');
  if (argv.includes("--help") || argv.includes("-h")) { io.stdout(traceUsage()); return 0; }
  const rest = argv.filter((a) => a !== '--json');
  if (rest[0] !== 'trace' || rest[1] !== 'get' || !rest[2] || rest.length !== 3 || rest[2].startsWith('-')) {
    io.stderr(traceUsage());
    return 4;
  }
  const traceId = rest[2];
  const apiKey = io.env.NEATLOGS_API_KEY?.trim();
  if (!apiKey) {
    io.stderr('NEATLOGS_API_KEY is not set');
    return 3;
  }
  let url: URL;
  try {
    const endpoint = new URL(io.env.NEATLOGS_ENDPOINT?.trim() || DEFAULT_ENDPOINT);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('bad');
    url = new URL(`/api/traces/v3/${encodeURIComponent(traceId)}`, endpoint.origin);
  } catch {
    io.stderr('NEATLOGS_ENDPOINT must be an absolute http(s) URL');
    return 4;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), io.requestTimeoutMs);
  let response: Response;
  try {
    response = await io.fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: { 'x-api-key': apiKey },
      signal: controller.signal,
    });
  } catch {
    io.stderr('Could not reach the trace read API');
    return 5;
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403) {
    io.stderr('Trace read rejected the API key');
    return 3;
  }
  if (response.status === 409) {
    io.stderr('Trace ingestion failed for good (HTTP 409, failed or dead-lettered); retrying will not help');
    return 5;
  }
  if ([202, 404].includes(response.status)) {
    io.stderr(`Trace not ready or not found (HTTP ${response.status}); retry after the app flushes`);
    return 2;
  }
  if (!response.ok) {
    io.stderr(`Trace read failed (HTTP ${response.status})`);
    return 5;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    io.stderr('Trace read returned invalid JSON');
    return 5;
  }
  if (!body || typeof body !== 'object') {
    io.stderr('Trace read returned an unexpected response');
    return 5;
  }
  const trace = body as Record<string, unknown>;
  const checks = checkTrace(trace);
  const failed = checks.filter((c) => c.status === 'fail');
  const spans: Span[] = Array.isArray(trace.spans) ? (trace.spans as Span[]) : [];
  const summary = {
    trace_id: str(trace._id) ?? traceId,
    status: trace.status,
    span_count: spans.length,
    total_tokens: trace.totalTokensUsed,
    spans: spans.map((s) => ({
      span_id: s.span_id, parent_span_id: s.parent_span_id,
      name: s.span_name ?? s.node_name, type: s.node_type ?? s.span_type,
    })),
    checks,
    result: failed.length === 0 ? 'pass' : 'fail',
  };
  if (json) {
    io.stdout(JSON.stringify(summary, null, 2));
  } else {
    io.stdout(`trace ${summary.trace_id}: ${summary.result} (${summary.span_count} spans)`);
    for (const c of checks) io.stdout(`  ${c.status === 'pass' ? 'ok  ' : 'FAIL'} ${c.name}: ${c.message}`);
  }
  return failed.length === 0 ? 0 : 1;
}
