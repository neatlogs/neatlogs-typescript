import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_PATCH_BYTES = 24_000;
const MAX_CHANGED_LINES = 250;
const MAX_FILES = 4;

export function patchPaths(patch) {
  if (Buffer.byteLength(patch, 'utf8') > MAX_PATCH_BYTES) throw new Error('Proposal patch exceeds 24 KB');
  if (/^(?:GIT binary patch|Binary files |(?:new|deleted) file mode |(?:new|old) mode |rename (?:from|to) )/m.test(patch)) {
    throw new Error('Binary patches, file creation or deletion, renames, and mode changes are not allowed');
  }
  const paths = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/([^\s]+) b\/([^\s]+)$/.exec(line);
      if (!match || match[1] !== match[2]) throw new Error('Proposal patch has an invalid file header');
      paths.push(match[1]);
    }
  }
  if (!paths.length || paths.length > MAX_FILES || new Set(paths).size !== paths.length) {
    throw new Error('Proposal must change one to four distinct files');
  }
  if (!paths.some((path) => /^src\/[a-z0-9/-]+\.ts$/.test(path))
      || !paths.some((path) => /^tests\/(?:unit|integration)\/[a-z0-9/-]+\.test\.ts$/.test(path))) {
    throw new Error('Proposal must change SDK source and a unit or integration test');
  }
  for (const path of paths) {
    if (!/^(?:src\/[a-z0-9/-]+\.ts|tests\/(?:unit|integration)\/[a-z0-9/-]+\.test\.ts)$/.test(path)
        || path.includes('..') || path.includes('//')) {
      throw new Error(`Proposal path is not allowed: ${path}`);
    }
  }
  const changedLines = patch.split('\n').filter((line) => /^[+-]/.test(line) && !/^(?:\+\+\+|---)/.test(line)).length;
  if (changedLines > MAX_CHANGED_LINES) throw new Error('Proposal changes too many lines');
  return paths;
}

export function validateAdapterPaths(paths, packageName, evidence) {
  const packageEvidence = (evidence.packages ?? []).find((item) => item.package === packageName);
  const allowed = new Set((packageEvidence?.integrations ?? [])
    .flatMap((integration) => integration.adapterSource ?? [])
    .map((source) => source.path));
  const sourcePaths = paths.filter((path) => path.startsWith('src/'));
  if (!allowed.size || sourcePaths.some((path) => !allowed.has(path))) {
    throw new Error(`Proposal changes source outside the affected ${packageName} adapter paths`);
  }
}

export function validateProposalReferences(proposal, paths, evidence) {
  const packageEvidence = (evidence.packages ?? []).find((item) => item.package === proposal.package);
  const references = new Set([
    ...(packageEvidence?.sourceContentChanges ?? []).map((item) => item.path),
    ...(packageEvidence?.packageSurfaceChanges ?? []).map((item) => item.key),
    ...(packageEvidence?.publicApiChanges?.added ?? []).map((item) => item.split(':')[0]),
    ...(packageEvidence?.publicApiChanges?.removed ?? []).map((item) => item.split(':')[0]),
    ...(packageEvidence?.officialDocumentation ?? []).map((item) => item.url),
  ]);
  if (!paths.includes(proposal.adapterPath) || !references.has(proposal.upstreamReference)) {
    throw new Error('Proposal does not cite a changed adapter and an exact upstream evidence reference');
  }
}

async function run(command, args, timeout = 300_000) {
  return execFileAsync(command, args, {
    cwd: repositoryRoot,
    timeout,
    maxBuffer: 3 * 1024 * 1024,
    // Generated tests run without provider keys or GitHub credentials.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true' },
  });
}

