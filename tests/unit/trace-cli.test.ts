import { describe, expect, it } from 'vitest';
import { runTraceCli } from '../../src/trace-cli.js';

type Call = { url: string; headers: Record<string, string> };
const env = { NEATLOGS_TOKEN: 'tok-secret', NEATLOGS_PROJECT_ID: '11111111-1111-4111-8111-111111111111' };

function io(route: (url: URL) => Response, e: NodeJS.ProcessEnv = env) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: Call[] = [];
  return {
    out, err, calls,
    overrides: {
      stdout: (l: string) => out.push(l),
      stderr: (l: string) => err.push(l),
      env: e,
      fetch: (async (input: URL | string, init?: RequestInit) => {
        calls.push({ url: String(input), headers: init?.headers as Record<string, string> });
        return route(new URL(String(input)));
      }) as typeof fetch,
    },
  };
}
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, requestId: 'r1' }), { status: 200 });
const status = (s: number) => new Response('{}', { status: s });
const traceData = {
  traceId: 't1', status: 'success', finalizationStatus: 'finalized', spansCount: 2, totalTokens: 5,
};
const spanA = { spanId: 'a', parentSpanId: null, spanName: 'root', spanType: 'workflow' };
const spanB = { spanId: 'b', parentSpanId: 'a', spanName: 'chat', spanType: 'llm' };
const healthy = (url: URL) =>
  url.pathname.endsWith('/spans')
    ? ok({ spans: [spanA, spanB], page: { hasMore: false, limit: 50, nextCursor: null } })
    : ok(traceData);
const args = ['trace', 'get', 't1', '--json'];

describe('neatlogs trace get', () => {
  it('passes a healthy trace using the public api with bearer auth and project id', async () => {
    const t = io(healthy);
    expect(await runTraceCli(args, t.overrides)).toBe(0);
    expect(t.calls[0]!.url).toBe('https://app.neatlogs.com/api/v1/public/traces/t1');
    expect(t.calls[1]!.url).toBe('https://app.neatlogs.com/api/v1/public/traces/t1/spans?limit=50');
    expect(t.calls[0]!.headers).toEqual({ authorization: 'Bearer tok-secret', 'x-project-id': env.NEATLOGS_PROJECT_ID });
    expect(JSON.parse(t.out[0]!).result).toBe('pass');
  });
  it('follows span pages until nextCursor is empty', async () => {
    const t = io((url) => {
      if (!url.pathname.endsWith('/spans')) return ok(traceData);
      return url.searchParams.get('cursor') === 'c2'
        ? ok({ spans: [spanB], page: { hasMore: false, limit: 50, nextCursor: null } })
        : ok({ spans: [spanA], page: { hasMore: true, limit: 50, nextCursor: 'c2' } });
    });
    expect(await runTraceCli(args, t.overrides)).toBe(0);
    expect(t.calls).toHaveLength(3);
    expect(t.calls[2]!.url).toContain('cursor=c2');
    expect(JSON.parse(t.out[0]!).span_count).toBe(2);
  });
  it('fails a trace with a missing parent and an unnamed span', async () => {
    const t = io((url) => url.pathname.endsWith('/spans')
      ? ok({ spans: [{ ...spanA, parentSpanId: 'zzz', spanName: '' }, spanB], page: { hasMore: false, limit: 50, nextCursor: null } })
      : ok(traceData));
    expect(await runTraceCli(args, t.overrides)).toBe(1);
    const names = JSON.parse(t.out[0]!).checks.filter((c: { status: string }) => c.status === 'fail').map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(['parents_resolve', 'spans_named']));
  });
  it('reports a dlq trace as a terminal failure before reading spans', async () => {
    const t = io((url) => (url.pathname.endsWith('/spans') ? status(409) : ok({ ...traceData, finalizationStatus: 'dlq' })));
    expect(await runTraceCli(['trace', 'get', 't1'], t.overrides)).toBe(5);
    expect(t.calls).toHaveLength(1);
    expect(t.err.join()).toContain('dlq');
  });
  it('reports a pending trace with a 409 on spans as not ready', async () => {
    const t = io((url) => (url.pathname.endsWith('/spans') ? status(409) : ok({ ...traceData, finalizationStatus: 'pending' })));
    expect(await runTraceCli(['trace', 'get', 't1'], t.overrides)).toBe(2);
    expect(t.err.join()).toContain('not ready');
  });
  it('does not check a partial span set when pagination hits the cap', async () => {
    const t = io((url) => (url.pathname.endsWith('/spans')
      ? ok({ spans: [spanA], page: { hasMore: true, limit: 50, nextCursor: 'more' } })
      : ok(traceData)));
    expect(await runTraceCli(args, t.overrides)).toBe(5);
    expect(t.out).toHaveLength(0);
    expect(t.err.join()).toContain('pagination incomplete');
    expect(t.calls).toHaveLength(201);
  });
  it('fails a pending trace and passes zero reported tokens', async () => {
    const dlq = io((url) => (url.pathname.endsWith('/spans') ? healthy(url) : ok({ ...traceData, finalizationStatus: 'pending', totalTokens: 0 })));
    expect(await runTraceCli(args, dlq.overrides)).toBe(1);
    const checks = JSON.parse(dlq.out[0]!).checks as { name: string; status: string }[];
    expect(checks.find((c) => c.name === 'finalized')!.status).toBe('fail');
    expect(checks.find((c) => c.name === 'llm_token_usage')!.status).toBe('pass');
  });
  it('maps statuses to exit codes without leaking the token', async () => {
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => status(404)).overrides)).toBe(2);
    const a = io(() => status(401));
    expect(await runTraceCli(['trace', 'get', 't1'], a.overrides)).toBe(3);
    expect(a.err.join()).not.toContain('tok-secret');
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => status(403)).overrides)).toBe(3);
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => status(500)).overrides)).toBe(5);
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => status(429)).overrides)).toBe(5);
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => status(409)).overrides)).toBe(5);
  });
  it('treats a 409 on the spans page as not ready', async () => {
    const t = io((url) => (url.pathname.endsWith('/spans') ? status(409) : ok(traceData)));
    expect(await runTraceCli(['trace', 'get', 't1'], t.overrides)).toBe(2);
  });
  it('needs a token and a project id', async () => {
    expect(await runTraceCli(['trace', 'get', 't1'], io(healthy, { NEATLOGS_PROJECT_ID: 'p' }).overrides)).toBe(3);
    expect(await runTraceCli(['trace', 'get', 't1'], io(healthy, { NEATLOGS_TOKEN: 't' }).overrides)).toBe(3);
    expect(await runTraceCli(['trace', 'get'], io(healthy).overrides)).toBe(4);
  });
  it('honours NEATLOGS_HOST and encodes the id', async () => {
    const t = io(healthy, { ...env, NEATLOGS_HOST: 'https://eu.app.neatlogs.com' });
    await runTraceCli(['trace', 'get', 'a/b'], t.overrides);
    expect(t.calls[0]!.url).toBe('https://eu.app.neatlogs.com/api/v1/public/traces/a%2Fb');
  });
});
