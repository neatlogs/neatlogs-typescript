import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../..');

function argumentValue(name, fallback) {
  const prefix = `${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function run(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      maxBuffer: 20 * 1024 * 1024,
      ...options,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result;
  } catch (error) {
    if (error?.stdout) process.stdout.write(error.stdout);
    if (error?.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

async function packSDK() {
  const { stdout } = await execFileAsync('npm', ['pack', '--json', '--ignore-scripts'], {
    cwd: repositoryRoot,
    maxBuffer: 20 * 1024 * 1024,
  });
  const packed = JSON.parse(stdout)?.[0];
  if (!packed?.filename) throw new Error('npm pack did not return an SDK tarball');
  return resolve(repositoryRoot, packed.filename);
}

const verificationProgram = `
import * as ai from 'ai';
import * as neatlogs from 'neatlogs';
import { createAITelemetry, wrapAISDK } from 'neatlogs/ai';

if (typeof ai.generateText !== 'function') throw new Error('AI SDK generateText export is missing');
if (typeof neatlogs.init !== 'function') throw new Error('Neatlogs root export is missing');
if (typeof createAITelemetry !== 'function') throw new Error('createAITelemetry export is missing');
if (typeof wrapAISDK !== 'function') throw new Error('wrapAISDK export is missing');

const telemetry = createAITelemetry({ functionId: 'compatibility-consumer' });
if (!telemetry.isEnabled || !telemetry.recordInputs || !telemetry.recordOutputs) {
  throw new Error('createAITelemetry interface changed');
}
const wrapped = wrapAISDK(ai);
if (typeof wrapped.generateText !== 'function') throw new Error('wrapped generateText is missing');
console.log('Installed consumer verified');
`;

export async function verifyConsumer(manager, aiVersion) {
  if (!['npm', 'pnpm', 'yarn'].includes(manager)) throw new Error(`unsupported manager: ${manager}`);
  if (!aiVersion) throw new Error('AI SDK version is required');
  const tarball = await packSDK();
  const directory = await mkdtemp(resolve(tmpdir(), `neatlogs-${manager}-consumer-`));
  try {
    await writeFile(resolve(directory, 'package.json'), `${JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        ai: aiVersion,
        neatlogs: `file:${tarball}`,
        zod: '^4.4.3',
      },
    }, null, 2)}\n`);
    await writeFile(resolve(directory, 'verify.mjs'), verificationProgram);

    if (manager === 'npm') {
      await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory });
      await run('node', ['verify.mjs'], { cwd: directory });
    } else if (manager === 'pnpm') {
      await run('corepack', ['pnpm', 'install', '--ignore-scripts', '--strict-peer-dependencies=false'], { cwd: directory });
      await run('corepack', ['pnpm', 'exec', 'node', 'verify.mjs'], { cwd: directory });
    } else {
      await writeFile(resolve(directory, '.yarnrc.yml'), 'nodeLinker: pnp\nenableTelemetry: false\n');
      await run('corepack', ['yarn', 'set', 'version', 'stable'], { cwd: directory });
      await run('corepack', ['yarn', 'install'], {
        cwd: directory,
        // This is a newly generated isolated consumer, so no lockfile exists
        // before the install. Yarn defaults immutable installs on CI.
        env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' },
      });
      await run('corepack', ['yarn', 'node', 'verify.mjs'], { cwd: directory });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(tarball, { force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyConsumer(
    argumentValue('--manager', process.env.COMPAT_PACKAGE_MANAGER ?? 'npm'),
    argumentValue('--ai-version', process.env.COMPAT_AI_VERSION ?? '7'),
  ).catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
