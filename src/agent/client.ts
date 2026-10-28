import { randomUUID } from 'node:crypto';
import { AbTestClient, TransientAbRequestError, type AbTestClientOptions } from '../ab-test/client.js';
import { type AbParams } from '../ab-test/protocol.js';
import { getNeatlogsRootSpan } from '../core/provider.js';
import { getReplayStatus } from '../replay/session.js';
import { agentAssignmentSchema, agentAttributesSchema, agentParamsSchema, agentConfigSchema, agentUnitSchema, type AgentAssignment, type AgentAttributes, type AgentConfig } from './protocol.js';

const API = '/api/v2/experiment-agents';
export type AgentDecision = (AgentAssignment & { unitId: string }) | {
  protocolVersion: 2; agentKey: string; unitId: string; reason: 'unavailable'; arm: 'a'; params: AbParams;
  revision: null; expiresAt: null; fingerprint: null;
};
export interface AgentChoiceOptions { unit: string; attributes?: AgentAttributes; fallback: AbParams }

/** Customer or session v2 adapter. Choose before opening the root trace; record just before execution. */
export class AgentClient extends AbTestClient {
  private readonly agentKeys: string[];
  private readonly publications = new Map<string, { config: AgentConfig; etag?: string }>();
  private readonly leases = new Map<string, AgentAssignment>();
  private readonly choosing = new Map<string, Promise<AgentDecision>>();
  private readonly refreshingAgents = new Map<string, Promise<void>>();
  private readonly recorded = new Map<string, string>();

  constructor(options: AbTestClientOptions) { super(options); this.agentKeys = [...new Set(options.keys)]; }

  override async refresh(): Promise<void> { await Promise.all(this.agentKeys.map(key => this.refreshAgent(key))); }

  private refreshAgent(key: string): Promise<void> {
    const pending = this.refreshingAgents.get(key);
    if (pending) return pending;
    const task = this.fetchConfig(key).finally(() => this.refreshingAgents.delete(key));
    this.refreshingAgents.set(key, task);
    return task;
  }

  private revoke(key: string): void {
    this.publications.delete(key);
    for (const [identity, lease] of this.leases) if (lease.agentKey === key) this.leases.delete(identity);
  }

  private async fetchConfig(key: string): Promise<void> {
    if (this.closed) return;
    const previous = this.publications.get(key);
    try {
      const response = await this.request(key, 'config', { headers: previous?.etag ? { 'If-None-Match': previous.etag } : {} }, API);
      if ([408, 429].includes(response.status) || response.status >= 500) throw new TransientAbRequestError();
      if (!response.ok && !(response.status === 304 && previous)) throw new Error('Agent config unavailable');
      const config = agentConfigSchema.parse(response.status === 304 && previous
        ? { ...previous.config, expiresAt: response.headers.get('X-AB-Config-Expires-At') } : response.body);
      const now = Date.now();
      if (config.agentKey !== key || !this.validExpiry(config.expiresAt, now) || previous && config.revision < previous.config.revision)
        throw new Error('Invalid agent config identity or expiry');
      config.expiresAt = new Date(Math.min(Date.parse(config.expiresAt), now + 60000)).toISOString();
      if (!this.closed) {
        if (!previous || JSON.stringify({ ...previous.config, expiresAt: '' }) !== JSON.stringify({ ...config, expiresAt: '' }) || config.live?.status !== 'running') this.revoke(key);
        this.publications.set(key, { config, etag: response.headers.get('ETag') ?? undefined });
      }
    } catch (error) {
      if (!(error instanceof TransientAbRequestError) || !previous || Date.parse(previous.config.expiresAt) <= Date.now()) this.revoke(key);
    }
  }

  chooseAgent(key: string, options: AgentChoiceOptions): Promise<AgentDecision> {
    const identity = JSON.stringify([key, options.unit]);
    const pending = this.choosing.get(identity);
    if (pending) return pending;
    const task = this.chooseOnce(key, options, identity).finally(() => this.choosing.delete(identity));
    this.choosing.set(identity, task);
    return task;
  }

