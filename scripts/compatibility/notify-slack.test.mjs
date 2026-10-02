import assert from 'node:assert/strict';
import test from 'node:test';

import { slackMessage } from './notify-slack.mjs';

test('Slack release message distinguishes advisory risk from a confirmed regression and links the issue and run', () => {
  const message = slackMessage({
    status: 'success',
    report: { changes: [{ package: 'ai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: { riskLevel: 'high' },
    verification: { counts: { passed: 1, failed: 0, blocked: 0, 'not-tested': 0 } },
    upstreamIssue: { title: 'stream spans stay open', url: 'https://github.com/example/sdk/issues/1' },
    issueUrl: 'https://github.com/neatlogs/neatlogs-typescript/issues/46',
    url: 'https://example.test/run',
  });
  assert.match(message, /1 watched package has a version newer than the recorded baseline/);
  assert.match(message, /ai 6 → 7/);
  assert.match(message, /high/);
  assert.match(message, /1 passed, 0 candidate regressions/);
  assert.match(message, /Gemini advisory: \*high potential risk\* \(unverified/);
  assert.match(message, /not full SDK compatibility/);
  assert.match(message, /github\.com\/neatlogs\/neatlogs-typescript\/issues\/46/);
  assert.match(message, /stream spans stay open/);
  assert.match(message, /github\.com\/example\/sdk\/issues\/1/);
  assert.match(message, /https:\/\/example\.test\/run/);
});

test('Slack failure message does not require a release report', () => {
  const message = slackMessage({ status: 'failure', report: null, analysis: null, url: 'https://github.com/neatlogs/neatlogs-typescript/actions/runs/36571240360' });
  assert.match(message, /workflow failed/);
  assert.match(message, /github\.com\/neatlogs\/neatlogs-typescript\/actions\/runs\/36571240360/);
  assert.doesNotMatch(message, /github\.com\/neatlogs\/neatlogs-typescript\/36571240360>/);
});

test('Slack distinguishes skipped Gemini analysis from a malformed-response failure', () => {
  const message = slackMessage({ status: 'success', report: { changes: [] }, analysis: { skipped: true }, url: null });
  assert.match(message, /Gemini advisory skipped: API key is not configured/);
  assert.doesNotMatch(message, /Advisory risk: \*undefined\*/);
  const failed = slackMessage({
    status: 'success', report: { changes: [] },
    analysis: { unavailable: true, reason: 'Gemini advisory returned malformed JSON.' },
    advisoryOutcome: 'failure',
    issueUrl: 'https://github.com/neatlogs/neatlogs-typescript/issues/46',
    url: 'https://github.com/neatlogs/neatlogs-typescript/actions/runs/36974184056',
  });
  assert.match(failed, /Gemini advisory failed: Gemini advisory returned malformed JSON/);
  assert.match(failed, /issues\/46/);
  assert.match(failed, /actions\/runs\/36974184056/);
  assert.doesNotMatch(failed, /high potential risk/);
});

test('Slack release message limits the package examples to three', () => {
  const changes = Array.from({ length: 15 }, (_, index) => ({ package: `package-${index}`, latest: '2' }));
  const message = slackMessage({ status: 'success', report: { changes }, analysis: { riskLevel: 'high' }, url: null });
  assert.match(message, /package-0/);
  assert.match(message, /package-2/);
  assert.doesNotMatch(message, /package-3/);
  assert.match(message, /\+12 more/);
});

test('Slack calls a baseline-pass latest-fail smoke probe a candidate regression', () => {
  const message = slackMessage({
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: { riskLevel: 'low' },
    verification: { counts: { passed: 0, failed: 1, blocked: 0, 'not-tested': 0 } },
    url: null,
  });
  assert.match(message, /^:red_circle:/);
  assert.match(message, /Deterministic smoke check: 1 candidate SDK regression/);
  assert.match(message, /recorded baseline passed; detected version failed/);
  assert.match(message, /low potential risk/);
});

test('Slack marks a verifier crash as a workflow failure even before the final failure step', () => {
  const message = slackMessage({
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: null,
    verificationOutcome: 'failure',
    url: 'https://example.test/run',
  });
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
  const published = slackMessage({ ...base, validation: { status: 'validated' }, publication: { status: 'created', url: 'https://github.com/neatlogs/neatlogs-typescript/pull/50' } });
  assert.match(published, /patch passed local patch and test validation/);
  assert.match(published, /open ready-for-review PR/);
  assert.match(published, /pull\/50/);
  assert.match(published, /https:\/\/example\.test\/run/);
  assert.doesNotMatch(published, /draft PR/);
  const rejected = slackMessage({ ...base, validation: { status: 'rejected' }, validationOutcome: 'failure' });
  assert.match(rejected, /^:red_circle:/);
  assert.match(rejected, /patch failed validation or tests/);
  const unpublished = slackMessage({ ...base, validation: { status: 'validated' }, publicationOutcome: 'failure' });
  assert.match(unpublished, /PR publication failed after patch validation/);
  assert.match(unpublished, /https:\/\/example\.test\/run/);
  assert.doesNotMatch(unpublished, /candidate regressions, 1 blocked/);
  const unverifiedExisting = slackMessage({
    ...base,
    validation: { status: 'validated' },
    publication: { status: 'existing_unverified', priorPrUrl: 'https://github.com/neatlogs/neatlogs-typescript/pull/51', existingWasDraft: true },
  });
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
  const proposalFailed = slackMessage({ ...base, proposal: { decision: 'review_only' }, proposalOutcome: 'failure' });
  assert.match(proposalFailed, /^:red_circle:/);
  assert.match(proposalFailed, /Gemini fix proposal failed/);
  assert.match(proposalFailed, /actions\/runs\/123/);
  const validationSkipped = slackMessage({ ...base, proposalReady: 'true', validationJobStatus: 'skipped' });
  assert.match(validationSkipped, /^:red_circle:/);
  assert.match(validationSkipped, /patch validation was unexpectedly skipped/);
});

test('Slack reports prior PR lookup failure without implying an SDK regression', () => {
  const message = slackMessage({
    status: 'success',
    report: { changes: [{ package: 'openai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: { riskLevel: 'high' },
    verification: { counts: { passed: 1, failed: 0, blocked: 0, 'not-tested': 0 } },
    priorPrsOutcome: 'failure',
    url: null,
  });
  assert.match(message, /^:red_circle:/);
  assert.match(message, /Fix automation failed to look up prior PRs/);
  assert.match(message, /0 candidate regressions/);
});
