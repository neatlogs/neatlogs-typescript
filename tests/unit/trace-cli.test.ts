import { describe, expect, it } from 'vitest';
import { runTraceCli } from '../../src/trace-cli.js';

function io(response: () => Response | Promise<Response>, env: NodeJS.ProcessEnv = { NEATLOGS_API_KEY: 'k' }) {
  const out: string[] = [];
  const err: string[] = [];
  const urls: string[] = [];
  return {
    out, err, urls,
    overrides: {
      stdout: (l: string) => out.push(l),
      stderr: (l: string) => err.push(l),
      env,
      fetch: (async (input: URL | string) => { urls.push(String(input)); return response(); }) as typeof fetch,
    },
  };
}
const good = {
  _id: 't1', status: 'success', finalizationStatus: 'finalized', spanCount: 2, totalTokensUsed: 5,
  spans: [
    { span_id: 'a', span_name: 'root', node_type: 'workflow' },
    { span_id: 'b', parent_span_id: 'a', span_name: 'chat', node_type: 'llm' },
  ],
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe('neatlogs trace get', () => {
  it('passes a healthy trace and reads the existing read path', async () => {
    const t = io(() => json(good));
    expect(await runTraceCli(['trace', 'get', 't1', '--json'], t.overrides)).toBe(0);
    expect(t.urls[0]).toBe('https://ingest.neatlogs.com/api/traces/v3/t1');
    expect(JSON.parse(t.out[0]!).result).toBe('pass');
  });
  it('fails a trace with a missing parent and unnamed span', async () => {
    const bad = { ...good, spans: [{ span_id: 'a', parent_span_id: 'zzz' }, good.spans[1]] };
    const t = io(() => json(bad));
    expect(await runTraceCli(['trace', 'get', 't1', '--json'], t.overrides)).toBe(1);
    const names = JSON.parse(t.out[0]!).checks.filter((c: { status: string }) => c.status === 'fail').map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(['parents_resolve', 'spans_named']));
  });
  it('maps statuses to exit codes without leaking the key', async () => {
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => json({}, 404)).overrides)).toBe(2);
    const a = io(() => json({}, 401));
    expect(await runTraceCli(['trace', 'get', 't1'], a.overrides)).toBe(3);
    expect(a.err.join()).not.toContain('k"');
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => json({}), {}).overrides)).toBe(3);
    expect(await runTraceCli(['trace', 'get'], io(() => json({})).overrides)).toBe(4);
    expect(await runTraceCli(['trace', 'get', 't1'], io(() => json({}, 500)).overrides)).toBe(5);
  });
  it('treats a 409 as a permanent failure, not a retry', async () => {
    const t = io(() => json({}, 409));
    expect(await runTraceCli(['trace', 'get', 't1'], t.overrides)).toBe(5);
    expect(t.err.join()).toContain('retrying will not help');
  });
  it('lets a trace with zero reported tokens pass', async () => {
    const zero = { ...good, totalTokensUsed: 0 };
    const t = io(() => json(zero));
    expect(await runTraceCli(['trace', 'get', 't1', '--json'], t.overrides)).toBe(0);
  });
  it('honours NEATLOGS_ENDPOINT and encodes the id', async () => {
    const t = io(() => json(good), { NEATLOGS_API_KEY: 'k', NEATLOGS_ENDPOINT: 'http://localhost:9' });
    await runTraceCli(['trace', 'get', 'a/b'], t.overrides);
    expect(t.urls[0]).toBe('http://localhost:9/api/traces/v3/a%2Fb');
  });
});
