import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { datasets } from '../../src/dataset/capture.js';
import { trace } from '../../src/core/context.js';
import { init, shutdown } from '../../src/init.js';

afterEach(async () => {
  await shutdown();
  vi.unstubAllEnvs();
});

describe('dataset capture using the default HTTP pipeline', () => {
  it('waits for the ordinary OTLP response before completing the registered capture', async () => {
    const datasetId = randomUUID();
    const captureId = randomUUID();
    const paths: string[] = [];
    let acknowledge: (() => void) | undefined;
    let exportedBytes = 0;
    let completion: unknown;
    let failure: unknown;
    const reply = (response: ServerResponse, state: string): void => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ success: true, data: { captureId, datasetId, state } }));
    };
    const server = createServer((request, response) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        paths.push(request.url ?? '');
        if (request.url === '/v1/traces') {
          expect(request.headers['x-api-key']).toBe('ingest-token');
          expect(request.headers.authorization).toBeUndefined();
          exportedBytes += body.byteLength;
          const done = (): void => { response.end(); };
          if (acknowledge) done();
          else acknowledge = done;
          return;
        }
        expect(request.headers.authorization).toBe('Bearer dataset-token');
        expect(request.headers['x-api-key']).toBeUndefined();
        if (request.url?.endsWith('/complete')) {
          completion = JSON.parse(body.toString());
          reply(response, 'queued');
        } else reply(response, 'recording');
      })().catch((error: unknown) => {
        failure = error;
        response.destroy(error instanceof Error ? error : undefined);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No local HTTP listener.');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      await init({ apiKey: 'ingest-token', endpoint: baseUrl, registerShutdownHandlers: false });
      const capturing = datasets.capture({ kind: 'existing', datasetId }, () => trace({ name: 'real-http-agent', kind: 'WORKFLOW', input: 'question' }, () => 'actual output'), {
        token: 'dataset-token', projectId: randomUUID(), baseUrl, environment: 'ci',
      });
      await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'));
      expect(completion).toBeUndefined();
      expect(paths[0]).toBe('/api/v1/public/dataset-capture-jobs');
      acknowledge?.();
      await expect(capturing).resolves.toMatchObject({ state: 'queued', result: 'actual output' });
      expect(failure).toBeUndefined();
      expect(exportedBytes).toBeGreaterThan(0);
      expect(completion).toEqual({ traces: [{ traceId: expect.stringMatching(/^[0-9a-f]{32}$/), spanIds: [expect.stringMatching(/^[0-9a-f]{16}$/)] }] });
      expect(paths.at(-1)).toBe(`/api/v1/public/dataset-capture-jobs/${captureId}/complete`);
    } finally {
      acknowledge?.();
      await shutdown();
      await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
    }
  });

  it('rejects caller-owned providers before registering or running the callback', async () => {
    const provider = new NodeTracerProvider();
    try {
      await init({ apiKey: 'unused', tracerProvider: provider, registerShutdownHandlers: false });
      const run = vi.fn();
      await expect(datasets.capture({ kind: 'existing', datasetId: randomUUID() }, run, {
        token: 'dataset-token', projectId: randomUUID(), baseUrl: 'https://api.example.test', environment: 'ci',
      })).rejects.toThrow('Neatlogs-owned provider');
      expect(run).not.toHaveBeenCalled();
    } finally {
      await shutdown();
      await provider.shutdown();
    }
  });
});
