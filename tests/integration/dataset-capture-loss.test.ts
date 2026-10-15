import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import { Client } from '../../src/core/client.js';
import { ByteLimitedSpanExporter } from '../../src/core/byte-limited-exporter.js';
import { trace } from '../../src/core/context.js';
import { getNeatlogsTracer } from '../../src/core/provider.js';
import type { UploadAuthority, UploadPayload } from '../../src/core/upload-authority.js';
import { datasets, getDatasetCaptureHandle, type DatasetCaptureHandle } from '../../src/dataset/capture.js';

const datasetId = randomUUID();
const options = { token: 'public-token', projectId: randomUUID(), baseUrl: 'https://api.example.test', environment: 'ci' as const };
const destination = { kind: 'existing' as const, datasetId };
const clients: Client[] = [];
function server() {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url);
    return Response.json({ success: true, data: { captureId: '53f5bc6f-2cc5-4e03-8c26-d0df0283845e', datasetId, state: url.endsWith('/abort') ? 'failed' : url.endsWith('/complete') ? 'queued' : 'recording' } });
  }));
  return requests;
}
function client(extra: Partial<ConstructorParameters<typeof Client>[0]> = {}) {
  const spans: ReadableSpan[] = [];
  const exporter: SpanExporter = { export(batch, callback) { spans.push(...batch); callback({ code: 0 }); }, async shutdown() {} };
  const instance = new Client({ apiKey: 'ingest-token', workflowName: 'capture-loss', spanExporter: exporter, ...extra });
  clients.push(instance);
  return { instance, spans };
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((entry) => entry.shutdown()));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('capture publication requires complete delivered evidence', () => {
  it('waits for actual exporter acknowledgement before requesting publication', async () => {
    const requests = server();
    let acknowledge: ((result: ExportResult) => void) | undefined;
    const { instance } = client({ spanExporter: {
      export(_spans, callback) { acknowledge = callback; }, async shutdown() {},
    } });
    const capture = instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 'actual'), options));
    await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'));
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
    acknowledge?.({ code: 0 });
    await expect(capture).resolves.toMatchObject({ state: 'queued' });
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(true);
  });

  it('rejects OTel dropped evidence while leaving normal telemetry active', async () => {
    const requests = server();
    vi.stubEnv('OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT', '1');
    const { instance, spans } = client();
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW', input: 'question' }, () => 'answer'), options))).rejects.toThrow('delivery failed');
    expect(spans.some((span) => span.droppedAttributesCount > 0)).toBe(true);
    expect(requests.at(-1)).toMatch(/\/abort$/);
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
  });

  it.each([0, 1])('checks nested link attribute loss independently of span counters, dropped=%s', async (droppedAttributesCount) => {
    const requests = server();
    const { instance, spans } = client();
    const capturing = instance.activate(() => datasets.capture(destination, () => {
      const root = getNeatlogsTracer('neatlogs.test').startSpan('linked-agent');
      root.addLink({ context: root.spanContext(), attributes: {}, droppedAttributesCount });
      root.end();
    }, options));
    if (droppedAttributesCount > 0) {
      await expect(capturing).rejects.toThrow('delivery failed');
      expect(requests.at(-1)).toMatch(/\/abort$/);
      expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
    } else {
      await expect(capturing).resolves.toMatchObject({ state: 'queued' });
    }
    const exported = spans.find((span) => span.name === 'linked-agent');
    expect(exported?.droppedAttributesCount).toBe(0);
    expect(exported?.links[0].droppedAttributesCount).toBe(droppedAttributesCount);
  });

  it('rejects providers configured to clip attribute values before executing', async () => {
    const requests = server();
    vi.stubEnv('OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT', '8');
    const { instance } = client();
    const run = vi.fn();
    await expect(instance.activate(() => datasets.capture(destination, run, options))).rejects.toThrow('unclipped');
    expect(run).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it.each([
    { 'neatlogs.capture.truncated': true },
    { 'neatlogs.capture_fidelity': 'truncated' },
    { 'neatlogs.stream.incomplete': true },
    { 'neatlogs.input.media.0.state': 'pending-upload' },
  ])('rejects explicit incomplete evidence after successful export: %j', async (attributes) => {
    const requests = server();
    const { instance, spans } = client();
    await expect(instance.activate(() => datasets.capture(destination, () => {
      const span = getNeatlogsTracer('neatlogs.test').startSpan('incomplete-agent', { attributes });
      span.end();
    }, options))).rejects.toThrow('delivery failed');
    expect(spans.some((span) => span.name === 'incomplete-agent')).toBe(true);
    expect(requests.at(-1)).toMatch(/\/abort$/);
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
  });

  it('rejects typed media unavailable before staging even when span export succeeds', async () => {
    const requests = server();
    const { instance, spans } = client({ uploadAuthority: false });
    const image = `data:image/png;base64,${Buffer.alloc(100_001).toString('base64')}`;
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'media-agent', kind: 'WORKFLOW', input: { image_url: { url: image } } }, () => 'answer'), options))).rejects.toThrow('delivery failed');
    expect(spans.some((span) => Object.entries(span.attributes).some(([key, value]) => key.endsWith('.state') && value === 'failed'))).toBe(true);
    expect(requests.at(-1)).toMatch(/\/abort$/);
  });

  it('includes original span IDs only after authenticated full OTLP overflow upload succeeds', async () => {
    const requests = server();
    const uploads: UploadPayload[] = [];
    const authority: UploadAuthority = {
      available: true, unavailableReason: '', maxPayloadBytes: 1024 * 1024,
      async upload(payload) {
        uploads.push(payload);
        const id = randomUUID();
        return { uploadId: id, state: 'ready', reference: { id, purpose: payload.purpose, sha256: payload.sha256, byteLength: payload.byteLength, mimeType: payload.mimeType, contentEncoding: payload.contentEncoding, state: 'ready' } };
      },
    };
    const sink: SpanExporter = { export(_batch, done) { done({ code: 0 }); }, async shutdown() {} };
    const { instance } = client({ spanExporter: new ByteLimitedSpanExporter(sink, 256, undefined, authority), uploadAuthority: authority });
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'large-agent', kind: 'WORKFLOW', input: 'x'.repeat(2000) }, () => 'actual'), options))).resolves.toMatchObject({ state: 'queued' });
    expect(uploads.some((item) => item.purpose === 'otlp_overflow' && item.content.byteLength > 2000)).toBe(true);
    expect(requests.at(-1)).toMatch(/\/complete$/);
  });

  it('rejects disabled export without registering or running the agent', async () => {
    const requests = server();
    const { instance } = client({ disableExport: true });
    const run = vi.fn();
    await expect(instance.activate(() => datasets.capture(destination, run, options))).rejects.toThrow('provider');
    expect(run).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('allows abort before execution without running or publishing the callback', async () => {
    const requests = server();
    const { instance } = client();
    const run = vi.fn();
    await expect(instance.activate(() => datasets.capture(destination, run, { ...options, onRegistered: (handle) => handle.abort() }))).rejects.toThrow('aborted before agent execution');
    expect(run).not.toHaveBeenCalled();
    expect(requests.some((url) => url.endsWith('/abort'))).toBe(true);
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
  });

  it('aborts during execution while letting the awaited agent and ordinary ingestion finish', async () => {
    const requests = server();
    const { instance, spans } = client();
    let handle: DatasetCaptureHandle | undefined;
    const finished = vi.fn();
    let caught: unknown;
    try {
      await instance.activate(() => datasets.capture(destination, () => trace({ name: 'cancelled-agent', kind: 'WORKFLOW' }, async () => {
        await handle!.abort();
        finished();
        return 'agent result';
      }), { ...options, onRegistered: (value) => { handle = value; } }));
    } catch (error) { caught = error; }
    expect(finished).toHaveBeenCalledOnce();
    expect(getDatasetCaptureHandle(caught)).toBe(handle);
    expect(handle?.state).toBe('failed');
    expect(caught).toBeInstanceOf(Error);
    expect(handle?.captureError?.message).toContain('aborted');
    expect(spans.some((span) => span.name === 'cancelled-agent')).toBe(true);
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
    expect(requests.filter((url) => url.endsWith('/abort'))).toHaveLength(1);
    await expect(handle!.retryCompletion()).rejects.toThrow('no exported completion manifest');
  });

  it('does not report a completed version after a cancelled status or wait', async () => {
    server();
    const { instance } = client();
    const handle = await instance.activate(() => datasets.capture(destination, () => trace({ name: 'agent', kind: 'WORKFLOW' }, () => 'actual'), options));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, data: {
      job: { id: handle.captureId, datasetId, state: 'cancelled', datasetVersionId: null, capturedCount: 0, skippedCount: 0, failedCount: 0 },
      failures: [], nextCursor: null,
    } })));
    await expect(handle.status()).resolves.toMatchObject({ state: 'cancelled', datasetVersionId: null });
    await expect(handle.wait()).rejects.toThrow('Dataset capture cancelled');
    expect(handle.datasetVersionId).toBeNull();
  });

  it('aborts failed full OTLP overflow upload without requesting publication', async () => {
    const requests = server();
    const authority: UploadAuthority = {
      available: true, unavailableReason: '', maxPayloadBytes: 1024 * 1024,
      async upload() { throw new Error('overflow upload unavailable'); },
    };
    const sink: SpanExporter = { export(_batch, done) { done({ code: 0 }); }, async shutdown() {} };
    const { instance } = client({ spanExporter: new ByteLimitedSpanExporter(sink, 256, undefined, authority), uploadAuthority: authority });
    await expect(instance.activate(() => datasets.capture(destination, () => trace({ name: 'large-agent', kind: 'WORKFLOW', input: 'x'.repeat(2000) }, () => 'actual'), options))).rejects.toThrow('delivery failed');
    expect(requests.at(-1)).toMatch(/\/abort$/);
    expect(requests.some((url) => url.endsWith('/complete'))).toBe(false);
  });
});
