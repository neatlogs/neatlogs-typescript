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

const DEFAULT_HOST = 'https://app.neatlogs.com';
const PAGE_LIMIT = 50;
const MAX_PAGES = 200;

export function traceUsage(): string {
  return 'Usage: neatlogs trace get <trace_id> [--json]\n' +
    'Reads a trace from the public API and checks it.\n' +
    'Needs NEATLOGS_TOKEN (service-account token with observability:read) and NEATLOGS_PROJECT_ID.\n' +
    'NEATLOGS_HOST sets the app origin (default https://app.neatlogs.com, EU: https://eu.app.neatlogs.com).';
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Checks over a trace and its spans as the public API returns them.
export function checkTrace(trace: Record<string, unknown>, spans: Span[]): TraceCheck[] {
  const checks: TraceCheck[] = [];
  const add = (name: string, ok: boolean, message: string) =>
    checks.push({ name, status: ok ? 'pass' : 'fail', message });

  add('has_spans', spans.length > 0, `${spans.length} span(s) returned`);
  if (typeof trace.spansCount === 'number') {
    add('span_count_matches', trace.spansCount === spans.length,
      `spansCount=${trace.spansCount}, returned=${spans.length}`);
  }
  const ids = new Set(spans.map((s) => str(s.spanId)).filter(Boolean));
  const orphans = spans.filter((s) => {
    const parent = str(s.parentSpanId);
    return parent !== undefined && !ids.has(parent);
  });
  add('parents_resolve', orphans.length === 0,
    orphans.length === 0 ? 'every parent span is present' : `${orphans.length} span(s) point at a missing parent`);
  const unnamed = spans.filter((s) => !str(s.spanName));
  add('spans_named', unnamed.length === 0,
    unnamed.length === 0 ? 'every span has a name' : `${unnamed.length} span(s) have no name`);
  const llm = spans.filter((s) => /llm/i.test(String(s.spanType ?? '')));
  if (llm.length > 0 && typeof trace.totalTokens === 'number') {
    add('llm_token_usage', trace.totalTokens >= 0,
      `LLM span(s): ${llm.length}, totalTokens=${trace.totalTokens} (0 can mean the provider sent no usage)`);
  }
  if (trace.finalizationStatus !== undefined) {
    add('finalized', trace.finalizationStatus === 'finalized', `finalizationStatus=${String(trace.finalizationStatus)}`);
  }
  return checks;
}

// neatlogs trace get <trace_id>
// exit: 0 ok, 1 check failed, 2 not ready or not found, 3 credentials, 4 usage, 5 error
export async function runTraceCli(
  argv: readonly string[],
  overrides: Partial<TraceCliIO> = {},
): Promise<number> {
  const io: TraceCliIO = { ...defaultTraceIO, ...overrides };
  const json = argv.includes('--json');
  if (argv.includes('--help') || argv.includes('-h')) { io.stdout(traceUsage()); return 0; }
  const rest = argv.filter((a) => a !== '--json');
  if (rest[0] !== 'trace' || rest[1] !== 'get' || !rest[2] || rest.length !== 3 || rest[2].startsWith('-')) {
    io.stderr(traceUsage());
    return 4;
  }
  const traceId = rest[2];
  const token = io.env.NEATLOGS_TOKEN?.trim();
  const projectId = io.env.NEATLOGS_PROJECT_ID?.trim();
  if (!token) {
    io.stderr('NEATLOGS_TOKEN is not set');
    return 3;
  }
  if (!projectId) {
    io.stderr('NEATLOGS_PROJECT_ID is not set');
    return 3;
  }
  let base: URL;
  try {
    base = new URL(io.env.NEATLOGS_HOST?.trim() || DEFAULT_HOST);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('bad');
  } catch {
    io.stderr('NEATLOGS_HOST must be an absolute http(s) URL');
    return 4;
  }
  const tracePath = `/api/v1/public/traces/${encodeURIComponent(traceId)}`;

  // one GET, returns the data object or an exit code
  const get = async (path: string, query: string, spansCall: boolean): Promise<Record<string, unknown> | number> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), io.requestTimeoutMs);
    let response: Response;
    try {
      response = await io.fetch(new URL(`${path}${query}`, base.origin), {
        method: 'GET',
        redirect: 'error',
        headers: { authorization: `Bearer ${token}`, 'x-project-id': projectId },
        signal: controller.signal,
      });
    } catch {
      io.stderr('Could not reach the trace read API');
      return 5;
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
      io.stderr(`Trace read rejected the credentials (HTTP ${response.status}); check the token scope, project id and host`);
      return 3;
    }
    // a 409 on spans while the trace is not dlq means it is still processing
    if (response.status === 404 || (spansCall && response.status === 409)) {
      io.stderr(`Trace not ready or not found (HTTP ${response.status}); retry after the app flushes`);
      return 2;
    }
    if (response.status === 429 || response.status === 503) {
      io.stderr(`Trace read is rate limited or unavailable (HTTP ${response.status}); retry after ${response.headers.get('retry-after') ?? 'a short wait'}`);
      return 5;
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
    const data = body && typeof body === 'object' ? (body as Record<string, unknown>).data : undefined;
    if (!data || typeof data !== 'object') {
      io.stderr('Trace read returned an unexpected response');
      return 5;
    }
    return data as Record<string, unknown>;
  };

  const trace = await get(tracePath, '', false);
  if (typeof trace === 'number') return trace;
  if (trace.finalizationStatus === 'dlq') {
    io.stderr('Trace ingestion failed for good (finalizationStatus=dlq); retrying will not help');
    return 5;
  }

  const spans: Span[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = `?limit=${PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await get(`${tracePath}/spans`, query, true);
    if (typeof data === 'number') return data;
    if (Array.isArray(data.spans)) spans.push(...data.spans.filter((s): s is Span => !!s && typeof s === 'object'));
    const next = (data.page as Record<string, unknown> | undefined)?.nextCursor;
    if (typeof next !== 'string' || !next) break;
    cursor = next;
    if (page === MAX_PAGES - 1) {
      io.stderr(`Span pagination incomplete: still more spans after ${MAX_PAGES} pages, so the trace was not checked`);
      return 5;
    }
  }

  const checks = checkTrace(trace, spans);
  const failed = checks.filter((c) => c.status === 'fail');
  const summary = {
    trace_id: str(trace.traceId) ?? traceId,
    status: trace.status,
    span_count: spans.length,
    total_tokens: trace.totalTokens,
    spans: spans.map((s) => ({
      span_id: s.spanId, parent_span_id: s.parentSpanId, name: s.spanName, type: s.spanType,
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
