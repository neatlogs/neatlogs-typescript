import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const otel = vi.hoisted(() => ({
  active: vi.fn(),
  suppressTracing: vi.fn(),
  withContext: vi.fn(),
}));

vi.mock('@opentelemetry/api', () => ({
  context: {
    active: otel.active,
    with: otel.withContext,
  },
}));

vi.mock('@opentelemetry/core', () => ({
  suppressTracing: otel.suppressTracing,
}));

import { PromptApiError, PromptClient } from '../../src/prompt/client.js';

function response({
  body = {},
  ok = true,
  status = 200,
  text = '',
}: {
  body?: unknown;
  ok?: boolean;
  status?: number;
  text?: string;
} = {}): Response {
  return {
    ok,
    status,
    body: { cancel: vi.fn().mockResolvedValue(undefined) },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(text),
  } as unknown as Response;
}

function createClient(): PromptClient {
  return new PromptClient({
    baseUrl: 'https://api.test.com',
    apiKey: 'test-api-key',
  });
}

describe('PromptClient transport replay boundary', () => {
  beforeEach(() => {
    otel.active.mockReset().mockReturnValue({});
    otel.suppressTracing.mockReset().mockImplementation((value) => value);
    otel.withContext
      .mockReset()
      .mockImplementation((_context, callback: () => Promise<Response>) => callback());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back once when reading the active OTel context throws', async () => {
    const setupError = new Error('active context unavailable');
    otel.active.mockImplementation(() => {
      throw setupError;
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'ok',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(otel.withContext).not.toHaveBeenCalled();
  });

  it('falls back once when suppressing the OTel context throws', async () => {
    const setupError = new Error('suppression unavailable');
    otel.suppressTracing.mockImplementation(() => {
      throw setupError;
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'ok',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(otel.withContext).not.toHaveBeenCalled();
  });

  it('falls back once when context.with throws before invoking transport', async () => {
    const setupError = new Error('context manager unavailable');
    otel.withContext.mockImplementation(() => {
      throw setupError;
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'ok',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the transport result when context.with throws after invoking transport', async () => {
    const contextError = new Error('context manager failed after callback');
    otel.withContext.mockImplementation((_context, callback: () => Promise<Response>) => {
      callback();
      throw contextError;
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'transport' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'transport',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the transport result when an async context wrapper rejects after invoking it', async () => {
    const contextError = new Error('async context wrapper failed after callback');
    otel.withContext.mockImplementation((_context, callback: () => Promise<Response>) => {
      callback();
      return Promise.reject(contextError);
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'transport' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'transport',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the transport error when an async context wrapper also rejects', async () => {
    const contextError = new Error('async context wrapper failed after callback');
    const transportError = new Error('transport failed');
    otel.withContext.mockImplementation((_context, callback: () => Promise<Response>) => {
      callback();
      return Promise.reject(contextError);
    });
    const fetchMock = vi.fn().mockRejectedValue(transportError);
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).rejects.toMatchObject({
      name: 'PromptApiError',
      message: 'GET /api/test request failed',
      method: 'GET',
      path: '/api/test',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back once when an async context wrapper rejects before invoking transport', async () => {
    otel.withContext.mockImplementation(() => Promise.reject(new Error('context unavailable')));
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'fallback' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'fallback',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('starts one plain transport when context.with returns without invoking the callback', async () => {
    otel.withContext.mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'fallback' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'fallback',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('starts transport once when a context manager invokes the callback twice', async () => {
    otel.withContext.mockImplementation((_context, callback: () => Promise<Response>) => {
      callback();
      return callback();
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'transport' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).resolves.toEqual({
      value: 'transport',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not replay when fetch throws synchronously', async () => {
    const transportError = new Error('synchronous transport failure');
    const fetchMock = vi.fn(() => {
      throw transportError;
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).rejects.toMatchObject({
      name: 'PromptApiError',
      message: 'GET /api/test request failed',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not replay when the fetch promise rejects', async () => {
    const transportError = new Error('asynchronous transport failure');
    const fetchMock = vi.fn().mockRejectedValue(transportError);
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).rejects.toMatchObject({
      name: 'PromptApiError',
      message: 'GET /api/test request failed',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not replay when transport rejects with an abort error', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).rejects.toMatchObject({
      name: 'PromptApiError',
      message: 'GET /api/test request failed',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not expose an HTTP error body or replay transport', async () => {
    const failedResponse = response({
      ok: false,
      status: 503,
      text: 'temporarily unavailable',
    });
    const fetchMock = vi.fn().mockResolvedValue(failedResponse);
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).rejects.toThrow(
      'GET /api/test failed (503)',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(failedResponse.body?.cancel).toHaveBeenCalledOnce();
    expect(failedResponse.text).not.toHaveBeenCalled();
    expect(failedResponse.json).not.toHaveBeenCalled();
  });

  it('ignores error-body cancellation failures without replaying transport', async () => {
    const failedResponse = response({ ok: false, status: 500 });
    vi.mocked(failedResponse.body!.cancel).mockRejectedValue(new Error('body cancel failed'));
    const fetchMock = vi.fn().mockResolvedValue(failedResponse);
    vi.stubGlobal('fetch', fetchMock);

    await expect(createClient()._request('/api/test')).rejects.toThrow(
      'GET /api/test failed (500)',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(failedResponse.body?.cancel).toHaveBeenCalledOnce();
    expect(failedResponse.text).not.toHaveBeenCalled();
    expect(failedResponse.json).not.toHaveBeenCalled();
  });

  it('preserves non-JSON response errors without replaying transport', async () => {
    const invalidResponse = response();
    vi.mocked(invalidResponse.json).mockRejectedValue(new Error('invalid JSON'));
    const fetchMock = vi.fn().mockResolvedValue(invalidResponse);
    vi.stubGlobal('fetch', fetchMock);

    const error = await createClient()
      ._request('/api/test')
      .catch((requestError: unknown) => requestError);

    expect(error).toBeInstanceOf(PromptApiError);
    expect(error).toHaveProperty('message', 'GET /api/test returned non-JSON response (200)');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('preserves URL, method, authentication, custom headers, and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ body: { value: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);

    await createClient()._request('/api/test?label=production', {
      method: 'PATCH',
      headers: { 'x-request-id': 'request-1' },
      body: JSON.stringify({ value: 'payload' }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test.com/api/test?label=production',
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'x-api-key': 'test-api-key',
          'x-request-id': 'request-1',
        },
        body: '{"value":"payload"}',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  const promptId = '00000000-0000-4000-8000-000000000001';
  const rejectedMutations = [
    {
      name: 'createPrompt',
      invoke: (client: PromptClient) => client.createPrompt({ name: 'created', content: 'hello' }),
      path: '/api/managed-prompts',
      method: 'POST',
      body: { name: 'created', content: 'hello' },
    },
    {
      name: 'updatePrompt',
      invoke: (client: PromptClient) => client.updatePrompt('updated', { content: 'hello' }),
      path: '/api/prompt-playground/save-as-version',
      method: 'POST',
      body: { promptName: 'updated', content: 'hello' },
    },
    {
      name: 'deletePrompt',
      invoke: (client: PromptClient) => client.deletePrompt('deleted', { promptId }),
      path: `/api/managed-prompts/${promptId}`,
      method: 'DELETE',
      body: undefined,
    },
    {
      name: 'setLabel',
      invoke: (client: PromptClient) => client.setLabel('labeled', 'production', { promptId }),
      path: `/api/managed-prompts/${promptId}/labels`,
      method: 'POST',
      body: { label: 'production' },
    },
    {
      name: 'addTag',
      invoke: (client: PromptClient) => client.addTag('tagged', 'production', { promptId }),
      path: `/api/managed-prompts/${promptId}/tags`,
      method: 'POST',
      body: { tag: 'production' },
    },
    {
      name: 'removeTag',
      invoke: (client: PromptClient) => client.removeTag('tagged', 'production', { promptId }),
      path: `/api/managed-prompts/${promptId}/tags`,
      method: 'DELETE',
      body: { tag: 'production' },
    },
    {
      name: 'saveAsVersion',
      invoke: (client: PromptClient) =>
        client.saveAsVersion('versioned', {
          content: 'hello',
          label: 'staging',
        }),
      path: '/api/prompt-playground/save-as-version',
      method: 'POST',
      body: { promptName: 'versioned', content: 'hello', labels: ['staging'] },
    },
  ];

  it.each(rejectedMutations)(
    'does not replay a rejected $name mutation',
    async ({ invoke, path, method, body }) => {
      const transportError = new Error(`${method} transport failure`);
      const fetchMock = vi.fn().mockRejectedValue(transportError);
      vi.stubGlobal('fetch', fetchMock);

      await expect(invoke(createClient())).rejects.toMatchObject({
        name: 'PromptApiError',
        message: `${method} ${path.replace(promptId, ':promptId')} request failed`,
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [calledUrl, calledOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(`https://api.test.com${path}`);
      expect(calledOptions.method).toBe(method);
      expect(calledOptions.body).toBe(body === undefined ? undefined : JSON.stringify(body));
    },
  );

  it('does not amplify a concurrent burst of rejected writes', async () => {
    const transportError = new Error('write rejected');
    const fetchMock = vi.fn().mockRejectedValue(transportError);
    vi.stubGlobal('fetch', fetchMock);
    const client = createClient();

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) =>
        client.createPrompt({ name: `prompt-${index}`, content: 'hello' }),
      ),
    );

    expect(results).toHaveLength(100);
    expect(
      results.every(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof PromptApiError &&
          result.reason.message === 'POST /api/managed-prompts request failed',
      ),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });
});
