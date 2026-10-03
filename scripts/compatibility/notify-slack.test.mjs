import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldNotifySlack, slackMessage } from './notify-slack.mjs';

const runUrl = 'https://github.com/neatlogs/neatlogs-typescript/actions/runs/37084327273';
const issueUrl = 'https://github.com/neatlogs/neatlogs-typescript/issues/46';
const changes = Array.from({ length: 15 }, (_, index) => ({
  package: `package-${index}`, previouslyAnalyzed: '1', latest: '2',
}));
const allPass = { counts: { passed: 15, failed: 0, blocked: 0, 'not-tested': 0 } };

test('all-pass high Gemini advisory is not a Slack alert', () => {
  const context = {
    status: 'success', changesFound: 'true', report: { changes },
    analysis: { riskLevel: 'high' }, verification: allPass,
    proposal: { decision: 'review_only' },
  };
  assert.equal(shouldNotifySlack(context), false);
  assert.equal(shouldNotifySlack({ status: 'success', changesFound: 'false', report: { changes: [] } }), false);
});

test('October 3 all-pass run reports Gemini failure as automation, not SDK regression', () => {
  const context = {
    status: 'success', changesFound: 'true', report: { changes },
    verification: allPass, advisoryOutcome: 'failure',
    analysis: { unavailable: true, reason: 'Gemini response hit MAX_TOKENS and returned malformed JSON.' },
    proposal: { decision: 'review_only' }, issueUrl, url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), true);
  const lines = slackMessage(context).split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /TypeScript SDK: Gemini analysis failed; review the workflow run/);
  assert.match(lines[1], /Checked: 15\/15 passed \(bounded smoke probes\) \| Regression: none found in tested scope \| Fix PR: none/);
  assert.match(lines[2], /MAX_TOKENS.*malformed JSON.*No validated SDK fix was proposed/);
  assert.match(lines[3], /Action: .*Discovery issue.*Workflow run/);
  assert.match(lines[3], /actions\/runs\/37084327273/);
  assert.doesNotMatch(slackMessage(context), /package-0|high potential risk|candidate SDK regression found/);
});

test('workflow failure links to the actual actions run without claiming a regression', () => {
  const message = slackMessage({ status: 'failure', report: null, analysis: null, url: runUrl });
  assert.match(message, /Compatibility workflow failed; inspect the run/);
  assert.match(message, /Checked: no completed report \| Regression: unknown \| Fix PR: none/);
  assert.match(message, /actions\/runs\/37084327273/);
  assert.doesNotMatch(message, /neatlogs-typescript\/37084327273>/);
});

test('blocked checks say compatibility is unknown for those versions', () => {
  const context = {
    status: 'success', changesFound: 'true', report: { changes: changes.slice(0, 3) },
    verification: { counts: { passed: 2, failed: 0, blocked: 1, 'not-tested': 0 } },
    analysis: { riskLevel: 'high' }, issueUrl, url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /Compatibility checks incomplete; investigate the blocked probes/);
  assert.match(message, /Checked: 2\/3 passed \(bounded smoke probes\), 1 blocked/);
  assert.match(message, /Blocked or untested probes leave those package versions unverified/);
  assert.doesNotMatch(message, /high potential risk/);
});

test('candidate regression and rejected fix show the failed gate and no PR', () => {
  const context = {
    status: 'success', report: { changes: changes.slice(0, 1) },
    verification: { counts: { passed: 0, failed: 1, blocked: 0, 'not-tested': 0 } },
    validation: { status: 'rejected', reason: 'No before/after regression proof' }, validationOutcome: 'failure', url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /^:red_circle: \*TypeScript SDK: Candidate SDK regression found/);
  assert.match(message, /Regression: 1 candidate \(baseline passed; latest failed\) \| Fix PR: none/);
  assert.match(message, /proposed SDK patch failed validation: No before\/after regression proof, so no PR was opened/);
  assert.match(message, /No before\/after regression proof/);
});

test('validated patch shows review PR and bounded post-patch result', () => {
  const context = {
    status: 'success', report: { changes: changes.slice(0, 1) }, verification: allPass,
    validation: { status: 'validated', regressionProof: 'targeted-test-red-green', postPatchSmoke: {
      package: 'openai', latestVersion: '7', latestStatus: 'passed', scope: 'client construction and SDK wrapping',
    } },
    publication: { status: 'created', url: 'https://github.com/neatlogs/neatlogs-typescript/pull/50' },
    issueUrl, url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /Validated SDK fix PR ready; review the code/);
  assert.match(message, /Fix PR: <https:\/\/github.com\/neatlogs\/neatlogs-typescript\/pull\/50\|ready for code review>/);
  assert.match(message, /focused test failed on the unchanged SDK and passed after the patch/);
  assert.match(message, /Review and approve the PR manually/);
  assert.doesNotMatch(message, /draft PR/);
});

test('proposal and publication failures explain why no new PR appeared', () => {
  const base = { status: 'success', report: { changes: changes.slice(0, 1) }, verification: allPass, url: runUrl };
  const proposalContext = { ...base, proposalOutcome: 'failure' };
  assert.equal(shouldNotifySlack(proposalContext), true);
  assert.match(slackMessage(proposalContext), /Gemini fix proposal failed; no validated SDK patch was available/);
  const publicationContext = { ...base, validation: { status: 'validated' }, publicationOutcome: 'failure' };
  assert.equal(shouldNotifySlack(publicationContext), true);
  assert.match(slackMessage(publicationContext), /PR publication failed after patch validation/);
  const existingContext = { ...base, publication: {
    status: 'existing_unverified', priorPrUrl: 'https://github.com/neatlogs/neatlogs-typescript/pull/51', existingWasDraft: true,
  } };
  assert.equal(shouldNotifySlack(existingContext), true);
  assert.match(slackMessage(existingContext), /existing PR> lacks verified bot provenance and was left unchanged as a draft/);
});
