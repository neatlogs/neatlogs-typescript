import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
const tarball = join(root, JSON.parse(output)[0].filename);

for (const bundler of [
  { name: 'vite', packages: ['vite@5.4.14'] },
  { name: 'esbuild', packages: ['esbuild@0.24.2'] },
  { name: 'webpack', packages: ['webpack@5.97.1', 'webpack-cli@6.0.1'] },
]) {
  const dir = mkdtempSync(join(tmpdir(), 'neatlogs-consumer-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', private: true }));
  execFileSync('npm', ['install', '--ignore-scripts', tarball, ...bundler.packages], { cwd: dir, stdio: 'pipe' });
  writeFileSync(
    join(dir, 'entry.js'),
    bundler.name === 'vite'
      ? "import * as browser from 'neatlogs/browser'; console.log(typeof browser);\n"
      : "import { init, flushAll } from 'neatlogs'; console.log(typeof init, typeof flushAll);\n",
  );
  if (bundler.name === 'vite') {
    writeFileSync(join(dir, 'index.html'), '<script type="module" src="/entry.js"></script>');
    execFileSync('npx', ['vite', 'build'], { cwd: dir, stdio: 'pipe' });
  } else if (bundler.name === 'esbuild') {
    execFileSync('npx', ['esbuild', 'entry.js', '--bundle', '--platform=node', '--outfile=out.js'], { cwd: dir, stdio: 'pipe' });
  } else {
    execFileSync('npx', ['webpack', '--entry', './entry.js', '--mode', 'production', '--target', 'node', '--output-path', join(dir, 'dist')], { cwd: dir, stdio: 'pipe' });
  }
  rmSync(dir, { recursive: true, force: true });
}
rmSync(tarball, { force: true });
