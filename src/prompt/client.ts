import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type { CachedPrompt, PromptMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Base exception for prompt client failures. */
export class PromptClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptClientError';
  }
}

/** Raised when the backend returns an API error. */
export class PromptApiError extends PromptClientError {
  readonly method?: string;
  readonly path?: string;
  readonly status?: number;
  readonly requestId?: string;

  constructor(
    message: string,
    details?: { method?: string; path?: string; status?: number; requestId?: string },
  ) {
    super(message);
    this.name = 'PromptApiError';
    this.method = details?.method;
    this.path = details?.path;
    this.status = details?.status;
    this.requestId = details?.requestId;
  }
}

/** Raised when a prompt/label/version is not found. */
export class PromptNotFoundError extends PromptClientError {
  constructor(message: string) {
    super(message);
    this.name = 'PromptNotFoundError';
  }
}

/** Raised when a prompt request exceeds its configured deadline. */
export class PromptRequestTimeoutError extends PromptApiError {
  constructor(message: string) {
    super(message);
    this.name = 'PromptRequestTimeoutError';
  }
}

/** Raised when work is attempted after the prompt client has been closed. */
export class PromptClientClosedError extends PromptClientError {
  constructor(message = 'PromptClient is closed.') {
    super(message);
    this.name = 'PromptClientClosedError';
  }
}

// ---------------------------------------------------------------------------
// Template rendering helper
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/**
 * Replace `{{key}}` placeholders in a template string with the corresponding
 * values from the provided variables map.  Unknown placeholders are left as-is.
 */
export function renderTemplate(template: string, variables: Record<string, any>): string {
  return template.replace(PLACEHOLDER_PATTERN, (full, key: string) => {
    return key in variables ? String(variables[key]) : full;
  });
}

// ---------------------------------------------------------------------------
// Normalize raw API response → CachedPrompt
// ---------------------------------------------------------------------------

const MAX_PROMPT_JSON_DEPTH = 32;
const MAX_PROMPT_JSON_NODES = 10_000;
const MAX_PROMPT_MESSAGES = 10_000;

interface PromptJsonCloneState {
  nodes: number;
  ancestors: Set<object>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clonePromptJson(value: unknown, depth: number, state: PromptJsonCloneState): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_PROMPT_JSON_NODES || depth > MAX_PROMPT_JSON_DEPTH) {
    throw new Error('Prompt JSON exceeds defensive copy limits.');
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Prompt JSON contains a non-finite number.');
    return value;
  }
  if (typeof value !== 'object') throw new Error('Prompt config is not JSON-compatible.');
  if (state.ancestors.has(value)) throw new Error('Prompt config contains a cycle.');

  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.keys(value).some((key, index) => key !== String(index))
      ) {
        throw new Error('Prompt config contains a non-JSON array.');
      }
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new Error('Prompt config contains an accessor or sparse array.');
        }
        result.push(clonePromptJson(descriptor.value, depth + 1, state));
      }
      return result;
    }
    if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error('Prompt config contains a non-JSON object.');
    }

    const result: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new Error('Prompt config contains an accessor or non-enumerable value.');
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: clonePromptJson(descriptor.value, depth + 1, state),
      });
    }
    return result;
  } finally {
    state.ancestors.delete(value);
  }
}

function clonePromptConfig(value: unknown): Record<string, any> {
  try {
    if (!isPlainRecord(value)) return {};
    const cloned = clonePromptJson(value, 0, { nodes: 0, ancestors: new Set() });
    return isPlainRecord(cloned) ? cloned : {};
  } catch {
    // Prompt configuration is untrusted product data. Unsupported, cyclic, or
    // excessively deep structures are discarded instead of retained by cache.
    return {};
  }
}

function clonePromptMessages(messages: PromptMessage[] | null): PromptMessage[] | null {
  if (messages !== null && messages.length > MAX_PROMPT_MESSAGES) return null;
  return messages?.map((message) => ({ role: message.role, content: message.content })) ?? null;
}

