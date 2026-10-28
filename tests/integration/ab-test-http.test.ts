import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbTestClient } from '../../src/ab-test/client.js';
import { abConfigSchema, assignmentBucket } from '../../src/ab-test/protocol.js';
import { abTest, chooseAbTest, recordAbTestRun, completeAbTestDecision, getAbTestClient } from '../../src/ab-test/shared.js';
import { init, flush, shutdown } from '../../src/init.js';
import { trace } from '../../src/core/context.js';
import { ReplaySession } from '../../src/replay/session.js';

const servers: Server[] = [];
const clients: AbTestClient[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const client of clients.splice(0)) client.close();
  await shutdown();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});
function config(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1, id: '00000000-0000-4000-8000-000000000001', key: 'cheap-model',
    revision: 1, allocationVersion: 1, salt: '0123456789abcdef'.repeat(4), unit: 'end_user',
    status: 'running', enabled: true, defaultArm: 'a', expiresAt: new Date(Date.now() + 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(), refreshAfterSeconds: 60,
    assignment: 'sha256_utf8_salt_colon_unit_first_uint32_be_mod_10000', etag: '"ab-1"',
    arms: [
      { key: 'a', label: 'Original', params: { model: 'original' }, weight: 2000 },
      { key: 'b', label: 'New', params: { model: 'cheap' }, weight: 8000 },
    ], ...overrides,
  };
}
async function server(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): Promise<string> {
  const value = createServer((req, res) => { void Promise.resolve(handler(req, res)).catch(() => res.destroy()); });
  servers.push(value);
  await new Promise<void>(resolve => value.listen(0, '127.0.0.1', resolve));
  const address = value.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  return `http://127.0.0.1:${address.port}`;
}
function json(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString());
}
function client(baseUrl: string): AbTestClient {
  const value = new AbTestClient({ baseUrl, apiKey: 'test-project-key', keys: ['cheap-model'] });
  clients.push(value); return value;
}

