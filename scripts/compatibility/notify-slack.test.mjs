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
  assert.match(message, /high potential compatibility risk\* \(unverified\)/);
  assert.match(message, /not full SDK compatibility/);
  assert.match(message, /github\.com\/neatlogs\/neatlogs-typescript\/issues\/46/);
  assert.match(message, /stream spans stay open/);
  assert.match(message, /github\.com\/example\/sdk\/issues\/1/);
  assert.match(message, /https:\/\/example\.test\/run/);
});

test('Slack failure message does not require a release report', () => {
  assert.match(slackMessage({ status: 'failure', report: null, analysis: null, url: null }), /workflow failed/);
});

test('Slack release message says when the Gemini analysis is unavailable', () => {
  const message = slackMessage({ status: 'success', report: { changes: [] }, analysis: { skipped: true }, url: null });
  assert.match(message, /Gemini impact analysis unavailable/);
  assert.doesNotMatch(message, /Advisory risk: \*undefined\*/);
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
  assert.match(message, /1 candidate regressions/);
  assert.match(message, /low potential compatibility risk/);
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
