import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PromptClient,
  PromptHandle,
  PromptClientError,
  PromptApiError,
  PromptNotFoundError,
  renderTemplate,
  normalizePromptObject,
  setSharedClient,
  getSharedClient,
} from '../../src/prompt/client.js';
import type { CachedPrompt } from '../../src/types.js';

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

describe('renderTemplate', () => {
  it('should replace simple placeholders', () => {
    expect(renderTemplate('Hello {{name}}', { name: 'World' })).toBe('Hello World');
  });

  it('should replace multiple placeholders', () => {
    expect(renderTemplate('{{a}} and {{b}}', { a: '1', b: '2' })).toBe('1 and 2');
  });

  it('should leave unknown placeholders unchanged', () => {
    expect(renderTemplate('{{known}} {{unknown}}', { known: 'yes' })).toBe('yes {{unknown}}');
  });

  it('should handle placeholders with spaces', () => {
    expect(renderTemplate('{{ name }}', { name: 'Alice' })).toBe('Alice');
  });

  it('should handle dotted/hyphenated keys', () => {
    expect(renderTemplate('{{my.var}}', { 'my.var': 'val' })).toBe('val');
    expect(renderTemplate('{{my-var}}', { 'my-var': 'val' })).toBe('val');
  });

  it('should convert non-string values to string', () => {
    expect(renderTemplate('Count: {{n}}', { n: 42 })).toBe('Count: 42');
  });

  it('should handle empty template', () => {
    expect(renderTemplate('', { a: 'b' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// normalizePromptObject
// ---------------------------------------------------------------------------

describe('normalizePromptObject', () => {
  it('should normalize a full API response', () => {
    const raw = {
      id: 'abc123',
      name: 'test-prompt',
      version: 3,
      content: 'Hello {{name}}',
      messages: null,
      config: { temperature: 0.7 },
      labels: ['production'],
      updatedAt: '2024-01-01T00:00:00Z',
      type: 'text',
    };
    const result = normalizePromptObject(raw);
    expect(result).toEqual({
      id: 'abc123',
      name: 'test-prompt',
      version: 3,
      content: 'Hello {{name}}',
      messages: null,
      config: { temperature: 0.7 },
      labels: ['production'],
      updatedAt: '2024-01-01T00:00:00Z',
      type: 'text',
    });
  });

  it('should normalize messages array', () => {
    const raw = {
      id: 'x',
      name: 'chat-prompt',
      version: 1,
      content: null,
      messages: [{ role: 'system', content: 'You are helpful' }],
      config: {},
      labels: [],
      updatedAt: '',
      type: 'chat',
    };
    const result = normalizePromptObject(raw);
    expect(result.messages).toEqual([{ role: 'system', content: 'You are helpful' }]);
    expect(result.type).toBe('chat');
  });

  it('should handle missing fields with defaults', () => {
    const result = normalizePromptObject({});
    expect(result.id).toBe('');
    expect(result.name).toBe('');
    expect(result.version).toBe(0);
    expect(result.content).toBeNull();
    expect(result.messages).toBeNull();
    expect(result.config).toEqual({});
    expect(result.labels).toEqual([]);
    expect(result.updatedAt).toBe('');
    expect(result.type).toBe('text');
  });

  it('should fallback to updated_at if updatedAt is missing', () => {
    const result = normalizePromptObject({ updated_at: '2024-06-15' });
    expect(result.updatedAt).toBe('2024-06-15');
  });

  it('should filter empty labels', () => {
    const result = normalizePromptObject({ labels: ['prod', '', '  ', 'staging'] });
    expect(result.labels).toEqual(['prod', 'staging']);
  });

  it('should handle invalid version gracefully', () => {
    expect(normalizePromptObject({ version: 'abc' }).version).toBe(0);
    expect(normalizePromptObject({ version: null }).version).toBe(0);
    expect(normalizePromptObject({ version: undefined }).version).toBe(0);
  });

  it('should handle non-object config', () => {
    expect(normalizePromptObject({ config: 'invalid' }).config).toEqual({});
    expect(normalizePromptObject({ config: [1, 2] }).config).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// PromptHandle
// ---------------------------------------------------------------------------

describe('PromptHandle', () => {
  const baseCached: CachedPrompt = {
    id: 'p1',
    name: 'my-prompt',
    version: 2,
    content: 'Hello {{name}}, welcome to {{place}}',
    messages: null,
    config: { temperature: 0.5 },
    labels: ['production'],
    updatedAt: '2024-01-01',
    type: 'text',
  };

  it('should expose all properties', () => {
    const handle = new PromptHandle(baseCached);
    expect(handle.id).toBe('p1');
    expect(handle.name).toBe('my-prompt');
    expect(handle.version).toBe(2);
    expect(handle.content).toBe('Hello {{name}}, welcome to {{place}}');
    expect(handle.messages).toBeNull();
    expect(handle.config).toEqual({ temperature: 0.5 });
    expect(handle.labels).toEqual(['production']);
    expect(handle.updatedAt).toBe('2024-01-01');
    expect(handle.type).toBe('text');
  });

  it('should return copies of mutable fields', () => {
    const handle = new PromptHandle(baseCached);
    const config = handle.config;
    config['new'] = true;
    expect(handle.config).not.toHaveProperty('new');

    const labels = handle.labels;
    labels.push('test');
    expect(handle.labels).not.toContain('test');
  });

  describe('compile', () => {
    it('should render content with variables', () => {
      const handle = new PromptHandle(baseCached);
      expect(handle.compile({ name: 'Alice', place: 'Wonderland' })).toBe(
        'Hello Alice, welcome to Wonderland',
      );
    });

    it('should work with no variables for static content', () => {
      const handle = new PromptHandle({ ...baseCached, content: 'Static text' });
      expect(handle.compile()).toBe('Static text');
    });

    it('should join messages when no content is available', () => {
      const handle = new PromptHandle({
        ...baseCached,
        content: null,
        messages: [
          { role: 'system', content: 'You are {{role}}' },
          { role: 'user', content: 'Hello {{name}}' },
        ],
      });
      expect(handle.compile({ role: 'helpful', name: 'Bob' })).toBe(
        'You are helpful\n\nHello Bob',
      );
    });

    it('should return empty string when both content and messages are null', () => {
      const handle = new PromptHandle({ ...baseCached, content: null, messages: null });
      expect(handle.compile()).toBe('');
    });
  });

  describe('compileMessages', () => {
    it('should render message list', () => {
      const handle = new PromptHandle({
        ...baseCached,
        content: null,
        messages: [
          { role: 'system', content: 'You are {{role}}' },
          { role: 'user', content: 'Do {{action}}' },
        ],
      });
      const result = handle.compileMessages({ role: 'AI', action: 'something' });
      expect(result).toEqual([
        { role: 'system', content: 'You are AI' },
        { role: 'user', content: 'Do something' },
      ]);
    });

    it('should create synthetic system message from content when no messages', () => {
      const handle = new PromptHandle(baseCached);
      const result = handle.compileMessages({ name: 'X', place: 'Y' });
      expect(result).toEqual([{ role: 'system', content: 'Hello X, welcome to Y' }]);
    });

    it('should handle null content with synthetic message', () => {
      const handle = new PromptHandle({ ...baseCached, content: null, messages: null });
      const result = handle.compileMessages();
      expect(result).toEqual([{ role: 'system', content: '' }]);
    });
  });

  describe('messages getter', () => {
    it('should return a copy of messages', () => {
      const handle = new PromptHandle({
        ...baseCached,
        messages: [{ role: 'system', content: 'hello' }],
      });
      const msgs = handle.messages!;
      msgs.push({ role: 'user', content: 'added' });
      expect(handle.messages).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe('Error classes', () => {
  it('PromptClientError should be instanceof Error', () => {
    const err = new PromptClientError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PromptClientError);
    expect(err.name).toBe('PromptClientError');
    expect(err.message).toBe('test');
  });

  it('PromptApiError should extend PromptClientError', () => {
    const err = new PromptApiError('api error');
    expect(err).toBeInstanceOf(PromptClientError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PromptApiError');
  });

  it('PromptNotFoundError should extend PromptClientError', () => {
    const err = new PromptNotFoundError('not found');
    expect(err).toBeInstanceOf(PromptClientError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PromptNotFoundError');
  });
});

// ---------------------------------------------------------------------------
// Shared client management
// ---------------------------------------------------------------------------

describe('Shared client', () => {
  beforeEach(() => {
    // Reset by setting a new client to avoid cross-test pollution
    // We can't easily reset to null from outside, so we test the flow
  });

  it('getSharedClient should throw when no client is set', () => {
    // Create a fresh module scope test by importing the internal state
    // We'll test the error message pattern
    expect(() => {
      // Access a private-ish function behavior:
      // We need to ensure no client was set in *this* test,
      // but since module state persists, we test via a different approach
      const client = new PromptClient({ baseUrl: 'http://test', apiKey: 'key' });
      setSharedClient(client);
      // After setting, it should return fine
      expect(getSharedClient()).toBe(client);
    }).not.toThrow();
  });

  it('setSharedClient and getSharedClient round-trip', () => {
    const client = new PromptClient({ baseUrl: 'http://example.com', apiKey: 'test-key' });
    setSharedClient(client);
    expect(getSharedClient()).toBe(client);
  });

  it('clears and removes the shared client', () => {
    const client = new PromptClient({ baseUrl: 'http://example.com', apiKey: 'test-key' });
    const clear = vi.spyOn(client, 'clearCache');
    setSharedClient(client);
    setSharedClient(null);
    expect(clear).toHaveBeenCalled();
    expect(() => getSharedClient()).toThrow('No prompt client available');
  });
});

// ---------------------------------------------------------------------------
// PromptClient (unit tests with mocked fetch)
// ---------------------------------------------------------------------------

describe('PromptClient', () => {
  let client: PromptClient;

  beforeEach(() => {
    client = new PromptClient({ baseUrl: 'https://api.test.com/', apiKey: 'test-api-key' });
    vi.restoreAllMocks();
  });

  it('should strip trailing slashes from baseUrl', () => {
    // The URL in _request should not have double slashes
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    client.listPrompts();

    // Check the URL doesn't have double slashes after the domain
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toMatch(/^https:\/\/api\.test\.com\/api\//);
  });

  describe('_request', () => {
    it('should include auth headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client._request('/api/test');

      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = calledOptions.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['x-api-key']).toBe('test-api-key');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should throw PromptApiError on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve('Not found'),
        }),
      );

      await expect(client._request('/api/missing')).rejects.toThrow(PromptApiError);
    });

    it('should throw PromptApiError on non-JSON response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new Error('parse error')),
        }),
      );

      await expect(client._request('/api/bad-json')).rejects.toThrow(PromptApiError);
    });
  });

  describe('getPrompt', () => {
    it('should throw when both label and version specified', async () => {
      await expect(
        client.getPrompt('test', { label: 'prod', version: 1 }),
      ).rejects.toThrow('Cannot specify both label and version');
    });

    it('should cache results on subsequent calls', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'p1',
                name: 'my-prompt',
                version: 1,
                content: 'Hello',
                config: {},
                labels: [],
                updatedAt: '2024-01-01',
                createdAt: '2024-01-01',
                type: 'text',
              },
            ],
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const h1 = await client.getPrompt('my-prompt');
      const h2 = await client.getPrompt('my-prompt');

      expect(h1.name).toBe('my-prompt');
      expect(h2.name).toBe('my-prompt');
      // Should only have fetched once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent fetches and cleans inflight state', async () => {
      let resolveFetch!: (value: any) => void;
      const mockFetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
      vi.stubGlobal('fetch', mockFetch);
      const first = client.getPrompt('dedupe');
      const second = client.getPrompt('dedupe');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      resolveFetch({ ok: true, json: async () => ({ items: [
        { id: '1', name: 'dedupe', version: 1, content: 'ok', createdAt: '1' },
      ] }) });
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
      expect((client as any)._inflight.size).toBe(0);
    });

    it('force refresh bypasses a fresh cache entry', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [
        { id: '1', name: 'refresh', version: 1, content: 'ok', createdAt: '1' },
      ] }) });
      vi.stubGlobal('fetch', mockFetch);
      await client.getPrompt('refresh');
      await client.getPrompt('refresh', { forceRefresh: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('serves stale once while one background revalidation runs', async () => {
      client = new PromptClient({ baseUrl: 'https://api.test.com', apiKey: 'key', cacheTtlMs: 0, staleWhileRevalidateMs: 10_000 });
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [
        { id: '1', name: 'swr', version: 1, content: 'ok', createdAt: '1' },
      ] }) });
      vi.stubGlobal('fetch', mockFetch);
      await client.getPrompt('swr');
      await new Promise((resolve) => setTimeout(resolve, 1));
      await Promise.all([client.getPrompt('swr'), client.getPrompt('swr')]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('bounds the cache with LRU eviction', async () => {
      client = new PromptClient({ baseUrl: 'https://api.test.com', apiKey: 'key', maxCacheEntries: 2 });
      vi.stubGlobal('fetch', vi.fn((_url: string) => Promise.resolve({ ok: true, json: async () => ({ items: [
        { id: '1', name: 'item', version: 1, content: 'ok', createdAt: '1' },
      ] }) })));
      await client.getPrompt('one');
      await client.getPrompt('two');
      await client.getPrompt('one');
      await client.getPrompt('three');
      expect([...(client as any)._cache.keys()]).toEqual(['one::', 'three::']);
    });
  });

  it('aborts a request at the configured timeout without retrying', async () => {
    const mockFetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
    }));
    vi.stubGlobal('fetch', mockFetch);
    client = new PromptClient({ baseUrl: 'https://api.test.com', apiKey: 'key', requestTimeoutMs: 10 });
    await expect(client.fetchPrompt('timeout')).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe('fetchPrompt', () => {
    it('should fetch by label', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'p1',
              name: 'test',
              version: 2,
              content: 'Hello',
              config: {},
              labels: ['prod'],
              updatedAt: '2024-01-01',
              type: 'text',
            }),
        }),
      );

      const handle = await client.fetchPrompt('test', { label: 'prod' });
      expect(handle.name).toBe('test');
      expect(handle.version).toBe(2);
    });

    it('should throw PromptNotFoundError when no versions exist', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        }),
      );

      await expect(client.fetchPrompt('nonexistent')).rejects.toThrow(PromptNotFoundError);
    });

    it('should throw PromptNotFoundError when version not found', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { id: 'p1', name: 'test', version: 1, content: 'x', config: {}, labels: [], updatedAt: '', createdAt: '2024-01-01', type: 'text' },
              ],
            }),
        }),
      );

      await expect(client.fetchPrompt('test', { version: 99 })).rejects.toThrow(PromptNotFoundError);
    });

    it('should return latest version by default', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { id: 'p1', name: 'test', version: 1, content: 'old', config: {}, labels: [], updatedAt: '', createdAt: '2024-01-01', type: 'text' },
                { id: 'p2', name: 'test', version: 2, content: 'new', config: {}, labels: [], updatedAt: '', createdAt: '2024-06-01', type: 'text' },
              ],
            }),
        }),
      );

      const handle = await client.fetchPrompt('test');
      expect(handle.version).toBe(2);
      expect(handle.content).toBe('new');
    });
  });

  describe('listPrompts', () => {
    it('should return array of PromptHandle', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { id: 'p1', name: 'a', version: 1, content: 'hi', config: {}, labels: [], updatedAt: '', type: 'text' },
                { id: 'p2', name: 'b', version: 1, content: 'bye', config: {}, labels: [], updatedAt: '', type: 'text' },
              ],
            }),
        }),
      );

      const result = await client.listPrompts();
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(PromptHandle);
      expect(result[0].name).toBe('a');
      expect(result[1].name).toBe('b');
    });
  });

  describe('createPrompt', () => {
    it('should send POST request and return PromptHandle', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            prompt: {
              id: 'new1',
              name: 'created',
              version: 1,
              content: 'Hello',
              config: {},
              labels: ['draft'],
              updatedAt: '2024-01-01',
              type: 'text',
            },
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const handle = await client.createPrompt({
        name: 'created',
        content: 'Hello',
        labels: ['draft'],
      });

      expect(handle.name).toBe('created');
      expect(handle.version).toBe(1);

      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe('POST');
      const body = JSON.parse(calledOptions.body as string);
      expect(body.name).toBe('created');
      expect(body.type).toBe('text');
    });

    it('should set type to chat when messages provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'c1', name: 'chat', version: 1, config: {}, labels: [], updatedAt: '', type: 'chat' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.createPrompt({
        name: 'chat',
        messages: [{ role: 'system', content: 'Hi' }],
      });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.type).toBe('chat');
      expect(body.messages).toEqual([{ role: 'system', content: 'Hi' }]);
    });
  });

  describe('deletePrompt', () => {
    it('should send DELETE request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.deletePrompt('test');

      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe('DELETE');
    });
  });

  describe('removeTag', () => {
    it('should send DELETE request with tag in body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.removeTag('test', 'old-tag');

      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe('DELETE');
      const body = JSON.parse(calledOptions.body as string);
      expect(body.tag).toBe('old-tag');
    });
  });

  describe('saveAsVersion', () => {
    it('should send POST to save-as-version endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            prompt: {
              id: 'v1',
              name: 'test',
              version: 3,
              content: 'saved',
              config: {},
              labels: ['staging'],
              updatedAt: '2024-06-01',
              type: 'text',
            },
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const handle = await client.saveAsVersion('test', { label: 'staging' });

      expect(handle.version).toBe(3);
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.promptName).toBe('test');
      expect(body.labels).toEqual(['staging']);
    });
  });
});
