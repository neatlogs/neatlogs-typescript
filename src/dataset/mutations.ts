import { randomUUID } from 'node:crypto';
import { DatasetApi, DatasetCaptureError, json, record, uuid, type DatasetApiOptions, type DatasetJson } from './api.js';

export interface DatasetCaseInput {
  input?: DatasetJson;
  observedOutput?: DatasetJson;
  outcome?: DatasetJson;
  context?: DatasetJson;
  metadata?: { [key: string]: DatasetJson };
  tags?: string[];
}

export interface CreateDatasetInput {
  name: string;
  description?: string | null;
  cases?: DatasetCaseInput[];
}

export interface DatasetMutationOptions extends DatasetApiOptions {
  idempotencyKey?: string;
}

export interface DatasetVersion {
  datasetId: string;
  versionId: string;
}

export interface DatasetOutcomeChange {
  caseId: string;
  revisionId: string;
  /** Omit to leave unchanged; null clears the outcome. */
  outcome?: DatasetJson;
}

function outcome(value: DatasetJson): DatasetJson {
  return value === null ? null : { value: json(value), status: 'draft', source: 'human' };
}

function version(value: unknown): DatasetVersion {
  const data = record(value);
  return { datasetId: uuid(data.datasetId, 'datasetId'), versionId: uuid(data.versionId, 'versionId') };
}

export async function createDataset(input: CreateDatasetInput, options: DatasetMutationOptions): Promise<DatasetVersion> {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 255) {
    throw new DatasetCaptureError('Dataset name must contain 1 to 255 characters.');
  }
  if (input.description !== undefined && input.description !== null && (typeof input.description !== 'string' || input.description.length > 2000)) {
    throw new DatasetCaptureError('Dataset description must contain at most 2000 characters.');
  }
  const cases = input.cases ?? [];
  if (!Array.isArray(cases) || cases.length > 500) throw new DatasetCaptureError('Dataset creation accepts at most 500 cases.');
  const idempotencyKey = uuid(options.idempotencyKey ?? randomUUID(), 'idempotencyKey');
  const body = {
    name: input.name.trim(),
    ...(input.description !== undefined ? { description: input.description } : {}),
    idempotencyKey,
    cases: cases.map((item) => ({
      ...(item.input !== undefined ? { input: json(item.input) } : {}),
      ...(item.observedOutput !== undefined ? { observedOutput: json(item.observedOutput) } : {}),
      ...(item.outcome !== undefined ? { expected: outcome(item.outcome) } : {}),
      ...(item.context !== undefined ? { context: json(item.context) } : {}),
      ...(item.metadata !== undefined ? { metadata: json(item.metadata) } : {}),
      ...(item.tags !== undefined ? { tags: json(item.tags) } : {}),
      source: { kind: 'import' },
    })),
  };
  return version(await new DatasetApi(options).request('POST', '/datasets', body, idempotencyKey));
}

export async function updateDatasetOutcomes(
  datasetId: string,
  input: { baseVersionId: string; changes: DatasetOutcomeChange[] },
  options: DatasetMutationOptions,
): Promise<DatasetVersion> {
  const id = uuid(datasetId, 'datasetId');
  if (!Array.isArray(input.changes) || input.changes.length > 2000) throw new DatasetCaptureError('At most 2000 outcome changes are allowed.');
  const seen = new Set<string>();
  const expectedChanges = input.changes.flatMap((item) => {
    if (item.outcome === undefined) return [];
    const caseId = uuid(item.caseId, 'caseId');
    if (seen.has(caseId)) throw new DatasetCaptureError('A case can be changed only once per version.');
    seen.add(caseId);
    return [{ caseId, revisionId: uuid(item.revisionId, 'revisionId'), expected: outcome(item.outcome) }];
  });
  if (expectedChanges.length === 0) throw new DatasetCaptureError('Supply at least one outcome change.');
  const idempotencyKey = uuid(options.idempotencyKey ?? randomUUID(), 'idempotencyKey');
  const result = version(await new DatasetApi(options).request('POST', `/datasets/${id}/versions`, {
    baseVersionId: uuid(input.baseVersionId, 'baseVersionId'), idempotencyKey, expectedChanges, removedCaseIds: [],
  }, idempotencyKey));
  if (result.datasetId !== id) throw new DatasetCaptureError('Dataset version belongs to a different dataset.');
  return result;
}
