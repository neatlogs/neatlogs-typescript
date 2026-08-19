import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ChildResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function runChild(mode: 'host' | 'sdk-only'): Promise<ChildResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve(process.cwd(), 'tests/fixtures/signal-child.mjs'),
        mode,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.once('error', reject);
    child.once('close', (code, signal) =>
      resolveResult({ code, signal, stdout, stderr }),
    );
  });
}

describe('signal coexistence', () => {
  it('lets an existing host listener handle the original signal exactly once', async () => {
    const result = await runChild('host');
    expect(result).toMatchObject({ code: 0, signal: null });
    expect(result.stdout.match(/host:/g)).toHaveLength(1);
    expect(result.stdout).toContain('done:1');
  });

  it('restores default termination when the SDK owns the signal', async () => {
    const result = await runChild('sdk-only');
    expect(result.code).toBeNull();
    expect(result.signal).toBe('SIGTERM');
    expect(result.stderr).not.toContain('process survived');
  });
});
