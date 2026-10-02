import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffApi,
  diffFiles,
  diffObjects,
  diffText,
  diffTextFiles,
  extractTypeScriptApi,
  documentationText,
  officialDocumentationUrls,
  packageSurface,
  compactEvidence,
  advisoryFailureReason,
  analyzeWithGemini,
} from './analyze-upstream.mjs';

test('packageSurface keeps only compatibility-relevant package metadata', () => {
  assert.deepEqual(packageSurface({ name: 'ignored', main: 'index.js', engines: { node: '>=20' } }), {
    engines: { node: '>=20' },
    main: 'index.js',
  });
});

test('diffObjects reports added, removed, and changed surfaces', () => {
  assert.deepEqual(diffObjects({ main: 'a.js', types: 'a.d.ts' }, { main: 'b.js', module: 'm.js' }), [
    { key: 'main', before: 'a.js', after: 'b.js' },
    { key: 'module', before: null, after: 'm.js' },
    { key: 'types', before: 'a.d.ts', after: null },
  ]);
});

test('diffFiles compares public artifact paths and sizes', () => {
  assert.deepEqual(diffFiles(
    [{ path: 'old.d.ts', size: 4 }, { path: 'same.js', size: 5 }, { path: 'changed.js', size: 6 }],
    [{ path: 'new.d.ts', size: 4 }, { path: 'same.js', size: 5 }, { path: 'changed.js', size: 9 }],
  ), {
    added: ['new.d.ts'],
    removed: ['old.d.ts'],
    sizeChanged: [{ path: 'changed.js', beforeBytes: 6, afterBytes: 9 }],
  });
});

test('extractTypeScriptApi reads real exported declaration signatures', () => {
  assert.deepEqual(extractTypeScriptApi({
    'dist/index.d.ts': 'declare const hidden: string;\nexport interface Telemetry { functionId: string }\nexport declare function instrument(value: Telemetry): void;',
  }), [
    'dist/index.d.ts: export declare function instrument(value: Telemetry): void;',
    'dist/index.d.ts: export interface Telemetry { functionId: string }',
  ]);
});

test('diffApi reports substantive exported API changes', () => {
  assert.deepEqual(diffApi(['a', 'b'], ['b', 'c']), { added: ['c'], removed: ['a'] });
});

test('diffText and diffTextFiles expose changed source content, not only byte sizes', () => {
  assert.deepEqual(diffText('const version = 6;\n', 'const version = 7;\n'), {
    addedLines: ['const version = 7;'],
    removedLines: ['const version = 6;'],
  });
  assert.deepEqual(diffTextFiles(
    { 'src/index.ts': 'export const context = "experimental_context";' },
    { 'src/index.ts': 'export const context = "runtimeContext";' },
  ), [{
    path: 'src/index.ts',
    addedLines: ['export const context = "runtimeContext";'],
    removedLines: ['export const context = "experimental_context";'],
  }]);
});

test('official documentation is discovered from authoritative package metadata', () => {
  assert.deepEqual(officialDocumentationUrls({}, {
    homepage: 'https://sdk.example.dev/docs',
    repository: { url: 'git+https://github.com/example/sdk.git' },
  }), [
    { kind: 'documentation-or-homepage', url: 'https://sdk.example.dev/docs' },
    { kind: 'source-repository', url: 'https://github.com/example/sdk' },
    { kind: 'release-notes', url: 'https://github.com/example/sdk/releases' },
  ]);
});

test('documentationText extracts visible documentation without scripts', () => {
  assert.equal(documentationText('<html><script>ignore()</script><body><h1>Migration</h1><p>Use runtimeContext.</p></body></html>', 'text/html'), 'Migration Use runtimeContext.');
});

test('advisory input stays bounded across fifteen large package reports and labels incomplete excerpts', () => {
  const large = 'x'.repeat(100_000);
  const item = (index) => ({
    package: `package-${index}`, previousVersion: '1', latestVersion: '2',
    integrations: [{ id: 'adapter', adapterPaths: ['src/adapter.ts'], adapterSource: [{ path: 'src/adapter.ts', content: large }] }],
    packageSurfaceChanges: [{ key: 'exports', before: large, after: large }],
    publicApiChanges: { added: [large], removed: [large] },
    sourceContentChanges: [{ path: 'index.ts', addedLines: [large], removedLines: [large] }],
    officialDocumentation: [{ url: 'https://example.test/docs', content: large }],
  });
  const packages = Array.from({ length: 15 }, (_, index) => item(index));
  packages[0].integrations.push({ id: 'third-adapter', adapterSource: [{ path: 'src/third.ts', content: large }] });
  const compact = compactEvidence({ schemaVersion: 1, packages });
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < 300_000);
  assert.equal(compact.packages[0].integrations[0].adapterSource[0].truncated, true);
  assert.equal(compact.packages[0].integrations[1].adapterSource[0].path, 'src/third.ts');
  assert.match(compact.note, /Do not infer missing handlers or syntax errors/);
});

test('malformed Gemini JSON becomes a safe advisory failure without publishing model text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"summary":"unfinished' }] } }],
  }) });
  try {
    await assert.rejects(analyzeWithGemini({ packages: [] }, 'fake-key'), /Gemini advisory returned malformed JSON after reaching its output limit/);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(advisoryFailureReason(Object.assign(new Error('network details'), { name: 'TimeoutError' })), 'Gemini advisory request timed out after six minutes.');
  assert.equal(advisoryFailureReason(new SyntaxError('raw model text')), 'Gemini advisory request failed before producing a valid assessment.');
});
