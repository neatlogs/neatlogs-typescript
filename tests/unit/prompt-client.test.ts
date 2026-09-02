import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PromptClient,
  PromptHandle,
  PromptClientError,
  PromptApiError,
  PromptClientClosedError,
  PromptNotFoundError,
  PromptRequestTimeoutError,
  renderTemplate,
  normalizePromptObject,
  setSharedClient,
  getSharedClient,
  closeSharedClient,
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

  it('infers chat type from normalized messages when the backend omits type', () => {
    const raw = {
      id: 'x',
      name: 'chat-prompt',
      version: 1,
      content: null,
      messages: [{ role: 'system', content: 'You are helpful' }],
      config: {},
      labels: [],
      updatedAt: '',
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

  it('deep-copies JSON config and fails closed for cyclic or excessive input', () => {
    const source = { model: { params: { stop: ['done'] } } };
    const normalized = normalizePromptObject({ config: source });
    source.model.params.stop[0] = 'mutated';
    expect(normalized.config).toEqual({ model: { params: { stop: ['done'] } } });

    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(normalizePromptObject({ config: cyclic }).config).toEqual({});

    let excessive: Record<string, unknown> = {};
    const root = excessive;
    for (let index = 0; index < 40; index += 1) {
      const next: Record<string, unknown> = {};
      excessive['next'] = next;
      excessive = next;
    }
    expect(normalizePromptObject({ config: root }).config).toEqual({});
    expect(normalizePromptObject({ config: { unsafe: () => 'secret' } }).config).toEqual({});

    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, '0', { enumerable: true, get: () => 'unsafe' });
    accessorArray.length = 1;
    expect(normalizePromptObject({ config: { unsafe: accessorArray } }).config).toEqual({});
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

  it('deeply isolates constructor input and every config/message getter', () => {
    const source: CachedPrompt = {
      ...baseCached,
      content: null,
      messages: [{ role: 'system', content: 'original message' }],
      config: { model: { params: { stop: ['done'] } } },
      type: 'chat',
    };
    const handle = new PromptHandle(source);

    (source.config['model'] as any).params.stop[0] = 'source mutation';
    source.messages![0].content = 'source mutation';
    const firstConfig = handle.config;
    (firstConfig['model'] as any).params.stop[0] = 'getter mutation';
    const firstMessages = handle.messages!;
    firstMessages[0].content = 'getter mutation';

    expect(handle.config).toEqual({ model: { params: { stop: ['done'] } } });
    expect(handle.messages).toEqual([{ role: 'system', content: 'original message' }]);
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
    closeSharedClient();
  });

  afterEach(() => {
    closeSharedClient();
  });

  it('getSharedClient should throw when no client is set', () => {
    expect(() => getSharedClient()).toThrow('No prompt client available');
  });

  it('setSharedClient and getSharedClient round-trip', () => {
    const client = new PromptClient({ baseUrl: 'http://example.com', apiKey: 'test-key' });
    setSharedClient(client);
    expect(getSharedClient()).toBe(client);
  });

  it('replacing the shared client closes the previous cache and request owner', async () => {
    const first = new PromptClient({ baseUrl: 'http://first.test', apiKey: 'first' });
    const second = new PromptClient({ baseUrl: 'http://second.test', apiKey: 'second' });
    setSharedClient(first);
    setSharedClient(second);

    await expect(first.getPrompt('closed')).rejects.toBeInstanceOf(PromptClientClosedError);
    expect(getSharedClient()).toBe(second);
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
      expect(headers['Authorization']).toBe('Bearer test-api-key');
      expect(headers['x-api-key']).toBe('test-api-key');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should throw PromptApiError on non-ok response', async () => {
      const readBody = vi.fn().mockResolvedValue('secret backend diagnostic');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          headers: new Headers({ 'x-request-id': 'req-safe-123' }),
          text: readBody,
        }),
      );

      const error = await client._request('/api/missing').catch((caught) => caught);
      expect(error).toBeInstanceOf(PromptApiError);
      expect(error).toMatchObject({
        method: 'GET',
        path: '/api/missing',
        status: 404,
        requestId: 'req-safe-123',
      });
      expect(error.message).toBe('GET /api/missing failed (404); request_id=req-safe-123');
      expect(error.message).not.toContain('secret backend diagnostic');
      expect(readBody).not.toHaveBeenCalled();
    });

    it('omits an unsafe response request id', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          headers: { get: () => 'unsafe\nprivate' },
        }),
      );

      const error = await client._request('/api/failure').catch((caught) => caught);
      expect(error).toMatchObject({ status: 500, requestId: undefined });
      expect(error.message).toBe('GET /api/failure failed (500)');
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

    it('prevents one caller from mutating nested cached prompt data seen by another', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'chat-1',
                name: 'chat-prompt',
                version: 1,
                content: null,
                messages: [{ role: 'system', content: 'original message' }],
                config: { model: { params: { stop: ['done'] } } },
                labels: [],
                updatedAt: '2024-01-01',
              },
            ],
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const first = await client.getPrompt('chat-prompt');
      (first.config['model'] as any).params.stop[0] = 'caller mutation';
      first.messages![0].content = 'caller mutation';

      const second = await client.getPrompt('chat-prompt');
      expect(second.type).toBe('chat');
      expect(second.config).toEqual({ model: { params: { stop: ['done'] } } });
      expect(second.messages).toEqual([{ role: 'system', content: 'original message' }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns stale data immediately and refreshes it once in the background', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                {
                  id: 'p1',
                  name: 'my-prompt',
                  version: 1,
                  content: 'old',
                  config: {},
                  labels: [],
                  updatedAt: '2024-01-01',
                  createdAt: '2024-01-01',
                  type: 'text',
                },
              ],
            }),
        })
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                {
                  id: 'p2',
                  name: 'my-prompt',
                  version: 2,
                  content: 'new',
                  config: {},
                  labels: [],
                  updatedAt: '2024-06-01',
                  createdAt: '2024-06-01',
                  type: 'text',
                },
              ],
            }),
        });
      vi.stubGlobal('fetch', mockFetch);
      const expiringClient = new PromptClient({
        baseUrl: 'https://api.test.com',
        apiKey: 'key',
      });

      const first = await expiringClient.getPrompt('my-prompt');
      const staleResults = await Promise.all([
        expiringClient.getPrompt('my-prompt', { cacheTtlMs: 0 }),
        expiringClient.getPrompt('my-prompt', { cacheTtlMs: 0 }),
        expiringClient.getPrompt('my-prompt', { cacheTtlMs: 0 }),
      ]);

      expect(first.content).toBe('old');
      expect(staleResults.map((item) => item.content)).toEqual(['old', 'old', 'old']);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await vi.waitFor(() =>
        expect(expiringClient.getPrompt('my-prompt')).resolves.toMatchObject({
          version: 2,
        }),
      );
    });

    it('deduplicates concurrent cold cache misses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'p1',
                name: 'my-prompt',
                version: 1,
                content: 'hello',
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

      const results = await Promise.all([
        client.getPrompt('my-prompt'),
        client.getPrompt('my-prompt'),
        client.getPrompt('my-prompt'),
      ]);

      expect(results).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('keeps an explicitly pinned version stable even with a zero TTL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'p1',
                name: 'my-prompt',
                version: 1,
                content: 'pinned',
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

      await client.getPrompt('my-prompt', { version: 1, cacheTtlMs: 0 });
      await client.getPrompt('my-prompt', { version: 1, cacheTtlMs: 0 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid cache TTLs', async () => {
      expect(
        () =>
          new PromptClient({
            baseUrl: 'https://api.test.com',
            apiKey: 'key',
            cacheTtlMs: -1,
          }),
      ).toThrow('cacheTtlMs must be a finite number greater than or equal to 0');
      await expect(client.getPrompt('my-prompt', { cacheTtlMs: Number.NaN })).rejects.toThrow(
        'cacheTtlMs must be a finite number greater than or equal to 0',
      );
    });

    it('preserves a per-key TTL when a background refresh replaces the value', async () => {
      let now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(promptListResponse('my-prompt', 1, 'old'))
        .mockResolvedValue(promptListResponse('my-prompt', 2, 'new'));
      vi.stubGlobal('fetch', mockFetch);

      await client.getPrompt('my-prompt', {
        cacheTtlMs: 10,
        staleWhileRevalidateMs: 100,
      });
      now += 11;

      expect((await client.getPrompt('my-prompt')).content).toBe('old');
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
      await vi.waitFor(async () =>
        expect((await client.getPrompt('my-prompt')).content).toBe('new'),
      );

      now += 11;
      expect((await client.getPrompt('my-prompt')).content).toBe('new');
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    });

    it('bounds stale fallback and rejects when an outage outlives that window', async () => {
      let now = 5_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      let rejectRefresh!: (reason?: unknown) => void;
      const refresh = new Promise<Response>((_resolve, reject) => {
        rejectRefresh = reject;
      });
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(promptListResponse('my-prompt', 1, 'last-known-good'))
        .mockReturnValueOnce(refresh)
        .mockRejectedValueOnce(new Error('backend unavailable'));
      vi.stubGlobal('fetch', mockFetch);
      const outageClient = new PromptClient({
        baseUrl: 'https://api.test.com',
        apiKey: 'key',
        cacheTtlMs: 10,
        staleWhileRevalidateMs: 20,
      });

      await outageClient.getPrompt('my-prompt');
      now += 11;
      expect((await outageClient.getPrompt('my-prompt')).content).toBe('last-known-good');
      rejectRefresh(new Error('backend unavailable'));
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 0));

      now += 20;
      await expect(outageClient.getPrompt('my-prompt')).rejects.toThrow(
        'GET /api/managed-prompts?name=my-prompt&limit=500&offset=0 request failed',
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('keeps distinct pinned versions immutable after an unpinned mutation', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(promptListResponse('my-prompt', 1, 'pinned-v1'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ prompt: promptObject('my-prompt', 2, 'latest-v2') }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const pinned = await client.getPrompt('my-prompt', { version: 1 });
      await client.updatePrompt('my-prompt', { content: 'latest-v2' });
      const pinnedAgain = await client.getPrompt('my-prompt', { version: 1 });

      expect(pinned.content).toBe('pinned-v1');
      expect(pinnedAgain.content).toBe('pinned-v1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('evicts least-recently-used selectors when the cache is full', async () => {
      const mockFetch = vi.fn().mockImplementation((rawUrl: string) => {
        const name = new URL(rawUrl).searchParams.get('name') ?? 'unknown';
        return Promise.resolve(promptListResponse(name, 1, name));
      });
      vi.stubGlobal('fetch', mockFetch);
      const boundedClient = new PromptClient({
        baseUrl: 'https://api.test.com',
        apiKey: 'key',
        maxCacheEntries: 2,
      });

      await boundedClient.getPrompt('a');
      await boundedClient.getPrompt('b');
      await boundedClient.getPrompt('a');
      await boundedClient.getPrompt('c');
      await boundedClient.getPrompt('b');

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('clearCache releases values and prevents an earlier request from repopulating it', async () => {
      let resolveFirst!: (response: Response) => void;
      const first = new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      });
      const mockFetch = vi
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValue(promptListResponse('my-prompt', 2, 'new'));
      vi.stubGlobal('fetch', mockFetch);

      const pending = client.getPrompt('my-prompt');
      client.clearCache();
      resolveFirst(promptListResponse('my-prompt', 1, 'old'));
      await expect(pending).resolves.toMatchObject({ version: 1 });
      await expect(client.getPrompt('my-prompt')).resolves.toMatchObject({ version: 2 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('request and client lifecycle', () => {
    it('times out one backend request without retrying it', async () => {
      const mockFetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      });
      vi.stubGlobal('fetch', mockFetch);
      const timeoutClient = new PromptClient({
        baseUrl: 'https://api.test.com',
        apiKey: 'key',
        requestTimeoutMs: 5,
      });

      await expect(timeoutClient.getPrompt('slow')).rejects.toBeInstanceOf(
        PromptRequestTimeoutError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a network failure outside suppressed OTel context', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('network down'));
      vi.stubGlobal('fetch', mockFetch);

      await expect(client.getPrompt('unavailable')).rejects.toThrow(
        'GET /api/managed-prompts?name=unavailable&limit=500&offset=0 request failed',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('close aborts requests, clears state, is idempotent, and rejects new work', async () => {
      const mockFetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const pending = client.getPrompt('pending');
      client.close();
      client.close();

      await expect(pending).rejects.toBeInstanceOf(PromptClientClosedError);
      await expect(client.getPrompt('after-close')).rejects.toBeInstanceOf(
        PromptClientClosedError,
      );
      expect(() => client.clearCache()).toThrow(PromptClientClosedError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('validates bounded-cache and request-deadline configuration', () => {
      expect(
        () =>
          new PromptClient({
            baseUrl: 'https://api.test.com',
            apiKey: 'key',
            staleWhileRevalidateMs: -1,
          }),
      ).toThrow('staleWhileRevalidateMs');
      expect(
        () =>
          new PromptClient({
            baseUrl: 'https://api.test.com',
            apiKey: 'key',
            requestTimeoutMs: 0,
          }),
      ).toThrow('requestTimeoutMs');
      expect(
        () =>
          new PromptClient({
            baseUrl: 'https://api.test.com',
            apiKey: 'key',
            maxCacheEntries: 1.5,
          }),
      ).toThrow('maxCacheEntries');
    });
  });

  describe('fetchPrompt', () => {
    it('rejects ambiguous label and version selectors before a request', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(client.fetchPrompt('test', { label: 'prod', version: 1 })).rejects.toThrow(
        'Cannot specify both label and version',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

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

    it('paginates until an exact version beyond the first 500 is found', async () => {
      const firstPage = Array.from({ length: 500 }, (_, index) =>
        promptObject('long-history', 501 - index, `v${501 - index}`),
      );
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: firstPage, total: 501 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [promptObject('long-history', 1, 'target')],
              total: 501,
            }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const handle = await client.fetchPrompt('long-history', { version: 1 });

      expect(handle.content).toBe('target');
      expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([
        'https://api.test.com/api/managed-prompts?name=long-history&limit=500&offset=0',
        'https://api.test.com/api/managed-prompts?name=long-history&limit=500&offset=500',
      ]);
    });

    it('should return latest version by default', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { id: 'p2', name: 'test', version: 2, content: 'new', config: {}, labels: [], updatedAt: '', createdAt: '2024-06-01', type: 'text' },
                { id: 'p1', name: 'test', version: 1, content: 'old', config: {}, labels: [], updatedAt: '', createdAt: '2024-01-01', type: 'text' },
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

    it('returns every backend page rather than silently truncating at 500', async () => {
      const firstPage = Array.from({ length: 500 }, (_, index) =>
        promptObject(`prompt-${index}`, 1, 'page-one'),
      );
      const finalPrompt = promptObject('prompt-500', 1, 'page-two');
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: firstPage, total: 501 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [finalPrompt], total: 501 }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.listPrompts();

      expect(result).toHaveLength(501);
      expect(result.at(-1)?.name).toBe('prompt-500');
      expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([
        'https://api.test.com/api/managed-prompts?limit=500&offset=0',
        'https://api.test.com/api/managed-prompts?limit=500&offset=500',
      ]);
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
        config: { temperature: 0.1 },
        labels: ['draft'],
        tags: ['sdk'],
        commitMessage: 'Initial SDK version',
      });

      expect(handle.name).toBe('created');
      expect(handle.version).toBe(1);

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.test.com/api/managed-prompts');
      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe('POST');
      const body = JSON.parse(calledOptions.body as string);
      expect(body).toEqual({
        name: 'created',
        content: 'Hello',
        config: { temperature: 0.1 },
        labels: ['draft'],
        tags: ['sdk'],
        commit_message: 'Initial SDK version',
      });
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
      expect(body).toEqual({
        name: 'chat',
        messages: [{ role: 'system', content: 'Hi' }],
      });
    });

    it('rejects a contentless create before making a request', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(client.createPrompt({ name: 'invalid' })).rejects.toThrow(
        'createPrompt requires non-empty content or messages',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('allows zero labels and rejects multiple labels before create', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ prompt: promptObject('unlabeled', 1, 'content') }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.createPrompt({ name: 'unlabeled', content: 'content', labels: [] });
      expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
        name: 'unlabeled',
        content: 'content',
        labels: [],
      });

      await expect(
        client.createPrompt({ name: 'invalid', content: 'content', labels: ['a', 'b'] }),
      ).rejects.toThrow('createPrompt accepts at most one label per prompt version');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('deletePrompt', () => {
    it('resolves the requested version to its UUID before DELETE', async () => {
      const promptId = '123e4567-e89b-12d3-a456-426614174000';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [{ ...promptObject('test', 3, 'delete-me'), id: promptId }],
            }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      vi.stubGlobal('fetch', mockFetch);

      await client.deletePrompt('test', { version: 3 });

      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.test.com/api/managed-prompts?name=test&limit=500&offset=0',
      );
      expect(mockFetch.mock.calls[1][0]).toBe(
        `https://api.test.com/api/managed-prompts/${promptId}`,
      );
      const calledOptions = mockFetch.mock.calls[1][1] as RequestInit;
      expect(calledOptions.method).toBe('DELETE');
      expect(calledOptions.body).toBeUndefined();
    });

    it('rejects ambiguous or invalid mutation selectors before a request', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        client.deletePrompt('test', { version: 3, label: 'production' }),
      ).rejects.toThrow('Specify only one');
      await expect(client.deletePrompt('test', { promptId: 'not-a-uuid' })).rejects.toThrow(
        'promptId must be a UUID',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('label and tag mutations', () => {
    it('posts a label to the UUID label endpoint', async () => {
      const promptId = '123e4567-e89b-12d3-a456-426614174000';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.setLabel('test', 'production', { promptId });

      expect(mockFetch.mock.calls[0][0]).toBe(
        `https://api.test.com/api/managed-prompts/${promptId}/labels`,
      );
      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe('POST');
      expect(JSON.parse(calledOptions.body as string)).toEqual({ label: 'production' });
    });

    it('posts a tag to the UUID tag endpoint', async () => {
      const promptId = '123e4567-e89b-12d3-a456-426614174000';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.addTag('test', 'release', { promptId });

      expect(mockFetch.mock.calls[0][0]).toBe(
        `https://api.test.com/api/managed-prompts/${promptId}/tags`,
      );
      const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe('POST');
      expect(JSON.parse(calledOptions.body as string)).toEqual({ tag: 'release' });
    });

    it('resolves a label to UUID before removing a tag', async () => {
      const promptId = '123e4567-e89b-12d3-a456-426614174000';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ...promptObject('test', 4, 'labeled'), id: promptId }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      vi.stubGlobal('fetch', mockFetch);

      await client.removeTag('test', 'old-tag', { label: 'production' });

      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.test.com/api/v1/prompts/test/fetch?label=production',
      );
      expect(mockFetch.mock.calls[1][0]).toBe(
        `https://api.test.com/api/managed-prompts/${promptId}/tags`,
      );
      const calledOptions = mockFetch.mock.calls[1][1] as RequestInit;
      expect(calledOptions.method).toBe('DELETE');
      expect(JSON.parse(calledOptions.body as string)).toEqual({ tag: 'old-tag' });
    });
  });

  describe('saveAsVersion', () => {
    it('sends the complete backend save-as-version contract', async () => {
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

      const handle = await client.saveAsVersion('test', {
        content: 'saved',
        config: { temperature: 0.2 },
        label: 'staging',
        tags: ['sdk'],
        commitMessage: 'Ship prompt version',
      });

      expect(handle.version).toBe(3);
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.test.com/api/prompt-playground/save-as-version',
      );
      expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({
        promptName: 'test',
        content: 'saved',
        config: { temperature: 0.2 },
        labels: ['staging'],
        tags: ['sdk'],
        commitMessage: 'Ship prompt version',
      });
    });

    it('implements deprecated updatePrompt as a real immutable version save', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ prompt: promptObject('test', 2, 'updated') }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.updatePrompt('test', { content: 'updated', labels: ['production'] });

      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.test.com/api/prompt-playground/save-as-version',
      );
      expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
      expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
        promptName: 'test',
        content: 'updated',
        labels: ['production'],
      });
    });

    it('rejects the legacy label-only call rather than sending an invalid request', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(client.saveAsVersion('test', { label: 'staging' })).rejects.toThrow(
        'saveAsVersion requires non-empty content or messages',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('allows no label and rejects multiple labels for save and update before network', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ prompt: promptObject('test', 4, 'unlabeled') }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.saveAsVersion('test', { content: 'unlabeled', labels: [] });
      expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
        promptName: 'test',
        content: 'unlabeled',
      });

      await expect(
        client.saveAsVersion('test', { content: 'bad', labels: ['a', 'b'] }),
      ).rejects.toThrow('saveAsVersion accepts at most one label per prompt version');
      await expect(
        client.updatePrompt('test', { content: 'bad', labels: ['a', 'b'] }),
      ).rejects.toThrow('updatePrompt accepts at most one label per prompt version');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

function promptObject(name: string, version: number, content: string): Record<string, unknown> {
  return {
    id: `${name}-${version}`,
    name,
    version,
    content,
    config: {},
    labels: [],
    updatedAt: `2024-01-${String(version).padStart(2, '0')}`,
    createdAt: `2024-01-${String(version).padStart(2, '0')}`,
    type: 'text',
  };
}

function promptListResponse(name: string, version: number, content: string): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ items: [promptObject(name, version, content)] }),
  } as Response;
}
