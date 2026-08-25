import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);
const paths = new Set([pkg.main, pkg.module, pkg.types]);

for (const entry of Object.values(pkg.exports ?? {})) {
  for (const mode of Object.values(entry ?? {})) {
    if (typeof mode === 'string') paths.add(mode);
    else if (mode && typeof mode === 'object') {
      for (const value of Object.values(mode)) {
        if (typeof value === 'string') paths.add(value);
      }
    }
  }
}

const missing = [];
for (const path of paths) {
  if (typeof path !== 'string') continue;
  try {
    await access(resolve(root, path));
  } catch {
    missing.push(path);
  }
}

if (missing.length) {
  throw new Error(`Package is missing exported runtime files: ${missing.join(', ')}`);
}

for (const [subpath, entry] of Object.entries(pkg.exports ?? {})) {
  const esmPath = entry?.import?.default;
  const cjsPath = entry?.require?.default;
  if (typeof esmPath !== 'string' || typeof cjsPath !== 'string') {
    throw new Error(`Package export ${subpath} must define ESM and CJS runtime entries`);
  }
  try {
    await import(pathToFileURL(resolve(root, esmPath)).href);
  } catch (error) {
    throw new Error(`Package export ${subpath} failed ESM import`, { cause: error });
  }
  try {
    require(resolve(root, cjsPath));
  } catch (error) {
    throw new Error(`Package export ${subpath} failed CJS require`, { cause: error });
  }
}

const esm = await import(pathToFileURL(resolve(root, pkg.module)).href);
const cjs = require(resolve(root, pkg.main));
const declarations = await readFile(resolve(root, pkg.types), 'utf8');

if (typeof esm.Client !== 'function' || typeof cjs.Client !== 'function') {
  throw new Error('Package main entry must export Client in both ESM and CJS');
}
if (!declarations.includes('Client')) {
  throw new Error('Package type declarations do not expose Client');
}

const expectedSchemaHash =
  '1ce32734138c2ffc316c4299f5ae3eebec2f94381a538a383af49ba93eec9f9d';
for (const [format, entry] of [
  ['ESM', esm],
  ['CJS', cjs],
]) {
  if (entry.TELEMETRY_SCHEMA_SHA256 !== expectedSchemaHash) {
    throw new Error(`${format} package entry exposes the wrong telemetry schema hash`);
  }
  if (entry.TELEMETRY_SCHEMA_V2?.['x-neatlogs-policy']?.contract_version !== '2.0.0') {
    throw new Error(`${format} package entry is missing canonical telemetry schema v2`);
  }
}
if (!declarations.includes('TELEMETRY_SCHEMA_V2')) {
  throw new Error('Package type declarations do not expose telemetry schema v2');
}
