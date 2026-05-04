import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(ROOT, 'scripts/run-original7-examples.mjs');

function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${SCRIPT} ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

describe('run-original7-examples.mjs', () => {
  it('--help exits 0 and prints usage', () => {
    const { stdout, exitCode } = run('--help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('run-original7-examples');
    expect(stdout).toContain('--only');
    expect(stdout).toContain('--timeout');
  });

  it('exits 1 for unknown --only name', () => {
    const { exitCode, stderr } = run('--only nonexistent_example');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('no matching examples');
  });
});
