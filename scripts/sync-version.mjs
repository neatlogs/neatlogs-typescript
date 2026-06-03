#!/usr/bin/env node
/**
 * Keep src/version.ts in sync with package.json's version.
 *
 * Runs automatically on `prebuild`, so the compiled SDK's `__version__`
 * (reported as `service.version` on every span) always matches the published
 * package version. Previously version.ts was a hand-edited constant that drifted
 * — it shipped "1.0.0" through several releases. Bump package.json; this does the rest.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const versionFile = join(root, 'src', 'version.ts');

const contents = `/**
 * SDK version. Kept in sync with package.json by the \`version:sync\` script
 * (runs automatically on \`prebuild\`). Do not edit by hand — bump package.json.
 */
export const __version__ = '${pkg.version}';
`;

const current = readFileSync(versionFile, 'utf8');
if (current !== contents) {
  writeFileSync(versionFile, contents);
  console.log(`[sync-version] src/version.ts -> ${pkg.version}`);
} else {
  console.log(`[sync-version] src/version.ts already at ${pkg.version}`);
}
