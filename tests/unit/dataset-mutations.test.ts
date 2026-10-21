import { afterEach, describe, expect, it, vi } from 'vitest';
import { listDatasetVersions } from '../../src/dataset/history.js';
import { createDataset, updateDatasetOutcomes, upsertDatasetCases } from '../../src/dataset/mutations.js';

const datasetId = '53f5bc6f-2cc5-4e03-8c26-d0df0283845e';
const versionId = '442e68ec-d502-489f-8a39-f01493fbcc7d';
const caseId = '9b10a2f8-25a4-407a-9d78-82cb375c7bdd';
const revisionId = 'f150fdea-688a-4ed8-8c65-cfbf85eecb9a';
const options = { token: 'public-token', projectId: datasetId, baseUrl: 'https://api.example.test', idempotencyKey: datasetId };
afterEach(() => vi.unstubAllGlobals());
function server() {
  const fetch = vi.fn(async () => Response.json({ success: true, data: { datasetId, versionId } }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
function body(fetch: ReturnType<typeof server>) {
  return JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
}

describe('dataset creation and per-case outcomes', () => {
  it('creates an empty dataset without initializing trace instrumentation', async () => {
    const fetch = server();
    await expect(createDataset({ name: ' examples ' }, options)).resolves.toEqual({ datasetId, versionId });
    expect(body(fetch)).toEqual({ name: 'examples', cases: [], idempotencyKey: datasetId });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/public/datasets');
  });

  it('maps optional human outcomes per case and keeps recorded outputs separate', async () => {
    const fetch = server();
    await createDataset({ name: 'cases', cases: [
      { input: { question: '2+2' }, observedOutput: 'four', outcome: '4' },
      { input: 'another', observedOutput: false, outcome: null },
      { input: 'no expectation' },
    ] }, options);
    expect(body(fetch).cases).toEqual([
      { input: { question: '2+2' }, observedOutput: 'four', expected: { value: '4', status: 'draft', source: 'human' }, source: { kind: 'import' } },
      { input: 'another', observedOutput: false, expected: null, source: { kind: 'import' } },
      { input: 'no expectation', source: { kind: 'import' } },
    ]);
  });

  it('creates a new version for selected revisions and distinguishes omitted/cleared outcomes', async () => {
    const fetch = server();
    await updateDatasetOutcomes(datasetId, { baseVersionId: versionId, changes: [
      { caseId, revisionId, outcome: 'expected' },
      { caseId: datasetId, revisionId, outcome: null },
      { caseId: versionId, revisionId },
    ] }, options);
    expect(body(fetch)).toEqual({ baseVersionId: versionId, idempotencyKey: datasetId, removedCaseIds: [], expectedChanges: [
      { caseId, revisionId, expected: { value: 'expected', status: 'draft', source: 'human' } },
      { caseId: datasetId, revisionId, expected: null },
    ] });
  });

  it('rejects invalid names, oversized cases and duplicate outcome changes before transport', async () => {
    const fetch = server();
    await expect(createDataset({ name: '' }, options)).rejects.toThrow('name');
    await expect(createDataset({ name: 'cases', cases: Array.from({ length: 501 }, () => ({})) }, options)).rejects.toThrow('500');
    await expect(updateDatasetOutcomes(datasetId, { baseVersionId: versionId, changes: [{ caseId, revisionId, outcome: 1 }, { caseId: caseId.toUpperCase(), revisionId, outcome: 2 }] }, options)).rejects.toThrow('only once');
    await expect(updateDatasetOutcomes(datasetId, { baseVersionId: versionId, changes: [{ caseId, revisionId }] }, options)).rejects.toThrow('at least one');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves stale-version conflicts instead of silently retrying against latest', async () => {
    const fetch = server();
    fetch.mockImplementation(async () => new Response('', { status: 409 }));
    await expect(updateDatasetOutcomes(datasetId, { baseVersionId: versionId, changes: [{ caseId, revisionId, outcome: 0 }] }, options)).rejects.toMatchObject({ statusCode: 409 });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

it('preserves external keys in create and publishes keyed replacements with a pinned base', async () => {
  const fetch = server();
  await createDataset({ name: 'keys', cases: [{ key: 'sheet/order-42', input: 'before' }] }, options);
  expect(body(fetch).cases[0].key).toBe('sheet/order-42');
  fetch.mockClear();
  await upsertDatasetCases(datasetId, { baseVersionId: versionId, cases: [{ key: 'sheet/order-42', input: 'after', outcome: 'right' }] }, options);
  expect(body(fetch)).toEqual({ baseVersionId: versionId, idempotencyKey: datasetId, upsertCases: [
    { key: 'sheet/order-42', input: 'after', expected: { value: 'right', status: 'draft', source: 'human' }, source: { kind: 'import' } },
  ] });
  expect(fetch.mock.calls[0]?.[0]).toBe(`https://api.example.test/api/v1/public/datasets/${datasetId}/versions`);
  expect(body(fetch).createdBy).toBeUndefined();
});
it('rejects duplicate or malformed upsert keys before transport', async () => {
  const fetch = server();
  for (const keys of [['duplicate', 'duplicate'], [' leading'], ['x'.repeat(129)], ['bad\nkey']]) {
    await expect(upsertDatasetCases(datasetId, { baseVersionId: versionId, cases: keys.map(key => ({ key, input: 'fixture' })) }, options)).rejects.toThrow();
  }
  expect(fetch).not.toHaveBeenCalled();
});

it('validates version actors and keeps unknown legacy provenance explicit', async () => {
  const payload = { dataset: { id: datasetId }, versions: [
    { id: versionId, version: 2, createdAt: '2026-10-21T00:00:00Z', createdBy: { kind: 'service_account', id: caseId }, tags: ['golden'] },
    { id: revisionId, version: 1, createdAt: '2026-10-20T00:00:00Z' },
  ] };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, data: payload })));
  const history = await listDatasetVersions(datasetId, options);
  expect(history[0]?.createdBy).toEqual({ kind: 'service_account', id: caseId });
  expect(history[1]?.createdBy).toBeNull();
  payload.versions[0]!.createdBy!.kind = 'forged';
  await expect(listDatasetVersions(datasetId, options)).rejects.toThrow('actor');
});
