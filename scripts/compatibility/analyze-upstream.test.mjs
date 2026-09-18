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