  private async chooseOnce(key: string, options: AgentChoiceOptions, identity: string): Promise<AgentDecision> {
    const fallback: AgentDecision = { protocolVersion: 2, agentKey: key, unitId: options.unit, reason: 'unavailable', arm: 'a',
      params: agentParamsSchema.parse(options.fallback), revision: null, expiresAt: null, fingerprint: null };
    if (this.closed || !this.agentKeys.includes(key) || getReplayStatus() || !agentUnitSchema.safeParse(options.unit).success || !agentAttributesSchema.safeParse(options.attributes ?? {}).success) return fallback;
    for (let attempt = 0; attempt < 2; attempt++) {
      let publication = this.publications.get(key);
      if (!publication || Date.parse(publication.config.expiresAt) <= Date.now()) { await this.refreshAgent(key); publication = this.publications.get(key); }
      if (!publication || Date.parse(publication.config.expiresAt) <= Date.now() || this.closed) return fallback;
      const config = publication.config;
      if (!config.live || config.live.status !== 'running') return { protocolVersion: 2, agentKey: key, unitId: options.unit,
        revision: config.revision, expiresAt: config.expiresAt, fingerprint: config.current.fingerprint,
        params: { ...config.current.params }, arm: 'a', reason: config.live ? 'paused' : 'current' };
      const lease = this.leases.get(identity);
      if (lease && lease.revision === config.revision && Date.parse(lease.expiresAt) > Date.now()) return { ...lease, expiresAt: new Date(Math.min(Date.parse(lease.expiresAt), Date.parse(config.expiresAt))).toISOString(), params: { ...lease.params }, unitId: options.unit };
      try {
        const response = await this.request(key, 'assignments', { method: 'POST', body: JSON.stringify({ protocolVersion: 2, revision: config.revision, unitId: options.unit, attributes: options.attributes ?? {} }) }, API);
        if (response.status === 409 && (response.body as { code?: string } | null)?.code === 'CONFIG_CHANGED' && attempt === 0) {
          this.revoke(key); await this.refreshAgent(key); continue;
        }
        if ([408, 429].includes(response.status) || response.status >= 500) return fallback;
        if (!response.ok) { this.revoke(key); return fallback; }
        const result = agentAssignmentSchema.parse(response.body);
        if (this.closed || this.publications.get(key) !== publication) return fallback;
        if (result.agentKey !== key || result.revision !== config.revision || !this.validExpiry(result.expiresAt, Date.now())) throw new Error('Invalid assignment lease');
        if (result.reason === 'assigned') {
          if (result.testId !== config.live.testId || result.experimentId !== config.live.experimentId || result.candidateRevision !== config.live.candidateRevision || result.allocationVersion !== config.live.allocationVersion || result.unit !== config.live.unit || result.completionPolicy !== config.live.completionPolicy || result.fingerprint !== (result.arm === 'a' ? config.current.fingerprint : config.live.candidateFingerprint)) throw new Error('Invalid assignment identity');
        } else if (result.fingerprint !== config.current.fingerprint) throw new Error('Invalid current fingerprint');
        result.expiresAt = new Date(Math.min(Date.parse(config.expiresAt), Date.parse(result.expiresAt), Date.now() + 60000)).toISOString();
        if (Date.parse(result.expiresAt) <= Date.now()) return fallback;
        this.leases.set(identity, result);
        if (this.leases.size > 1000) this.leases.delete(this.leases.keys().next().value!);
        return { ...result, params: { ...result.params }, unitId: options.unit };
      } catch (error) {
        if (!(error instanceof TransientAbRequestError)) this.revoke(key);
        return fallback;
      }
    }
    return fallback;
  }

  protected override onAuthorizationFailure(key: string): void { this.revoke(key); }

  private validExpiry(value: string, now: number): boolean { const expires = Date.parse(value); return expires > now && expires <= now + 65000; }

  recordAgentRun(decision: AgentDecision): boolean {
    if (decision.reason !== 'assigned' || getReplayStatus()) return false;
    const config = this.publications.get(decision.agentKey)?.config;
    const root = getNeatlogsRootSpan();
    if (!root?.isRecording() || !config || config.revision !== decision.revision || config.live?.status !== 'running' || Math.min(Date.parse(config.expiresAt), Date.parse(decision.expiresAt)) <= Date.now()) return false;
    const traceId = root.spanContext().traceId;
    const identity = JSON.stringify([decision.agentKey, traceId]);
    const prior = this.recorded.get(identity);
    if (prior && prior !== decision.assignmentId) return false;
    if (!this.queueAgentReceipt(decision, traceId, false)) return false;
    root.setAttribute(`neatlogs.agent.${decision.agentKey}.assignment_id`, decision.assignmentId);
    root.setAttribute(`neatlogs.agent.${decision.agentKey}.fingerprint`, decision.fingerprint);
    this.recorded.set(identity, decision.assignmentId);
    if (this.recorded.size > 10000) this.recorded.delete(this.recorded.keys().next().value!);
    return true;
  }

  /** Call after exporting the final trace of this conversation. Customer units stay open. */
  completeAgentDecision(decision: AgentDecision, traceId: string): boolean {
    if (decision.reason !== 'assigned' || getReplayStatus() || this.recorded.get(JSON.stringify([decision.agentKey, traceId])) !== decision.assignmentId) return false;
    return this.queueAgentReceipt(decision, traceId, true);
  }

  private queueAgentReceipt(decision: Extract<AgentDecision, { reason: 'assigned' }>, traceId: string, conversationComplete: boolean): boolean {
    if (!traceId || traceId.length > 128 || !agentUnitSchema.safeParse(decision.unitId).success) return false;
    const payload = { protocolVersion: 2, eventId: randomUUID(), assignmentId: decision.assignmentId, unitId: decision.unitId, traceId, conversationComplete, unitComplete: conversationComplete && decision.unit === 'session' && decision.completionPolicy === 'explicit' };
    return this.enqueueReceipt(decision.agentKey, payload, JSON.stringify(['agent', decision.agentKey, decision.assignmentId, traceId, conversationComplete]), API);
  }

  override close(): void { this.publications.clear(); this.leases.clear(); this.recorded.clear(); super.close(); }
}
