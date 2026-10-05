import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('Gemini proposal HTTP errors produce a failed step and a reviewable artifact', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'neatlogs-proposal-failure-')));
  const scripts = join(root, 'scripts/compatibility');
  try {
    mkdirSync(scripts, { recursive: true });
    for (const name of ['propose-fix.mjs', 'publish-fix.mjs', 'validate-fix.mjs']) {
      copyFileSync(join(sourceRoot, 'scripts/compatibility', name), join(scripts, name));
    }
    writeFileSync(join(root, 'mock-fetch.mjs'), "globalThis.fetch = async () => ({ ok: false, status: 503 });\n");
    writeFileSync(join(root, 'compatibility-release-report.json'), JSON.stringify({ changes: [
      { package: 'openai', previouslyAnalyzed: '1.0.0', latest: '2.0.0' },
    ] }));
    writeFileSync(join(root, 'compatibility-verification.json'), JSON.stringify({ packages: [
      { package: 'openai', status: 'passed' },
    ] }));
    writeFileSync(join(root, 'compatibility-evidence.json'), JSON.stringify({ packages: [
      { package: 'openai', integrations: [{ adapterSource: [{ path: 'src/openai.ts', content: 'adapter code' }] }] },
    ] }));
    writeFileSync(join(root, 'compatibility-existing-prs.json'), '[]');
    const githubOutput = join(root, 'github-output');
    const run = spawnSync(process.execPath, [
      '--import', join(root, 'mock-fetch.mjs'), join(scripts, 'propose-fix.mjs'),
    ], { cwd: root, encoding: 'utf8', env: {
      ...process.env, COMPAT_GEMINI_API_KEY: 'fixture-key', GITHUB_RUN_NUMBER: '0',
      GITHUB_SHA: 'fixture-sha', GITHUB_OUTPUT: githubOutput,
    } });
    assert.equal(run.status, 1, run.stderr);
    const artifact = JSON.parse(readFileSync(join(root, 'compatibility-fix-proposal.json'), 'utf8'));
    assert.equal(artifact.decision, 'review_only');
    assert.match(artifact.reason, /Gemini fix proposal failed for 1 request/);
    assert.match(artifact.modelNotes[0].error, /HTTP 503/);
    assert.match(readFileSync(githubOutput, 'utf8'), /proposal_ready=false/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing Gemini key marks the required fix scan incomplete and fails visibly', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'neatlogs-proposal-no-key-')));
  const scripts = join(root, 'scripts/compatibility');
  try {
    mkdirSync(scripts, { recursive: true });
    for (const name of ['propose-fix.mjs', 'publish-fix.mjs', 'validate-fix.mjs']) {
      copyFileSync(join(sourceRoot, 'scripts/compatibility', name), join(scripts, name));
    }
    writeFileSync(join(root, 'compatibility-release-report.json'), JSON.stringify({ changes: [
      { package: 'openai', previouslyAnalyzed: '1.0.0', latest: '2.0.0' },
    ] }));
    writeFileSync(join(root, 'compatibility-verification.json'), JSON.stringify({ packages: [
      { package: 'openai', status: 'passed' },
    ] }));
    writeFileSync(join(root, 'compatibility-existing-prs.json'), '[]');
    const githubOutput = join(root, 'github-output');
    const run = spawnSync(process.execPath, [join(scripts, 'propose-fix.mjs')], {
      cwd: root, encoding: 'utf8', env: {
        ...process.env, COMPAT_GEMINI_API_KEY: '', GITHUB_RUN_NUMBER: '0',
        GITHUB_SHA: 'fixture-sha', GITHUB_OUTPUT: githubOutput,
      },
    });
    assert.equal(run.status, 1, run.stderr);
    const artifact = JSON.parse(readFileSync(join(root, 'compatibility-fix-proposal.json'), 'utf8'));
    assert.equal(artifact.decision, 'review_only');
    assert.match(artifact.reason, /Gemini API key is not configured; no automated fix proposal was generated/);
    assert.match(artifact.modelNotes[0].error, /fix proposal scan did not run/);
    assert.match(readFileSync(githubOutput, 'utf8'), /proposal_ready=false/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