async function main() {
  const output = resolve(repositoryRoot, 'compatibility-fix-validation.json');
  const proposal = JSON.parse(await readFile(resolve(repositoryRoot, 'compatibility-fix-proposal.json'), 'utf8'));
  const result = { schemaVersion: 1, status: 'rejected', package: proposal.package ?? null, files: [], checks: [] };
  try {
    if (proposal.decision !== 'propose_fix') throw new Error('No fix proposal was generated');
    const { stdout: baseSha } = await run('git', ['rev-parse', 'HEAD'], 20_000);
    if (!proposal.baseSha || proposal.baseSha !== baseSha.trim()) throw new Error('Proposal base SHA differs from validation checkout');
    const paths = patchPaths(proposal.patch);
    const evidence = JSON.parse(await readFile(resolve(repositoryRoot, 'compatibility-evidence.json'), 'utf8'));
    validateAdapterPaths(paths, proposal.package, evidence);
    validateProposalReferences(proposal, paths, evidence);
    result.baseSha = proposal.baseSha;
    result.patchSha256 = createHash('sha256').update(proposal.patch).digest('hex');
    for (const path of paths) {
      if ((await lstat(resolve(repositoryRoot, path))).isSymbolicLink()) throw new Error(`Symlink target is not allowed: ${path}`);
    }
    const patchFile = resolve(repositoryRoot, 'compatibility-fix.patch');
    await writeFile(patchFile, proposal.patch);
    const { stdout: numstat } = await run('git', ['apply', '--numstat', patchFile], 20_000);
    const appliedPaths = numstat.trim().split('\n').filter(Boolean).map((line) => line.split('\t').at(-1));
    if (appliedPaths.length !== paths.length || appliedPaths.some((path) => !paths.includes(path))) {
      throw new Error('Patch file paths differ from validated headers');
    }
    await run('git', ['apply', '--check', '--whitespace=error', patchFile], 20_000);
    const testPaths = paths.filter((path) => path.startsWith('tests/'));
    await run('git', ['apply', ...testPaths.map((path) => `--include=${path}`), patchFile], 20_000);
    try {
      await run('node', [resolve(repositoryRoot, 'node_modules/vitest/vitest.mjs'), 'run', ...testPaths], 120_000);
      result.baselineTargetedTest = 'passed';
    } catch (error) {
      result.baselineTargetedTest = 'failed';
      result.baselineTargetedTestDetail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    } finally {
      await run('git', ['restore', '--', ...testPaths], 20_000);
    }
    await run('git', ['apply', '--whitespace=error', patchFile], 20_000);
    result.files = paths;
    const { stdout: changed } = await run('git', ['diff', '--name-only'], 20_000);
    const actual = changed.trim().split('\n').filter(Boolean);
    if (actual.length !== paths.length || actual.some((path) => !paths.includes(path))) {
      throw new Error('Applied changes differ from validated paths');
    }
    for (const [name, args] of [
      ['lint', ['run', 'lint']],
      ['targeted-test', ['exec', '--', 'vitest', 'run', ...testPaths]],
      ['test', ['test']],
    ]) {
      await run('npm', args);
      result.checks.push(name);
    }
    // The consumer probe packs dist/, so build again after applying the patch.
    await run('npm', ['run', 'build']);
    result.checks.push('post-patch-build');
    const releases = JSON.parse(await readFile(resolve(repositoryRoot, 'compatibility-release-report.json'), 'utf8'));
    const change = (releases.changes ?? []).find((item) => item.package === proposal.package);
    if (!change) throw new Error('Selected package is absent from the release report');
    await writeFile(resolve(repositoryRoot, 'compatibility-fix-release-report.json'), `${JSON.stringify({
      ...releases, changes: [change],
    }, null, 2)}\n`);
    const postPatchOutput = resolve(repositoryRoot, 'compatibility-fix-verification.json');
    await rm(postPatchOutput, { force: true });
    const verificationStartedAt = Date.now();
    try {
      await run('node', [
        resolve(repositoryRoot, 'scripts/compatibility/verify-releases.mjs'),
        '--release-report=compatibility-fix-release-report.json',
        '--output=compatibility-fix-verification.json',
      ], 300_000);
    } catch (error) {
      if (!(await readFile(postPatchOutput, 'utf8').catch(() => null))) {
        throw new Error(`Post-patch published-version smoke check did not produce a report: ${(error instanceof Error ? error.message : String(error)).slice(0, 500)}`);
      }
    }
    const postPatchReport = JSON.parse(await readFile(postPatchOutput, 'utf8'));
    const postPatch = postPatchReport.packages?.[0];
    const counts = postPatchReport.counts ?? {};
    const total = ['passed', 'failed', 'blocked', 'not-tested'].reduce((sum, name) => sum + Number(counts[name] ?? 0), 0);
    const generatedAt = Date.parse(postPatchReport.generatedAt);
    if (postPatchReport.schemaVersion !== 1 || postPatchReport.packages?.length !== 1
        || postPatch?.package !== proposal.package
        || postPatch.baselineVersion !== change.previouslyAnalyzed
        || postPatch.latestVersion !== change.latest
        || counts[postPatch.status] !== 1 || total !== 1
        || !Number.isFinite(generatedAt) || generatedAt < verificationStartedAt - 1000) {
      throw new Error('Post-patch smoke report is stale or does not match the selected published package');
    }
    result.postPatchSmoke = {
      package: proposal.package,
      status: postPatch.status,
      baselineStatus: postPatch.baseline?.status ?? 'not-tested',
      latestStatus: postPatch.latest?.status ?? 'not-tested',
      latestVersion: change.latest,
      scope: postPatch.scope ?? null,
      detail: postPatch.latest?.detail?.slice(0, 500) ?? null,
    };
    if (postPatch.baseline?.status !== 'passed' || postPatch.latest?.status !== 'passed' || postPatch.status !== 'passed') {
      throw new Error(`Post-patch ${proposal.package} baseline/latest smoke probes did not both pass`);
    }
    result.checks.push('post-patch-published-version-smoke');
    result.status = 'validated';
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'validated=true\n');
    console.log(`Validated Gemini fix in ${paths.join(', ')}`);
  } catch (error) {
    result.reason = (error instanceof Error ? error.message : String(error)).slice(0, 1500);
    console.error(`Fix validation rejected: ${result.reason}`);
    process.exitCode = 1;
  }
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
