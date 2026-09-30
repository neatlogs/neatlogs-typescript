import assert from 'node:assert/strict';
import test from 'node:test';

import { slackMessage } from './notify-slack.mjs';

test('Slack release message distinguishes advisory risk from a confirmed regression and links the issue and run', () => {
  const message = slackMessage({
    status: 'success',
    report: { changes: [{ package: 'ai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: { riskLevel: 'high' },
    upstreamIssue: { title: 'stream spans stay open', url: 'https://github.com/example/sdk/issues/1' },
    issueUrl: 'https://github.com/neatlogs/neatlogs-typescript/issues/46',
    url: 'https://example.test/run',
  });
  assert.match(message, /1 watched package has a version newer than the recorded baseline/);
  assert.match(message, /ai 6 → 7/);
  assert.match(message, /high/);
  assert.match(message, /no regression is confirmed/);
  assert.match(message, /high potential compatibility risk\* \(unverified\)/);
  assert.match(message, /This workflow did not test the SDK against these versions/);
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