/** Normalize a raw API response object into a well-typed {@link CachedPrompt}. */
export function normalizePromptObject(raw: Record<string, any>): CachedPrompt {
  // Messages
  let messages: PromptMessage[] | null = null;
  const rawMessages = raw['messages'];
  if (Array.isArray(rawMessages) && rawMessages.length <= MAX_PROMPT_MESSAGES) {
    const messageList: PromptMessage[] = [];
    for (const item of rawMessages) {
      if (item && typeof item === 'object') {
        messageList.push({
          role: String(item['role'] ?? 'system'),
          content: String(item['content'] ?? ''),
        });
      }
    }
    if (messageList.length > 0) {
      messages = messageList;
    }
  }

  // Labels
  let labels: string[] = [];
  const rawLabels = raw['labels'];
  if (Array.isArray(rawLabels)) {
    labels = rawLabels.filter((l) => String(l).trim()).map(String);
  }

  // Config
  const config = clonePromptConfig(raw['config']);

  // Scalar fields
  const content: string | null = typeof raw['content'] === 'string' ? raw['content'] : null;
  const id: string = typeof raw['id'] === 'string' ? raw['id'] : '';
  const name: string = typeof raw['name'] === 'string' ? raw['name'] : '';

  let version = 0;
  try {
    if (raw['version'] != null) {
      version = Number(raw['version']) || 0;
    }
  } catch {
    version = 0;
  }

  let updatedAt: string = '';
  if (typeof raw['updatedAt'] === 'string') {
    updatedAt = raw['updatedAt'];
  } else if (typeof raw['updated_at'] === 'string') {
    updatedAt = raw['updated_at'];
  }

  let type: 'text' | 'chat' = 'text';
  if (messages !== null || raw['type'] === 'chat') {
    type = 'chat';
  }

  return {
    id,
    name,
    version,
    content,
    messages,
    config,
    labels,
    updatedAt,
    type,
  };
}

// ---------------------------------------------------------------------------
// PromptHandle
// ---------------------------------------------------------------------------

/**
 * Compiled prompt handle returned by {@link PromptClient.getPrompt}.
 */
export class PromptHandle {
  private readonly _prompt: CachedPrompt;

  constructor(prompt: CachedPrompt) {
    this._prompt = {
      id: prompt.id,
      name: prompt.name,
      version: prompt.version,
      content: prompt.content,
      messages: clonePromptMessages(prompt.messages),
      config: clonePromptConfig(prompt.config),
      labels: [...prompt.labels],
      updatedAt: prompt.updatedAt,
      type: prompt.type,
    };
  }

  get id(): string {
    return this._prompt.id;
  }
  get name(): string {
    return this._prompt.name;
  }
  get version(): number {
    return this._prompt.version;
  }
  get content(): string | null {
    return this._prompt.content;
  }
  get messages(): PromptMessage[] | null {
    return clonePromptMessages(this._prompt.messages);
  }
  get config(): Record<string, any> {
    return clonePromptConfig(this._prompt.config);
  }
  get labels(): string[] {
    return [...this._prompt.labels];
  }
  get updatedAt(): string {
    return this._prompt.updatedAt;
  }
  get type(): string {
    return this._prompt.type;
  }

  /**
   * Compile string content with `{{variable}}` replacement.
   *
   * If the prompt has `content`, renders it directly.
   * If it only has `messages`, renders and joins all message contents.
   */
  compile(variables?: Record<string, any>): string {
    const vars = variables ?? {};

    if (this._prompt.content) {
      return renderTemplate(this._prompt.content, vars);
    }

    if (this._prompt.messages) {
      const rendered = this._prompt.messages
        .map((msg) => renderTemplate(msg.content ?? '', vars))
        .filter(Boolean);
      return rendered.join('\n\n');
    }

    return '';
  }

