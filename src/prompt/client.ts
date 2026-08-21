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
  constructor(message: string) {
    super(message);
    this.name = 'PromptApiError';
  }
}

/** Raised when a prompt/label/version is not found. */
export class PromptNotFoundError extends PromptClientError {
  constructor(message: string) {
    super(message);
    this.name = 'PromptNotFoundError';
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

/** Normalize a raw API response object into a well-typed {@link CachedPrompt}. */
export function normalizePromptObject(raw: Record<string, any>): CachedPrompt {
  // Messages
  let messages: PromptMessage[] | null = null;
  const rawMessages = raw['messages'];
  if (Array.isArray(rawMessages)) {
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
  let config: Record<string, any> = {};
  if (raw['config'] && typeof raw['config'] === 'object' && !Array.isArray(raw['config'])) {
    config = { ...raw['config'] };
  }

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
  if (raw['type'] === 'chat') {
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
    this._prompt = prompt;
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
    return this._prompt.messages ? [...this._prompt.messages] : null;
  }
  get config(): Record<string, any> {
    return { ...this._prompt.config };
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
  /** Default stale-while-revalidate lifetime. Defaults to 60 seconds. */
  cacheTtlMs?: number;
}

export interface GetPromptOptions {
  version?: number;
  label?: string;
  /** Override the client's cache lifetime for this prompt lookup. */
  cacheTtlMs?: number;
}

const DEFAULT_PROMPT_CACHE_TTL_MS = 60_000;

interface PromptCacheEntry {
  prompt: CachedPrompt;
  fetchedAtMs: number;
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
  private readonly _cache: Map<string, PromptCacheEntry> = new Map();
  private readonly _inflight: Map<string, Promise<PromptHandle>> = new Map();
  private readonly _inflightPromptNames: Map<string, string> = new Map();
  private readonly _promptGenerations: Map<string, number> = new Map();

  constructor(options: PromptClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.cacheTtlMs = PromptClient.validateCacheTtl(
      options.cacheTtlMs ?? DEFAULT_PROMPT_CACHE_TTL_MS,
    );
  }

  // ---- public API ----------------------------------------------------------

  /**
   * Get a prompt by name, optionally pinned to a version or label.
   * Results are cached in memory by cache key.
   */
  async getPrompt(name: string, options?: GetPromptOptions): Promise<PromptHandle> {
    const version = options?.version;
    const label = options?.label;

    if (label != null && version != null) {
      throw new PromptClientError('Cannot specify both label and version.');
    }

    const cacheKey = JSON.stringify([name, label ?? null, version ?? null]);
    const ttlMs = PromptClient.validateCacheTtl(options?.cacheTtlMs ?? this.cacheTtlMs);
    const cached = this._cache.get(cacheKey);
    if (cached) {
      const isPinnedVersion = version != null;
      const isFresh = Date.now() - cached.fetchedAtMs < ttlMs;
      if (isPinnedVersion || isFresh) {
        return new PromptHandle(cached.prompt);
      }

      // Stale-while-revalidate: callers keep a usable prompt while one shared
      // request refreshes the cache. A failed refresh leaves the stale entry in
      // place and the next lookup can try again.
      this.revalidatePrompt(cacheKey, name, { version, label });
      return new PromptHandle(cached.prompt);
    }

    return this.fetchAndCache(cacheKey, name, { version, label });
  }

  private static validateCacheTtl(ttlMs: number): number {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new PromptClientError('cacheTtlMs must be a finite number greater than or equal to 0.');
    }
    return ttlMs;
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

  private cachePrompt(cacheKey: string, handle: PromptHandle): void {
    this._cache.set(cacheKey, {
      prompt: this.snapshotPrompt(handle),
      fetchedAtMs: Date.now(),
    });
  }

  private fetchAndCache(
    cacheKey: string,
    name: string,
    options: { version?: number; label?: string },
  ): Promise<PromptHandle> {
    const existing = this._inflight.get(cacheKey);
    if (existing) return existing;

    const generation = this._promptGenerations.get(name) ?? 0;
    const request = this.fetchPrompt(name, options)
      .then((handle) => {
        if ((this._promptGenerations.get(name) ?? 0) === generation) {
          this.cachePrompt(cacheKey, handle);
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
    this._inflightPromptNames.set(cacheKey, name);
    return request;
  }

  private revalidatePrompt(
    cacheKey: string,
    name: string,
    options: { version?: number; label?: string },
  ): void {
    if (this._inflight.has(cacheKey)) return;
    void this.fetchAndCache(cacheKey, name, options).catch(() => {
      // Stale-while-revalidate deliberately preserves the last known prompt.
      // The in-flight entry is cleared in finally so a later lookup retries.
    });
  }

  private invalidatePrompt(name: string): void {
    this._promptGenerations.set(name, (this._promptGenerations.get(name) ?? 0) + 1);
    for (const [cacheKey, entry] of this._cache) {
      if (entry.prompt.name === name) this._cache.delete(cacheKey);
    }
    for (const [cacheKey, promptName] of this._inflightPromptNames) {
      if (promptName !== name) continue;
      this._inflight.delete(cacheKey);
      this._inflightPromptNames.delete(cacheKey);
    }
  }

  /**
   * Always fetch from the API (bypasses cache).
   */
  async fetchPrompt(
    name: string,
    options?: { version?: number; label?: string },
  ): Promise<PromptHandle> {
    const version = options?.version;
    const label = options?.label;

    if (label != null) {
      const path = `/api/v1/prompts/${encodeURIComponent(name)}/fetch`;
      const url = `${path}?label=${encodeURIComponent(label)}`;
      const payload = await this._request(url);
      return new PromptHandle(normalizePromptObject(payload));
    }

    // List all versions, find the right one
    const listing = await this._request(
      `/api/managed-prompts?name=${encodeURIComponent(name)}&limit=100&offset=0`,
    );
    const items: Record<string, any>[] = listing['items'] ?? [];

    if (items.length === 0) {
      throw new PromptNotFoundError(`No versions found for prompt '${name}'`);
    }

    if (version != null) {
      const match = items.find((item) => item['version'] === version);
      if (!match) {
        throw new PromptNotFoundError(`Prompt '${name}' version ${version} not found`);
      }
      return new PromptHandle(normalizePromptObject(match));
    }

    // Default: most recently created version
    const latest = items.reduce((a, b) => {
      const aDate = a['createdAt'] ?? a['created_at'] ?? '';
      const bDate = b['createdAt'] ?? b['created_at'] ?? '';
      return String(aDate) >= String(bDate) ? a : b;
    });
    return new PromptHandle(normalizePromptObject(latest));
  }

  /**
   * List all prompts.
   */
  async listPrompts(): Promise<PromptHandle[]> {
    const payload = await this._request('/api/managed-prompts?limit=100&offset=0');
    const items: Record<string, any>[] = payload['items'] ?? [];
    return items.map((item) => new PromptHandle(normalizePromptObject(item)));
  }

  /**
   * Create a new prompt.
   */
  async createPrompt(data: {
    name: string;
    content?: string;
    messages?: PromptMessage[];
    config?: Record<string, any>;
    labels?: string[];
  }): Promise<PromptHandle> {
    const body: Record<string, any> = { name: data.name };
    if (data.content !== undefined) body['content'] = data.content;
    if (data.messages !== undefined) {
      body['messages'] = data.messages;
      body['type'] = 'chat';
    } else {
      body['type'] = 'text';
    }
    if (data.config !== undefined) body['config'] = data.config;
    if (data.labels !== undefined) body['labels'] = data.labels;

    const payload = await this._request('/api/managed-prompts', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const promptData = payload['prompt'] ?? payload;
    this.invalidatePrompt(data.name);
    return new PromptHandle(normalizePromptObject(promptData));
  }

  /**
   * Update an existing prompt.
   */
  async updatePrompt(
    name: string,
    data: {
      content?: string;
      messages?: PromptMessage[];
      config?: Record<string, any>;
      labels?: string[];
    },
  ): Promise<PromptHandle> {
    const body: Record<string, any> = { name };
    if (data.content !== undefined) body['content'] = data.content;
    if (data.messages !== undefined) body['messages'] = data.messages;
    if (data.config !== undefined) body['config'] = data.config;
    if (data.labels !== undefined) body['labels'] = data.labels;

    const payload = await this._request(`/api/managed-prompts`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    const promptData = payload['prompt'] ?? payload;
    this.invalidatePrompt(name);
    return new PromptHandle(normalizePromptObject(promptData));
  }

  /**
   * Delete a prompt by name.
   */
  async deletePrompt(name: string): Promise<void> {
    await this._request(`/api/managed-prompts/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    this.invalidatePrompt(name);
  }

  /**
   * Remove a tag from a prompt.
   */
  async removeTag(name: string, tag: string): Promise<void> {
    await this._request(`/api/managed-prompts/${encodeURIComponent(name)}/tags`, {
      method: 'DELETE',
      body: JSON.stringify({ tag }),
    });
    this.invalidatePrompt(name);
  }

  /**
   * Save the current prompt content as a new version, optionally with a label.
   */
  async saveAsVersion(name: string, options?: { label?: string }): Promise<PromptHandle> {
    const body: Record<string, any> = { promptName: name };
    if (options?.label) body['labels'] = [options.label];

    const payload = await this._request('/api/prompt-playground/save-as-version', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const promptData = payload['prompt'] ?? payload;
    this.invalidatePrompt(name);
    return new PromptHandle(normalizePromptObject(promptData));
  }

  // ---- internal ------------------------------------------------------------

  /**
   * Internal fetch wrapper with auth headers and OTel suppression.
   */
  async _request(path: string, options?: RequestInit): Promise<any> {
    const url = `${this.baseUrl}${path}`;
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

    // Suppress OTel instrumentation on our own HTTP calls so they don't
    // create noisy child spans under the user's traces.
    let response: Response;
    try {
      const suppressedContext = suppressTracing(context.active());
      response = await context.with(suppressedContext, () => fetch(url, fetchOptions));
    } catch {
      // If OTel is not available, fall through to plain fetch
      response = await fetch(url, fetchOptions);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '<unavailable>');
      throw new PromptApiError(
        `${fetchOptions.method} ${path} failed (${response.status}): ${body.slice(0, 400)}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new PromptApiError(`${fetchOptions.method} ${path} returned non-JSON response`);
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level shared client (set by init())
// ---------------------------------------------------------------------------

let _sharedClient: PromptClient | null = null;

/** Set the module-level shared prompt client (called by init()). */
export function setSharedClient(client: PromptClient): void {
  _sharedClient = client;
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

export async function createPrompt(data: {
  name: string;
  content?: string;
  messages?: PromptMessage[];
  config?: Record<string, any>;
  labels?: string[];
}): Promise<PromptHandle> {
  return getSharedClient().createPrompt(data);
}

export async function updatePrompt(
  name: string,
  data: {
    content?: string;
    messages?: PromptMessage[];
    config?: Record<string, any>;
    labels?: string[];
  },
): Promise<PromptHandle> {
  return getSharedClient().updatePrompt(name, data);
}

export async function saveAsVersion(
  name: string,
  options?: { label?: string },
): Promise<PromptHandle> {
  return getSharedClient().saveAsVersion(name, options);
}

export async function deletePrompt(name: string): Promise<void> {
  return getSharedClient().deletePrompt(name);
}

export async function removeTag(name: string, tag: string): Promise<void> {
  return getSharedClient().removeTag(name, tag);
}
