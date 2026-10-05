import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows/compatibility-scheduled.yml'), 'utf8');

function job(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const next = /^  [a-z][a-z_]*:\s*$/gm;
  next.lastIndex = start + `\n  ${name}:\n`.length;
  return workflow.slice(start, next.exec(workflow)?.index ?? workflow.length);
}

test('published upstream code runs only in a read-only job without service secrets', () => {
  const releases = job('releases');
  const verify = job('verify');
  const assess = job('discover');

  assert.match(releases, /contents: read/);
  assert.doesNotMatch(releases, /secrets\.|issues: write|pull-requests: write/);
  assert.match(verify, /needs: releases/);
  assert.match(verify, /contents: read/);
  assert.match(verify, /node scripts\/compatibility\/verify-releases\.mjs/);
  assert.doesNotMatch(verify, /secrets\.|GH_TOKEN:|issues: write|pull-requests: write/);
  assert.match(assess, /needs: \[releases, verify\]/);
  assert.match(assess, /COMPAT_GEMINI_API_KEY: \$\{\{ secrets\.COMPAT_GEMINI_API_KEY \}\}/);
  assert.doesNotMatch(assess, /node scripts\/compatibility\/verify-releases\.mjs/);
  for (const name of ['releases', 'verify', 'discover', 'validate_fix', 'publish_fix']) {
    assert.doesNotMatch(job(name), /cache: npm/, `${name} must not share a writable npm cache across trust boundaries`);
  }
});

test('verification results survive candidate failures and reach issue and Slack reporting', () => {
  const releases = job('releases');
  const verify = job('verify');
  const assess = job('discover');
  const notify = job('notify');

  assert.match(releases, /name: typescript-compatibility-releases/);
  assert.match(verify, /name: typescript-compatibility-releases/);
  assert.match(verify, /verify_outcome: \$\{\{ steps\.verify_releases\.outcome \}\}/);
  assert.match(verify, /continue-on-error: true\s+run: node scripts\/compatibility\/verify-releases\.mjs/);
  assert.match(verify, /name: typescript-compatibility-verification/);
  assert.match(assess, /if: always\(\) && needs\.releases\.outputs\.changes_found == 'true'/);
  assert.match(assess, /name: typescript-compatibility-verification/);
  assert.match(assess, /steps\.download_verification\.outcome == 'success'/);
  assert.match(assess, /- name: Run advisory Gemini impact analysis\s+if:[^\n]+\s+continue-on-error: true/);
  assert.match(assess, /if: always\(\) && needs\.releases\.outputs\.changes_found == 'true'\s+uses: actions\/github-script@v7/);
  assert.match(notify, /needs: \[releases, verify, discover, validate_fix, publish_fix\]/);
  assert.match(notify, /needs\.verify\.result == 'failure'/);
  assert.match(notify, /needs\.verify\.outputs\.verify_outcome == 'failure'/);
  assert.match(notify, /- name: Notify Slack of release and fix outcome\s+id: slack\s+env:/);
  assert.doesNotMatch(notify, /- name: Notify Slack of release and fix outcome\s+continue-on-error: true/);
  assert.match(notify, /- name: Fail run for candidate regression or fix automation failure\s+if: always\(\)/);
  assert.match(notify, /needs\.discover\.outputs\.proposal_outcome == 'failure'/);
  assert.match(notify, /needs\.validate_fix\.outputs\.validation_outcome == 'failure' && steps\.slack\.outputs\.safe_rejected != 'true'/);
  assert.doesNotMatch(notify, /advisory_outcome|llm_analysis\.outcome/);
});

test('generated code and PR credentials stay in separate jobs', () => {
  const validate = job('validate_fix');
  const publish = job('publish_fix');

  assert.match(validate, /contents: read/);
  assert.doesNotMatch(validate, /COMPAT_GEMINI_API_KEY|COMPAT_PR_TOKEN|pull-requests: write/);
  assert.match(publish, /contents: write/);
  assert.match(publish, /pull-requests: write/);
  assert.match(publish, /secrets\.COMPAT_PR_TOKEN \|\| github\.token/);
  assert.doesNotMatch(publish, /npm (?:test|run)|vitest|node scripts\/compatibility\/validate-fix\.mjs/);
});
