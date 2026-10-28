import { randomUUID } from 'node:crypto';
import { getReplayStatus } from '../replay/session.js';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { z } from 'zod';
import { getActiveNeatlogsSpan, getNeatlogsRootSpan } from '../core/provider.js';
import { getLogger } from '../core/logger.js';
import { abConfigSchema, abKeySchema, assignmentBucket, exposureSchema, type AbConfig, type AbParams, type AbExposure } from './protocol.js';

export interface AbTestClientOptions {
  baseUrl: string;
  apiKey: string;
  keys: string[];
}
export interface AbAssignment {
  key: string;
  arm: 'a' | 'b';
  params: AbParams;
  reason: 'assigned' | 'default' | 'unavailable';
  revision: number | null;
  allocationVersion: number | null;
}
export interface AbAssignmentOptions {
  unit: string;
  /** Used when settings cannot be fetched. Keep these equal to your control version. */
  fallback?: AbParams;
}
/** A choice that has not yet been reported as an executed agent run. */
export interface AbDecision extends AbAssignment {
  unitId: string;
}
export type LogExposureOptions = Pick<AbExposure, 'unitId' | 'arm'> & {
  traceId?: string;
  unitComplete?: boolean;
  eventId?: string;
  /** Keep the assignment's version when reporting after a settings refresh. */
  allocationVersion?: number;
};
type PendingExposure = { key: string; exposure: AbExposure; queuedAt: number };
const MAX_RESPONSE_BYTES = 64 * 1024;
const CACHE_MS = 60_000;
const MAX_QUEUE = 1000;
const MAX_PENDING_AGE_MS = 24 * 60 * 60_000;