  /**
   * Compile message list with `{{variable}}` replacement.
   *
   * If no messages exist, returns a single synthetic system message from content.
   */
  compileMessages(variables?: Record<string, any>): PromptMessage[] {
    const vars = variables ?? {};

    if (this._prompt.messages) {
      return this._prompt.messages.map((msg) => ({
        role: String(msg.role ?? 'system'),
        content: renderTemplate(String(msg.content ?? ''), vars),
      }));
    }

    return [
      {
        role: 'system',
        content: renderTemplate(this._prompt.content ?? '', vars),
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// PromptClient
// ---------------------------------------------------------------------------

export interface PromptClientOptions {
  baseUrl: string;
  apiKey: string;
  /** How long an unpinned cache entry is fresh. Defaults to 60 seconds. */
  cacheTtlMs?: number;
  /** How long an expired unpinned entry may be served during refresh. Defaults to 5 minutes. */
  staleWhileRevalidateMs?: number;
  /** Deadline for each backend request. Defaults to 10 seconds. */
  requestTimeoutMs?: number;
  /** Maximum cached prompt selectors. Least-recently-used entries are evicted. Defaults to 100. */
  maxCacheEntries?: number;
}

export interface GetPromptOptions {
  version?: number;
  label?: string;
  /** Override the client's cache lifetime for this prompt lookup. */
  cacheTtlMs?: number;
  /** Override the client's stale-while-revalidate window for this prompt lookup. */
  staleWhileRevalidateMs?: number;
}

/** Select one immutable prompt version for a mutation. Defaults to the latest version. */
export interface PromptMutationSelector {
  promptId?: string;
  version?: number;
  label?: string;
}

export interface PromptWriteMetadata {
  config?: Record<string, any>;
  labels?: string[];
  tags?: string[];
  commitMessage?: string;
}

export interface PromptWriteInput extends PromptWriteMetadata {
  content?: string;
  messages?: PromptMessage[];
}

export interface CreatePromptInput extends PromptWriteInput {
  name: string;
}

export type SavePromptVersionOptions = PromptWriteMetadata &
  (
    | { content: string; messages?: PromptMessage[] }
    | { content?: string; messages: PromptMessage[] }
  ) & {
    /** @deprecated Use `labels: [label]`; retained as a source-compatible alias. */
    label?: string;
  };

/** @deprecated A label alone cannot create a backend prompt version. */
export interface LegacySavePromptVersionOptions {
  label?: string;
}

const DEFAULT_PROMPT_CACHE_TTL_MS = 60_000;
const DEFAULT_PROMPT_STALE_WHILE_REVALIDATE_MS = 300_000;
const DEFAULT_PROMPT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_PROMPT_MAX_CACHE_ENTRIES = 100;
const PROMPT_LIST_PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PromptCacheEntry {
  prompt: CachedPrompt;
  fetchedAtMs: number;
  ttlMs: number;
  staleWhileRevalidateMs: number;
  pinned: boolean;
}

interface PromptCachePolicy {
  ttlMs: number;
  staleWhileRevalidateMs: number;
}

/**
 * Prompt client for Neatlogs managed prompts.
 *
 * Fetches prompts on-demand from the backend.
 * Uses an in-memory cache to avoid redundant HTTP calls.
 */
export class PromptClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly cacheTtlMs: number;
  private readonly staleWhileRevalidateMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxCacheEntries: number;
  private readonly _cache: Map<string, PromptCacheEntry> = new Map();
  private readonly _inflight: Map<string, Promise<PromptHandle>> = new Map();
  private readonly _inflightPromptNames: Map<string, { name: string; pinned: boolean }> = new Map();
  private readonly _requestControllers = new Set<AbortController>();
  private _cacheEpoch = 0;
  private _mutationEpoch = 0;
  private _closed = false;

  constructor(options: PromptClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.cacheTtlMs = PromptClient.validateCacheTtl(
      options.cacheTtlMs ?? DEFAULT_PROMPT_CACHE_TTL_MS,
    );
    this.staleWhileRevalidateMs = PromptClient.validateCacheDuration(
      'staleWhileRevalidateMs',
      options.staleWhileRevalidateMs ?? DEFAULT_PROMPT_STALE_WHILE_REVALIDATE_MS,
    );
    this.requestTimeoutMs = PromptClient.validatePositiveDuration(
      'requestTimeoutMs',
      options.requestTimeoutMs ?? DEFAULT_PROMPT_REQUEST_TIMEOUT_MS,
    );
    this.maxCacheEntries = PromptClient.validateMaxCacheEntries(
      options.maxCacheEntries ?? DEFAULT_PROMPT_MAX_CACHE_ENTRIES,
    );
  }

  // ---- public API ----------------------------------------------------------

  /**
   * Get a prompt by name, optionally pinned to a version or label.
   * Results are cached in memory by cache key.
   */
  async getPrompt(name: string, options?: GetPromptOptions): Promise<PromptHandle> {
    this.assertOpen();
    const version = options?.version;
    const label = options?.label;

    if (label != null && version != null) {
      throw new PromptClientError('Cannot specify both label and version.');
    }

    const cacheKey = JSON.stringify([name, label ?? null, version ?? null]);
    const cached = this._cache.get(cacheKey);
    if (cached) {
      const policy = this.resolveCachePolicy(options, cached);
      cached.ttlMs = policy.ttlMs;
      cached.staleWhileRevalidateMs = policy.staleWhileRevalidateMs;
      this.touchCacheEntry(cacheKey, cached);

      if (cached.pinned) {
        return new PromptHandle(cached.prompt);
      }

      const ageMs = Math.max(0, Date.now() - cached.fetchedAtMs);
      if (ageMs < policy.ttlMs) return new PromptHandle(cached.prompt);

      if (ageMs < policy.ttlMs + policy.staleWhileRevalidateMs) {
        // Temporary backend failures cannot take down a caller while the
        // explicitly bounded stale window remains open.
        this.revalidatePrompt(cacheKey, name, { version, label }, policy);
        return new PromptHandle(cached.prompt);
      }
    }

    const policy = this.resolveCachePolicy(options, cached);
    return this.fetchAndCache(cacheKey, name, { version, label }, policy);
  }

  private static validateCacheTtl(ttlMs: number): number {
    return PromptClient.validateCacheDuration('cacheTtlMs', ttlMs);
  }

  private static validateCacheDuration(name: string, durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new PromptClientError(`${name} must be a finite number greater than or equal to 0.`);
    }
    return durationMs;
  }

  private static validatePositiveDuration(name: string, durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new PromptClientError(`${name} must be a finite number greater than 0.`);
    }
    return durationMs;
  }

  private static validateMaxCacheEntries(value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new PromptClientError('maxCacheEntries must be a positive integer.');
    }
    return value;
  }

