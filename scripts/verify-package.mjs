import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
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

const esm = await import(pathToFileURL(resolve(root, pkg.module)).href);
const require = createRequire(import.meta.url);
const cjs = require(resolve(root, pkg.main));
const declarations = await readFile(resolve(root, pkg.types), 'utf8');

if (typeof esm.Client !== 'function' || typeof cjs.Client !== 'function') {
  throw new Error('Package main entry must export Client in both ESM and CJS');
}
if (!declarations.includes('Client')) {
  throw new Error('Package type declarations do not expose Client');
}
