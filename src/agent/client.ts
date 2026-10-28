import { randomUUID } from 'node:crypto';
import { AbTestClient, TransientAbRequestError, type AbTestClientOptions } from '../ab-test/client.js';
import { type AbParams } from '../ab-test/protocol.js';
import { getNeatlogsRootSpan } from '../core/provider.js';
import { getReplayStatus } from '../replay/session.js';
import { AgentCanonicalError, agentAttributesDigest, agentVersionFingerprint } from './fingerprint.js';
import { AGENT_PROFILE, AGENT_CAPABILITY_HEADER, agentAssignmentSchema, agentAttributesSchema, agentParamsSchema, agentConfigSchema, agentUnitSchema, type AgentAssignment, type AgentAttributes, type AgentConfig } from './protocol.js';

const API = '/api/v2/experiment-agents';
export type AgentDecisionCause = 'transport_unavailable' | 'invalid_identity' | 'unsupported_canonical_params';
export type AgentDecision = ((AgentAssignment & { unitId: string }) | {
  protocolVersion: 2; agentKey: string; unitId: string; reason: 'unavailable'; arm: 'a'; params: AbParams;
  revision: null; expiresAt: null; fingerprint: null; knownRevision?: number; knownUnit?: 'session' | 'end_user';
}) & { cause?: AgentDecisionCause };
export interface AgentChoiceOptions { unit: string; attributes?: AgentAttributes; fallback: AbParams }

