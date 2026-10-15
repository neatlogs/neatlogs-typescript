import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { Client } from '../../src/core/client.js';
import { trace } from '../../src/core/context.js';
import { getNeatlogsTracer } from '../../src/core/provider.js';
import { datasets, DatasetCaptureError, getDatasetCaptureHandle, type DatasetCaptureHandle } from '../../src/dataset/capture.js';

const datasetId = randomUUID();
const projectId = randomUUID();
const versionId = randomUUID();
const options = { token: 'dataset-write-token', projectId, baseUrl: 'https://api.example.test', environment: 'local' as const };
const destination = { kind: 'existing' as const, datasetId };
const clients: Client[] = [];
class Exporter implements SpanExporter {
  spans: ReadableSpan[] = [];
  fail = false;
  export(spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
    this.spans.push(...spans);
    callback({ code: this.fail ? 1 : 0 });
  }
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}
function client(extra: Partial<ConstructorParameters<typeof Client>[0]> = {}) {
  const exporter = new Exporter();
  const instance = new Client({ apiKey: 'ingest-only-key', workflowName: 'capture-test', spanExporter: exporter, flushInterval: 60, ...extra });
  clients.push(instance);
  return { instance, exporter };
}
interface Request { url: string; body: Record<string, unknown>; headers: Headers; }
function api(state: 'completed' | 'needs_review' | 'failed' | 'running' = 'completed') {
  const requests: Request[] = [];
  const registered: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url, body, headers: new Headers(init?.headers) });
    if (init?.method === 'GET') {
      const id = new URL(url).pathname.split('/').at(-1);
      return Response.json({ data: { job: { id, datasetId, state, datasetVersionId: state === 'completed' ? versionId : null, capturedCount: 1, skippedCount: 0, failedCount: state === 'needs_review' ? 1 : 0 }, failures: [], nextCursor: null } });
    }
    let id: string;
    if (url.endsWith('/complete') || url.endsWith('/abort')) id = url.split('/').at(-2)!;
    else { id = randomUUID(); registered.push(id); }
    return Response.json({ data: { captureId: id, datasetId, state: url.endsWith('/complete') ? 'queued' : url.endsWith('/abort') ? 'cancelled' : 'recording' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, registered, fetchMock };
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((entry) => entry.shutdown()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('dataset capture through real SDK providers', () => {
  it('registers before executing and completes only after normal export with root and awaited descendants', async () => {
    const http = api();
    const { instance, exporter } = client();
    const capture = await instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, async () => {
      expect(http.registered).toHaveLength(1);
      await Promise.resolve();
      return trace({ name: 'tool', kind: 'TOOL' }, () => 'actual answer');
    }), options));
    expect(capture.result).toBe('actual answer');
    expect(JSON.stringify(capture)).not.toContain(options.token);
    expect(capture.datasetId).toBe(datasetId);
    expect(capture.state).toBe('queued');
    const spans = exporter.spans.filter((entry) => entry.name !== 'neatlogs.trace.complete');
    expect(spans.map((entry) => entry.name).sort()).toEqual(['agent', 'tool']);
    const completion = http.requests.find((entry) => entry.url.endsWith('/complete'))!;
    expect(completion.body).toEqual({ traces: [{ traceId: spans[0].spanContext().traceId, spanIds: expect.arrayContaining(spans.map((entry) => entry.spanContext().spanId)) }] });
    expect((completion.body.traces as Array<{spanIds: string[]}>)[0].spanIds).toHaveLength(2);
    expect(completion.headers.get('Authorization')).toBe('Bearer dataset-write-token');
    expect(completion.headers.get('x-project-id')).toBe(projectId);
    expect(completion.headers.get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
    await expect(capture.wait()).resolves.toMatchObject({ state: 'completed', datasetVersionId: versionId });
    expect(capture.datasetVersionId).toBe(versionId);
  });

  it('starts scoped roots independently of an outer trace and never manufactures a capture span', async () => {
    const http = api();
    const { instance, exporter } = client();
    await instance.activate(() => trace({ name: 'outside', kind: 'WORKFLOW' }, () => datasets.capture(destination, () => trace({ name: 'inside', kind: 'WORKFLOW' }, () => 2), options)));
    await instance.flush();
    const outside = exporter.spans.find((span) => span.name === 'outside')!;
    const inside = exporter.spans.find((span) => span.name === 'inside')!;
    expect(inside.parentSpanId).toBeUndefined();
    expect(inside.spanContext().traceId).not.toBe(outside.spanContext().traceId);
    expect(http.requests.find((request) => request.url.endsWith('/complete'))!.body).toEqual({ traces: [{ traceId: inside.spanContext().traceId, spanIds: [inside.spanContext().spanId] }] });
  });

  it('isolates concurrent captures, including awaited asynchronous children', async () => {
    const http = api();
    const { instance, exporter } = client();
    await instance.activate(() => Promise.all(['first', 'second'].map((name) => datasets.capture(destination, () => trace({ name, kind: 'WORKFLOW' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, name === 'first' ? 5 : 1));
      return trace({ name: `${name}-child`, kind: 'TOOL' }, () => name);
    }), options))));
    const completions = http.requests.filter((request) => request.url.endsWith('/complete'));
    expect(completions).toHaveLength(2);
    const ids = completions.map((request) => (request.body.traces as Array<{ traceId: string; spanIds: string[] }>)[0]);
    expect(ids[0].traceId).not.toBe(ids[1].traceId);
    expect(ids.every((group) => group.spanIds.length === 2)).toBe(true);
    expect(exporter.spans.filter((span) => span.name !== 'neatlogs.trace.complete')).toHaveLength(4);
  });

  it('saves failed agent examples while preserving the exact frozen callback error', async () => {
    const http = api();
    const { instance } = client();
    const original = Object.freeze(new Error('agent failed'));
    let registered: DatasetCaptureHandle | undefined;
    const result = instance.activate(() => datasets.capture(destination, () => trace({ name: 'failed-agent', kind: 'WORKFLOW' }, () => { throw original; }), { ...options, onRegistered: (handle) => { registered = handle; } }));
    await expect(result).rejects.toBe(original);
    expect(getDatasetCaptureHandle(original)).toBe(registered);
    expect(registered?.state).toBe('queued');
    expect(http.requests.some((request) => request.url.endsWith('/complete'))).toBe(true);
    expect(http.requests.some((request) => request.url.endsWith('/abort'))).toBe(false);
  });

  it('preserves primitive exceptions and exposes the handle before execution', async () => {
    api();
    const { instance } = client();
    let handle: DatasetCaptureHandle | undefined;
    await expect(instance.activate(() => datasets.capture(destination, () => { throw 'failed'; }, { ...options, onRegistered: (value) => { handle = value; } }))).rejects.toBe('failed');
    expect(handle?.state).toBe('queued');
  });

  it('aborts an open span instead of completing partial execution', async () => {
    const http = api();
    const { instance } = client();
    let open: ReturnType<ReturnType<typeof getNeatlogsTracer>['startSpan']> | undefined;
    await expect(instance.activate(() => datasets.capture(destination, () => { open = getNeatlogsTracer('neatlogs.test').startSpan('still-running'); }, options))).rejects.toThrow('left spans open');
    expect(http.requests.at(-1)?.body).toEqual({ reason: 'incomplete_execution' });
    open?.end();
  });

  it.each(['export', 'mask', 'disabled'] as const)('aborts %s delivery loss while retaining ordinary trace pipeline behavior', async (failure) => {
    const http = api();
    const { instance, exporter } = client(failure === 'mask' ? { mask: () => null } : failure === 'disabled' ? { disableExport: true } : {});
    exporter.fail = failure === 'export';
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 'result'), options))).rejects.toThrow('delivery failed');
    expect(http.requests.at(-1)?.body).toEqual({ reason: 'export_failed' });
    expect(http.requests.some((request) => request.url.endsWith('/complete'))).toBe(false);
  });

  it('excludes HTTP transport and completion markers from capture membership', async () => {
    const http = api();
    const { instance } = client();
    await instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => {
      const httpSpan = getNeatlogsTracer('neatlogs.http').startSpan('HTTP GET');
      httpSpan.setAttribute('http.method', 'GET');
      httpSpan.end();
      return 7;
    }), options));
    const group = (http.requests.find((request) => request.url.endsWith('/complete'))!.body.traces as Array<{ spanIds: string[] }>)[0];
    expect(group.spanIds).toHaveLength(1);
  });

  it('permits empty uninstrumented execution without manufacturing outputs', async () => {
    const http = api();
    const { instance, exporter } = client();
    const handle = await instance.activate(() => datasets.capture(destination, () => ({ untouched: true }), options));
    expect(handle.result).toEqual({ untouched: true });
    expect(http.requests.at(-1)?.body).toEqual({ traces: [] });
    expect(exporter.spans).toEqual([]);
  });

  it('rejects nested captures before registering the inner callback', async () => {
    const http = api();
    const { instance } = client();
    await expect(instance.activate(() => datasets.capture(destination, () => datasets.capture(destination, () => 'inner', options), options))).rejects.toThrow('Nested');
    expect(http.registered).toHaveLength(1);
    expect(http.requests.at(-1)?.body).toEqual({ traces: [] });
  });

  it.each([
    { token: '' }, { baseUrl: 'https://api.example.test/api/v1' }, { environment: undefined }, { environment: 'production' },
  ])('rejects invalid auth/origin/environment before executing %j', async (invalid) => {
    const http = api();
    const { instance } = client();
    const callback = vi.fn();
    await expect(instance.activate(() => datasets.capture(destination, callback, { ...options, ...invalid } as typeof options))).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
    expect(http.requests).toEqual([]);
  });

  it('requires explicit destination creation and never executes on an ambiguous name', async () => {
    const http = api();
    http.fetchMock.mockResolvedValueOnce(Response.json({ error: 'ambiguous' }, { status: 409 }));
    const { instance } = client();
    const callback = vi.fn();
    await expect(instance.activate(() => datasets.capture({ kind: 'name', name: 'examples', createIfMissing: false }, callback, options))).rejects.toMatchObject({ statusCode: 409 });
    expect(callback).not.toHaveBeenCalled();
    expect(http.requests).toEqual([]);
  });

  it('returns needs_review without automatic partial publication', async () => {
    const http = api('needs_review');
    const { instance } = client();
    const capture = await instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 1), options));
    let reviewError: unknown;
    try { await capture.wait(); } catch (error) { reviewError = error; }
    expect(reviewError).toBeInstanceOf(DatasetCaptureError);
    expect(getDatasetCaptureHandle(reviewError)).toBe(capture);
    expect(capture.lastStatus).toMatchObject({ state: 'needs_review', datasetVersionId: null, failedCount: 1 });
    expect(http.requests.filter((request) => request.url.endsWith('/complete'))).toHaveLength(1);
  });

  it('bounds polling and associates terminal job errors with the registered handle', async () => {
    api('running');
    const { instance } = client();
    const capture = await instance.activate(() => datasets.capture(destination, () => 1, options));
    let caught: unknown;
    try { await capture.wait({ timeoutMillis: 15, pollIntervalMillis: 2 }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(DatasetCaptureError);
    expect(getDatasetCaptureHandle(caught)).toBe(capture);
    expect(capture.state).toBe('running');
  });

  it('rejects sampling loss before registration and callback execution', async () => {
    const http = api();
    const { instance } = client({ sampleRate: 0 });
    const callback = vi.fn();
    await expect(instance.activate(() => datasets.capture(destination, callback, options))).rejects.toThrow('sampleRate: 1');
    expect(callback).not.toHaveBeenCalled();
    expect(http.requests).toEqual([]);
  });

  it('flushes only participating SDK providers so unrelated delivery failures do not poison capture', async () => {
    const http = api();
    const good = client();
    const unrelated = client();
    unrelated.exporter.fail = true;
    await unrelated.instance.activate(() => trace({ name: 'unrelated', kind: 'WORKFLOW' }, () => 'outside'));
    const flush = vi.spyOn(unrelated.instance, 'flush');
    await good.instance.activate(() => datasets.capture(destination, () => trace({ name: 'captured', kind: 'WORKFLOW' }, () => 1), options));
    expect(flush).not.toHaveBeenCalled();
    expect(http.requests.at(-1)?.url).toContain('/complete');
  });

  it('flushes another full-sampling Client activated inside the callback', async () => {
    const http = api();
    const first = client();
    const second = client();
    await first.instance.activate(() => datasets.capture(destination, () => second.instance.activate(() => trace({ name: 'second-client', kind: 'WORKFLOW' }, () => 3)), options));
    expect(second.exporter.spans.some((span) => span.name === 'second-client')).toBe(true);
    expect(http.requests.at(-1)?.url).toContain('/complete');
  });

  it('rejects a sampled Client activated during execution rather than losing its unrecorded spans', async () => {
    const http = api();
    const first = client();
    const sampled = client({ sampleRate: 0 });
    const run = vi.fn();
    await expect(first.instance.activate(() => datasets.capture(destination, () => sampled.instance.activate(run), options))).rejects.toThrow('sampleRate: 1');
    expect(run).not.toHaveBeenCalled();
    expect(http.requests.at(-1)?.body).toEqual({ traces: [] });
  });

  it('retains masking redaction while using unchanged trace/span IDs for membership', async () => {
    const http = api();
    const { instance, exporter } = client({ mask: async (data) => ({ ...data, attributes: { redacted: true } }) });
    await instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 'secret'), options));
    const root = exporter.spans.find((span) => span.name === 'agent')!;
    expect(root.attributes).toEqual({ redacted: true });
    expect(http.requests.at(-1)?.body).toEqual({ traces: [{ traceId: root.spanContext().traceId, spanIds: [root.spanContext().spanId] }] });
  });

  it('retries HTTP phases with stable keys without rerunning the callback', async () => {
    const http = api();
    const original = http.fetchMock.getMockImplementation()!;
    const attempts: Array<{ url: string; key: string | null }> = [];
    const seen = new Set<string>();
    http.fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      attempts.push({ url, key: new Headers(init?.headers).get('Idempotency-Key') });
      if (!seen.has(url)) { seen.add(url); throw new Error('temporary disconnect'); }
      return original(input, init);
    });
    const { instance } = client();
    const callback = vi.fn(() => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 'result'));
    await instance.activate(() => datasets.capture(destination, callback, options));
    expect(callback).toHaveBeenCalledOnce();
    expect(attempts).toHaveLength(4);
    expect(attempts[0].key).toBe(attempts[1].key);
    expect(attempts[2].key).toBe(attempts[3].key);
    expect(attempts[0].key).not.toBe(attempts[2].key);
  });

  it('rejects oversized manifests without truncating or interfering with normal ingestion', async () => {
    const http = api();
    const { instance, exporter } = client({ batchSize: 1000 });
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'large-agent', kind: 'WORKFLOW' }, () => {
      for (let index = 0; index < 3500; index += 1) getNeatlogsTracer('neatlogs.test').startSpan(`child-${index}`).end();
    }), options))).rejects.toThrow('64 KiB');
    expect(exporter.spans.filter((span) => span.name !== 'neatlogs.trace.complete')).toHaveLength(3501);
    expect(http.requests.some((request) => request.url.endsWith('/complete'))).toBe(false);
    expect(http.requests.at(-1)?.body).toEqual({ reason: 'export_failed' });
  });

  it('reports terminal empty-capture failure without claiming a published version', async () => {
    api('failed');
    const { instance } = client();
    const capture = await instance.activate(() => datasets.capture(destination, () => 'uninstrumented', options));
    await expect(capture.wait()).rejects.toThrow('Dataset capture failed');
    expect(capture.datasetVersionId).toBeNull();
  });

  it('rejects cross-capture or unpublished status payloads and keeps their error handle', async () => {
    const http = api();
    const { instance } = client();
    const capture = await instance.activate(() => datasets.capture(destination, () => 1, options));
    http.fetchMock.mockResolvedValueOnce(Response.json({ data: { job: { id: randomUUID(), datasetId, state: 'completed' } } }));
    let error: unknown;
    try { await capture.status(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(DatasetCaptureError);
    expect(getDatasetCaptureHandle(error)).toBe(capture);
    expect(capture.datasetVersionId).toBeNull();
  });


  it('preserves callback exceptions when export also fails and exposes the secondary capture error', async () => {
    const http = api();
    const { instance, exporter } = client();
    exporter.fail = true;
    const original = new Error('original agent error');
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'failed-agent', kind: 'WORKFLOW' }, () => { throw original; }), options))).rejects.toBe(original);
    expect(getDatasetCaptureHandle(original)?.captureError?.message).toContain('delivery failed');
    expect(http.requests.at(-1)?.body).toEqual({ reason: 'export_failed' });
  });

  it('bounds a stuck provider flush without claiming successful capture', async () => {
    const http = api();
    const { instance } = client();
    const flush = vi.spyOn(instance, 'flush').mockReturnValue(new Promise<boolean>(() => {}));
    try {
      await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 1), { ...options, flushTimeoutMillis: 10 }))).rejects.toThrow('delivery failed');
      expect(http.requests.at(-1)?.body).toEqual({ reason: 'export_failed' });
    } finally { flush.mockRestore(); }
  });

  it('exposes review diagnostics and the subsequent failure page cursor', async () => {
    const http = api();
    const { instance } = client();
    const capture = await instance.activate(() => datasets.capture(destination, () => 1, options));
    http.fetchMock.mockResolvedValueOnce(Response.json({ data: { job: { id: capture.captureId, datasetId, state: 'needs_review', datasetVersionId: null, capturedCount: 0, skippedCount: 0, failedCount: 1, publicationError: 'Evidence unavailable' }, failures: [{ position: 3, source: { kind: 'trace', traceId: 'abcd' }, error: { code: 'TRANSIENT', message: 'Still ingesting', retryable: true } }], nextCursor: '3' } }));
    const status = await capture.status();
    expect(status.publicationError).toBe('Evidence unavailable');
    expect(status.failures[0]).toMatchObject({ position: 3, error: { message: 'Still ingesting', retryable: true } });
    expect(status.nextCursor).toBe('3');
    await capture.status({ after: status.nextCursor! });
    expect(http.requests.at(-1)?.url).toContain('?after=3');
  });


  it('retains exact completion bytes and key after uncertain sealing without aborting or replaying execution', async () => {
    const http = api();
    const originalFetch = http.fetchMock.getMockImplementation()!;
    const seals: Array<{ body: string; key: string | null }> = [];
    http.fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/complete')) {
        seals.push({ body: String(init?.body), key: new Headers(init?.headers).get('Idempotency-Key') });
        if (seals.length <= 2) throw new Error('ACK lost after server seal');
      }
      return originalFetch(input, init);
    });
    const { instance, exporter } = client();
    const callback = vi.fn(() => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 'actual'));
    let caught: unknown;
    try { await instance.activate(() => datasets.capture(destination, callback, options)); } catch (error) { caught = error; }
    const handle = getDatasetCaptureHandle(caught)!;
    expect(handle).toBeDefined();
    expect(handle.captureError).toBe(caught);
    expect(http.requests.some((request) => request.url.endsWith('/abort'))).toBe(false);
    const status = await handle.status();
    expect(status.state).toBe('completed');
    await handle.retryCompletion();
    expect(seals).toHaveLength(3);
    expect(seals.every((seal) => seal.body === seals[0].body && seal.key === seals[0].key)).toBe(true);
    const root = exporter.spans.find((span) => span.name === 'agent')!;
    expect(JSON.parse(seals[0].body)).toEqual({ traces: [{ traceId: root.spanContext().traceId, spanIds: [root.spanContext().spanId] }] });
    expect(callback).toHaveBeenCalledOnce();
    expect(handle.captureError).toBeNull();
    expect(handle.state).toBe('completed');
    expect(handle.datasetVersionId).toBe(versionId);
  });

  it('keeps original agent exceptions and a retryable manifest when the seal acknowledgement is lost', async () => {
    const http = api();
    const originalFetch = http.fetchMock.getMockImplementation()!;
    http.fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/complete')) throw new Error('ACK lost');
      return originalFetch(input, init);
    });
    const { instance } = client();
    const agentError = new Error('agent failed');
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => { throw agentError; }), options))).rejects.toBe(agentError);
    const handle = getDatasetCaptureHandle(agentError)!;
    expect(handle.captureError).toBeInstanceOf(DatasetCaptureError);
    expect(http.requests.some((request) => request.url.endsWith('/abort'))).toBe(false);
    http.fetchMock.mockImplementation(originalFetch);
    await handle.retryCompletion();
    expect(handle.state).toBe('queued');
  });

  it('does not invent a completion manifest for an aborted capture', async () => {
    api();
    const { instance } = client({ disableExport: true });
    let caught: unknown;
    try { await instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 1), options)); } catch (error) { caught = error; }
    await expect(getDatasetCaptureHandle(caught)!.retryCompletion()).rejects.toThrow('no exported completion manifest');
  });

  it('rejects remote plaintext token transport before registration and permits HTTP loopback', async () => {
    const http = api();
    const { instance } = client();
    const callback = vi.fn();
    await expect(instance.activate(() => datasets.capture(destination, callback, { ...options, baseUrl: 'http://api.example.test' }))).rejects.toThrow('HTTPS');
    expect(callback).not.toHaveBeenCalled();
    expect(http.requests).toEqual([]);
    await instance.activate(() => datasets.capture(destination, () => 1, { ...options, baseUrl: 'http://127.0.0.1:3056' }));
    expect(http.requests[0].url).toContain('http://127.0.0.1:3056/');
  });

});
