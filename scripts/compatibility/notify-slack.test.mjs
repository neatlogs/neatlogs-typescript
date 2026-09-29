import assert from 'node:assert/strict';
import test from 'node:test';

import { slackMessage } from './notify-slack.mjs';

test('Slack release message contains count, package change, risk, and run link', () => {
  const message = slackMessage({
    status: 'success',
    report: { changes: [{ package: 'ai', previouslyAnalyzed: '6', latest: '7' }] },
    analysis: { riskLevel: 'high' },
    upstreamIssue: { title: 'stream spans stay open', url: 'https://github.com/example/sdk/issues/1' },
    url: 'https://example.test/run',
  });
  assert.match(message, /1 upstream release/);
  assert.match(message, /ai 6 → 7/);
  assert.match(message, /high/);
  assert.match(message, /stream spans stay open/);
  assert.match(message, /github\.com\/example\/sdk\/issues\/1/);
  assert.match(message, /https:\/\/example\.test\/run/);
});

test('Slack failure message does not require a release report', () => {
  assert.match(slackMessage({ status: 'failure', report: null, analysis: null, url: null }), /workflow failed/);
});