describe('A/B assignment and exposure HTTP protocol', () => {
  it('uses monotonic rollout assignments and returns control after the monitoring deadline', async () => {
    let percentage = 50;
    const baseUrl = await server((_req, res) => json(res, config({
      phase: 'rollout', rolloutPercentage: percentage, allocationVersion: percentage === 50 ? 2 : 3,
      revision: percentage === 50 ? 2 : 3, status: percentage === 50 ? 'ramping' : 'shipped',
      endsAt: new Date(Date.now() + 50000).toISOString(),
      arms: [{ key: 'a', label: 'Original', params: { model: 'original' }, weight: 10000 - percentage * 100 },
        { key: 'b', label: 'New', params: { model: 'cheap' }, weight: percentage * 100 }],
    })));
    const ab = client(baseUrl); await ab.start();
    const earlier = Array.from({ length: 100 }, (_, i) => ab.assign('cheap-model', { unit: `unit-${i}` }));
    expect(earlier.some(item => item.arm === 'a')).toBe(true);
    expect(earlier.some(item => item.arm === 'b')).toBe(true);
    expect(earlier.every(item => item.allocationVersion === 2)).toBe(true);
    percentage = 100; await ab.refresh();
    for (let i = 0; i < earlier.length; i++) expect(ab.assign('cheap-model', { unit: `unit-${i}` })).toMatchObject({ arm: 'b', allocationVersion: 3, reason: 'assigned' });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 55000);
    expect(ab.assign('cheap-model', { unit: 'unit-0' })).toMatchObject({ arm: 'a', reason: 'default' });
    vi.mocked(Date.now).mockReturnValue(now + 61000);
    expect(ab.assign('cheap-model', { unit: 'unit-0', fallback: { model: 'safe' } })).toMatchObject({ arm: 'a', reason: 'unavailable', allocationVersion: null });
    vi.restoreAllMocks();
  });

  it('keeps delayed closure on the original epoch and requires a version for ambiguous reuse', async () => {
    let epoch = 1;
    const bodies: Record<string, unknown>[] = [];
    const baseUrl = await server(async (req, res) => {
      if (req.method !== 'GET') { bodies.push(await readBody(req) as Record<string, unknown>); return json(res, { accepted: true }); }
      json(res, config(epoch === 1 ? {} : { phase: 'rollout', rolloutPercentage: 50, status: 'ramping', revision: 2, allocationVersion: 2,
        arms: [{ key: 'a', label: 'Original', params: {}, weight: 5000 }, { key: 'b', label: 'New', params: {}, weight: 5000 }] }));
    });
    const ab = client(baseUrl); await ab.start();
    const old = { unitId: 'user-1', arm: 'b' as const, traceId: 'trace-old' };
    expect(ab.logExposure('cheap-model', old)).toBe(true);
    epoch = 2; await ab.refresh();
    expect(ab.completeUnit('cheap-model', { ...old, source: 'external' })).toBe(true);
    expect(ab.logExposure('cheap-model', old)).toBe(true);
    expect(ab.completeUnit('cheap-model', { ...old, source: 'external' })).toBe(false);
    expect(ab.completeUnit('cheap-model', { ...old, source: 'external', allocationVersion: 2 })).toBe(true);
    expect(ab.completeUnit('cheap-model', { ...old, traceId: 'unseen', source: 'external' })).toBe(false);
    expect(await ab.flush()).toBe(true);
    expect(bodies.map(item => [item.allocationVersion, item.unitComplete])).toEqual([[1, false], [1, true], [2, false], [2, true]]);
  });

  it('rejects contradictory rollout settings and out-of-range epochs', () => {
    const rollout = config({ phase: 'rollout', rolloutPercentage: 100, status: 'shipped', allocationVersion: 3,
      arms: [{ key: 'a', label: 'Original', params: {}, weight: 0 }, { key: 'b', label: 'New', params: {}, weight: 10000 }] });
    expect(abConfigSchema.safeParse(rollout).success).toBe(true);
    for (const patch of [{ phase: undefined }, { allocationVersion: 1 }, { allocationVersion: 2_147_483_648 },
      { rolloutPercentage: 50 }, { status: 'running' }, { defaultArm: 'b' }, { enabled: false }])
      expect(abConfigSchema.safeParse({ ...rollout, ...patch }).success).toBe(false);
    expect(abConfigSchema.safeParse(config({ allocationVersion: 2 })).success).toBe(false);
    expect(abConfigSchema.safeParse({ ...rollout, enabled: false, status: 'rolled_back',
      arms: [{ key: 'a', label: 'Original', params: {}, weight: 10000 }, { key: 'b', label: 'New', params: {}, weight: 0 }] }).success).toBe(true);
  });

  it('keeps local replay out of production A/B exposure counts', async () => {
    const methods: string[] = [];
    const baseUrl = await server((req, res) => { methods.push(req.method ?? ''); json(res, config()); });
    const ab = client(baseUrl); await ab.start();
    const replay = new ReplaySession({ version: 1, sourceTraceId: 'saved', entries: [] }, { mode: 'tools_only' });
    replay.run(() => {
      expect(ab.assign('cheap-model', { unit: 'user-1' }).reason).toBe('assigned');
      expect(ab.logExposure('cheap-model', { unitId: 'user-1', arm: 'b', traceId: 'generated' })).toBe(false);
      expect(ab.completeUnit('cheap-model', { unitId: 'user-1', arm: 'b', traceId: 'generated' })).toBe(false);
    });
    expect(await ab.flush()).toBe(true);
    expect(methods).toEqual(['GET']);
  });
  it('uses the same UTF-8 hash vectors across SDKs', () => {
    const salt = '0123456789abcdef'.repeat(4);
    expect(assignmentBucket(salt, 'user-1')).toBe(2509);
    expect(assignmentBucket(salt, '用户-α')).toBe(2445);
    expect(assignmentBucket(salt, 'session:42')).toBe(4105);
  });

  it('fetches at start, assigns without network, copies params, and handles ETag refresh', async () => {
    const requests: string[] = [];
    const baseUrl = await server((req, res) => {
      expect(req.headers.authorization).toBe('Bearer test-project-key');
      requests.push(req.url ?? '');
      if (req.headers['if-none-match']) {
        expect(req.headers['if-none-match']).toBe('"ab-1"');
        res.writeHead(304, { 'X-AB-Config-Expires-At': new Date(Date.now() + 60000).toISOString() }); res.end();
      } else json(res, config());
    });
    const ab = client(baseUrl);
    await ab.start();
    const first = ab.assign('cheap-model', { unit: 'user-1' });
    expect(first).toMatchObject({ arm: 'b', params: { model: 'cheap' }, reason: 'assigned' });
    first.params.model = 'mutated';
    for (let i = 0; i < 100; i++) expect(ab.assign('cheap-model', { unit: 'user-1' }).params.model).toBe('cheap');
    expect(requests).toEqual(['/api/v1/ab-tests/cheap-model/config']);
    await Promise.all([ab.refresh(), ab.refresh()]);
    expect(requests).toHaveLength(2);
  });

  it('retains valid settings on transient refresh failure and honors shipped defaults', async () => {
    let fail = false;
    let shipped = false;
    const baseUrl = await server((_req, res) => {
      if (fail) return json(res, {}, 503);
      json(res, config(shipped ? {
        status: 'shipped', enabled: false, defaultArm: 'b', revision: 2,
        arms: [
          { key: 'a', label: 'Original', params: { model: 'original' }, weight: 0 },
          { key: 'b', label: 'New', params: { model: 'cheap' }, weight: 10000 },
        ],
      } : {}));
    });
    const ab = client(baseUrl);
    await ab.start();
    fail = true; await ab.refresh();
    expect(ab.assign('cheap-model', { unit: 'user-1' })).toMatchObject({ arm: 'b', reason: 'assigned' });
    fail = false; shipped = true; await ab.refresh();
    expect(ab.assign('cheap-model', { unit: 'user-1' })).toMatchObject({ arm: 'b', reason: 'default' });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
    expect(ab.assign('cheap-model', { unit: 'user-1' }).reason).toBe('unavailable');
    vi.restoreAllMocks();
  });

  it.each([408, 429, 500, 503, 'disconnect', 'interrupted'])(
    'retains settings only until their original expiry after %s', async failure => {
      const original = config({ expiresAt: new Date(Date.now() + 20000).toISOString() });
      let fail = false;
      const baseUrl = await server((_req, res) => {
        if (!fail) return json(res, original);
        if (failure === 'disconnect') return res.destroy();
        if (failure === 'interrupted') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.write('{"protocolVersion":');
          setImmediate(() => res.destroy());
          return;
        }
        json(res, {}, failure as number);
      });
      const ab = client(baseUrl);
      await ab.start();
      fail = true;
      const now = vi.spyOn(Date, 'now');
      try {
        now.mockReturnValue(Date.parse(original.expiresAt) - 1);
        await ab.refresh();
        expect(ab.choose('cheap-model', { unit: 'user-1' }).reason).toBe('assigned');
        now.mockReturnValue(Date.parse(original.expiresAt));
        await ab.refresh();
        expect(ab.choose('cheap-model', { unit: 'user-1', fallback: { model: 'safe' } }))
          .toMatchObject({ reason: 'unavailable', params: { model: 'safe' } });
      } finally { now.mockRestore(); }
    },
  );

  it.each([401, 403, 404, 302, 'invalid'])(
    'invalidates unexpired settings immediately after %s', async failure => {
      let fail = false;
      const baseUrl = await server((_req, res) => {
        if (!fail) return json(res, config());
        if (failure === 'invalid') return json(res, config({ revision: 0 }));
        json(res, {}, failure as number);
      });
      const ab = client(baseUrl);
      await ab.start();
      fail = true;
      await ab.refresh();
      expect(ab.choose('cheap-model', { unit: 'user-1' }).reason).toBe('unavailable');
    },
  );

  it.each([503, 401])('classifies HTTP %s even when response disposal fails', async status => {
    const baseUrl = await server((_req, res) => json(res, config()));
    const ab = client(baseUrl);
    await ab.start();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({
      cancel: () => Promise.reject(new Error('response cleanup failed')),
    }), { status }));
    try {
      await ab.refresh();
      expect(ab.choose('cheap-model', { unit: 'user-1' }).reason)
        .toBe(status === 503 ? 'assigned' : 'unavailable');
    } finally { fetch.mockRestore(); }
  });

  it('preserves exposure IDs and ordering while trace finalization catches up', async () => {
    const bodies: unknown[] = [];
    let ready = false;
    const baseUrl = await server(async (req, res) => {
      if (req.method === 'GET') return json(res, config());
      bodies.push(await readBody(req));
      json(res, ready ? { accepted: true } : { code: 'AB_TRACE_NOT_READY' }, ready ? 200 : 409);
    });
    const ab = client(baseUrl); await ab.start();
    const exposure = { unitId: 'user-1', arm: 'b' as const, traceId: 'trace-1' };
    expect(ab.logExposure('cheap-model', exposure)).toBe(true);
    expect(ab.logExposure('cheap-model', exposure)).toBe(true);
    expect(ab.completeUnit('cheap-model', { ...exposure, source: 'external' })).toBe(true);
    expect(await ab.flush()).toBe(false);
    expect(bodies).toHaveLength(1);
    ready = true;
    expect(await ab.flush()).toBe(true);
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toMatchObject({ source: 'external', unitComplete: false });
    expect(bodies[2]).toMatchObject({ unitComplete: true });
    expect(ab.getDiagnostics()).toEqual({ pending: 0, rejected: 0 });
  });

  it('starts through init and stamps the current trace before queueing an SDK exposure', async () => {
    const exposures: unknown[] = [];
    const paths: string[] = [];
    const baseUrl = await server(async (req, res) => {
      paths.push(req.url ?? '');
      if (req.method === 'GET') return json(res, config());
      if (req.url === '/v1/traces') {
        for await (const _chunk of req) { /* Drain the OTLP protobuf request. */ }
        res.writeHead(200, { 'Content-Type': 'application/x-protobuf' }); res.end(); return;
      }
      exposures.push(await readBody(req)); json(res, { accepted: true });
    });
    await init({ apiKey: 'test-project-key', endpoint: baseUrl, experiments: { keys: ['cheap-model'], baseUrl }, registerShutdownHandlers: false });
    let traceId = '';
    await trace({ name: 'ab-example', endUserId: 'user-1' }, async span => {
      traceId = span.spanContext().traceId;
      expect(abTest('cheap-model', { unit: 'user-1' }).arm).toBe('b');
      expect(getAbTestClient()?.getDiagnostics().pending).toBe(1);
    });
    expect(exposures).toHaveLength(0);
    expect(await flush()).toBe(true);
    expect(exposures[0]).toMatchObject({ unitId: 'user-1', traceId, source: 'sdk', arm: 'b' });
    expect(paths.indexOf('/v1/traces')).toBeGreaterThan(-1);
    expect(paths.lastIndexOf('/v1/traces')).toBeLessThan(paths.indexOf('/api/v1/ab-tests/cheap-model/exposures'));
    expect(await shutdown()).toBe(true);
  });

  it('counts only executed choices and preserves failed agent attempts', async () => {
    const exposures: Record<string, unknown>[] = [];
    const baseUrl = await server(async (req, res) => {
      if (req.method === 'GET') return json(res, config());
      if (req.url === '/v1/traces') {
        for await (const _chunk of req) { /* Drain the OTLP request. */ }
        res.writeHead(200, { 'Content-Type': 'application/x-protobuf' }); res.end(); return;
      }
      exposures.push(await readBody(req) as Record<string, unknown>); json(res, { accepted: true });
    });
    await init({ apiKey: 'test-project-key', endpoint: baseUrl, experiments: { keys: ['cheap-model'], baseUrl }, registerShutdownHandlers: false });
    const abandoned = chooseAbTest('cheap-model', { unit: 'abandoned' });
    expect(abandoned.reason).toBe('assigned');
    expect(getAbTestClient()?.getDiagnostics().pending).toBe(0);
    expect(recordAbTestRun(abandoned)).toBe(false);
    let traceId = '';
    const decision = chooseAbTest('cheap-model', { unit: 'user-1' });
    await expect(trace({ name: 'failed-agent', endUserId: 'user-1' }, async span => {
      traceId = span.spanContext().traceId;
      expect(recordAbTestRun(decision)).toBe(true);
      throw new Error('agent failed after starting');
    })).rejects.toThrow('agent failed after starting');
    expect(getAbTestClient()?.getDiagnostics().pending).toBe(1);
    expect(await flush()).toBe(true);
    expect(completeAbTestDecision(decision, traceId)).toBe(true);
    expect(await flush()).toBe(true);
    expect(exposures).toHaveLength(2);
    expect(exposures[0]).toMatchObject({ unitId: 'user-1', traceId, unitComplete: false });
    expect(exposures[1]).toMatchObject({ unitId: 'user-1', traceId, unitComplete: true });
  });

  it('rejects credentials in URLs, malformed/oversized settings, and redirects', async () => {
    expect(() => client('https://key:secret@example.com')).toThrow();
    let response = 'malformed';
    const baseUrl = await server((_req, res) => {
      if (response === 'redirect') { res.writeHead(302, { Location: 'https://example.com' }); res.end(); return; }
      if (response === 'large') { res.end('x'.repeat(65537)); return; }
      json(res, config({ salt: 'invalid' }));
    });
    const ab = client(baseUrl); await ab.start();
    expect(ab.assign('cheap-model', { unit: 'user-1' }).reason).toBe('unavailable');
    response = 'large'; await ab.refresh();
    expect(ab.assign('cheap-model', { unit: 'user-1' }).reason).toBe('unavailable');
    response = 'redirect'; await ab.refresh();
    expect(ab.assign('cheap-model', { unit: 'user-1' }).reason).toBe('unavailable');
    expect(ab.logExposure('cheap-model', { unitId: '', arm: 'b', traceId: 'trace', eventId: randomUUID() })).toBe(false);
  });

  it('reports permanent conflicts and continues delivering other units', async () => {
    let requests = 0;
    const baseUrl = await server(async (req, res) => {
      if (req.method === 'GET') return json(res, config());
      await readBody(req); requests++;
      json(res, requests === 1 ? { code: 'AB_UNIT_INVALID' } : { accepted: true }, requests === 1 ? 409 : 200);
    });
    const ab = client(baseUrl); await ab.start();
    const eventId = randomUUID();
    expect(ab.logExposure('cheap-model', { eventId, unitId: 'user-1', arm: 'b', traceId: 'trace-1' })).toBe(true);
    expect(ab.logExposure('cheap-model', { eventId, unitId: 'user-2', arm: 'a', traceId: 'trace-2' })).toBe(false);
    expect(ab.logExposure('cheap-model', { unitId: 'user-2', arm: 'a', traceId: 'trace-2' })).toBe(true);
    expect(await ab.flush()).toBe(false);
    expect(requests).toBe(2);
    expect(ab.getDiagnostics()).toEqual({ pending: 0, rejected: 1 });
  });
});
