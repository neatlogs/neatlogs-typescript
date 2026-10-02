import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldNotifySlack, slackMessage } from './notify-slack.mjs';

test('high Gemini advisory with passing smoke checks and no fix does not send a routine release alert', () => {
  const context = {
    status: 'success',
    changesFound: 'true',
    report: { changes: Array.from({ length: 15 }, (_, index) => ({ package: `package-${index}`, previouslyAnalyzed: '1', latest: '2' })) },
    analysis: { riskLevel: 'high' },
    verification: { counts: { passed: 15, failed: 0, blocked: 0, 'not-tested': 0 } },
    proposal: { decision: 'review_only' },
  };
  assert.equal(shouldNotifySlack(context), false);
  assert.equal(shouldNotifySlack({ status: 'success', changesFound: 'false', report: { changes: [] } }), false);
});

test('Slack failure message does not require a release report', () => {
  const context = { status: 'failure', report: null, analysis: null, url: 'https://github.com/neatlogs/neatlogs-typescript/actions/runs/36571240360' };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /workflow failed/);
  assert.match(message, /github\.com\/neatlogs\/neatlogs-typescript\/actions\/runs\/36571240360/);
  assert.doesNotMatch(message, /github\.com\/neatlogs\/neatlogs-typescript\/36571240360>/);
});

test('Slack distinguishes skipped Gemini analysis from a malformed-response failure', () => {
  const skipped = {
    status: 'success', changesFound: 'true',
    report: { changes: Array.from({ length: 15 }, (_, index) => ({ package: `package-${index}`, latest: '2' })) },
    analysis: { skipped: true }, verification: { counts: { passed: 15, failed: 0, blocked: 0, 'not-tested': 0 } },
    proposal: { decision: 'review_only' }, url: null,
  };
  assert.equal(shouldNotifySlack(skipped), false);
  const message = slackMessage(skipped);
  assert.match(message, /Gemini advisory skipped: API key is not configured/);
  assert.doesNotMatch(message, /Advisory risk: \*undefined\*/);
  const failedContext = {
    ...skipped,
    analysis: { unavailable: true, reason: 'Gemini advisory returned malformed JSON.' },
    advisoryOutcome: 'failure',
    issueUrl: 'https://github.com/neatlogs/neatlogs-typescript/issues/46',
    url: 'https://github.com/neatlogs/neatlogs-typescript/actions/runs/36974184056',
  };
  assert.equal(shouldNotifySlack(failedContext), true);
  const failed = slackMessage(failedContext);
  assert.match(failed, /compatibility scan incomplete/);
  assert.match(failed, /15 passed, 0 candidate regressions/);
  assert.match(failed, /Gemini advisory failed: Gemini advisory returned malformed JSON/);
  assert.match(failed, /issues\/46/);
  assert.match(failed, /actions\/runs\/36974184056/);
  assert.doesNotMatch(failed, /high potential risk/);
  assert.doesNotMatch(failed, /release review required/i);
  assert.match(failed, /No SDK patch was selected for validation; no PR was opened/);
});

test('Slack release message limits the package examples to three', () => {
  const changes = Array.from({ length: 15 }, (_, index) => ({ package: `package-${index}`, latest: '2' }));
  const context = { status: 'success', changesFound: 'true', report: { changes }, analysis: { unavailable: true, reason: 'Gemini advisory returned malformed JSON.' }, url: null };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /package-0/);
  assert.match(message, /package-2/);
  assert.doesNotMatch(message, /package-3/);
  assert.match(message, /\+12 more/);
});

test('Slack calls a baseline-pass latest-fail smoke probe a candidate regression', () => {
  const context = {
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: { riskLevel: 'low' },
    verification: { counts: { passed: 0, failed: 1, blocked: 0, 'not-tested': 0 } },
    url: null,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /^:red_circle:/);
  assert.match(message, /Deterministic smoke check: 1 candidate SDK regression/);
  assert.match(message, /recorded baseline passed; detected version failed/);
  assert.match(message, /low potential risk/);
});

test('Slack marks a verifier crash as a workflow failure even before the final failure step', () => {
  const context = {
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: null,
    verificationOutcome: 'failure',
    url: 'https://example.test/run',
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /^:red_circle:/);
  assert.match(message, /failed before producing a report/);
});