/** Customer or session v2 adapter. Choose before opening the root trace; record just before execution. */
export class AgentClient extends AbTestClient {
  private readonly agentKeys: string[];
  private readonly publications = new Map<string, { config: AgentConfig; etag?: string }>();
  private readonly leases = new Map<string, AgentAssignment>();
  private readonly servingLeases = new Map<string, AgentAssignment>();
  private readonly observed = new Map<string, string>();
  private readonly refreshCauses = new Map<string, AgentDecisionCause>();
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
    for (const leases of [this.leases, this.servingLeases])
      for (const [identity, lease] of leases) if (lease.agentKey === key) leases.delete(identity);
  }

  private async fetchConfig(key: string): Promise<void> {
    if (this.closed) return;
    const previous = this.publications.get(key);
    try {
      const response = await this.request(key, 'config', { headers: { [AGENT_CAPABILITY_HEADER]: AGENT_PROFILE, ...(previous?.etag ? { 'If-None-Match': previous.etag } : {}) } }, API);
      if ([408, 429].includes(response.status) || response.status >= 500) throw new TransientAbRequestError();
      if (!response.ok && !(response.status === 304 && previous)) throw new Error('Agent config unavailable');
      const acknowledged = response.headers.get(AGENT_CAPABILITY_HEADER) === AGENT_PROFILE;
      if (response.status === 304 && previous?.config.profile === AGENT_PROFILE && !acknowledged) throw new Error('Agent profile not acknowledged');
      const config: AgentConfig = agentConfigSchema.parse(response.status === 304 && previous
        ? { ...previous.config, expiresAt: response.headers.get('X-AB-Config-Expires-At') } : response.body);
      if ((config.profile === AGENT_PROFILE) !== acknowledged) throw new Error('Agent profile mismatch');
      this.validateConfigFingerprints(config);
      const now = Date.now();
      if (config.agentKey !== key || !this.validExpiry(config.expiresAt, now) || previous && config.revision < previous.config.revision)
        throw new Error('Invalid agent config identity or expiry');
      config.expiresAt = new Date(Math.min(Date.parse(config.expiresAt), now + 60000)).toISOString();
      if (!this.closed) {
        if (!previous || JSON.stringify({ ...previous.config, expiresAt: '' }) !== JSON.stringify({ ...config, expiresAt: '' }) || config.live?.status !== 'running') this.revoke(key);
        this.refreshCauses.delete(key);
        this.publications.set(key, { config, etag: response.headers.get('ETag') ?? undefined });
      }
    } catch (error) {
      this.refreshCauses.set(key, error instanceof AgentCanonicalError ? 'unsupported_canonical_params' : error instanceof TransientAbRequestError ? 'transport_unavailable' : 'invalid_identity');
      if (!(error instanceof TransientAbRequestError) || !previous || Date.parse(previous.config.expiresAt) <= Date.now()) this.revoke(key);
    }
  }

  chooseAgent(key: string, options: AgentChoiceOptions): Promise<AgentDecision> {
    let attributesDigest: string;
    try { attributesDigest = agentAttributesDigest(agentAttributesSchema.parse(options.attributes ?? {})); }
    catch { return this.chooseOnce(key, options, JSON.stringify([key, options.unit])); }
    const identity = JSON.stringify([key, options.unit, attributesDigest]);
    const pending = this.choosing.get(identity);
    if (pending) return pending;
    const task = this.chooseOnce(key, options, JSON.stringify([key, options.unit])).finally(() => this.choosing.delete(identity));
    this.choosing.set(identity, task);
    return task;
  }

  private async chooseOnce(key: string, options: AgentChoiceOptions, identity: string): Promise<AgentDecision> {
    const fallback: AgentDecision = { protocolVersion: 2, agentKey: key, unitId: options.unit, reason: 'unavailable', arm: 'a',
      params: agentParamsSchema.parse(options.fallback), revision: null, expiresAt: null, fingerprint: null };
    if (this.closed || !this.agentKeys.includes(key) || getReplayStatus() || !agentUnitSchema.safeParse(options.unit).success || !agentAttributesSchema.safeParse(options.attributes ?? {}).success) return fallback;
    const failure = (cause?: AgentDecisionCause): AgentDecision => ({ ...fallback, ...(cause ?? this.refreshCauses.get(key) ? { cause: cause ?? this.refreshCauses.get(key) } : {}) });
    for (let attempt = 0; attempt < 2; attempt++) {
      let publication = this.publications.get(key);
      if (!publication || Date.parse(publication.config.expiresAt) <= Date.now()) { await this.refreshAgent(key); publication = this.publications.get(key); }
      if (!publication || Date.parse(publication.config.expiresAt) <= Date.now() || this.closed) return failure();
      const config = publication.config;
      fallback.knownRevision = config.revision; fallback.knownUnit = config.serving?.unit ?? config.live?.unit;
      if ((!config.live || config.live.status !== 'running') && !config.serving) return { protocolVersion: 2, agentKey: key, unitId: options.unit,
        ...(config.profile ? { profile: config.profile } : {}), revision: config.revision, expiresAt: config.expiresAt, fingerprint: config.current.fingerprint,
        params: { ...config.current.params }, arm: 'a', reason: config.live ? 'paused' : 'current' };
      let servingIdentity: string | null = null;
      try {
        if (config.profile === AGENT_PROFILE && config.live?.agentProfile === AGENT_PROFILE) agentAttributesDigest(options.attributes ?? {});
        if (config.serving) servingIdentity = JSON.stringify([config.profile, key, config.revision, config.serving.revisionId, config.serving.digest, options.unit, agentAttributesDigest(options.attributes ?? {}, config.serving.requiredAttributeKeys)]);
      } catch { return failure('unsupported_canonical_params'); }
      const lease = this.leases.get(identity) ?? (servingIdentity ? this.servingLeases.get(servingIdentity) : undefined);
      if (lease && lease.revision === config.revision && Date.parse(lease.expiresAt) > Date.now())
        return this.copyDecision(lease, options.unit, new Date(Math.min(Date.parse(lease.expiresAt), Date.parse(config.expiresAt))).toISOString());
      try {
        const response = await this.request(key, 'assignments', { method: 'POST', headers: { [AGENT_CAPABILITY_HEADER]: AGENT_PROFILE }, body: JSON.stringify({ protocolVersion: 2, revision: config.revision, unitId: options.unit, attributes: options.attributes ?? {} }) }, API);
        if (response.status === 409 && (response.body as { code?: string } | null)?.code === 'CONFIG_CHANGED' && attempt === 0) {
          this.revoke(key); await this.refreshAgent(key); continue;
        }
        if ([408, 429].includes(response.status) || response.status >= 500) return failure('transport_unavailable');
        if (!response.ok) { this.revoke(key); return failure('invalid_identity'); }
        const result = agentAssignmentSchema.parse(response.body) as AgentAssignment;
        if (this.closed || this.publications.get(key) !== publication) return failure();
        if ((result.profile === AGENT_PROFILE) !== (config.profile === AGENT_PROFILE) || config.profile === AGENT_PROFILE && response.headers.get(AGENT_CAPABILITY_HEADER) !== AGENT_PROFILE)
          throw new Error('Agent decision profile mismatch');
        if (result.agentKey !== key || result.revision !== config.revision || !this.validExpiry(result.expiresAt, Date.now())) throw new Error('Invalid assignment lease');
        if (result.reason === 'assigned') {
          const live = config.live;
          if (!live || live.status !== 'running' || result.testId !== live.testId || result.experimentId !== live.experimentId || result.candidateRevision !== live.candidateRevision || result.allocationVersion !== live.allocationVersion || result.unit !== live.unit || result.completionPolicy !== live.completionPolicy || result.fingerprint !== (result.arm === 'a' ? ('current' in live ? live.current.fingerprint : live.currentFingerprint) : live.candidateFingerprint)) throw new Error('Invalid assignment identity');
          if ('agentProfile' in live && live.agentProfile === AGENT_PROFILE && agentVersionFingerprint(key, result.params) !== result.fingerprint) throw new Error('Invalid assignment params');
        } else if (result.reason === 'published') {
          const serving = config.serving;
          if (!serving || result.unit !== serving.unit || result.unitId !== options.unit || result.attributesDigest !== agentAttributesDigest(options.attributes ?? {}, serving.requiredAttributeKeys) || result.serving.revisionId !== serving.revisionId || result.serving.revision !== serving.revision || result.serving.digest !== serving.digest || !serving.allowedIdentities.some(item => item.publicationId === result.serving.publicationId && item.fingerprint === result.fingerprint) || agentVersionFingerprint(key, result.params) !== result.fingerprint) throw new Error('Invalid published identity');
        } else if (result.fingerprint !== config.current.fingerprint || config.profile === AGENT_PROFILE && (config.serving || config.live?.agentProfile !== 'legacy-v2') && agentVersionFingerprint(key, result.params) !== result.fingerprint) throw new Error('Invalid current fingerprint');
        result.expiresAt = new Date(Math.min(Date.parse(config.expiresAt), Date.parse(result.expiresAt), Date.now() + 60000)).toISOString();
        if (Date.parse(result.expiresAt) <= Date.now()) return failure();
        const cache = servingIdentity && result.reason !== 'assigned' ? this.servingLeases : this.leases;
        cache.set(servingIdentity && result.reason !== 'assigned' ? servingIdentity : identity, result);
        if (cache.size > 1000) cache.delete(cache.keys().next().value!);
        return this.copyDecision(result, options.unit);
      } catch (error) {
        if (!(error instanceof TransientAbRequestError)) this.revoke(key);
        return failure(error instanceof AgentCanonicalError ? 'unsupported_canonical_params' : error instanceof TransientAbRequestError ? 'transport_unavailable' : 'invalid_identity');
      }
    }
    return failure();
  }

  protected override onAuthorizationFailure(key: string): void { this.revoke(key); }

  private validExpiry(value: string, now: number): boolean { const expires = Date.parse(value); return expires > now && expires <= now + 65000; }

  private copyDecision(value: AgentAssignment, unitId: string, expiresAt = value.expiresAt): AgentDecision {
    if (value.reason === 'published') return { ...value, params: { ...value.params }, serving: { ...value.serving }, unitId, expiresAt };
    return { ...value, params: { ...value.params }, unitId, expiresAt };
  }

  private validateConfigFingerprints(config: AgentConfig): void {
    if (config.profile !== AGENT_PROFILE) return;
    if (config.live?.agentProfile === 'legacy-v2' && !config.serving) return;
    if (agentVersionFingerprint(config.agentKey, config.current.params) !== config.current.fingerprint) throw new Error('Invalid Current params');
    if (config.live) {
      if (agentVersionFingerprint(config.agentKey, config.live.current.params) !== config.live.current.fingerprint) throw new Error('Invalid live Current params');
      const baseline = config.live.baselineServing, serving = config.serving;
      if (config.live.agentProfile === AGENT_PROFILE && (Boolean(baseline) !== Boolean(serving) || baseline && serving && (baseline.revisionId !== serving.revisionId || baseline.revision !== serving.revision || baseline.digest !== serving.digest))) throw new Error('Invalid baseline serving identity');
    }
  }

  recordAgentRun(decision: AgentDecision): boolean {
    if (getReplayStatus()) return false;
    const root = getNeatlogsRootSpan();
    if (!root?.isRecording()) return false;
    const config = this.publications.get(decision.agentKey)?.config;
    let actual: string | undefined;
    try { actual = agentVersionFingerprint(decision.agentKey, { ...decision.params }); } catch { /* Unknown canonical identity is observable without inventing a hash. */ }
    const traceId = root.spanContext().traceId, identity = JSON.stringify([decision.agentKey, traceId]);
    const prefix = `neatlogs.agent.${decision.agentKey}.`;
    const revision = decision.revision ?? ('knownRevision' in decision ? decision.knownRevision : undefined);
    const unit = ('unit' in decision ? decision.unit : 'knownUnit' in decision ? decision.knownUnit : undefined) ?? config?.serving?.unit ?? config?.live?.unit;
    const observation = JSON.stringify([decision.reason, actual, decision.unitId, revision, unit]);
    const priorObservation = this.observed.get(identity);
    const signedPrior = this.recorded.get(identity);
    if (decision.reason === 'assigned' && config && config.revision === decision.revision && config.live?.status === 'running' && Math.min(Date.parse(config.expiresAt), Date.parse(decision.expiresAt)) > Date.now() && !(config.profile === AGENT_PROFILE && config.live.agentProfile === AGENT_PROFILE && actual !== decision.fingerprint) && (!signedPrior || signedPrior === decision.assignmentId) && (!priorObservation || priorObservation === observation)) {
      // Preserve the existing signed identity when the root is near its attribute limit.
      root.setAttribute(prefix + 'assignment_id', decision.assignmentId);
      root.setAttribute(prefix + 'fingerprint', decision.fingerprint);
    }
    root.setAttribute(prefix + 'serving_trace_version', 1);
    root.setAttribute(prefix + 'unit_id', decision.unitId);
    root.setAttribute(prefix + 'decision_reason', decision.reason);
    const strict = config?.profile === AGENT_PROFILE && config.live?.agentProfile === AGENT_PROFILE || decision.reason === 'published';
    const cause = decision.cause ?? (!actual ? 'unsupported_canonical_params' : strict && decision.fingerprint !== actual ? 'invalid_identity' : undefined);
    if (cause) root.setAttribute(prefix + 'decision_cause', cause);
    if (actual) root.setAttribute(prefix + 'served_fingerprint', actual);
    if (revision) root.setAttribute(prefix + 'config_revision', revision);
    if (unit) root.setAttribute(prefix + 'unit_kind', unit);

    if (priorObservation && priorObservation !== observation) {
      root.setAttribute(prefix + 'decision_reason', 'unavailable');
      root.setAttribute(prefix + 'decision_cause', 'invalid_identity');
      for (const name of ['assignment_id', 'fingerprint', 'serving_policy_id', 'serving_policy_digest']) root.setAttribute(prefix + name, '');
      return false;
    }
    this.observed.set(identity, observation);
    if (this.observed.size > 10000) this.observed.delete(this.observed.keys().next().value!);
    if (decision.reason === 'published') {
      const serving = config?.serving;
      if (actual === decision.fingerprint && serving && config?.revision === decision.revision && serving.revisionId === decision.serving.revisionId && serving.revision === decision.serving.revision && serving.digest === decision.serving.digest && serving.allowedIdentities.some(item => item.publicationId === decision.serving.publicationId && item.fingerprint === actual) && Math.min(Date.parse(config.expiresAt), Date.parse(decision.expiresAt)) > Date.now()) {
        root.setAttribute(prefix + 'serving_policy_id', decision.serving.publicationId);
        root.setAttribute(prefix + 'serving_policy_revision', decision.serving.revision);
        root.setAttribute(prefix + 'serving_policy_digest', decision.serving.digest);
      }
      return false;
    }
    if (decision.reason !== 'assigned' || !config || config.revision !== decision.revision || config.live?.status !== 'running' || Math.min(Date.parse(config.expiresAt), Date.parse(decision.expiresAt)) <= Date.now()) return false;
    if (config.profile === AGENT_PROFILE && config.live.agentProfile === AGENT_PROFILE && actual !== decision.fingerprint) return false;
    const prior = this.recorded.get(identity);
    if (prior && prior !== decision.assignmentId) return false;
    if ('attributes' in root && root.attributes && typeof root.attributes === 'object' && (Reflect.get(root.attributes, prefix + 'assignment_id') !== decision.assignmentId || Reflect.get(root.attributes, prefix + 'fingerprint') !== decision.fingerprint)) return false;
    if (!this.queueAgentReceipt(decision, traceId, false)) return false;
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

  override close(): void { this.publications.clear(); this.leases.clear(); this.servingLeases.clear(); this.observed.clear(); this.refreshCauses.clear(); this.recorded.clear(); super.close(); }
}
