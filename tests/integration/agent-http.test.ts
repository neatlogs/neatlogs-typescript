import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentClient } from '../../src/agent/client.js';
import { agentAttributesSchema, agentUnitSchema, agentConfigSchema } from '../../src/agent/protocol.js';
import * as replay from '../../src/replay/session.js';
import * as provider from '../../src/core/provider.js';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace } from '../../src/core/context.js';

const vectors = JSON.parse(readFileSync(new URL('../fixtures/agent-v2.json', import.meta.url), 'utf8'));
const servers: Server[] = [], clients: AgentClient[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const client of clients.splice(0)) client.close(); await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }))); });
async function setup(configSeconds = 60, assignmentSeconds = 60) {
  const now = Date.now();
  const state = { config: { ...structuredClone(vectors.config), expiresAt: new Date(now + configSeconds * 1000).toISOString() },
    assignment: { ...structuredClone(vectors.assignment), expiresAt: new Date(now + assignmentSeconds * 1000).toISOString() },
    configStatus: 200, assignmentStatus: 200, exposureStatus: 200, changed: false, requests: [] as { path: string; body: any }[] };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    state.requests.push({ path: req.url!, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url!.endsWith('/config')) { res.statusCode = state.configStatus; res.setHeader('ETag', `"agent-${state.config.revision}"`); res.setHeader('X-AB-Config-Expires-At', state.config.expiresAt); res.end(JSON.stringify(state.config)); }
    else if (req.url!.endsWith('/assignments')) {
      if (state.changed) { state.changed = false; state.config.revision++; state.assignment.revision++; res.statusCode = 409; res.end(JSON.stringify({ code: 'CONFIG_CHANGED' })); }
      else { res.statusCode = state.assignmentStatus; res.end(JSON.stringify(state.assignment)); }
    } else { res.statusCode = state.exposureStatus; res.end(JSON.stringify(state.exposureStatus === 409 ? { code: 'AB_TRACE_NOT_READY' } : { accepted: true })); }
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
  const client = new AgentClient({ baseUrl: `http://127.0.0.1:${address.port}`, apiKey: 'test-key', keys: ['support'] }); clients.push(client);
  return { client, state, now };
}
const options = { unit: 'session:42', attributes: { environment: 'production', premium: true }, fallback: { model: 'deployed' } };
describe('agent v2 protocol', () => {
  it('agrees on shared typed and UTF16 attribute/session vectors', () => {
    for (const vector of vectors.attributeVectors) expect(agentAttributesSchema.safeParse(vector.attributes).success).toBe(vector.valid);
    for (const vector of vectors.unitVectors) expect(agentUnitSchema.safeParse(vector.unit).success).toBe(vector.valid);
    for (const { unit, completionPolicy, valid } of vectors.completionVectors) {
      const config = structuredClone(vectors.config);
      Object.assign(config.live, { unit, completionPolicy });
      expect(agentConfigSchema.safeParse(config).success).toBe(valid);
    }
  });
  it.each([[10, 60], [60, 10]])('expires at the earlier config/assignment lease (%i/%i)', async (configSeconds, assignmentSeconds) => {
    const { client, state, now } = await setup(configSeconds, assignmentSeconds);
    const first = await client.chooseAgent('support', options);
    expect(first).toMatchObject({ reason: 'assigned', arm: 'b', params: { model: 'candidate' } });
    expect(Date.parse(first.expiresAt!)).toBe(now + 10000);
    state.configStatus = 503; state.assignmentStatus = 503;
    await client.refresh();
    expect((await client.chooseAgent('support', options)).reason).toBe('assigned');
    vi.spyOn(Date, 'now').mockReturnValue(now + 11000);
    expect(await client.chooseAgent('support', options)).toMatchObject({ reason: 'unavailable', params: options.fallback });
  });
  it.each([401, 403, 404, 302])('revokes cached decisions for config HTTP %i', async status => {
    const { client, state } = await setup(); await client.chooseAgent('support', options);
    state.configStatus = status; await client.refresh();
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
  });
  it.each([408, 429, 500])('retains only the existing valid lease on HTTP %i', async status => {
    const { client, state } = await setup(); const first = await client.chooseAgent('support', options);
    state.configStatus = status; await client.refresh();
    expect(await client.chooseAgent('support', options)).toEqual(first);
  });
  it('serves current after pause and rejects an invalid customer completion policy', async () => {
    const { client, state } = await setup(); await client.chooseAgent('support', options);
    state.config.revision++; state.config.live.status = 'paused'; await client.refresh();
    expect(await client.chooseAgent('support', options)).toMatchObject({ reason: 'paused', arm: 'a', params: { model: 'current' } });
    state.config.revision++; state.config.live.unit = 'end_user'; await client.refresh();
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
  });
  it('refreshes a changed publication once and sends typed attributes without transforming them', async () => {
    const { client, state } = await setup(); state.changed = true;
    expect(await client.chooseAgent('support', options)).toMatchObject({ reason: 'assigned', revision: 2 });
    const assignments = state.requests.filter(item => item.path.endsWith('/assignments'));
    expect(assignments).toHaveLength(2);
    expect(assignments[0].body).toEqual({ protocolVersion: 2, revision: 1, unitId: options.unit, attributes: options.attributes });
    expect(state.requests.every(item => item.path.startsWith('/api/v2/experiment-agents/'))).toBe(true);
  });
  it('fails closed for a mismatched receipt fingerprint and for an unexpected schema field', async () => {
    const { client, state } = await setup(); state.assignment.fingerprint = 'd'.repeat(64);
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
    state.assignment.fingerprint = 'b'.repeat(64); state.config.futureTargeting = true;
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
  });
  it('counts only a recorded root, retries the same event and closes the original receipt after expiry', async () => {
    const { client, state, now } = await setup(); const selected = await client.chooseAgent('support', options);
    expect(client.getDiagnostics().pending).toBe(0);
    expect(client.recordAgentRun(selected)).toBe(false);
    const root = { isRecording: () => true, spanContext: () => ({ traceId: 'a'.repeat(32) }), setAttribute: vi.fn() };
    vi.spyOn(provider, 'getNeatlogsRootSpan').mockReturnValue(root as any);
    expect(client.recordAgentRun(selected)).toBe(true);
    expect(client.recordAgentRun(selected)).toBe(true);
    expect(root.setAttribute).toHaveBeenCalledWith('neatlogs.agent.support.assignment_id', vectors.assignment.assignmentId);
    expect(root.setAttribute).toHaveBeenCalledWith('neatlogs.agent.support.fingerprint', vectors.assignment.fingerprint);
    state.exposureStatus = 409; expect(await client.flush()).toBe(false);
    state.exposureStatus = 200; expect(await client.flush()).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(now + 61000);
    expect(client.recordAgentRun(selected)).toBe(false);
    expect(client.completeAgentDecision(selected, 'a'.repeat(32))).toBe(true);
    expect(await client.flush()).toBe(true);
    const sent = state.requests.filter(item => item.path.endsWith('/exposures')).map(item => item.body);
    expect(sent).toHaveLength(3); expect(sent[0]).toEqual(sent[1]);
    expect(sent[2]).toMatchObject({ protocolVersion: 2, assignmentId: vectors.assignment.assignmentId, conversationComplete: true, unitComplete: true });
    expect(sent[2]).not.toHaveProperty('arm');
  });
  it('coalesces simultaneous admission and respects a shorter refreshed config lease', async () => {
    const { client, state, now } = await setup();
    const [first, second] = await Promise.all([client.chooseAgent('support', options), client.chooseAgent('support', options)]);
    expect(first).toEqual(second);
    expect(state.requests.filter(item => item.path.endsWith('/assignments'))).toHaveLength(1);
    state.config.expiresAt = new Date(now + 3000).toISOString(); state.configStatus = 304;
    await client.refresh();
    expect(Date.parse((await client.chooseAgent('support', options)).expiresAt!)).toBe(now + 3000);
  });
  it('accepts natural test expiry without requiring a database revision bump', async () => {
    const { client, state } = await setup(); await client.chooseAgent('support', options);
    state.config.live = null; await client.refresh();
    expect(await client.chooseAgent('support', options)).toMatchObject({ reason: 'current', params: { model: 'current' } });
  });
  it('does not admit or record replay executions', async () => {
    const { client, state } = await setup();
    const selected = await client.chooseAgent('support', options);
    vi.spyOn(replay, 'getReplayStatus').mockReturnValue({} as any);
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
    expect(client.recordAgentRun(selected)).toBe(false);
    expect(state.requests.filter(item => item.path.endsWith('/assignments'))).toHaveLength(1);
    expect(client.getDiagnostics().pending).toBe(0);
  });
  it('clears assignment use after an outbox authorization rejection', async () => {
    const { client, state } = await setup(); const selected = await client.chooseAgent('support', options);
    vi.spyOn(provider, 'getNeatlogsRootSpan').mockReturnValue({ isRecording: () => true, spanContext: () => ({ traceId: 'a'.repeat(32) }), setAttribute: vi.fn() } as any);
    expect(client.recordAgentRun(selected)).toBe(true); state.exposureStatus = 401;
    expect(await client.flush()).toBe(false); expect(client.recordAgentRun(selected)).toBe(false);
  });
  it('keeps a customer assigned across two conversations and completes only each conversation', async () => {
    const { client, state } = await setup();
    Object.assign(state.config.live, { unit: 'end_user', completionPolicy: 'fixed_horizon' });
    Object.assign(state.assignment, { unit: 'end_user', completionPolicy: 'fixed_horizon' });
    const exporter = new InMemorySpanExporter();
    const telemetry = new NodeTracerProvider();
    telemetry.addSpanProcessor(new SimpleSpanProcessor(exporter));
    const previous = provider.getNeatlogsProvider();
    provider._setNeatlogsProvider(telemetry);
    const traceIds: string[] = [];
    try {
      for (const [index, step] of vectors.customerJourney.traces.entries()) {
        const selected = await client.chooseAgent('support', { ...options, unit: vectors.customerJourney.unitId });
        expect(selected).toMatchObject({ reason: 'assigned', unit: 'end_user', completionPolicy: 'fixed_horizon' });
        await trace({ name: 'customer-turn', sessionId: step.sessionId, endUserId: vectors.customerJourney.unitId }, async span => {
          traceIds.push(span.spanContext().traceId);
          expect(client.recordAgentRun(selected)).toBe(true);
          expect(client.recordAgentRun(selected)).toBe(true);
        });
        await telemetry.forceFlush();
        if (index === 2) {
          state.config.revision++;
          Object.assign(state.config.live, { unit: 'session', completionPolicy: 'explicit' });
          await client.refresh();
        }
        if (step.conversationComplete) {
          expect(client.completeAgentDecision(selected, traceIds.at(-1)!)).toBe(true);
          expect(client.completeAgentDecision(selected, traceIds.at(-1)!)).toBe(true);
        }
        expect(await client.flush()).toBe(true);
      }
      const roots = exporter.getFinishedSpans().filter(span => !span.parentSpanId);
      expect(roots).toHaveLength(3);
      expect(new Set(traceIds).size).toBe(3);
      roots.forEach((root, i) => {
        expect(root.attributes['neatlogs.session.id']).toBe(vectors.customerJourney.traces[i].sessionId);
        expect(root.attributes['neatlogs.end_user.id']).toBe(vectors.customerJourney.unitId);
        expect(root.attributes['neatlogs.agent.support.assignment_id']).toBe(vectors.assignment.assignmentId);
      });
      const admissions = state.requests.filter(item => item.path.endsWith('/assignments'));
      expect(admissions).toHaveLength(1);
      expect(admissions[0].body).toEqual({ protocolVersion: 2, revision: 1, unitId: vectors.customerJourney.unitId, attributes: options.attributes });
      const sent = state.requests.filter(item => item.path.endsWith('/exposures')).map(item => item.body);
      expect(sent).toHaveLength(5);
      expect(new Set(sent.map(item => item.eventId)).size).toBe(5);
      expect(sent.map(item => item.conversationComplete)).toEqual([false, false, true, false, true]);
      sent.forEach(item => {
        expect(item).toEqual({ protocolVersion: 2, eventId: expect.any(String), assignmentId: vectors.assignment.assignmentId,
          unitId: vectors.customerJourney.unitId, traceId: expect.any(String), conversationComplete: expect.any(Boolean), unitComplete: false });
      });
    } finally { provider._setNeatlogsProvider(previous); await telemetry.shutdown(); }
  });
  it('rejects assignment unit or completion policy that differs from the publication', async () => {
    const { client, state } = await setup();
    Object.assign(state.assignment, { unit: 'end_user', completionPolicy: 'fixed_horizon' });
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
    state.assignment.unit = 'session'; state.assignment.completionPolicy = 'unknown';
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
    delete state.assignment.completionPolicy;
    expect((await client.chooseAgent('support', options)).reason).toBe('unavailable');
  });

});
