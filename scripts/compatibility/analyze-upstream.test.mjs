import assert from 'node:assert/strict';
import test from 'node:test';

import { diffFiles, diffObjects, packageSurface } from './analyze-upstream.mjs';

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
