import { DatasetApi, DatasetCaptureError, record, uuid, type DatasetApiOptions } from './api.js';

export interface DatasetVersionActor {
  kind: 'user' | 'service_account' | 'guest';
  id: string;
}
export interface DatasetVersionSummary {
  id: string;
  version: number;
  createdAt: string;
  createdBy: DatasetVersionActor | null;
  tags: string[];
}

/** Read immutable version provenance; older versions can have an unknown actor. */
export async function listDatasetVersions(datasetId: string, options: DatasetApiOptions): Promise<DatasetVersionSummary[]> {
  const id = uuid(datasetId, 'datasetId');
  const data = record(await new DatasetApi(options).request('GET', `/datasets/${id}`));
  if (uuid(record(data.dataset).id, 'datasetId') !== id || !Array.isArray(data.versions)) throw new DatasetCaptureError('Invalid dataset version history.');
  return data.versions.map(value => {
    const version = record(value);
    if (typeof version.version !== 'number' || !Number.isSafeInteger(version.version) || version.version < 1 || typeof version.createdAt !== 'string' || !Number.isFinite(Date.parse(version.createdAt))) throw new DatasetCaptureError('Invalid dataset version history.');
    let createdBy: DatasetVersionActor | null = null;
    if (version.createdBy !== null && version.createdBy !== undefined) {
      const actor = record(version.createdBy);
      if (actor.kind !== 'user' && actor.kind !== 'service_account' && actor.kind !== 'guest') throw new DatasetCaptureError('Invalid dataset version actor.');
      createdBy = { kind: actor.kind, id: uuid(actor.id, 'actorId') };
    }
    const tags = version.tags ?? [];
    if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw new DatasetCaptureError('Invalid dataset version tags.');
    return { id: uuid(version.id, 'versionId'), version: version.version, createdAt: version.createdAt, createdBy, tags };
  });
}
