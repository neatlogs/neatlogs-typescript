import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INSTALL_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 20_000;
const WORKERS = 3;

// Every probe runs against the published SDK tarball and an exact upstream
// version in a fresh consumer. A module probe is intentionally weaker than a
// behavioral integration test; the report exposes that scope per package.
export const PROBES = {
  '@ai-sdk/otel': { adapter: 'ai', exportName: 'createAITelemetry', scope: 'consumer import and adapter export' },
  '@anthropic-ai/claude-agent-sdk': { adapter: 'claude-agent-sdk', exportName: 'wrapClaudeAgentSDK', scope: 'consumer import and adapter export' },
  '@anthropic-ai/sdk': { adapter: 'anthropic', exportName: 'wrapAnthropic', mode: 'anthropic', scope: 'client construction and SDK wrapping' },
  '@aws-sdk/client-bedrock-runtime': { adapter: 'bedrock', exportName: 'wrapBedrock', mode: 'bedrock', scope: 'client construction and SDK wrapping' },
  '@earendil-works/pi-agent-core': { adapter: 'pi-agent', exportName: 'piAgentHooks', scope: 'consumer import and adapter export' },
  '@google/genai': { adapter: 'google-genai', exportName: 'wrapGoogleGenAI', mode: 'google', scope: 'client construction and SDK wrapping' },
  '@langchain/anthropic': { adapter: 'langchain', exportName: 'langchainHandler', scope: 'consumer import and adapter export' },
  '@langchain/core': { adapter: 'langchain', exportName: 'langchainHandler', scope: 'consumer import and adapter export' },
  '@langchain/langgraph': { adapter: 'langchain', exportName: 'langchainHandler', scope: 'consumer import and adapter export' },
  '@langchain/openai': { adapter: 'langchain', exportName: 'langchainHandler', scope: 'consumer import and adapter export' },
  '@mastra/core': { adapter: 'mastra', exportName: 'wrapMastra', scope: 'consumer import and adapter export' },
  '@mastra/observability': { adapter: 'mastra', exportName: 'wrapMastra', scope: 'consumer import and adapter export' },
  '@opencode-ai/plugin': { adapter: 'opencode', exportName: 'NeatlogsOpencodePlugin', scope: 'consumer import and adapter export' },
  ai: { adapter: 'ai', exportName: 'wrapAISDK', mode: 'ai', scope: 'published AI SDK exports and SDK wrapping' },
  openai: { adapter: 'openai', exportName: 'wrapOpenAI', mode: 'openai', scope: 'client construction and SDK wrapping' },
};

const probeProgram = `
import * as upstream from process.env.COMPAT_PACKAGE;
import * as adapter from process.env.COMPAT_ADAPTER;

const symbol = adapter[process.env.COMPAT_EXPORT];
if (typeof symbol !== 'function') throw new Error('Neatlogs adapter export missing');
if (Object.keys(upstream).length === 0) throw new Error('Upstream package has no module exports');

switch (process.env.COMPAT_MODE) {
  case 'openai': {
    const Client = upstream.default ?? upstream.OpenAI;
    const client = new Client({ apiKey: 'compatibility-placeholder' });
    if (typeof symbol(client).responses?.create !== 'function') throw new Error('Wrapped OpenAI responses.create missing');
    break;
  }
  case 'anthropic': {
    const Client = upstream.default ?? upstream.Anthropic;
    const client = new Client({ apiKey: 'compatibility-placeholder' });
    if (typeof symbol(client).messages?.create !== 'function') throw new Error('Wrapped Anthropic messages.create missing');
    break;
  }
  case 'bedrock': {
    const Client = upstream.BedrockRuntimeClient;
    const client = new Client({ region: 'us-east-1', credentials: { accessKeyId: 'placeholder', secretAccessKey: 'placeholder' } });
    if (typeof symbol(client).send !== 'function') throw new Error('Wrapped Bedrock send missing');
    break;
  }
  case 'google': {
    const Client = upstream.GoogleGenAI;
    const client = new Client({ apiKey: 'compatibility-placeholder' });
    if (typeof symbol(client).models?.generateContent !== 'function') throw new Error('Wrapped Google GenAI generateContent missing');
    break;
  }
  case 'ai': {
    if (typeof upstream.generateText !== 'function') throw new Error('AI SDK generateText missing');
    if (typeof symbol(upstream).generateText !== 'function') throw new Error('Wrapped AI SDK generateText missing');
    break;
  }
}
console.log('Probe passed');
`;

