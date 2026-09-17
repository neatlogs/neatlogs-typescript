import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../..');

export function validateConfiguration(config, lock) {
  if (config?.schemaVersion !== 1 || !Array.isArray(config.integrations)) {
    throw new Error('integrations.json must use schemaVersion 1 and contain integrations[]');
  }
  if (lock?.schemaVersion !== 1 || typeof lock.packages !== 'object' || lock.packages === null) {
    throw new Error('versions.lock.json must use schemaVersion 1 and contain packages{}');
  }

  const ids = new Set();
  for (const integration of config.integrations) {
    if (!integration.id || !integration.displayName || !Array.isArray(integration.packages)) {
      throw new Error('every integration requires id, displayName, and packages[]');
    }
    if (ids.has(integration.id)) throw new Error(`duplicate integration id: ${integration.id}`);
    ids.add(integration.id);
    for (const packageName of integration.packages) {
      if (typeof packageName !== 'string' || packageName.length === 0) {
        throw new Error(`invalid package name for ${integration.id}`);
      }
    }
  }
}

export function watchedPackages(config) {
  return [...new Set(config.integrations.flatMap((item) =>
    item.releaseMonitoring === false ? [] : item.packages,
  ))].sort();
}

export function compareVersions(config, lock, registryVersions) {
  const integrationsByPackage = new Map();
  for (const integration of config.integrations) {
    if (integration.releaseMonitoring === false) continue;
    for (const packageName of integration.packages) {
      const current = integrationsByPackage.get(packageName) ?? [];
      current.push(integration.id);
      integrationsByPackage.set(packageName, current);
    }
  }

  return watchedPackages(config).flatMap((packageName) => {
    const latest = registryVersions[packageName];
    const analyzed = lock.packages[packageName] ?? null;
    if (!latest || latest === analyzed) return [];
    return [{
      package: packageName,
      previouslyAnalyzed: analyzed,
      latest,
      integrations: integrationsByPackage.get(packageName) ?? [],
    }];
  });
}

async function fetchLatestVersion(packageName) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
    headers: { 'user-agent': 'neatlogs-compatibility-monitor/1' },
  });
  if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${packageName}`);
  const metadata = await response.json();
  const latest = metadata?.['dist-tags']?.latest;
  if (typeof latest !== 'string' || latest.length === 0) {
    throw new Error(`npm registry returned no latest dist-tag for ${packageName}`);
  }
  return latest;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const config = JSON.parse(await readFile(resolve(repositoryRoot, '.compatibility/integrations.json'), 'utf8'));
  const lock = JSON.parse(await readFile(resolve(repositoryRoot, '.compatibility/versions.lock.json'), 'utf8'));
  validateConfiguration(config, lock);

  if (args.has('--validate-only')) {
    console.log(`Validated ${config.integrations.length} TypeScript integrations`);
    return;
  }

  const packageNames = watchedPackages(config);
  const entries = await Promise.all(packageNames.map(async (packageName) => [
    packageName,
    await fetchLatestVersion(packageName),
  ]));
  const registryVersions = Object.fromEntries(entries);
  const changes = compareVersions(config, lock, registryVersions);
  const report = {
    schemaVersion: 1,
    ecosystem: 'npm',
    generatedAt: new Date().toISOString(),
    checkedPackages: packageNames.length,
    changes,
  };

  const reportPathArgument = process.argv.find((item) => item.startsWith('--report='));
  const reportPath = resolve(repositoryRoot, reportPathArgument?.slice('--report='.length) || 'compatibility-release-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changes_found=${changes.length > 0}\nreport_path=${reportPath}\n`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
