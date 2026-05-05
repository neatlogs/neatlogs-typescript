#!/usr/bin/env node
/**
 * Run harness for the original 7 TypeScript SDK examples.
 *
 * Runs each example sequentially via `npx tsx`, captures terminal output to
 * logs/<example>_terminal.log, and prints a pass/fail summary at the end.
 * Failures do NOT abort the run — all examples are attempted.
 *
 * Raw and processed span logs are written by each example into:
 *   logs/<example>_raw_spans.jsonl
 *   logs/<example>_processed_spans.jsonl
 *
 * Usage:
 *   node scripts/run-original7-examples.mjs [--help] [--only <name>] [--timeout <ms>]
 *
 * Options:
 *   --help           Show this help message and exit.
 *   --only <name>    Run only the named example (may be repeated).
 *   --timeout <ms>   Per-example timeout in milliseconds (default: 120000).
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LOGS_DIR = resolve(ROOT, 'logs');

// ── Example definitions ─────────────────────────────────────────────────
const EXAMPLES = [
  { name: 'openai_multiagent',          entry: 'examples/openai_multiagent/main.ts',          args: ['Tesla'] },
  { name: 'anthropic_multiagent',       entry: 'examples/anthropic_multiagent/main.ts',       args: [] },
  { name: 'google_genai_multiagent',    entry: 'examples/google_genai_multiagent/main.ts',    args: [] },
  { name: 'langchain_react',            entry: 'examples/langchain_react/main.ts',            args: [] },
  { name: 'langgraph_multiagent',       entry: 'examples/langgraph_multiagent/main.ts',       args: [] },
  { name: 'marketing_strategy_demo',    entry: 'examples/marketing_strategy_demo/main.ts',    args: [] },
  { name: 'reasoning_model_workflow',   entry: 'examples/reasoning_model_workflow/main.ts',   args: [] },
];

// ── CLI parsing ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`
run-original7-examples.mjs — Run the original 7 TypeScript SDK examples.

Usage:
  node scripts/run-original7-examples.mjs [options]

Options:
  --help             Show this help and exit.
  --only <name>      Run only the named example. May be repeated.
  --timeout <ms>     Per-example timeout in milliseconds (default: 120000).

Examples:
  node scripts/run-original7-examples.mjs
  node scripts/run-original7-examples.mjs --only openai_multiagent --only anthropic_multiagent
  node scripts/run-original7-examples.mjs --timeout 180000
`.trim());
  process.exit(0);
}

let timeout = 120_000;
const onlyNames = [];

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--timeout' && argv[i + 1]) {
    timeout = Number(argv[++i]);
  } else if (argv[i] === '--only' && argv[i + 1]) {
    onlyNames.push(argv[++i]);
  }
}

const selectedExamples = onlyNames.length
  ? EXAMPLES.filter((e) => onlyNames.includes(e.name))
  : EXAMPLES;

if (selectedExamples.length === 0) {
  console.error(`Error: no matching examples for --only ${onlyNames.join(', ')}`);
  console.error(`Available: ${EXAMPLES.map((e) => e.name).join(', ')}`);
  process.exit(1);
}

// ── Runner ──────────────────────────────────────────────────────────────

/**
 * Run a single example, capturing all terminal output.
 * Returns { name, passed, exitCode, logFile, durationMs }.
 */
async function runExample(example) {
  const logFile = resolve(LOGS_DIR, `${example.name}_terminal.log`);
  const chunks = [];
  const startMs = Date.now();

  return new Promise((resolvePromise) => {
    const child = spawn('npx', ['tsx', example.entry, ...example.args], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (d) => {
      chunks.push(d);
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      chunks.push(d);
      process.stderr.write(d);
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000);
    }, timeout);

    child.on('close', async (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;
      const log = Buffer.concat(chunks).toString('utf8');
      await writeFile(logFile, log, 'utf8');
      resolvePromise({
        name: example.name,
        passed: code === 0,
        exitCode: code,
        logFile,
        durationMs,
      });
    });
  });
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(LOGS_DIR, { recursive: true });

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  run-original7-examples — NeatLogs TypeScript SDK   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Running ${selectedExamples.length} example(s), timeout ${timeout}ms each.\n`);

  const results = [];

  for (const example of selectedExamples) {
    console.log(`\n┌─── ${example.name} ───`);
    const result = await runExample(example);
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`└─── ${example.name}: ${status} (exit ${result.exitCode}, ${result.durationMs}ms)\n`);
    results.push(result);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n════════════════ SUMMARY ════════════════');
  const maxNameLen = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const padded = r.name.padEnd(maxNameLen);
    console.log(`  ${icon}  ${padded}  exit=${r.exitCode}  ${r.durationMs}ms  ${r.logFile}`);
  }

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.length - passCount;
  console.log(`\n  ${passCount} passed, ${failCount} failed out of ${results.length}`);
  console.log('═════════════════════════════════════════\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Harness error:', err);
  process.exit(2);
});