class TransientAbRequestError extends Error {}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Empty A/B response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read().catch(() => { throw new TransientAbRequestError('A/B response interrupted'); });
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('A/B response exceeds 64 KiB');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Cached assignment never waits for HTTP. Exposure delivery follows trace export. */
export class AbTestClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly keys: string[];
  private readonly configs = new Map<string, AbConfig>();
  private readonly controllers = new Set<AbortController>();
  private readonly queue = new Map<string, PendingExposure>();
  private readonly seen = new Map<string, string>();
  private readonly traceAllocations = new Map<string, number | null>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private refreshing: Promise<void> | undefined;
  private flushing: Promise<boolean> | undefined;
  private closed = false;
  private rejected = 0;

  constructor(options: AbTestClientOptions) {
    const url = new URL(options.baseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('A/B baseUrl must be an HTTPS origin or a local HTTP origin');
    }
    this.baseUrl = url.origin;
    this.apiKey = z.string().trim().min(1).parse(options.apiKey);
    this.keys = [...new Set(z.array(abKeySchema).max(20).parse(options.keys))];
  }

  async start(): Promise<void> {
    if (this.closed) return;
    await this.refresh();
    if (!this.closed && !this.timer) {
      this.timer = setInterval(() => { void this.refresh(); void this.flush(); }, CACHE_MS);
      this.timer.unref();
    }
  }

  refresh(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.refreshing) return this.refreshing;
    const operation = Promise.all(this.keys.map(key => this.refreshKey(key))).then(() => undefined);
    this.refreshing = operation;
    void operation.finally(() => { this.refreshing = undefined; });
    return operation;
  }

  private async refreshKey(key: string): Promise<void> {
    const previous = this.configs.get(key);
    try {
      const response = await this.request(key, 'config', {
        headers: previous ? { 'If-None-Match': previous.etag } : {},
      });
      const now = Date.now();
      let config: AbConfig;
      if (response.status === 304 && previous) {
        config = abConfigSchema.parse({ ...previous, expiresAt: response.headers.get('X-AB-Config-Expires-At') });
      } else {
        if ([408, 429].includes(response.status) || response.status >= 500) throw new TransientAbRequestError('A/B settings temporarily unavailable');
        if (!response.ok) throw new Error('A/B settings unavailable');
        config = abConfigSchema.parse(response.body);
      }
      if (config.key !== key || Date.parse(config.expiresAt) <= now ||
          Date.parse(config.expiresAt) > now + CACHE_MS + 5000 ||
          previous && (config.id !== previous.id || config.revision < previous.revision || config.salt !== previous.salt || config.allocationVersion < previous.allocationVersion)) {
        throw new Error('Invalid A/B settings revision or expiry');
      }
      config.expiresAt = new Date(Math.min(Date.parse(config.expiresAt), now + CACHE_MS)).toISOString();
      if (!this.closed) this.configs.set(key, config);
    } catch (error) {
      if (!(error instanceof TransientAbRequestError) || !previous || Date.parse(previous.expiresAt) <= Date.now()) {
        this.configs.delete(key);
      }
    }
  }

  assign(key: string, options: AbAssignmentOptions): AbAssignment {
    const decision = this.choose(key, options);
    if (decision.reason === 'assigned') this.recordRun(decision);
    return {
      key: decision.key, arm: decision.arm, params: decision.params,
      reason: decision.reason, revision: decision.revision,
      allocationVersion: decision.allocationVersion,
    };
  }

  /** Choose from cached settings without claiming that the agent ran. */
  choose(key: string, options: AbAssignmentOptions): AbDecision {
    const config = !this.closed ? this.configs.get(key) : undefined;
    if (!config || Date.parse(config.expiresAt) <= Date.now() || !options.unit || options.unit.length > 1024) {
      return { key, unitId: options.unit, arm: 'a', params: { ...options.fallback }, reason: 'unavailable', revision: null, allocationVersion: null };
    }
    const enabled = config.enabled && Date.parse(config.endsAt) > Date.now();
    const arm = enabled
      ? config.arms[assignmentBucket(config.salt, options.unit) < config.arms[0].weight ? 0 : 1]
      : config.arms[config.defaultArm === 'a' ? 0 : 1];
    return { key, unitId: options.unit, arm: arm.key, params: { ...arm.params }, reason: enabled ? 'assigned' : 'default', revision: config.revision, allocationVersion: config.allocationVersion };
  }

  /** Call inside the run's trace, immediately before the chosen agent starts. */
  recordRun(decision: AbDecision): boolean {
    if (decision.reason !== 'assigned' || decision.allocationVersion === null) return false;
    return this.queueExposure(decision.key, {
      unitId: decision.unitId, arm: decision.arm, allocationVersion: decision.allocationVersion,
    }, 'sdk');
  }

  /** Call after the final trace of this session or user has been exported. */
  completeDecision(decision: AbDecision, traceId: string): boolean {
    if (decision.reason !== 'assigned' || decision.allocationVersion === null) return false;
    return this.completeUnit(decision.key, {
      unitId: decision.unitId, arm: decision.arm, traceId, allocationVersion: decision.allocationVersion,
    });
  }

  /** Call inside a trace when an external feature flag chose the version. */
  logExposure(key: string, options: LogExposureOptions): boolean {
    return this.queueExposure(key, options, 'external');
  }

  /** Close only after all traces for this session/user have been exported. */
  completeUnit(key: string, options: Pick<AbExposure, 'unitId' | 'arm' | 'traceId'> & { source?: 'sdk' | 'external'; allocationVersion?: number }): boolean {
    return this.queueExposure(key, { ...options, unitComplete: true }, options.source ?? 'sdk');
  }

  private queueExposure(key: string, options: LogExposureOptions, source: AbExposure['source']): boolean {
    if (this.closed || !this.keys.includes(key) || getReplayStatus()) return false;
    const span = getNeatlogsRootSpan() ?? getActiveNeatlogsSpan();
    const traceId = options.traceId ?? span?.spanContext().traceId;
    const allocationIdentity = JSON.stringify([key, options.unitId, traceId, options.arm, source]);
    const remembered = this.traceAllocations.get(allocationIdentity);
    const config = this.configs.get(key);
    const allocationVersion = options.allocationVersion ?? (options.unitComplete
      ? remembered
      : config && Date.parse(config.expiresAt) > Date.now() ? config.allocationVersion : undefined);
    // A closure without its original assignment is ambiguous after a refresh or eviction.
    if (allocationVersion == null) return false;
    const parsed = exposureSchema.safeParse({
      ...options, traceId, eventId: options.eventId ?? randomUUID(), allocationVersion,
      source, unitComplete: options.unitComplete ?? false,
    });
    if (!parsed.success) return false;
    const exposure = parsed.data;
    const identity = JSON.stringify([key, exposure.unitId, exposure.traceId, exposure.arm, source, exposure.unitComplete, exposure.allocationVersion]);
    if (this.seen.has(identity)) return true;
    if (this.queue.has(exposure.eventId)) return false;
    if (this.queue.size >= MAX_QUEUE) {
      this.rejected += 1;
      getLogger().warn('A/B exposure queue is full; this exposure was not recorded');
      return false;
    }
    if (span && span.spanContext().traceId === traceId) span.setAttribute(`neatlogs.ab.${key}`, exposure.arm);
    this.seen.set(identity, exposure.eventId);
    if (this.seen.size > 10_000) {
      const first = this.seen.keys().next();
      if (!first.done) this.seen.delete(first.value);
    }
    this.queue.set(exposure.eventId, { key, exposure, queuedAt: Date.now() });
    if (!exposure.unitComplete) {
      this.traceAllocations.set(allocationIdentity, remembered === undefined || remembered === exposure.allocationVersion ? exposure.allocationVersion : null);
      if (this.traceAllocations.size > 10_000) {
        const first = this.traceAllocations.keys().next();
        if (!first.done) this.traceAllocations.delete(first.value);
      }
    }
    return true;
  }

  flush(): Promise<boolean> {
    if (this.flushing) return this.flushing;
    if (this.closed) return Promise.resolve(this.queue.size === 0);
    const operation = this.flushPending();
    this.flushing = operation;
    void operation.finally(() => { this.flushing = undefined; });
    return operation;
  }

  private async flushPending(): Promise<boolean> {
    const deadline = Date.now() + 5000;
    for (const [id, item] of this.queue) {
      if (this.closed || Date.now() >= deadline) break;
      if (Date.now() - item.queuedAt > MAX_PENDING_AGE_MS) {
        this.queue.delete(id); this.rejected += 1; continue;
      }
      try {
        const response = await this.request(item.key, 'exposures', {
          method: 'POST', body: JSON.stringify(item.exposure),
        });
        const error = z.object({ code: z.string() }).safeParse(response.body);
        if (response.ok) {
          const receipt = z.object({ accepted: z.literal(true) }).safeParse(response.body);
          if (!receipt.success) break;
          this.queue.delete(id);
        } else if ([400, 401, 403, 404, 422].includes(response.status) ||
          response.status === 409 && error.success && error.data.code !== 'AB_TRACE_NOT_READY') {
          this.queue.delete(id); this.rejected += 1;
          getLogger().warn(`A/B exposure rejected with HTTP ${response.status}`);
        } else {
          // Preserve order, including explicit closure, while finalization catches up.
          break;
        }
      } catch { break; }
    }
    return this.queue.size === 0 && this.rejected === 0;
  }

  getDiagnostics(): { pending: number; rejected: number } {
    return { pending: this.queue.size, rejected: this.rejected };
  }

  close(): void {
    this.closed = true;
    clearInterval(this.timer);
    this.configs.clear();
    this.traceAllocations.clear();
    for (const controller of this.controllers) controller.abort();
  }

  private async request(key: string, operation: 'config' | 'exposures', init: RequestInit): Promise<{ status: number; ok: boolean; headers: Headers; body: unknown }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    this.controllers.add(controller);
    try {
      const response = await context.with(suppressTracing(context.active()), () => fetch(
        `${this.baseUrl}/api/v1/ab-tests/${encodeURIComponent(key)}/${operation}`,
        { ...init, headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...init.headers }, redirect: 'manual', signal: controller.signal },
      )).catch(() => { throw new TransientAbRequestError('A/B request failed'); });
      if (operation === 'config' && !response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return { status: response.status, ok: false, headers: response.headers, body: null };
      }
      const body = response.status === 304 ? null : await readJson(response).catch(error => {
        if (response.ok) throw error;
        return null;
      });
      return { status: response.status, ok: response.ok, headers: response.headers, body };
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
}