function argumentValue(name, fallback) {
  const prefix = `${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function shortError(error) {
  const raw = [error?.message, error?.stderr, error?.stdout].filter(Boolean).join('\n');
  return raw.slice(0, 1200) || String(error);
}

export function installedVersions(tree, packageName) {
  const versions = [];
  function visit(node) {
    for (const [name, dependency] of Object.entries(node?.dependencies ?? {})) {
      if (name === packageName && dependency.version) versions.push(dependency.version);
      visit(dependency);
    }
  }
  visit(tree);
  return versions;
}

export function classifyVerification(baseline, latest) {
  if (latest.status === 'passed') return 'passed';
  if (latest.status === 'blocked' || baseline.status === 'blocked') return 'blocked';
  if (baseline.status === 'passed' && latest.status === 'failed') return 'failed';
  return 'blocked';
}

async function packSDK(directory) {
  const { stdout } = await execFileAsync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], {
    cwd: repositoryRoot,
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const filename = JSON.parse(stdout)?.[0]?.filename;
  if (!filename) throw new Error('npm pack returned no SDK tarball');
  return resolve(directory, filename);
}

async function probeVersion(change, version, probe, tarball, root) {
  const directory = await mkdtemp(resolve(root, 'consumer-'));
  try {
    await writeFile(resolve(directory, 'package.json'), `${JSON.stringify({
      private: true,
      type: 'module',
      dependencies: { neatlogs: `file:${tarball}`, [change.package]: version },
      overrides: { [change.package]: version },
    }, null, 2)}\n`);
    await writeFile(resolve(directory, 'probe.mjs'), probeProgram.replace(
      "import * as upstream from process.env.COMPAT_PACKAGE;\nimport * as adapter from process.env.COMPAT_ADAPTER;",
      `const upstream = await import(${JSON.stringify(change.package)});\nconst adapter = await import(${JSON.stringify(`neatlogs/${probe.adapter}`)});`,
    ));
    try {
      await execFileAsync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd: directory,
        timeout: INSTALL_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch (error) {
      return { status: 'blocked', phase: 'install', version, detail: shortError(error) };
    }
    try {
      const { stdout } = await execFileAsync('npm', ['ls', change.package, '--all', '--json'], {
        cwd: directory,
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
      });
      const resolved = installedVersions(JSON.parse(stdout), change.package);
      if (!resolved.length || resolved.some((installed) => installed !== version)) {
        return { status: 'blocked', phase: 'version-resolution', version, detail: `Expected only ${version}; resolved ${resolved.join(', ') || 'none'}` };
      }
    } catch (error) {
      return { status: 'blocked', phase: 'version-resolution', version, detail: shortError(error) };
    }
    try {
      await execFileAsync('node', ['probe.mjs'], {
        cwd: directory,
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          COMPAT_EXPORT: probe.exportName,
          COMPAT_MODE: probe.mode ?? 'module',
        },
      });
      return { status: 'passed', phase: 'runtime', version };
    } catch (error) {
      return { status: 'failed', phase: 'runtime', version, detail: shortError(error) };
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function verifyChanges(changes, tarball, root, probe = probeVersion) {
  const results = new Array(changes.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(WORKERS, changes.length) }, async () => {
    while (next < changes.length) {
      const index = next++;
      const change = changes[index];
      const definition = PROBES[change.package];
      if (!definition || !change.previouslyAnalyzed) {
        results[index] = {
          package: change.package,
          baselineVersion: change.previouslyAnalyzed ?? null,
          latestVersion: change.latest,
          status: 'not-tested',
          scope: null,
          reason: definition ? 'no recorded baseline for comparison' : 'no runtime probe configured',
        };
        continue;
      }
      const baseline = await probe(change, change.previouslyAnalyzed, definition, tarball, root);
      const latest = await probe(change, change.latest, definition, tarball, root);
      results[index] = {
        package: change.package,
        baselineVersion: change.previouslyAnalyzed,
        latestVersion: change.latest,
        scope: definition.scope,
        baseline,
        latest,
        status: classifyVerification(baseline, latest),
      };
    }
  }));
  return results;
}

async function main() {
  const report = JSON.parse(await readFile(resolve(repositoryRoot, argumentValue('--release-report', 'compatibility-release-report.json')), 'utf8'));
  const output = resolve(repositoryRoot, argumentValue('--output', 'compatibility-verification.json'));
  const root = await mkdtemp(resolve(tmpdir(), 'neatlogs-compat-verification-'));
  try {
    const tarball = await packSDK(root);
    const results = await verifyChanges(report.changes ?? [], tarball, root);
    const counts = Object.fromEntries(['passed', 'failed', 'blocked', 'not-tested'].map((status) => [
      status, results.filter((result) => result.status === status).length,
    ]));
    await writeFile(output, `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      method: 'isolated npm consumer of locally packed SDK checkout; exact recorded baseline versus detected latest',
      limitations: 'Smoke probes only; no live upstream API calls or full tracing assertions',
      counts,
      packages: results,
    }, null, 2)}\n`);
    console.log(`Compatibility smoke verification: ${JSON.stringify(counts)} (report: ${output})`);
    if (counts.failed) process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
