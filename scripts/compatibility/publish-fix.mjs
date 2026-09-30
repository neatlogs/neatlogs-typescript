import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { patchPaths, validateAdapterPaths, validateProposalReferences } from './validate-fix.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export function proposalBranch(packageName, version) {
  return `compat/ts-${slug(packageName)}-${slug(version)}`;
}

async function run(command, args) {
  return execFileAsync(command, args, { cwd: repositoryRoot, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
}

async function main() {
  const output = resolve(repositoryRoot, 'compatibility-fix-publication.json');
  const proposal = JSON.parse(await readFile(resolve(repositoryRoot, 'compatibility-fix-proposal.json'), 'utf8'));
  const validation = JSON.parse(await readFile(resolve(repositoryRoot, process.env.COMPAT_VALIDATION_FILE || 'compatibility-fix-validation.json'), 'utf8'));
  const report = JSON.parse(await readFile(resolve(repositoryRoot, 'compatibility-release-report.json'), 'utf8'));
  const change = report.changes.find((item) => item.package === proposal.package);
  const result = { schemaVersion: 1, status: 'failed', package: proposal.package ?? null, url: null };
  try {
    if (proposal.decision !== 'propose_fix' || validation.status !== 'validated' || !change) {
      throw new Error('No validated SDK fix is available to publish');
    }
    if (!process.env.GH_TOKEN) throw new Error('GitHub token is unavailable');
    const { stdout: head } = await run('git', ['rev-parse', 'HEAD']);
    const files = patchPaths(proposal.patch);
    for (const path of files) {
      if ((await lstat(resolve(repositoryRoot, path))).isSymbolicLink()) throw new Error(`Symlink target is not allowed: ${path}`);
    }
    const evidence = JSON.parse(await readFile(resolve(repositoryRoot, 'compatibility-evidence.json'), 'utf8'));
    validateAdapterPaths(files, proposal.package, evidence);
    validateProposalReferences(proposal, files, evidence);
    const digest = createHash('sha256').update(proposal.patch).digest('hex');
    if (!proposal.baseSha || proposal.baseSha !== head.trim() || validation.baseSha !== head.trim()
        || validation.patchSha256 !== digest || JSON.stringify(validation.files) !== JSON.stringify(files)) {
      throw new Error('Validated patch, base SHA, or changed files differ from the proposal artifact');
    }
    const patchFile = resolve(repositoryRoot, 'compatibility-fix.patch');
    await writeFile(patchFile, proposal.patch);
    await run('git', ['apply', '--check', '--whitespace=error', patchFile]);
    const branch = proposalBranch(change.package, change.latest);
    result.branch = branch;
    const repository = process.env.GITHUB_REPOSITORY;
    const { stdout: existingJSON } = await run('gh', ['pr', 'list', '--repo', repository, '--state', 'all', '--head', branch, '--json', 'url,state']);
    const existing = JSON.parse(existingJSON)?.[0];
    if (existing) {
      if (existing.state !== 'OPEN') {
        result.status = 'skipped_closed';
        result.priorPrUrl = existing.url;
        result.reason = 'A maintainer closed the prior fix PR; no new PR was opened automatically';
      } else {
        result.status = 'existing';
        result.url = existing.url;
      }
    } else {
      const { stdout: remote } = await run('git', ['ls-remote', '--heads', 'origin', branch]);
      if (remote.trim()) throw new Error(`Branch ${branch} exists without a PR; refusing to overwrite it`);
      await run('git', ['switch', '-c', branch]);
      await run('git', ['apply', '--whitespace=error', patchFile]);
      const { stdout: changed } = await run('git', ['diff', '--name-only']);
      const actual = changed.trim().split('\n').filter(Boolean);
      if (actual.length !== files.length || actual.some((path) => !files.includes(path))) {
        throw new Error('Applied changes differ from validated patch paths');
      }
      await run('git', ['config', 'user.name', 'github-actions[bot]']);
      await run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
      await run('git', ['add', '--', ...files]);
      await run('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', `fix(compat): adapt ${change.package} to ${change.latest}`]);
      await run('gh', ['auth', 'setup-git']);
      await run('git', ['-c', 'core.hooksPath=/dev/null', 'push', '--set-upstream', 'origin', branch]);
      const issueUrl = process.env.COMPAT_DISCOVERY_ISSUE_URL;
      const runUrl = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
      const body = [
        '## Gemini proposed compatibility fix',
        '',
        `Upstream package: ${change.package} ${change.previouslyAnalyzed ?? 'unrecorded'} → ${change.latest}`,
        `Reason: ${proposal.reason}`,
        `Evidence cited by Gemini: ${proposal.evidence}`,
        '',
        'This is a draft for human code review. The Gemini reasoning is advisory; the bounded baseline/latest smoke probes and repository tests do not establish complete integration compatibility.',
        '',
        `Targeted changed test on the original SDK: ${validation.baselineTargetedTest ?? 'not run'}. A failure here may reproduce the issue, but still needs human review.`,
        `Validated files: ${validation.files.join(', ')}`,
        `Validation completed: ${validation.checks.join(', ')}`,
        issueUrl ? `Discovery issue: ${issueUrl}` : 'Discovery issue: unavailable',
        `Workflow run and evidence artifact: ${runUrl}`,
      ].join('\n');
      const bodyFile = resolve(repositoryRoot, 'compatibility-fix-pr-body.md');
      await writeFile(bodyFile, `${body}\n`);
      const { stdout: url } = await run('gh', [
        'pr', 'create', '--repo', repository, '--draft', '--base', process.env.COMPAT_BASE_BRANCH || 'main',
        '--head', branch, '--title', `fix(compat): review ${change.package}@${change.latest} TypeScript adapter`,
        '--body-file', bodyFile,
      ]);
      result.status = 'created';
      result.url = url.trim();
    }
    if (process.env.GITHUB_OUTPUT && result.url) await appendFile(process.env.GITHUB_OUTPUT, `pr_url=${result.url}\n`);
    console.log(`Fix PR ${result.status}: ${result.url ?? result.reason}`);
  } catch (error) {
    result.reason = (error instanceof Error ? error.message : String(error)).slice(0, 1500);
    console.error(`Fix PR publication failed: ${result.reason}`);
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
