import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trace } from '../../src/core/context.js';
import { flush, init, shutdown } from '../../src/init.js';
import {
  createPrompt,
  deletePrompt,
  fetchPrompt,
  PromptApiError,
  PromptClient,
  removeTag,
  saveAsVersion,
  updatePrompt,
} from '../../src/prompt/client.js';

interface CapturedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

type AsyncRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

const servers = new Set<Server>();

async function stopServer(server: Server): Promise<void> {
  servers.delete(server);
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections?.();
  });
}

afterEach(async () => {
  await Promise.all([...servers].map(stopServer));
});

async function startServer(
  handler: AsyncRequestHandler,
): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer((request, response) => {
    void handler(request, response).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
  servers.add(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await stopServer(server);
    throw new Error('Test server did not bind to a TCP port');
  }

  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function captureRequest(request: IncomingMessage): Promise<CapturedRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const bodyText = Buffer.concat(chunks).toString('utf8');
  return {
    method: request.method ?? '',
    path: request.url ?? '',
    headers: request.headers,
    body: bodyText ? JSON.parse(bodyText) : undefined,
  };
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Connection', 'close');
  response.end(JSON.stringify(value));
}

function prompt(name: string, version: number, content: string, labels: string[] = []) {
  return {
    id: `${name}-${version}`,
    name,
    version,
    content,
    config: { temperature: 0 },
    labels,
    updatedAt: '2026-09-03T00:00:00.000Z',
    createdAt: `2026-09-03T00:00:0${version}.000Z`,
    type: 'text',
  };
}

describe('PromptClient real HTTP transport', () => {
  it('runs the public prompt workflow over an actual HTTP connection', async () => {
    const requests: CapturedRequest[] = [];
    const name = 'release check/東京';
    const label = 'production ready';
    const { baseUrl } = await startServer(async (request, response) => {
      const captured = await captureRequest(request);
      requests.push(captured);
      const url = new URL(captured.path, baseUrl);

      if (captured.method === 'POST' && url.pathname === '/api/managed-prompts') {
        sendJson(response, { prompt: prompt(name, 1, 'Hello {{name}}', ['draft']) });
        return;
      }
      if (captured.method === 'PUT' && url.pathname === '/api/managed-prompts') {
        sendJson(response, { prompt: prompt(name, 2, 'Welcome {{name}}', [label]) });
        return;
      }
      if (captured.method === 'GET' && url.pathname === '/api/managed-prompts') {
        sendJson(response, {
          items: [
            prompt(name, 1, 'Hello {{name}}', ['draft']),
            prompt(name, 2, 'Welcome {{name}}', [label]),
          ],
        });
        return;
      }
      if (captured.method === 'GET' && url.pathname.endsWith('/fetch')) {
        sendJson(response, prompt(name, 2, 'Welcome {{name}}', [label]));
        return;
      }
      if (captured.method === 'DELETE' && url.pathname.endsWith('/tags')) {
        sendJson(response, {});
        return;
      }
      if (
        captured.method === 'POST' &&
        url.pathname === '/api/prompt-playground/save-as-version'
      ) {
        sendJson(response, { prompt: prompt(name, 3, 'Welcome {{name}}', ['staging']) });
        return;
      }
      if (captured.method === 'DELETE' && url.pathname.startsWith('/api/managed-prompts/')) {
        sendJson(response, {});
        return;
      }

      sendJson(response, { error: 'unexpected request' }, 404);
    });
    const client = new PromptClient({ baseUrl: `${baseUrl}/`, apiKey: 'integration-key' });

    const created = await client.createPrompt({
      name,
      content: 'Hello {{name}}',
      labels: ['draft'],
    });
    const updated = await client.updatePrompt(name, {
      content: 'Welcome {{name}}',
      labels: [label],
    });
    const listed = await client.listPrompts();
    const latest = await client.getPrompt(name);
    const cached = await client.getPrompt(name);
    const labeled = await client.fetchPrompt(name, { label });
    await client.removeTag(name, label);
    const versioned = await client.saveAsVersion(name, { label: 'staging' });
    await client.deletePrompt(name);

    expect(created.compile({ name: 'Harsh' })).toBe('Hello Harsh');
    expect(updated.compile({ name: 'Harsh' })).toBe('Welcome Harsh');
    expect(listed.map((item) => item.version)).toEqual([1, 2]);
    expect(latest.version).toBe(2);
    expect(cached.version).toBe(2);
    expect(labeled.labels).toEqual([label]);
    expect(versioned.version).toBe(3);

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /api/managed-prompts',
      'PUT /api/managed-prompts',
      'GET /api/managed-prompts?limit=100&offset=0',
      'GET /api/managed-prompts?name=release%20check%2F%E6%9D%B1%E4%BA%AC&limit=100&offset=0',
      'GET /api/v1/prompts/release%20check%2F%E6%9D%B1%E4%BA%AC/fetch?label=production%20ready',
      'DELETE /api/managed-prompts/release%20check%2F%E6%9D%B1%E4%BA%AC/tags',
      'POST /api/prompt-playground/save-as-version',
      'DELETE /api/managed-prompts/release%20check%2F%E6%9D%B1%E4%BA%AC',
    ]);
    expect(
      requests.every(({ headers }) => headers.authorization === 'Bearer integration-key'),
    ).toBe(true);
    expect(requests.every(({ headers }) => headers['x-api-key'] === 'integration-key')).toBe(true);
    expect(requests.every(({ headers }) => headers.accept === 'application/json')).toBe(true);
    expect(requests.every(({ headers }) => headers['content-type'] === 'application/json')).toBe(
      true,
    );
    expect(requests[0].body).toEqual({
      name,
      content: 'Hello {{name}}',
      type: 'text',
      labels: ['draft'],
    });
    expect(requests[1].body).toEqual({
      name,
      content: 'Welcome {{name}}',
      labels: [label],
    });
    expect(requests[5].body).toEqual({ tag: label });
    expect(requests[6].body).toEqual({ promptName: name, labels: ['staging'] });
  });

  it('preserves real HTTP and JSON errors without another request', async () => {
    const requests: CapturedRequest[] = [];
    const { baseUrl } = await startServer(async (request, response) => {
      const captured = await captureRequest(request);
      requests.push(captured);
      if (captured.path === '/unavailable') {
        response.statusCode = 503;
        response.setHeader('Connection', 'close');
        response.end('temporarily unavailable');
        return;
      }

      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/plain');
      response.setHeader('Connection', 'close');
      response.end('not json');
    });
    const client = new PromptClient({ baseUrl, apiKey: 'integration-key' });

    await expect(client._request('/unavailable')).rejects.toThrow(
      'GET /unavailable failed (503): temporarily unavailable',
    );
    await expect(client._request('/invalid-json')).rejects.toThrow(
      'GET /invalid-json returned non-JSON response',
    );

    expect(requests.map(({ path }) => path)).toEqual(['/unavailable', '/invalid-json']);
  });

  const interruptedRequests = [
    {
      name: '_request GET',
      invoke: (client: PromptClient) => client._request('/dropped-read'),
      path: '/dropped-read',
      method: 'GET',
      body: undefined,
    },
    {
      name: 'createPrompt',
      invoke: (client: PromptClient) =>
        client.createPrompt({ name: 'created', content: 'hello' }),
      path: '/api/managed-prompts',
      method: 'POST',
      body: { name: 'created', content: 'hello', type: 'text' },
    },
    {
      name: 'updatePrompt',
      invoke: (client: PromptClient) => client.updatePrompt('updated', { content: 'hello' }),
      path: '/api/managed-prompts',
      method: 'PUT',
      body: { name: 'updated', content: 'hello' },
    },
    {
      name: 'deletePrompt',
      invoke: (client: PromptClient) => client.deletePrompt('deleted'),
      path: '/api/managed-prompts/deleted',
      method: 'DELETE',
      body: undefined,
    },
    {
      name: 'removeTag',
      invoke: (client: PromptClient) => client.removeTag('tagged', 'production'),
      path: '/api/managed-prompts/tagged/tags',
      method: 'DELETE',
      body: { tag: 'production' },
    },
    {
      name: 'saveAsVersion',
      invoke: (client: PromptClient) => client.saveAsVersion('versioned', { label: 'staging' }),
      path: '/api/prompt-playground/save-as-version',
      method: 'POST',
      body: { promptName: 'versioned', labels: ['staging'] },
    },
  ];

  it.each(interruptedRequests)(
    'does not replay $name after the server receives the complete request',
    async ({ invoke, path, method, body }) => {
      const requests: CapturedRequest[] = [];
      const { baseUrl } = await startServer(async (request, response) => {
        requests.push(await captureRequest(request));
        response.destroy();
      });
      const client = new PromptClient({ baseUrl, apiKey: 'integration-key' });

      const error = await invoke(client).catch((requestError: unknown) => requestError);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PromptApiError);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ method, path, body });
    },
  );

  it('does not amplify 100 complete writes whose responses are lost', async () => {
    const requests: CapturedRequest[] = [];
    const { baseUrl } = await startServer(async (request, response) => {
      requests.push(await captureRequest(request));
      response.destroy();
    });
    const client = new PromptClient({ baseUrl, apiKey: 'integration-key' });

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) =>
        client.createPrompt({ name: `prompt-${index}`, content: 'hello' }),
      ),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(requests).toHaveLength(100);
    expect(new Set(requests.map(({ body }) => (body as { name: string }).name)).size).toBe(100);
  }, 15_000);

  it('rejects a real unreachable endpoint without hanging', async () => {
    const { baseUrl, server } = await startServer(async (_request, response) => {
      response.destroy();
    });
    await stopServer(server);
    const client = new PromptClient({ baseUrl, apiKey: 'integration-key' });

    const error = await client
      ._request('/unreachable')
      .catch((requestError: unknown) => requestError);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PromptApiError);
  });

  it('keeps prompt product data outside telemetry masking', async () => {
    const requests: CapturedRequest[] = [];
    const marker = 'prompt-product-data-marker';
    const destructiveMask = vi.fn(() => null);
    const { baseUrl } = await startServer(async (request, response) => {
      const captured = await captureRequest(request);
      requests.push(captured);
      const url = new URL(captured.path, baseUrl);
      const body = captured.body as {
        name: string;
        content: string;
        config: Record<string, unknown>;
        labels: string[];
      } | undefined;
      if (body?.name === `${marker}-failure`) {
        response.destroy();
        return;
      }
      if (captured.method === 'GET' && url.pathname.endsWith('/fetch')) {
        sendJson(response, prompt(marker, 2, `updated:${marker}`, [marker]));
        return;
      }
      if (captured.method === 'DELETE') {
        sendJson(response, {});
        return;
      }
      if (
        captured.method === 'POST' &&
        url.pathname === '/api/prompt-playground/save-as-version'
      ) {
        sendJson(response, { prompt: prompt(marker, 3, `updated:${marker}`, [marker]) });
        return;
      }
      if (!body) {
        sendJson(response, { error: 'missing request body' }, 400);
        return;
      }
      sendJson(response, {
        prompt: {
          ...prompt(body.name, captured.method === 'POST' ? 1 : 2, body.content, body.labels),
          config: body.config,
        },
      });
    });

    try {
      await init({
        apiKey: 'integration-key',
        endpoint: baseUrl,
        disableExport: true,
        registerShutdownHandlers: false,
        mask: destructiveMask,
      });

      await trace({ name: 'mask-positive-control' }, async () => undefined);
      await expect(flush()).resolves.toBe(true);
      expect(destructiveMask).toHaveBeenCalled();
      destructiveMask.mockClear();

      const created = await createPrompt({
        name: marker,
        content: `created:${marker}`,
        config: { marker },
        labels: [marker],
      });
      await expect(
        createPrompt({
          name: `${marker}-failure`,
          content: marker,
          config: { marker },
          labels: [marker],
        }),
      ).rejects.toBeInstanceOf(Error);
      await expect(flush()).resolves.toBe(true);
      const updated = await updatePrompt(marker, {
        content: `updated:${marker}`,
        config: { marker },
        labels: [marker],
      });
      const fetched = await fetchPrompt(marker, { label: marker });
      await removeTag(marker, marker);
      const versioned = await saveAsVersion(marker, { label: marker });
      await deletePrompt(marker);

      expect(created.content).toBe(`created:${marker}`);
      expect(updated.content).toBe(`updated:${marker}`);
      expect(fetched.content).toBe(`updated:${marker}`);
      expect(versioned.labels).toEqual([marker]);
      expect(requests.map(({ body }) => body)).toEqual([
        {
          name: marker,
          content: `created:${marker}`,
          type: 'text',
          config: { marker },
          labels: [marker],
        },
        {
          name: `${marker}-failure`,
          content: marker,
          type: 'text',
          config: { marker },
          labels: [marker],
        },
        {
          name: marker,
          content: `updated:${marker}`,
          config: { marker },
          labels: [marker],
        },
        undefined,
        { tag: marker },
        { promptName: marker, labels: [marker] },
        undefined,
      ]);
      expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
        'POST /api/managed-prompts',
        'POST /api/managed-prompts',
        'PUT /api/managed-prompts',
        'GET /api/v1/prompts/prompt-product-data-marker/fetch?label=prompt-product-data-marker',
        'DELETE /api/managed-prompts/prompt-product-data-marker/tags',
        'POST /api/prompt-playground/save-as-version',
        'DELETE /api/managed-prompts/prompt-product-data-marker',
      ]);
      expect(destructiveMask).not.toHaveBeenCalled();
    } finally {
      await expect(shutdown()).resolves.toBe(true);
    }
  });
});
