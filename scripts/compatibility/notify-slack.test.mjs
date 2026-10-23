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

test('optional advisory failure is issue-only after completed checks and fix proposal', () => {
  const context = {
    status: 'success', changesFound: 'true', report: { changes },
    verification: allPass, advisoryOutcome: 'failure',
    analysis: { unavailable: true, reason: 'Gemini response hit MAX_TOKENS and returned malformed JSON.' },
    proposalOutcome: 'success', proposal: { decision: 'review_only' }, issueUrl, url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), false);
  assert.equal(shouldNotifySlack({ ...context, proposalOutcome: 'failure' }), true);
});

test('Slack severity follows confirmed findings and required pipeline status', () => {
  const base = { status: 'success', changesFound: 'true', report: { changes }, verification: allPass,
    proposalOutcome: 'success', advisoryOutcome: 'success' };
  const cases = [
    ['clean review', {}, false],
    ['optional advisory failure', { advisoryOutcome: 'failure', analysis: { unavailable: true } }, false],
    ['blocked without regression', { verification: verificationFor(changes, ['blocked']) }, false],
    ['unverified report', { verification: { counts: allPass.counts } }, true],
    ['candidate regression', { verification: verificationFor(changes, ['failed']) }, true],
    ['required proposal failure', { proposalOutcome: 'failure' }, true],
    ['required publication failure', { publicationOutcome: 'failure' }, true],
    ['validated PR', { publication: { url: 'https://github.com/neatlogs/neatlogs-typescript/pull/50' } }, true],
  ];
  for (const [name, change, expected] of cases) {
    assert.equal(shouldNotifySlack({ ...base, ...change }), expected, name);
  }
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
  const bothFailed = slackMessage({ ...base, verification: inconsistent, proposalOutcome: 'failure' });
  assert.match(bothFailed, /SDK regression status is unknown, and the Gemini fix scan also failed/);
  assert.doesNotMatch(bothFailed, /smoke probes found no regression/);
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

test('safe rejection without a verified regression stays in the issue; crashes still alert', () => {
  const selected = changes.slice(0, 1);
  const context = {
    status: 'success', changesFound: 'true', report: { changes: selected },
    verification: verificationFor(selected), proposal: { decision: 'propose_fix', package: selected[0].package },
    proposalOutcome: 'success', validation: {
      schemaVersion: 1, status: 'rejected', kind: 'proposal-gate', package: selected[0].package,
      reason: 'Targeted test passed on unchanged SDK; no before/after proof',
    },
    validationOutcome: 'failure', validationStatus: 'rejected', validationJobStatus: 'success', publicationJobStatus: 'skipped',
  };
  assert.equal(shouldNotifySlack(context), false);
  assert.equal(shouldNotifySlack({ ...context, verification: verificationFor(selected, ['failed']) }), true);
  assert.equal(shouldNotifySlack({ ...context, validation: null }), true);
  assert.equal(shouldNotifySlack({ ...context, validation: { status: 'rejected' } }), true);
  assert.equal(shouldNotifySlack({ ...context, validation: { ...context.validation, status: 'failed', kind: 'tooling-or-artifact' }, validationStatus: 'failed' }), true);
  assert.equal(shouldNotifySlack({ ...context, validation: { ...context.validation, kind: 'tooling-or-artifact' } }), true);
  assert.equal(shouldNotifySlack({ ...context, validationJobStatus: 'failure' }), true);
  assert.equal(shouldNotifySlack({ ...context, validationStatus: '' }), true);
  assert.equal(shouldNotifySlack({ ...context, publicationJobStatus: 'success' }), true);
  assert.equal(shouldNotifySlack({ ...context, publication: { status: 'failed' } }), true);
  assert.equal(shouldNotifySlack({ ...context, prUrl: 'https://github.com/neatlogs/neatlogs-typescript/pull/50' }), true);
});

test('failed discovery issue update alerts and points to its failed step', () => {
  const context = {
    status: 'success', changesFound: 'true', report: { changes }, verification: allPass,
    proposalOutcome: 'success', issueUpdateOutcome: 'failure', issueUrl, url: runUrl,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /discovery issue could not be updated with the fix outcome/);
  assert.match(message, /Inspect and retry the failed discovery issue update step/);
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
  const partialScan = slackMessage({ ...context, proposalOutcome: 'failure' });
  assert.match(partialScan, /Review the PR; Gemini requests for other candidates were incomplete/);
});

test('proposal and publication failures explain why no new PR appeared', () => {
  const base = { status: 'success', report: { changes: changes.slice(0, 1) }, verification: verificationFor(changes.slice(0, 1)), url: runUrl };
  const proposalContext = { ...base, proposalOutcome: 'failure' };
  assert.equal(shouldNotifySlack(proposalContext), true);
  assert.match(slackMessage(proposalContext), /AI fix scan incomplete/);
  assert.match(slackMessage(proposalContext), /Bounded smoke probes found no regression; behavior outside those probes remains unverified/);
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
  assert.match(payload.blocks[0].text.text, /AI fix scan incomplete/);
  assert.equal(payload.blocks[2].text.text, '*Checked:* 15/15 passed (bounded smoke probes)');
  assert.equal(payload.blocks[3].text.text, '*Regression:* none found in tested scope');
  assert.equal(payload.blocks[4].text.text, '*Fix PR:* none');
  assert.match(payload.blocks[5].text.text, /Gemini fix proposal failed/);
  assert.match(payload.blocks[6].text.text, /Inspect the failed Gemini proposal step, then retry/);
  assert.match(payload.blocks[7].elements[0].text, /Discovery issue.*Workflow run/);
  assert.match(payload.text, /\*TypeScript SDK:.*\*\n\n\*Checked:/);
  assert.doesNotMatch(payload.text, /\*\*Checked:/);
});

test('incomplete scan names the untested package and malformed Gemini response', () => {
  const selected = [
    ...changes.slice(0, 1),
    { package: '@openai/agents', previouslyAnalyzed: '0.18.0', latest: '0.19.0' },
  ];
  const verification = verificationFor(selected, ['passed', 'not-tested']);
  verification.packages[1].reason = 'no runtime probe configured';
  const message = slackMessage({
    status: 'success', report: { changes: selected }, verification,
    proposalOutcome: 'failure', proposal: { modelNotes: [{
      package: '@openai/agents', error: 'Gemini proposal returned malformed JSON',
    }] },
  });
  assert.match(message, /1 not tested \(@openai\/agents: no runtime probe configured\)/);
  assert.match(message, /@openai\/agents: Gemini proposal returned malformed JSON/);
  assert.match(message, /add a runtime probe for @openai\/agents/);
  assert.match(message, /Regression:\* none found in tested scope/);
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
  assert.match(JSON.parse(sent.options.body).blocks[0].text.text, /AI fix scan incomplete/);
  await assert.rejects(deliverSlackAlert(context, webhook, async () => ({ ok: false, status: 429 })), /Slack webhook returned 429/);
  const noAlert = { ...context, proposalOutcome: 'success' };
  assert.equal(await deliverSlackAlert(noAlert, '', () => { throw new Error('unexpected request'); }), false);
});
