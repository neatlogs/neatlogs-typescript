import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function command(cwd, executable, args, env = process.env) {
  return execFileSync(executable, args, { cwd, env, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }).trim();
}

test('a focused regression fixture validates a patch and reaches regular PR publication', { timeout: 90_000 }, () => {
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
    mkdirSync(scripts, { recursive: true });
    mkdirSync(bin);
    for (const name of ['validate-fix.mjs', 'publish-fix.mjs']) {
      copyFileSync(join(sourceRoot, 'scripts/compatibility', name), join(scripts, name));
    }
    symlinkSync(join(sourceRoot, 'node_modules'), join(repo, 'node_modules'));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({
      name: 'compat-fix-fixture', private: true, type: 'module',
      scripts: {
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
    command(root, 'git', ['init', '--bare', remote], env);
    command(repo, 'git', ['init', '--initial-branch=main'], env);
    command(repo, 'git', ['config', 'user.name', 'Fixture'], env);
    command(repo, 'git', ['config', 'user.email', 'fixture@example.test'], env);
    command(repo, 'git', ['add', 'package.json', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
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
    writeFileSync(env.GITHUB_OUTPUT, '');

    const validationLog = command(repo, process.execPath, [join(scripts, 'validate-fix.mjs')], env);
    assert.ok(existsSync(join(repo, 'compatibility-fix-validation.json')), `Validator did not write a report: ${validationLog}`);
    const validation = JSON.parse(readFileSync(join(repo, 'compatibility-fix-validation.json'), 'utf8'));
    assert.equal(validation.status, 'validated');
    assert.equal(validation.baselineTargetedTest, 'failed');
    assert.deepEqual(validation.checks, ['lint', 'targeted-test', 'test']);

    const gh = join(bin, 'gh');
    writeFileSync(gh, [
      '#!/bin/sh',
      'case "$1 $2" in',
      '  "pr list") printf "[]\\n" ;;',
      '  "auth setup-git") exit 0 ;;',
      '  "pr create") printf "https://github.test/neatlogs/fixture/pull/2\\n" ;;',
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'));
    chmodSync(gh, 0o755);
    command(repo, 'git', ['restore', '--', 'src/openai.ts', 'tests/unit/openai.test.ts'], env);
    command(repo, process.execPath, [join(scripts, 'publish-fix.mjs')], env);
    const publication = JSON.parse(readFileSync(join(repo, 'compatibility-fix-publication.json'), 'utf8'));
    assert.equal(publication.status, 'created');
    assert.equal(publication.url, 'https://github.test/neatlogs/fixture/pull/2');
    assert.equal(command(root, 'git', ['--git-dir', remote, 'rev-parse', 'refs/heads/compat/ts-openai-2-0-0'], env).length, 40);
    assert.match(readFileSync(join(repo, 'compatibility-fix-pr-body.md'), 'utf8'), /ready for human code review/);
    assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /validated=true\npr_url=https:\/\/github\.test\/neatlogs\/fixture\/pull\/2\n/);
    assert.ok(existsSync(join(repo, 'compatibility-fix.patch')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
