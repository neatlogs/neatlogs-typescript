import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyVerification, installedVersions, verifyChanges } from './verify-releases.mjs';

test('only baseline pass followed by latest runtime failure is a candidate regression', () => {
  assert.equal(classifyVerification({ status: 'passed' }, { status: 'failed' }), 'failed');
  assert.equal(classifyVerification({ status: 'failed' }, { status: 'failed' }), 'blocked');
  assert.equal(classifyVerification({ status: 'passed' }, { status: 'blocked' }), 'blocked');
  assert.equal(classifyVerification({ status: 'failed' }, { status: 'passed' }), 'passed');
});

test('version-resolution check sees nested copies of the watched package', () => {
  const tree = { dependencies: {
    ai: { version: '7.0.1' },
    neatlogs: { dependencies: { ai: { version: '6.0.1' } } },
  } };
  assert.deepEqual(installedVersions(tree, 'ai'), ['7.0.1', '6.0.1']);
});

test('verification records paired versions, scope, and packages with no baseline', async () => {
  const calls = [];
  const results = await verifyChanges([
    { package: 'openai', previouslyAnalyzed: '6.0.0', latest: '7.0.0' },
    { package: 'unknown', previouslyAnalyzed: '1.0.0', latest: '2.0.0' },
    { package: 'ai', previouslyAnalyzed: null, latest: '7.0.0' },
  ], '/tmp/sdk.tgz', '/tmp', async (change, version) => {
    calls.push(`${change.package}@${version}`);
    return { status: version === '7.0.0' ? 'failed' : 'passed', phase: 'runtime', version };
  });
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].scope, 'client construction and SDK wrapping');
  assert.equal(results[1].status, 'not-tested');
  assert.equal(results[2].reason, 'no recorded baseline for comparison');
  assert.deepEqual(calls, ['openai@6.0.0', 'openai@7.0.0']);
});
