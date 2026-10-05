import assert from 'node:assert/strict';
import test from 'node:test';

import { deliverSlackAlert, shouldNotifySlack, slackMessage, slackPayload, verificationIsConsistent } from './notify-slack.mjs';

const runUrl = 'https://github.com/neatlogs/neatlogs-typescript/actions/runs/37084327273';
const issueUrl = 'https://github.com/neatlogs/neatlogs-typescript/issues/46';
const changes = Array.from({ length: 15 }, (_, index) => ({
  package: `package-${index}`, previouslyAnalyzed: '1', latest: '2',
}));
function verificationFor(releaseChanges, statuses = []) {
  const packages = releaseChanges.map((change, index) => {
    const status = statuses[index] ?? 'passed';
    return {
      package: change.package, baselineVersion: change.previouslyAnalyzed, latestVersion: change.latest,
      status,
      ...(status === 'not-tested' ? {} : {
        baseline: { status: 'passed' }, latest: { status: status === 'failed' ? 'failed' : status },
      }),
    };
  });
  return {
    schemaVersion: 1,
    packages,
    counts: Object.fromEntries(['passed', 'failed', 'blocked', 'not-tested'].map((status) =>
      [status, packages.filter((item) => item.status === status).length])),
  };
}

const allPass = verificationFor(changes);

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
  const payload = slackPayload(context);
  const lines = payload.text.split('\n');
  assert.match(lines[0], /TypeScript SDK: Gemini analysis failed; review the workflow run/);
  assert.equal(lines[1], '');
  assert.match(lines[2], /\*Checked:\* 15\/15 passed \(bounded smoke probes\)/);
  assert.match(lines[3], /\*Regression:\* none found in tested scope/);
  assert.match(lines[4], /\*Fix PR:\* none/);
  assert.match(lines[6], /MAX_TOKENS.*malformed JSON.*No validated SDK fix was proposed/);
  assert.match(lines[8], /\*Action:\*/);
  assert.match(lines[10], /Discovery issue.*Workflow run/);
  assert.match(lines[10], /actions\/runs\/37084327273/);
  assert.deepEqual(payload.blocks.map((block) => block.type), [
    'section', 'divider', 'section', 'section', 'section', 'section', 'section', 'context',
  ]);
  assert.match(payload.blocks[2].text.text, /\*Checked:\*/);
  assert.match(payload.blocks[3].text.text, /\*Regression:\*/);
  assert.match(payload.blocks[4].text.text, /\*Fix PR:\*/);
  assert.match(payload.blocks[5].text.text, /\*Why:\*/);
  assert.match(payload.blocks[6].text.text, /\*Action:\*/);
  assert.match(payload.blocks[7].elements[0].text, /Discovery issue.*Workflow run/);
  assert.doesNotMatch(slackMessage(context), /package-0|high potential risk|candidate SDK regression found/);
});

test('workflow failure links to the actual actions run without claiming a regression', () => {
  const message = slackMessage({ status: 'failure', report: null, analysis: null, url: runUrl });
  assert.match(message, /Compatibility workflow failed; inspect the run/);
  assert.match(message, /\*Checked:\* no valid completed report\n\*Regression:\* unknown\n\*Fix PR:\* none/);
  assert.match(message, /actions\/runs\/37084327273/);
  assert.doesNotMatch(message, /neatlogs-typescript\/37084327273>/);
});

test('blocked and not-tested results stay in the issue when the completed run found no regression', () => {
  const selected = changes.slice(0, 3);
  const context = {
    status: 'success', changesFound: 'true', report: { changes: selected },
    verification: verificationFor(selected, ['passed', 'blocked', 'not-tested']),
    analysis: { riskLevel: 'high' }, issueUrl, url: runUrl,
  };
  assert.equal(verificationIsConsistent(context.report, context.verification), true);
  assert.equal(shouldNotifySlack(context), false);
  assert.equal(shouldNotifySlack({ ...context, verification: verificationFor(selected, ['passed', 'blocked', 'passed']) }), false);
  assert.equal(shouldNotifySlack({ ...context, verification: verificationFor(selected, ['passed', 'passed', 'not-tested']) }), false);
});

test('missing or inconsistent verification results alert with unknown regression status', () => {
  const selected = changes.slice(0, 3);
  const base = { status: 'success', changesFound: 'true', report: { changes: selected }, url: runUrl };
  const inconsistent = verificationFor(selected);
  inconsistent.counts.passed = 3;
  inconsistent.packages[1].status = 'failed';
  assert.equal(verificationIsConsistent(base.report, inconsistent), false);
  assert.equal(shouldNotifySlack({ ...base, verification: inconsistent }), true);
  assert.match(slackMessage({ ...base, verification: inconsistent }), /\*Regression:\* unknown/);
  assert.match(slackMessage({ ...base, verification: inconsistent }), /report is missing or inconsistent/);
  assert.equal(shouldNotifySlack({ ...base, verification: null }), true);
  const duplicate = verificationFor(selected);
  duplicate.packages[1].package = duplicate.packages[0].package;
  assert.equal(verificationIsConsistent(base.report, duplicate), false);
  const stale = verificationFor(selected);
  stale.packages[0].latestVersion = 'stale-version';
  assert.equal(verificationIsConsistent(base.report, stale), false);
});

