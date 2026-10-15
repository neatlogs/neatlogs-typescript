import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';

export type DatasetCaptureDestination =
  | { kind: 'existing'; datasetId: string }
  | { kind: 'name'; name: string; createIfMissing: boolean; description?: string };
export type DatasetCaptureState = 'recording' | 'queued' | 'running' | 'needs_review' | 'completed' | 'failed' | 'cancelled';
export interface DatasetCaptureReceipt {
  captureId: string;
  datasetId: string;
  state: DatasetCaptureState;
}
export interface DatasetCaptureFailure {
  position: number;
  source: Record<string, unknown>;
  error: { code: string; message: string; retryable: boolean };
}
export interface DatasetCaptureStatus extends DatasetCaptureReceipt {
  datasetVersionId: string | null;
  capturedCount: number;
  skippedCount: number;
  failedCount: number;
  publicationError: string | null;
  failures: DatasetCaptureFailure[];
  nextCursor: string | null;
}
export interface DatasetApiOptions {
  token: string;
  projectId: string;
  baseUrl: string;
  requestTimeoutMillis?: number;
}

export class DatasetCaptureError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = 'DatasetCaptureError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new DatasetCaptureError('Invalid dataset capture API response.');
  return Object.fromEntries(Object.entries(value));
}
export function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new DatasetCaptureError(`${field} must be a UUID.`);
  return value;
}
function captureState(value: unknown): DatasetCaptureState {
  switch (value) {
    case 'recording': case 'queued': case 'running': case 'needs_review': case 'completed': case 'failed': case 'cancelled': return value;
    default: throw new DatasetCaptureError('Invalid dataset capture state.');
  }
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new DatasetCaptureError('Invalid dataset capture count.');
  return value;
}
export function parseReceipt(value: unknown): DatasetCaptureReceipt {
  const data = record(value);
  return { captureId: uuid(data.captureId, 'captureId'), datasetId: uuid(data.datasetId, 'datasetId'), state: captureState(data.state) };
}
export function parseStatus(value: unknown, captureId: string, datasetId: string): DatasetCaptureStatus {
  const data = record(value);
  const job = record(data.job);
  if (job.id !== captureId || job.datasetId !== datasetId) throw new DatasetCaptureError('Dataset capture status belongs to a different capture.');
  const state = captureState(job.state);
  const datasetVersionId = job.datasetVersionId === null ? null : uuid(job.datasetVersionId, 'datasetVersionId');
  if (datasetVersionId !== null && state !== 'completed') throw new DatasetCaptureError('Invalid unpublished dataset capture version.');
  const publicationError = job.publicationError ?? null;
  if (publicationError !== null && typeof publicationError !== 'string') throw new DatasetCaptureError('Invalid dataset capture publication error.');
  if (!Array.isArray(data.failures) || (data.nextCursor !== null && typeof data.nextCursor !== 'string')) throw new DatasetCaptureError('Invalid dataset capture failures page.');
  const failures = data.failures.map((value): DatasetCaptureFailure => {
    const failure = record(value);
    const error = record(failure.error);
    if (typeof error.code !== 'string' || typeof error.message !== 'string' || typeof error.retryable !== 'boolean') throw new DatasetCaptureError('Invalid dataset capture failure.');
    return { position: count(failure.position), source: record(failure.source), error: { code: error.code, message: error.message, retryable: error.retryable } };
  });
  return { captureId, datasetId, state, datasetVersionId, capturedCount: count(job.capturedCount), skippedCount: count(job.skippedCount), failedCount: count(job.failedCount), publicationError, failures, nextCursor: data.nextCursor };
}
export function validateDestination(destination: DatasetCaptureDestination): DatasetCaptureDestination {
  if (destination.kind === 'existing') return { kind: 'existing', datasetId: uuid(destination.datasetId, 'datasetId') };
  if (destination.kind !== 'name' || typeof destination.name !== 'string' || !destination.name.trim() || destination.name.length > 255 || typeof destination.createIfMissing !== 'boolean') throw new DatasetCaptureError('A name destination requires a name and explicit createIfMissing.');
  if (destination.description !== undefined && (typeof destination.description !== 'string' || destination.description.length > 2000)) throw new DatasetCaptureError('description must be a string of at most 2000 characters.');
  return { kind: 'name', name: destination.name.trim(), createIfMissing: destination.createIfMissing, ...(destination.description !== undefined ? { description: destination.description } : {}) };
}

export function serializeCaptureBody(body: unknown): string {
  const serialized = JSON.stringify(body);
  if (serialized === undefined) throw new DatasetCaptureError('Invalid dataset capture request body.');
  if (Buffer.byteLength(serialized) > 65_536) throw new DatasetCaptureError('Dataset capture request exceeds 64 KiB; no traces were truncated.');
  return serialized;
}

export class DatasetCaptureApi {
  private readonly baseUrl: string;
  private readonly timeout: number;
  constructor(private readonly options: DatasetApiOptions) {
    if (typeof options.token !== 'string' || !options.token.trim()) throw new DatasetCaptureError('An explicit dataset API token is required; ingestion API keys are not reused.');
    uuid(options.projectId, 'projectId');
    let url: URL;
    try { url = new URL(options.baseUrl); } catch { throw new DatasetCaptureError('baseUrl must be an explicit HTTP(S) API origin.'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new DatasetCaptureError('baseUrl must be an HTTPS API origin; HTTP is allowed only on loopback.');
    this.baseUrl = url.origin;
    this.timeout = options.requestTimeoutMillis ?? 30_000;
    if (!Number.isFinite(this.timeout) || this.timeout <= 0) throw new DatasetCaptureError('requestTimeoutMillis must be positive.');
  }
  async request(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string, timeoutMillis = this.timeout): Promise<unknown> {
    return this.requestSerialized(method, path, body === undefined ? undefined : serializeCaptureBody(body), idempotencyKey, timeoutMillis);
  }
  async requestSerialized(method: 'GET' | 'POST', path: string, serialized?: string, idempotencyKey?: string, timeoutMillis = this.timeout): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(this.timeout, timeoutMillis));
    try {
      const headers = { Authorization: `Bearer ${this.options.token.trim()}`, 'x-project-id': this.options.projectId, ...(serialized !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': uuid(idempotencyKey, 'Idempotency-Key') } : {}) };
      for (let attempt = 0; ; attempt += 1) {
        let response: Response;
        try {
          response = await context.with(suppressTracing(context.active()), () => fetch(`${this.baseUrl}/api/v1/public/dataset-capture-jobs${path}`, {
            method, signal: controller.signal, headers, body: serialized,
          }));
        } catch (error) {
          if (attempt === 0 && !controller.signal.aborted) continue;
          throw error;
        }
        if (attempt === 0 && [500, 502, 503, 504].includes(response.status) && !controller.signal.aborted) {
          await response.body?.cancel();
          continue;
        }
        if (!response.ok) throw new DatasetCaptureError(`Dataset capture ${method} failed with HTTP ${response.status}.`, response.status);
        return record(await response.json()).data;
      }
    } catch (error) {
      if (error instanceof DatasetCaptureError) throw error;
      throw new DatasetCaptureError(controller.signal.aborted ? 'Dataset capture API request timed out.' : 'Dataset capture API request failed.');
    } finally {
      clearTimeout(timer);
    }
  }
}
