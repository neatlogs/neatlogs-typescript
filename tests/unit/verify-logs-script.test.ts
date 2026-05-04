import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(ROOT, 'scripts/verify-original7-logs.mjs');
const TEST_LOGS_DIR = resolve(ROOT, 'tests/.tmp-verify-logs');

function run(
  args: string,
  env: NodeJS.ProcessEnv = {},
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${SCRIPT} ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, NEATLOGS_WORKFLOW_PREFIX: '', ...env },
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

describe('verify-original7-logs.mjs', () => {
  beforeAll(() => {
    mkdirSync(TEST_LOGS_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_LOGS_DIR)) {
      rmSync(TEST_LOGS_DIR, { recursive: true, force: true });
    }
  });

  it('--help exits 0 and prints usage', () => {
    const { stdout, exitCode } = run('--help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('verify-original7-logs.mjs');
    expect(stdout).toContain('--only');
    expect(stdout).toContain('--logs-dir');
  });

  it('exits 1 when no log files exist', () => {
    const emptyDir = resolve(TEST_LOGS_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const { stdout, exitCode } = run(`--logs-dir ${emptyDir} --only openai_multiagent`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('No log files found');
    expect(stdout).toContain('SKIP');
  });

  it('exits 2 for unknown --only name', () => {
    const { exitCode, stderr } = run('--only nonexistent_example');
    expect(exitCode).toBe(2);
    expect(stderr).toContain('no matching specs');
  });

  it('passes when valid processed spans are present', () => {
    const dir = resolve(TEST_LOGS_DIR, 'valid');
    mkdirSync(dir, { recursive: true });

    // Create a minimal valid processed spans JSONL for openai_multiagent
    const spans = [
      {
        name: 'investment_research_workflow',
        traceId: 'abc123def456',
        attributes: { 'neatlogs.span.kind': 'WORKFLOW' },
      },
      {
        name: 'planner',
        traceId: 'abc123def456',
        attributes: { 'neatlogs.span.kind': 'AGENT' },
      },
      {
        name: 'researcher',
        traceId: 'abc123def456',
        attributes: { 'neatlogs.span.kind': 'AGENT' },
      },
      {
        name: 'analyst',
        traceId: 'abc123def456',
        attributes: { 'neatlogs.span.kind': 'AGENT' },
      },
      {
        name: 'reporter',
        traceId: 'abc123def456',
        attributes: { 'neatlogs.span.kind': 'AGENT' },
      },
      {
        name: 'web_search',
        traceId: 'abc123def456',
        attributes: { 'neatlogs.span.kind': 'TOOL' },
      },
    ];

    writeFileSync(
      resolve(dir, 'openai_multiagent_processed_spans.jsonl'),
      spans.map((s) => JSON.stringify(s)).join('\n') + '\n',
    );
    // Also create an empty raw file to avoid "file not found"
    writeFileSync(resolve(dir, 'openai_multiagent_raw_spans.jsonl'), '');

    const { stdout, exitCode } = run(`--logs-dir ${dir} --only openai_multiagent`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('PASS');
    expect(stdout).toContain('investment_research_workflow');
    expect(stdout).toContain('1 passed, 0 failed');
  });

  it('reports missing agents as errors', () => {
    const dir = resolve(TEST_LOGS_DIR, 'missing-agents');
    mkdirSync(dir, { recursive: true });

    // Only workflow span, no agents
    const spans = [
      {
        name: 'investment_research_workflow',
        traceId: 'abc123def456',
        attributes: { 'neatlogs.span.kind': 'WORKFLOW' },
      },
    ];

    writeFileSync(
      resolve(dir, 'openai_multiagent_processed_spans.jsonl'),
      spans.map((s) => JSON.stringify(s)).join('\n') + '\n',
    );

    const { stdout, exitCode } = run(`--logs-dir ${dir} --only openai_multiagent`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('FAIL');
    expect(stdout).toContain('Missing agent spans');
    expect(stdout).toContain('Missing tool spans');
  });

  it('reports missing workflow span', () => {
    const dir = resolve(TEST_LOGS_DIR, 'missing-workflow');
    mkdirSync(dir, { recursive: true });

    const spans = [
      {
        name: 'some_other_span',
        traceId: 'abc',
        attributes: { 'neatlogs.span.kind': 'CHAIN' },
      },
    ];

    writeFileSync(
      resolve(dir, 'anthropic_multiagent_processed_spans.jsonl'),
      spans.map((s) => JSON.stringify(s)).join('\n') + '\n',
    );

    const { stdout, exitCode } = run(`--logs-dir ${dir} --only anthropic_multiagent`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Root WORKFLOW span');
    expect(stdout).toContain('not found');
  });

  it('falls back to raw spans if processed is empty', () => {
    const dir = resolve(TEST_LOGS_DIR, 'raw-fallback');
    mkdirSync(dir, { recursive: true });

    // Empty processed file, populated raw file
    writeFileSync(resolve(dir, 'marketing_strategy_demo_processed_spans.jsonl'), '');

    const spans = [
      { name: 'Marketing Strategy Workflow', traceId: 't1', attributes: { 'neatlogs.span.kind': 'WORKFLOW' } },
      { name: 'Lead Market Analyst', traceId: 't1', attributes: { 'neatlogs.span.kind': 'AGENT' } },
      { name: 'Chief Marketing Strategist', traceId: 't1', attributes: { 'neatlogs.span.kind': 'AGENT' } },
      { name: 'Creative Content Creator', traceId: 't1', attributes: { 'neatlogs.span.kind': 'AGENT' } },
      { name: 'Web Search Google', traceId: 't1', attributes: { 'neatlogs.span.kind': 'TOOL' } },
      { name: 'Analyze Website Content', traceId: 't1', attributes: { 'neatlogs.span.kind': 'TOOL' } },
      { name: 'research_task', traceId: 't1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
      { name: 'project_understanding_task', traceId: 't1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
      { name: 'marketing_strategy_task', traceId: 't1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
      { name: 'campaign_idea_task', traceId: 't1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
      { name: 'copy_creation_task', traceId: 't1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
    ];

    writeFileSync(
      resolve(dir, 'marketing_strategy_demo_raw_spans.jsonl'),
      spans.map((s) => JSON.stringify(s)).join('\n') + '\n',
    );

    const { stdout, exitCode } = run(`--logs-dir ${dir} --only marketing_strategy_demo`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Using raw spans');
    expect(stdout).toContain('PASS');
  });

  it('honors NEATLOGS_WORKFLOW_PREFIX for identifiable runs', () => {
    const dir = resolve(TEST_LOGS_DIR, 'prefixed-workflow');
    mkdirSync(dir, { recursive: true });

    const spans = [
      {
        name: 'ts-visible-investment_research_workflow',
        traceId: 'prefixed123',
        attributes: { 'neatlogs.span.kind': 'WORKFLOW' },
      },
      { name: 'planner', traceId: 'prefixed123', attributes: { 'neatlogs.span.kind': 'AGENT' } },
      { name: 'researcher', traceId: 'prefixed123', attributes: { 'neatlogs.span.kind': 'AGENT' } },
      { name: 'analyst', traceId: 'prefixed123', attributes: { 'neatlogs.span.kind': 'AGENT' } },
      { name: 'reporter', traceId: 'prefixed123', attributes: { 'neatlogs.span.kind': 'AGENT' } },
      { name: 'web_search', traceId: 'prefixed123', attributes: { 'neatlogs.span.kind': 'TOOL' } },
    ];

    writeFileSync(
      resolve(dir, 'openai_multiagent_processed_spans.jsonl'),
      spans.map((s) => JSON.stringify(s)).join('\n') + '\n',
    );
    writeFileSync(resolve(dir, 'openai_multiagent_raw_spans.jsonl'), '');

    const { stdout, exitCode } = run(
      `--logs-dir ${dir} --only openai_multiagent`,
      { NEATLOGS_WORKFLOW_PREFIX: 'ts-visible-' },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('ts-visible-investment_research_workflow');
    expect(stdout).toContain('openai_multiagent: ✅ PASS');

    const mismatch = run(`--logs-dir ${dir} --only openai_multiagent`);
    expect(mismatch.exitCode).toBe(1);
    expect(mismatch.stdout).toContain("Root WORKFLOW span 'investment_research_workflow' not found");
  });

  it('requires full LangGraph downstream chain spans', () => {
    const dir = resolve(TEST_LOGS_DIR, 'langgraph-truncated');
    mkdirSync(dir, { recursive: true });

    const spans = [
      { name: 'research_workflow', traceId: 'lg1', attributes: { 'neatlogs.span.kind': 'WORKFLOW' } },
      { name: 'supervisor', traceId: 'lg1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
      { name: 'web_researcher', traceId: 'lg1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
      { name: 'wiki_researcher', traceId: 'lg1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
      { name: 'arxiv_researcher', traceId: 'lg1', attributes: { 'neatlogs.span.kind': 'CHAIN' } },
    ];

    writeFileSync(
      resolve(dir, 'langgraph_multiagent_processed_spans.jsonl'),
      spans.map((span) => JSON.stringify(span)).join('\n') + '\n',
    );

    const { stdout, exitCode } = run(`--logs-dir ${dir} --only langgraph_multiagent`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Missing chain spans');
    expect(stdout).toContain('synthesizer');
    expect(stdout).toContain('report_writer');
  });

});