test('candidate regression and rejected fix show the failed gate and no PR', () => {
  const context = {
    status: 'success', report: { changes: changes.slice(0, 1) },
    verification: verificationFor(changes.slice(0, 1), ['failed']),
    validation: { status: 'rejected', reason: 'No before/after regression proof' }, validationOutcome: 'failure', url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /^:red_circle: \*TypeScript SDK: Candidate SDK regression found/);
  assert.match(message, /\*Regression:\* 1 candidate \(baseline passed; latest failed\)\n\*Fix PR:\* none/);
  assert.match(message, /proposed SDK patch failed validation: No before\/after regression proof, so no PR was opened/);
  assert.match(message, /No before\/after regression proof/);
});

test('validated patch shows review PR and bounded post-patch result', () => {
  const context = {
    status: 'success', report: { changes: changes.slice(0, 1) }, verification: verificationFor(changes.slice(0, 1)),
    validation: { status: 'validated', regressionProof: 'targeted-test-red-green', postPatchSmoke: {
      package: 'openai', latestVersion: '7', latestStatus: 'passed', scope: 'client construction and SDK wrapping',
    } },
    publication: { status: 'created', url: 'https://github.com/neatlogs/neatlogs-typescript/pull/50' },
    issueUrl, url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /Validated SDK fix PR ready; review the code/);
  assert.match(message, /\*Fix PR:\* <https:\/\/github.com\/neatlogs\/neatlogs-typescript\/pull\/50\|ready for code review>/);
  assert.match(message, /focused test failed on the unchanged SDK and passed after the patch/);
  assert.match(message, /Review and approve the PR manually/);
  assert.doesNotMatch(message, /draft PR/);
});

test('proposal and publication failures explain why no new PR appeared', () => {
  const base = { status: 'success', report: { changes: changes.slice(0, 1) }, verification: verificationFor(changes.slice(0, 1)), url: runUrl };
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

test('post-merge proposal failure has separate Slack blocks for outcome and next step', () => {
  const context = {
    status: 'success', changesFound: 'true', report: { changes }, verification: allPass,
    proposalOutcome: 'failure', proposal: { decision: 'review_only' }, issueUrl, url: runUrl,
  };
  const payload = slackPayload(context);
  assert.equal(shouldNotifySlack(context), true);
  assert.match(payload.blocks[0].text.text, /Compatibility automation failed/);
  assert.equal(payload.blocks[2].text.text, '*Checked:* 15/15 passed (bounded smoke probes)');
  assert.equal(payload.blocks[3].text.text, '*Regression:* none found in tested scope');
  assert.equal(payload.blocks[4].text.text, '*Fix PR:* none');
  assert.match(payload.blocks[5].text.text, /Gemini fix proposal failed/);
  assert.match(payload.blocks[6].text.text, /Inspect the failed step/);
  assert.match(payload.blocks[7].elements[0].text, /Discovery issue.*Workflow run/);
  assert.match(payload.text, /\*TypeScript SDK:.*\*\n\n\*Checked:/);
  assert.doesNotMatch(payload.text, /\*\*Checked:/);
});

test('actionable alerts require a configured webhook and a successful Slack response', async () => {
  const context = {
    status: 'success', changesFound: 'true', report: { changes }, verification: allPass,
    proposalOutcome: 'failure', url: runUrl,
  };
  await assert.rejects(deliverSlackAlert(context, ''), /COMPAT_SLACK_WEBHOOK_URL is not configured/);
  let sent;
  const webhook = 'https://hooks.slack.test/example';
  assert.equal(await deliverSlackAlert(context, webhook, async (url, options) => {
    sent = { url, options };
    return { ok: true, status: 200 };
  }), true);
  assert.equal(sent.url, webhook);
  assert.match(JSON.parse(sent.options.body).blocks[0].text.text, /Compatibility automation failed/);
  await assert.rejects(deliverSlackAlert(context, webhook, async () => ({ ok: false, status: 429 })), /Slack webhook returned 429/);
  const noAlert = { ...context, proposalOutcome: 'success' };
  assert.equal(await deliverSlackAlert(noAlert, '', () => { throw new Error('unexpected request'); }), false);
});