  private assertOpen(): void {
    if (this._closed) throw new PromptClientClosedError();
  }

  private resolveCachePolicy(
    options: GetPromptOptions | undefined,
    cached?: PromptCacheEntry,
  ): PromptCachePolicy {
    return {
      ttlMs: PromptClient.validateCacheTtl(
        options?.cacheTtlMs ?? cached?.ttlMs ?? this.cacheTtlMs,
      ),
      staleWhileRevalidateMs: PromptClient.validateCacheDuration(
        'staleWhileRevalidateMs',
        options?.staleWhileRevalidateMs ??
          cached?.staleWhileRevalidateMs ??
          this.staleWhileRevalidateMs,
      ),
    };
  }

  private snapshotPrompt(handle: PromptHandle): CachedPrompt {
    return {
      id: handle.id,
      name: handle.name,
      version: handle.version,
      content: handle.content,
      messages: handle.messages,
      config: handle.config,
      labels: handle.labels,
      updatedAt: handle.updatedAt,
      type: handle.type as 'text' | 'chat',
    };
  }

  private cachePrompt(
    cacheKey: string,
    handle: PromptHandle,
    policy: PromptCachePolicy,
    pinned: boolean,
  ): void {
    this._cache.delete(cacheKey);
    this._cache.set(cacheKey, {
      prompt: this.snapshotPrompt(handle),
      fetchedAtMs: Date.now(),
      ttlMs: policy.ttlMs,
      staleWhileRevalidateMs: policy.staleWhileRevalidateMs,
      pinned,
    });
    this.evictCacheEntries();
  }

  private touchCacheEntry(cacheKey: string, entry: PromptCacheEntry): void {
    this._cache.delete(cacheKey);
    this._cache.set(cacheKey, entry);
  }

  private evictCacheEntries(): void {
    while (this._cache.size > this.maxCacheEntries) {
      const oldestKey = this._cache.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      this._cache.delete(oldestKey);
    }
  }

  private fetchAndCache(
    cacheKey: string,
    name: string,
    options: { version?: number; label?: string },
    policy: PromptCachePolicy,
  ): Promise<PromptHandle> {
    this.assertOpen();
    const existing = this._inflight.get(cacheKey);
    if (existing) return existing;

    const mutationEpoch = this._mutationEpoch;
    const cacheEpoch = this._cacheEpoch;
    const pinned = options.version != null;
    const request = this.fetchPrompt(name, options)
      .then((handle) => {
        if (
          !this._closed &&
          this._cacheEpoch === cacheEpoch &&
          this._mutationEpoch === mutationEpoch
        ) {
          this.cachePrompt(cacheKey, handle, policy, pinned);
        }
        return handle;
      })
      .finally(() => {
        if (this._inflight.get(cacheKey) === request) {
          this._inflight.delete(cacheKey);
          this._inflightPromptNames.delete(cacheKey);
        }
      });
    this._inflight.set(cacheKey, request);
    this._inflightPromptNames.set(cacheKey, { name, pinned });
    return request;
  }

