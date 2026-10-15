import { DatasetCaptureError, record, uuid } from './api.js';

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
  if (datasetVersionId === null && state === 'completed') throw new DatasetCaptureError('Completed dataset capture has no published version.');
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


