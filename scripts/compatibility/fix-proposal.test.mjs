import assert from 'node:assert/strict';
import test from 'node:test';

import { boundedPackageEvidence, candidatePackages, consideredPackages, reviewOnlyReason, validProposal } from './propose-fix.mjs';
import { proposalBranch } from './publish-fix.mjs';
import { patchPaths, validateAdapterPaths, validateProposalReferences } from './validate-fix.mjs';

const report = { changes: [
  { package: 'openai', previouslyAnalyzed: '6', latest: '7' },
  { package: 'ai', previouslyAnalyzed: '6', latest: '7' },
] };

test('candidate selection does not rely on Gemini aggregate risk or old finding shape', () => {
  assert.deepEqual(candidatePackages(report, { riskLevel: 'low', findings: ['unstructured'] }, { packages: [] }), ['openai', 'ai']);
  assert.deepEqual(candidatePackages(report, { findings: [] }, { packages: [] }, [proposalBranch('openai', '7')]), ['ai']);
});

test('three-package rotation eventually considers all fifteen packages', () => {
  const names = Array.from({ length: 15 }, (_, index) => `package-${index}`);
  const covered = new Set(Array.from({ length: 5 }, (_, run) => consideredPackages(names, run)).flat());
  assert.deepEqual([...covered].sort(), [...names].sort());
});

test('review-only issue summary does not present model explanations as verified facts', () => {
  const reason = reviewOnlyReason(['@ai-sdk/otel', '@anthropic-ai/sdk']);
  assert.match(reason, /No SDK patch was selected for validation from 2 packages/);
  assert.match(reason, /model explanations in the artifact are unverified/);
  assert.doesNotMatch(reason, /syntax error|constructor signature/);
});

test('model high risk alone is not an actionable fix decision', () => {
  assert.equal(validProposal({ decision: 'review_only', package: 'openai', reason: 'high', patch: '' }, ['openai']), false);
  assert.equal(validProposal({ decision: 'propose_fix', package: 'other', reason: 'x'.repeat(40), evidence: 'x'.repeat(40), patch: 'diff --git a/x b/x' }, ['openai']), false);
  const payload = { upstreamEvidence: {
    integrations: [{ adapterSource: [{ path: 'src/openai.ts' }] }],
    sourceContentChanges: [{ path: 'src/responses.ts' }],
  } };
  const proposed = {
    decision: 'propose_fix', package: 'openai', adapterPath: 'src/openai.ts', upstreamReference: 'src/responses.ts',
    reason: 'A changed response field requires a parser adjustment in the Neatlogs adapter.',
    evidence: 'The source change renames a field used by the current response parser.',
    patch: 'diff --git a/src/openai.ts b/src/openai.ts\n',
  };
  assert.equal(validProposal(proposed, ['openai'], payload), true);
  assert.equal(validProposal({ ...proposed, upstreamReference: 'made-up.ts' }, ['openai'], payload), false);
});

test('package evidence is bounded without truncating JSON', () => {
  const payload = boundedPackageEvidence(report.changes[0], null, [], {
    package: 'openai',
    integrations: [{ id: 'openai', adapterPaths: ['src/openai.ts'], adapterSource: [{ path: 'src/openai.ts', content: 'x'.repeat(30_000) }] }],
    officialDocumentation: [{ url: 'https://example.test', content: 'y'.repeat(10_000) }],
  });
  assert.equal(payload.upstreamEvidence.integrations[0].adapterSource[0].content.length, 12_000);
  assert.equal(payload.upstreamEvidence.officialDocumentation[0].content.length, 3_000);
  assert.equal(JSON.parse(JSON.stringify(payload)).change.package, 'openai');
});

test('patch validation confines source to the affected adapter and existing tests', () => {
  const patch = [
    'diff --git a/src/openai.ts b/src/openai.ts',
    '--- a/src/openai.ts',
    '+++ b/src/openai.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    'diff --git a/tests/unit/wrappers.test.ts b/tests/unit/wrappers.test.ts',
    '--- a/tests/unit/wrappers.test.ts',
    '+++ b/tests/unit/wrappers.test.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n');
  const paths = patchPaths(patch);
  assert.deepEqual(paths, ['src/openai.ts', 'tests/unit/wrappers.test.ts']);
  assert.doesNotThrow(() => validateAdapterPaths(paths, 'openai', {
    packages: [{ package: 'openai', integrations: [{ adapterSource: [{ path: 'src/openai.ts' }] }] }],
  }));
  assert.throws(() => validateAdapterPaths(['src/anthropic.ts', paths[1]], 'openai', {
    packages: [{ package: 'openai', integrations: [{ adapterSource: [{ path: 'src/openai.ts' }] }] }],
  }), /outside the affected/);
  assert.throws(() => patchPaths(patch.replace('src/openai.ts', '.github/workflows/ci.yml')), /invalid file header|not allowed|must change SDK source/);
  const evidence = { packages: [{ package: 'openai', sourceContentChanges: [{ path: 'src/responses.ts' }] }] };
  assert.doesNotThrow(() => validateProposalReferences({ package: 'openai', adapterPath: 'src/openai.ts', upstreamReference: 'src/responses.ts' }, paths, evidence));
  assert.throws(() => validateProposalReferences({ package: 'openai', adapterPath: 'src/openai.ts', upstreamReference: 'made-up.ts' }, paths, evidence), /exact upstream evidence/);
});