  private revalidatePrompt(
    cacheKey: string,
    name: string,
    options: { version?: number; label?: string },
    policy: PromptCachePolicy,
  ): void {
    if (this._inflight.has(cacheKey)) return;
    void this.fetchAndCache(cacheKey, name, options, policy).catch(() => {
      // Stale-while-revalidate deliberately preserves the last known prompt.
      // The in-flight entry is cleared in finally so a later lookup retries.
    });
  }

  private invalidatePrompt(name: string, includePinned = false): void {
    // A single process-wide epoch prevents an in-flight read from repopulating
    // stale data without retaining one generation counter per mutated name.
    this._mutationEpoch += 1;
    for (const [cacheKey, entry] of this._cache) {
      if (entry.prompt.name === name && (includePinned || !entry.pinned)) {
        this._cache.delete(cacheKey);
      }
    }
    for (const [cacheKey, request] of this._inflightPromptNames) {
      if (request.name !== name || (!includePinned && request.pinned)) continue;
      this._inflight.delete(cacheKey);
      this._inflightPromptNames.delete(cacheKey);
    }
  }

  /** Clear cached values without changing or shutting down the telemetry SDK. */
  clearCache(): void {
    this.assertOpen();
    this._cacheEpoch += 1;
    this._cache.clear();
  }

