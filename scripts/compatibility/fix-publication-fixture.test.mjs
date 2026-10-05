import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function command(cwd, executable, args, env = process.env) {
  return execFileSync(executable, args, { cwd, env, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }).trim();
}

test('a focused regression fixture validates a patch, checks the published version, and recovers PR publication', { timeout: 90_000 }, () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'neatlogs-compat-fix-fixture-')));
  const repo = join(root, 'repo');
  const remote = join(root, 'remote.git');
  const scripts = join(repo, 'scripts/compatibility');
  const bin = join(root, 'bin');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GH_TOKEN: 'fixture-token',
    GITHUB_REPOSITORY: 'neatlogs/fixture',
    GITHUB_SERVER_URL: 'https://github.test',
    GITHUB_RUN_ID: '123',
    COMPAT_BASE_BRANCH: 'main',
    COMPAT_DISCOVERY_ISSUE_URL: 'https://github.test/neatlogs/fixture/issues/1',
    GITHUB_OUTPUT: join(root, 'github-output'),
  };
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    mkdirSync(join(repo, 'tests/unit'), { recursive: true });
    mkdirSync(join(repo, '.compatibility'), { recursive: true });
    mkdirSync(scripts, { recursive: true });
    mkdirSync(bin);
    for (const name of ['validate-fix.mjs', 'publish-fix.mjs']) {
      copyFileSync(join(sourceRoot, 'scripts/compatibility', name), join(scripts, name));
    }
    const verifierPath = join(scripts, 'verify-releases.mjs');
    function writeVerifier(status) {
      writeFileSync(verifierPath, [
        "import { readFileSync, writeFileSync } from 'node:fs';",
        "const report = JSON.parse(readFileSync('compatibility-fix-release-report.json', 'utf8'));",
        "if (report.changes.length !== 1 || report.changes[0].package !== 'openai') process.exit(1);",
        "if (!readFileSync('dist/openai.js', 'utf8').includes(\"value === 'new'\")) process.exit(1);",
        'const change = report.changes[0];',
        `const status = ${JSON.stringify(status)};`,
        "const counts = { passed: 0, failed: 0, blocked: 0, 'not-tested': 0 }; counts[status] = 1;",
        "writeFileSync('compatibility-fix-verification.json', JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), counts, packages: [{ package: change.package, baselineVersion: change.previouslyAnalyzed, latestVersion: change.latest, status, baseline: { status: 'passed' }, latest: { status }, scope: 'fixture runtime response mapping' }] }));",
        '',
      ].join('\n'));
    }
    writeVerifier('passed');
    symlinkSync(join(sourceRoot, 'node_modules'), join(repo, 'node_modules'));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({
      name: 'compat-fix-fixture', private: true, type: 'module',
      scripts: {
        build: 'tsc --moduleResolution bundler --module esnext --target es2022 --outDir dist src/openai.ts',
        lint: 'tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2022 src/openai.ts tests/unit/openai.test.ts',
        test: 'vitest run',
      },
    }));
    const sourcePath = join(repo, 'src/openai.ts');
    const testPath = join(repo, 'tests/unit/openai.test.ts');
    writeFileSync(sourcePath, "export function mapResponse(value: string): string { return value; }\n");
    writeFileSync(testPath, [
      "import { expect, test } from 'vitest';",
      "import { mapResponse } from '../../src/openai';",
      "test('preserves old response', () => expect(mapResponse('old')).toBe('old'));",
      '',
    ].join('\n'));
    writeFileSync(join(repo, '.compatibility/versions.lock.json'), `${JSON.stringify({ schemaVersion: 1, packages: { openai: '1.0.0' } }, null, 2)}\n`);
    command(root, 'git', ['init', '--bare', remote], env);
    command(repo, 'git', ['init', '--initial-branch=main'], env);
    command(repo, 'git', ['config', 'user.name', 'Fixture'], env);
    command(repo, 'git', ['config', 'user.email', 'fixture@example.test'], env);
    command(repo, 'git', ['add', 'package.json', 'src/openai.ts', 'tests/unit/openai.test.ts', '.compatibility/versions.lock.json'], env);
    command(repo, 'git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture baseline'], env);
    command(repo, 'git', ['remote', 'add', 'origin', remote], env);
    const baseSha = command(repo, 'git', ['rev-parse', 'HEAD'], env);

    writeFileSync(sourcePath, "export function mapResponse(value: string): string { return value === 'new' ? 'old' : value; }\n");
    writeFileSync(testPath, [
      "import { expect, test } from 'vitest';",
      "import { mapResponse } from '../../src/openai';",
      "test('preserves old response', () => expect(mapResponse('old')).toBe('old'));",
      "test('adapts new response', () => expect(mapResponse('new')).toBe('old'));",
      '',
    ].join('\n'));
    const patch = command(repo, 'git', ['diff', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env) + '\n';
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    writeFileSync(join(repo, 'compatibility-fix-proposal.json'), JSON.stringify({
      decision: 'propose_fix', package: 'openai', adapterPath: 'src/openai.ts',
      upstreamReference: 'upstream/responses.ts', baseSha,
      reason: 'The new upstream response value needs an adapter mapping to preserve the old SDK contract.',
      evidence: 'The upstream response declaration now includes the new value consumed by this adapter.',
      patch,
    }));
    writeFileSync(join(repo, 'compatibility-evidence.json'), JSON.stringify({ packages: [{
      package: 'openai', integrations: [{ adapterSource: [{ path: 'src/openai.ts' }] }],
      sourceContentChanges: [{ path: 'upstream/responses.ts' }],
    }] }));
    writeFileSync(join(repo, 'compatibility-release-report.json'), JSON.stringify({ changes: [
      { package: 'openai', previouslyAnalyzed: '1.0.0', latest: '2.0.0' },
    ] }));
    writeFileSync(join(repo, 'compatibility-verification.json'), JSON.stringify({
      schemaVersion: 1, counts: { passed: 1, failed: 0, blocked: 0, 'not-tested': 0 },
      packages: [{ package: 'openai', baselineVersion: '1.0.0', latestVersion: '2.0.0', status: 'passed',
        baseline: { status: 'passed' }, latest: { status: 'passed' } }],
    }));
    const originalVerification = readFileSync(join(repo, 'compatibility-verification.json'), 'utf8');
    writeFileSync(env.GITHUB_OUTPUT, '');

    const validationLog = command(repo, process.execPath, [join(scripts, 'validate-fix.mjs')], env);
    assert.ok(existsSync(join(repo, 'compatibility-fix-validation.json')), `Validator did not write a report: ${validationLog}`);
    const validation = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(validation.status, 'validated');
    assert.equal(validation.baselineTargetedTest, 'failed');
    assert.equal(validation.regressionProof, 'targeted-test-red-green');
    assert.deepEqual(validation.checks, ['lint', 'targeted-test', 'test', 'post-patch-build', 'post-patch-published-version-smoke']);
    assert.equal(validation.postPatchSmoke.latestStatus, 'passed');
    assert.equal(validation.postPatchSmoke.baselineStatus, 'passed');
    assert.equal(validation.postPatchSmoke.latestVersion, '2.0.0');
    const successfulValidation = readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8');
    const successfulProposal = readFileSync(join(repo, 'compatibility-fix-proposal.json'), 'utf8');
    const missingTool = spawnSync(process.execPath, [join(scripts, 'validate-fix.mjs')], {
      cwd: repo, encoding: 'utf8', env: { ...env, PATH: bin },
    });
    assert.equal(missingTool.status, 1, missingTool.stderr);
    const missingToolReport = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(missingToolReport.status, 'failed');
    assert.equal(missingToolReport.kind, 'tooling-or-artifact');
    assert.match(missingToolReport.reason, /spawn git ENOENT/);
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    const npmFixture = join(bin, 'npm');
    writeFileSync(npmFixture, '#!/bin/sh\nexit 73\n');
    chmodSync(npmFixture, 0o755);
    const failedNpm = spawnSync(process.execPath, [join(scripts, 'validate-fix.mjs')], { cwd: repo, encoding: 'utf8', env });
    assert.equal(failedNpm.status, 1, failedNpm.stderr);
    const failedNpmReport = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(failedNpmReport.status, 'failed');
    assert.equal(failedNpmReport.kind, 'tooling-or-artifact');
    rmSync(npmFixture);
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    const evidenceFile = join(repo, 'compatibility-evidence.json');
    const validEvidence = readFileSync(evidenceFile, 'utf8');
    writeFileSync(evidenceFile, JSON.stringify({ packages: [{ package: 'openai', integrations: {} }] }));
    const badEvidence = spawnSync(process.execPath, [join(scripts, 'validate-fix.mjs')], { cwd: repo, encoding: 'utf8', env });
    assert.equal(badEvidence.status, 1, badEvidence.stderr);
    const badEvidenceReport = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(badEvidenceReport.status, 'failed');
    assert.equal(badEvidenceReport.kind, 'tooling-or-artifact');
    assert.match(badEvidenceReport.reason, /evidence artifact is missing or malformed/);
    writeFileSync(evidenceFile, validEvidence);
    writeFileSync(sourcePath, "export function mapResponse(value: string): string { return value === 'new' ? 'old' : value; }\n");
    writeFileSync(testPath, [
      "import { expect, test } from 'vitest';",
      "import { mapResponse } from '../../src/openai';",
      "test('preserves old response', () => expect(mapResponse('old')).toBe('old'));",
      "test('also preserves another old response', () => expect(mapResponse('older')).toBe('older'));",
      '',
    ].join('\n'));
    const unprovenPatch = command(repo, 'git', ['diff', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env) + '\n';
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    writeFileSync(join(repo, 'compatibility-fix-proposal.json'), JSON.stringify({
      ...JSON.parse(successfulProposal), patch: unprovenPatch,
    }));
    const unproven = spawnSync(process.execPath, [join(scripts, 'validate-fix.mjs')], { cwd: repo, encoding: 'utf8', env });
    assert.equal(unproven.status, 1, unproven.stderr);
    const unprovenReport = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(unprovenReport.status, 'rejected');
    assert.equal(unprovenReport.kind, 'proposal-gate');
    assert.equal(unprovenReport.baselineTargetedTest, 'passed');
    assert.match(unprovenReport.reason, /No before\/after regression proof/);
    const smokeRegression = JSON.parse(originalVerification);
    smokeRegression.counts = { passed: 0, failed: 1, blocked: 0, 'not-tested': 0 };
    smokeRegression.packages[0].status = 'failed';
    smokeRegression.packages[0].latest.status = 'failed';
    writeFileSync(join(repo, 'compatibility-verification.json'), JSON.stringify(smokeRegression));
    command(repo, process.execPath, [join(scripts, 'validate-fix.mjs')], env);
    const smokeValidated = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(smokeValidated.status, 'validated');
    assert.equal(smokeValidated.baselineTargetedTest, 'passed');
    assert.equal(smokeValidated.regressionProof, 'baseline-latest-smoke');
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    writeFileSync(join(repo, 'compatibility-verification.json'), originalVerification);
    writeFileSync(join(repo, 'compatibility-fix-proposal.json'), successfulProposal);
    for (const status of ['blocked', 'not-tested']) {
      command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
      writeVerifier(status);
      const rejected = spawnSync(process.execPath, [join(scripts, 'validate-fix.mjs')], { cwd: repo, encoding: 'utf8', env });
      assert.equal(rejected.status, 1, rejected.stderr);
      const report = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
      assert.equal(report.status, 'rejected');
      assert.equal(report.kind, 'proposal-gate');
      assert.equal(report.postPatchSmoke.latestStatus, status);
    }
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    writeFileSync(verifierPath, 'process.exit(2);\n');
    writeFileSync(join(repo, 'compatibility-fix-verification.json'), successfulValidation);
    const stale = spawnSync(process.execPath, [join(scripts, 'validate-fix.mjs')], { cwd: repo, encoding: 'utf8', env });
    assert.equal(stale.status, 1, stale.stderr);
    const staleReport = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(staleReport.status, 'failed');
    assert.equal(staleReport.kind, 'tooling-or-artifact');
    assert.match(staleReport.reason, /did not produce a report/);
    writeVerifier('passed');
    writeFileSync(join(repo, 'compatibility-fix-validation.json'), successfulValidation);

    const forgedValidation = { ...JSON.parse(successfulValidation), baselineTargetedTest: 'passed' };
    writeFileSync(join(repo, 'compatibility-fix-validation.json'), JSON.stringify(forgedValidation));
    const unprovenPublication = spawnSync(process.execPath, [join(scripts, 'publish-fix.mjs')], { cwd: repo, encoding: 'utf8', env });
    assert.equal(unprovenPublication.status, 1, unprovenPublication.stderr);
    assert.match(JSON.parse(readFileSync(join(repo, 'compatibility-fix-publication.json'), 'utf8')).reason, /lacks matching before\/after regression proof/);
    writeFileSync(join(repo, 'compatibility-fix-validation.json'), successfulValidation);

    const gh = join(bin, 'gh');
    writeFileSync(gh, [
      '#!/bin/sh',
      'case "$1 $2" in',
      '  "pr list") printf "[]\\n" ;;',
      '  "auth setup-git") exit 0 ;;',
      '  "pr create") if [ "$COMPAT_FIXTURE_FAIL_PR_CREATE" = 1 ]; then exit 1; fi; printf "https://github.test/neatlogs/fixture/pull/2\\n" ;;',
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'));
    chmodSync(gh, 0o755);
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    const failedPublication = spawnSync(process.execPath, [join(scripts, 'publish-fix.mjs')], {
      cwd: repo, encoding: 'utf8', env: { ...env, COMPAT_FIXTURE_FAIL_PR_CREATE: '1' },
    });
    assert.equal(failedPublication.status, 1, failedPublication.stderr);
    const firstPublication = JSON.parse(readFileSync(join(repo, 'compatibility-fix-publication.json'), 'utf8'));
    assert.equal(firstPublication.status, 'failed');
    assert.equal(command(root, 'git', ['--git-dir', remote, 'rev-parse', 'refs/heads/compat/ts-openai-2-0-0'], env).length, 40);
    command(repo, 'git', ['switch', '--quiet', 'main'], env);
    command(repo, process.execPath, [join(scripts, 'publish-fix.mjs')], env);
    const publication = JSON.parse(readFileSync(join(repo, 'compatibility-fix-publication.json'), 'utf8'));
    assert.equal(publication.status, 'created');
    assert.equal(publication.recoveredBranch, true);
    assert.equal(publication.url, 'https://github.test/neatlogs/fixture/pull/2');
    assert.equal(command(root, 'git', ['--git-dir', remote, 'rev-parse', 'refs/heads/compat/ts-openai-2-0-0'], env).length, 40);
    const publishedLock = JSON.parse(command(root, 'git', ['--git-dir', remote, 'show', 'refs/heads/compat/ts-openai-2-0-0:.compatibility/versions.lock.json'], env));
    assert.equal(publishedLock.packages.openai, '2.0.0');
    assert.match(readFileSync(join(repo, 'compatibility-fix-pr-body.md'), 'utf8'), /ready for human code review/);
    const jobOutputs = readFileSync(env.GITHUB_OUTPUT, 'utf8');
    assert.match(jobOutputs, /validated=true\nvalidation_status=validated\n/);
    assert.match(jobOutputs, /pr_url=https:\/\/github\.test\/neatlogs\/fixture\/pull\/2\n/);
    assert.ok(existsSync(join(repo, 'compatibility-fix.patch')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