test('Slack distinguishes validated review PR from validation and publication failures', () => {
  const base = {
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    verification: { counts: { passed: 1, failed: 0, blocked: 0, 'not-tested': 0 } },
    analysis: { riskLevel: 'high' },
    url: 'https://example.test/run',
  };
  const publishedContext = { ...base, validation: { status: 'validated', postPatchSmoke: {
    package: 'openai', latestVersion: '7', latestStatus: 'passed', scope: 'client construction and SDK wrapping',
  } }, publication: { status: 'created', url: 'https://github.com/neatlogs/neatlogs-typescript/pull/50' } };
  assert.equal(shouldNotifySlack(publishedContext), true);
  const published = slackMessage(publishedContext);
  assert.match(published, /fix ready for code review/);
  assert.match(published, /patch passed local patch and test validation/);
  assert.match(published, /open ready-for-review PR/);
  assert.match(published, /bounded client construction and SDK wrapping smoke probe against openai@7/);
  assert.match(published, /pull\/50/);
  assert.match(published, /https:\/\/example\.test\/run/);
  assert.doesNotMatch(published, /draft PR/);
  const partialProposal = slackMessage({ ...publishedContext, proposalOutcome: 'failure' });
  assert.match(partialProposal, /proposal requests for other candidates were incomplete/);
  const blockedSmoke = slackMessage({ ...publishedContext, validation: { status: 'validated', postPatchSmoke: {
    package: 'openai', latestVersion: '7', latestStatus: 'blocked', scope: 'client construction and SDK wrapping',
  } } });
  assert.match(blockedSmoke, /recorded baseline was not advanced/);
  const rejectedContext = { ...base, validation: { status: 'rejected' }, validationOutcome: 'failure' };
  assert.equal(shouldNotifySlack(rejectedContext), true);
  const rejected = slackMessage(rejectedContext);
  assert.match(rejected, /^:red_circle:/);
  assert.match(rejected, /patch failed validation or tests/);
  const unpublishedContext = { ...base, validation: { status: 'validated' }, publicationOutcome: 'failure' };
  assert.equal(shouldNotifySlack(unpublishedContext), true);
  const unpublished = slackMessage(unpublishedContext);
  assert.match(unpublished, /PR publication failed after patch validation/);
  assert.match(unpublished, /https:\/\/example\.test\/run/);
  assert.doesNotMatch(unpublished, /candidate regressions, 1 blocked/);
  const unverifiedExistingContext = {
    ...base,
    validation: { status: 'validated' },
    publication: { status: 'existing_unverified', priorPrUrl: 'https://github.com/neatlogs/neatlogs-typescript/pull/51', existingWasDraft: true },
  };
  assert.equal(shouldNotifySlack(unverifiedExistingContext), true);
  const unverifiedExisting = slackMessage(unverifiedExistingContext);
  assert.match(unverifiedExisting, /existing PR> lacks verified bot provenance/);
  assert.match(unverifiedExisting, /left unchanged as a draft/);
  assert.doesNotMatch(unverifiedExisting, /Validated SDK fix:/);
});

test('Slack reports a failed Gemini proposal and skipped patch validation as automation failures', () => {
  const base = {
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    verification: { counts: { passed: 1, failed: 0, blocked: 0, 'not-tested': 0 } },
    url: 'https://github.com/neatlogs/neatlogs-typescript/actions/runs/123',
  };
  const proposalFailedContext = { ...base, proposal: { decision: 'review_only' }, proposalOutcome: 'failure' };
  assert.equal(shouldNotifySlack(proposalFailedContext), true);
  const proposalFailed = slackMessage(proposalFailedContext);
  assert.match(proposalFailed, /^:red_circle:/);
  assert.match(proposalFailed, /Gemini fix proposal failed/);
  assert.match(proposalFailed, /actions\/runs\/123/);
  const validationSkippedContext = { ...base, proposalReady: 'true', validationJobStatus: 'skipped' };
  assert.equal(shouldNotifySlack(validationSkippedContext), true);
  const validationSkipped = slackMessage(validationSkippedContext);
  assert.match(validationSkipped, /^:red_circle:/);
  assert.match(validationSkipped, /patch validation was unexpectedly skipped/);
});

test('Slack reports prior PR lookup failure without implying an SDK regression', () => {
  const context = {
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: { riskLevel: 'high' },
    verification: { counts: { passed: 1, failed: 0, blocked: 0, 'not-tested': 0 } },
    priorPrsOutcome: 'failure',
    url: null,
  };
  assert.equal(shouldNotifySlack(context), true);
  const message = slackMessage(context);
  assert.match(message, /^:red_circle:/);
  assert.match(message, /Fix automation failed to look up prior PRs/);
  assert.match(message, /0 candidate regressions/);
});

test('blocked or untested version probes alert as an incomplete scan', () => {
  const base = { status: 'success', changesFound: 'true', report: { changes: [{ package: 'openai', latest: '7' }] }, analysis: { riskLevel: 'low' } };
  for (const counts of [
    { passed: 0, failed: 0, blocked: 1, 'not-tested': 0 },
    { passed: 0, failed: 0, blocked: 0, 'not-tested': 1 },
  ]) {
    const context = { ...base, verification: { counts } };
    assert.equal(shouldNotifySlack(context), true);
    assert.match(slackMessage(context), /compatibility scan incomplete/);
  }
});