  /** Abort prompt requests, release the cache, and permanently close this client. */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this._cacheEpoch += 1;
    for (const controller of this._requestControllers) controller.abort();
    this._requestControllers.clear();
    this._cache.clear();
    this._inflight.clear();
    this._inflightPromptNames.clear();
  }

  /**
   * Always fetch from the API (bypasses cache).
   */
  async fetchPrompt(
    name: string,
    options?: { version?: number; label?: string },
  ): Promise<PromptHandle> {
    this.assertOpen();
    const version = options?.version;
    const label = options?.label;

    if (label != null && version != null) {
      throw new PromptClientError('Cannot specify both label and version.');
    }

    if (label != null) {
      const path = `/api/v1/prompts/${encodeURIComponent(name)}/fetch`;
      const url = `${path}?label=${encodeURIComponent(label)}`;
      const payload = await this._request(url);
      return new PromptHandle(normalizePromptObject(payload));
    }

    const items = await this.listPromptRecords(
      name,
      version == null
        ? (page) => page.length > 0
        : (page) => page.some((item) => Number(item['version']) === version),
    );

    if (items.length === 0) {
      throw new PromptNotFoundError(`No versions found for prompt '${name}'`);
    }

    if (version != null) {
      const match = items.find((item) => Number(item['version']) === version);
      if (!match) {
        throw new PromptNotFoundError(`Prompt '${name}' version ${version} not found`);
      }
      return new PromptHandle(normalizePromptObject(match));
    }

    // The backend orders a name-filtered listing by descending version.
    return new PromptHandle(normalizePromptObject(items[0]));
  }

  /**
   * List all prompts.
   */
  async listPrompts(): Promise<PromptHandle[]> {
    this.assertOpen();
    const items = await this.listPromptRecords();
    return items.map((item) => new PromptHandle(normalizePromptObject(item)));
  }

  /**
   * Create a new prompt.
   */
  async createPrompt(data: CreatePromptInput): Promise<PromptHandle> {
    this.assertOpen();
    this.assertPromptWrite(data, 'createPrompt');
    const body: Record<string, any> = { name: data.name };
    if (data.content !== undefined) body['content'] = data.content;
    if (data.messages !== undefined) body['messages'] = data.messages;
    if (data.config !== undefined) body['config'] = data.config;
    if (data.labels !== undefined) body['labels'] = data.labels;
    if (data.tags !== undefined) body['tags'] = data.tags;
    if (data.commitMessage !== undefined) body['commit_message'] = data.commitMessage;

    const payload = await this._request('/api/managed-prompts', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const promptData = payload['prompt'] ?? payload;
    this.invalidatePrompt(data.name);
    return new PromptHandle(normalizePromptObject(promptData));
  }

  /**
   * Save changed content as a new immutable version.
   *
   * @deprecated Managed prompts are immutable. Prefer {@link saveAsVersion}.
   */
  async updatePrompt(
    name: string,
    data: PromptWriteInput,
  ): Promise<PromptHandle> {
    this.assertOpen();
    this.assertPromptWrite(data, 'updatePrompt');
    return this.saveAsVersion(name, data as SavePromptVersionOptions);
  }

  /**
   * Delete one immutable prompt version. A name-only call resolves the latest
   * version first for compatibility; pass a version, label, or promptId when
   * the target must be explicit.
   */
  async deletePrompt(name: string, selector?: PromptMutationSelector): Promise<void> {
    this.assertOpen();
    const promptId = await this.resolvePromptId(name, selector);
    await this._request(`/api/managed-prompts/${encodeURIComponent(promptId)}`, {
      method: 'DELETE',
    });
    this.invalidatePrompt(name, true);
  }

  /**
   * Assign a label to one immutable prompt version.
   */
  async setLabel(
    name: string,
    label: string,
    selector?: PromptMutationSelector,
  ): Promise<void> {
    this.assertOpen();
    this.assertLabel(label, 'setLabel');
    const promptId = await this.resolvePromptId(name, selector);
    await this._request(`/api/managed-prompts/${encodeURIComponent(promptId)}/labels`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
    this.invalidatePrompt(name);
  }

  /**
   * Add a tag to one immutable prompt version.
   */
  async addTag(name: string, tag: string, selector?: PromptMutationSelector): Promise<void> {
    this.assertOpen();
    this.assertTag(tag, 'addTag');
    const promptId = await this.resolvePromptId(name, selector);
    await this._request(`/api/managed-prompts/${encodeURIComponent(promptId)}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
    this.invalidatePrompt(name);
  }

  /** Remove a tag from one immutable prompt version. */
  async removeTag(name: string, tag: string, selector?: PromptMutationSelector): Promise<void> {
    this.assertOpen();
    this.assertTag(tag, 'removeTag');
    const promptId = await this.resolvePromptId(name, selector);
    await this._request(`/api/managed-prompts/${encodeURIComponent(promptId)}/tags`, {
      method: 'DELETE',
      body: JSON.stringify({ tag }),
    });
    this.invalidatePrompt(name);
  }

  /** Save supplied content or messages as a new immutable version. */
  async saveAsVersion(
    name: string,
    options: SavePromptVersionOptions,
  ): Promise<PromptHandle>;
  /** @deprecated Pass non-empty `content` or `messages`; label-only saves are rejected. */
  async saveAsVersion(
    name: string,
    options?: LegacySavePromptVersionOptions,
  ): Promise<PromptHandle>;
  async saveAsVersion(
    name: string,
    options?: SavePromptVersionOptions | LegacySavePromptVersionOptions,
  ): Promise<PromptHandle> {
    this.assertOpen();
    const writeOptions = options ?? {};
    this.assertPromptWrite(writeOptions, 'saveAsVersion');
    const write = writeOptions as SavePromptVersionOptions;
    const body: Record<string, any> = { promptName: name };
    if (write.content !== undefined) body['content'] = write.content;
    if (write.messages !== undefined) body['messages'] = write.messages;
    if (write.config !== undefined) body['config'] = write.config;
    const labels = this.resolveWriteLabels(write, 'saveAsVersion');
    if (labels.length > 0) body['labels'] = labels;
    if (write.tags !== undefined) body['tags'] = write.tags;
    if (write.commitMessage !== undefined) body['commitMessage'] = write.commitMessage;

    const payload = await this._request('/api/prompt-playground/save-as-version', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const promptData = payload['prompt'] ?? payload;
    this.invalidatePrompt(name);
    return new PromptHandle(normalizePromptObject(promptData));
  }

  // ---- internal ------------------------------------------------------------

  private assertPromptWrite(
    data: PromptWriteInput | LegacySavePromptVersionOptions,
    operation: string,
  ): void {
    const content = 'content' in data ? data.content : undefined;
    const messages = 'messages' in data ? data.messages : undefined;
    const hasContent = typeof content === 'string' && content.trim().length > 0;
    const hasMessages = Array.isArray(messages) && messages.length > 0;
    if (!hasContent && !hasMessages) {
      throw new PromptClientError(`${operation} requires non-empty content or messages.`);
    }
    this.resolveWriteLabels(data, operation);
    for (const tag of (data as PromptWriteInput).tags ?? []) this.assertTag(tag, operation);
  }

  private resolveWriteLabels(
    data: PromptWriteInput | LegacySavePromptVersionOptions,
    operation: string,
  ): string[] {
    const write = data as PromptWriteInput & { label?: string };
    const labels = [...(write.labels ?? [])];
    if (write.label !== undefined && !labels.includes(write.label)) labels.unshift(write.label);
    if (labels.length > 1) {
      throw new PromptClientError(`${operation} accepts at most one label per prompt version.`);
    }
    for (const label of labels) this.assertLabel(label, operation);
    return labels;
  }

  private assertLabel(label: string, operation: string): void {
    if (typeof label !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(label)) {
      throw new PromptClientError(
        `${operation} labels must contain 1-50 letters, numbers, underscores, or hyphens.`,
      );
    }
  }

  private assertTag(tag: string, operation: string): void {
    if (
      typeof tag !== 'string' ||
      tag !== tag.trim() ||
      tag.length < 1 ||
      tag.length > 64 ||
      /[\r\n]/.test(tag)
    ) {
      throw new PromptClientError(
        `${operation} tags must contain 1-64 characters without surrounding whitespace or newlines.`,
      );
    }
  }

  private validateMutationSelector(selector?: PromptMutationSelector): void {
    const selected = [selector?.promptId, selector?.version, selector?.label].filter(
      (value) => value != null,
    );
    if (selected.length > 1) {
      throw new PromptClientError('Specify only one of promptId, version, or label.');
    }
    if (selector?.promptId != null && !UUID_PATTERN.test(selector.promptId)) {
      throw new PromptClientError('promptId must be a UUID.');
    }
    if (
      selector?.version != null &&
      (!Number.isInteger(selector.version) || selector.version <= 0)
    ) {
      throw new PromptClientError('version must be a positive integer.');
    }
    if (selector?.label != null) this.assertLabel(selector.label, 'selector');
  }

  private async resolvePromptId(
    name: string,
    selector?: PromptMutationSelector,
  ): Promise<string> {
    this.validateMutationSelector(selector);
    if (selector?.promptId != null) return selector.promptId;
    const handle = await this.fetchPrompt(name, {
      version: selector?.version,
      label: selector?.label,
    });
    if (!handle.id) {
      throw new PromptNotFoundError(`Prompt '${name}' did not return a version id`);
    }
    return handle.id;
  }

  private async listPromptRecords(
    name?: string,
    stopWhen?: (page: Record<string, any>[]) => boolean,
  ): Promise<Record<string, any>[]> {
    const records: Record<string, any>[] = [];
    let offset = 0;

    for (;;) {
      const nameQuery = name == null ? '' : `name=${encodeURIComponent(name)}&`;
      const payload = await this._request(
        `/api/managed-prompts?${nameQuery}limit=${PROMPT_LIST_PAGE_SIZE}&offset=${offset}`,
      );
      const page = Array.isArray(payload?.['items'])
        ? (payload['items'] as Record<string, any>[])
        : [];
      records.push(...page);
      offset += page.length;

      if (stopWhen?.(page)) return records;

      const rawTotal = Number(payload?.['total']);
      const total = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : undefined;
      if (
        page.length === 0 ||
        page.length < PROMPT_LIST_PAGE_SIZE ||
        (total !== undefined && offset >= total)
      ) {
        return records;
      }
    }
  }

  /**
   * Internal fetch wrapper with auth headers and OTel suppression.
   */
  async _request(path: string, options?: RequestInit): Promise<any> {
    this.assertOpen();
    const url = `${this.baseUrl}${path}`;
    const safePath = PromptClient.safeErrorPath(path);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'x-api-key': this.apiKey,
      ...(options?.headers as Record<string, string> | undefined),
    };

    const fetchOptions: RequestInit = {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body,
    };

    const controller = new AbortController();
    this._requestControllers.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.requestTimeoutMs);
    (timeout as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
    fetchOptions.signal = controller.signal;

    try {
      // Suppress OTel instrumentation on our own HTTP calls so prompt CRUD
      // never becomes a child span of user telemetry.
      const suppressedContext = suppressTracing(context.active());
      const response = await context.with(suppressedContext, () => fetch(url, fetchOptions));
      const requestId = PromptClient.safeRequestId(response.headers?.get?.('x-request-id'));
      const requestIdSuffix = requestId ? `; request_id=${requestId}` : '';

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new PromptApiError(
          `${fetchOptions.method} ${safePath} failed (${response.status})${requestIdSuffix}`,
          {
            method: fetchOptions.method,
            path: safePath,
            status: response.status,
            requestId,
          },
        );
      }

      try {
        return await response.json();
      } catch {
        throw new PromptApiError(
          `${fetchOptions.method} ${safePath} returned non-JSON response (${response.status})${requestIdSuffix}`,
          { method: fetchOptions.method, path: safePath, status: response.status, requestId },
        );
      }
    } catch (error) {
      if (error instanceof PromptClientError) throw error;
      if (timedOut) {
        throw new PromptRequestTimeoutError(
          `${fetchOptions.method} ${safePath} exceeded ${this.requestTimeoutMs}ms`,
        );
      }
      if (this._closed) throw new PromptClientClosedError();
      throw new PromptApiError(`${fetchOptions.method} ${safePath} request failed`, {
        method: fetchOptions.method,
        path: safePath,
      });
    } finally {
      clearTimeout(timeout);
      this._requestControllers.delete(controller);
    }
  }

  private static safeRequestId(value: string | null | undefined): string | undefined {
    if (value == null) return undefined;
    const trimmed = value.trim();
    return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(trimmed) ? trimmed : undefined;
  }

  private static safeErrorPath(path: string): string {
    const route = path.split('?', 1)[0];
    if (/^\/api\/v1\/prompts\/[^/]+\/fetch$/.test(route)) {
      return '/api/v1/prompts/:name/fetch';
    }
    return route.replace(
      /^\/api\/managed-prompts\/[^/]+(?=\/|$)/,
      '/api/managed-prompts/:promptId',
    );
  }
}

// ---------------------------------------------------------------------------
// Module-level shared client (set by init())
// ---------------------------------------------------------------------------

let _sharedClient: PromptClient | null = null;

/** Set the module-level shared prompt client (called by init()). */
export function setSharedClient(client: PromptClient): void {
  if (_sharedClient && _sharedClient !== client) _sharedClient.close();
  _sharedClient = client;
}

/** Close and forget the module-level prompt client without affecting telemetry flush status. */
export function closeSharedClient(): void {
  const client = _sharedClient;
  _sharedClient = null;
  client?.close();
}

/** Get the module-level shared prompt client. Throws if not initialized. */
export function getSharedClient(): PromptClient {
  if (!_sharedClient) {
    throw new PromptClientError(
      'No prompt client available. Call neatlogs.init(apiKey: ...) or setSharedClient() first.',
    );
  }
  return _sharedClient;
}

// ---------------------------------------------------------------------------
// Module-level convenience functions that delegate to shared client
// ---------------------------------------------------------------------------

export async function getPrompt(name: string, options?: GetPromptOptions): Promise<PromptHandle> {
  return getSharedClient().getPrompt(name, options);
}

export async function fetchPrompt(
  name: string,
  options?: { version?: number; label?: string },
): Promise<PromptHandle> {
  return getSharedClient().fetchPrompt(name, options);
}

export async function listPrompts(): Promise<PromptHandle[]> {
  return getSharedClient().listPrompts();
}

export async function createPrompt(data: CreatePromptInput): Promise<PromptHandle> {
  return getSharedClient().createPrompt(data);
}

export async function updatePrompt(
  name: string,
  data: PromptWriteInput,
): Promise<PromptHandle> {
  return getSharedClient().updatePrompt(name, data);
}

export async function saveAsVersion(
  name: string,
  options: SavePromptVersionOptions,
): Promise<PromptHandle>;
/** @deprecated Pass non-empty `content` or `messages`; label-only saves are rejected. */
export async function saveAsVersion(
  name: string,
  options?: LegacySavePromptVersionOptions,
): Promise<PromptHandle>;
export async function saveAsVersion(
  name: string,
  options?: SavePromptVersionOptions | LegacySavePromptVersionOptions,
): Promise<PromptHandle> {
  return getSharedClient().saveAsVersion(name, options);
}

export async function deletePrompt(
  name: string,
  selector?: PromptMutationSelector,
): Promise<void> {
  return getSharedClient().deletePrompt(name, selector);
}

export async function setLabel(
  name: string,
  label: string,
  selector?: PromptMutationSelector,
): Promise<void> {
  return getSharedClient().setLabel(name, label, selector);
}

export async function addTag(
  name: string,
  tag: string,
  selector?: PromptMutationSelector,
): Promise<void> {
  return getSharedClient().addTag(name, tag, selector);
}

export async function removeTag(
  name: string,
  tag: string,
  selector?: PromptMutationSelector,
): Promise<void> {
  return getSharedClient().removeTag(name, tag, selector);
}
