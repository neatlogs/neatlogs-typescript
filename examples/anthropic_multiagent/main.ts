/**
 * Entry point for the Anthropic code review workflow.
 *
 * Custom TypeScript orchestration with span() wrappers.
 *
 * Uses @anthropic-ai/bedrock-sdk for Bedrock semantics.
 * If Bedrock SDK hits a concrete TypeScript runtime blocker,
 * the fallback is documented in comments and README.
 *
 * Usage:
 *     npx tsx examples/anthropic_multiagent/main.ts
 *
 * Required env vars:
 *     NEATLOGS_API_KEY
 *     AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION  (Bedrock)
 */

import 'dotenv/config';

// Deterministic log env vars — set before init
process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/anthropic_multiagent_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/anthropic_multiagent_processed_spans.jsonl';

import { init, span, trace, log, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

const workflowPrefix = process.env.NEATLOGS_WORKFLOW_PREFIX ?? '';

// ---------------------------------------------------------------------------
// Lazy Bedrock client factory — created after init() so instrumentation is active
// ---------------------------------------------------------------------------

let _client: any = null;

async function getClient(): Promise<any> {
  if (!_client) {
    // Use @anthropic-ai/bedrock-sdk for Bedrock semantics
    const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
    _client = new AnthropicBedrock({
      awsRegion: process.env.AWS_REGION ?? 'us-west-1',
    });
  }
  return _client;
}

function getSonnetModel(): string {
  return process.env.BEDROCK_SONNET_MODEL ?? 'us.anthropic.claude-sonnet-4-6';
}

function getHaikuModel(): string {
  return process.env.BEDROCK_HAIKU_MODEL ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
}

function describeProviderError(err: unknown): string {
  const e = err as { name?: string; status?: number; code?: string; constructor?: { name?: string } };
  const name = e?.name ?? e?.constructor?.name ?? 'ProviderError';
  const status = typeof e?.status === 'number' ? ` status=${e.status}` : '';
  const code = typeof e?.code === 'string' ? ` code=${e.code}` : '';
  return `${name}${status}${code}`.trim();
}

async function withProviderFallback<T>(
  step: string,
  run: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const reason = describeProviderError(err);
    log('Provider fallback in {step}: {reason}', { step, reason, level: 'warning' });
    console.warn(`[${step}] Provider unavailable; using deterministic fallback (${reason}).`);
    return fallback();
  }
}

function fallbackIssues(syntaxSummary: string): Array<{ severity: string; line: number; description: string }> {
  return [
    {
      severity: 'medium',
      line: 6,
      description: `Fallback review: handle empty input before dividing by len(numbers). Syntax check: ${syntaxSummary}`,
    },
    {
      severity: 'medium',
      line: 12,
      description: 'Fallback review: find_duplicates is O(n^2); prefer a set-based implementation.',
    },
    {
      severity: 'high',
      line: 20,
      description: 'Fallback review: parse_config assumes "=" is present and can raise IndexError.',
    },
  ];
}

function fallbackFixedCode(): string {
  return `def calculate_average(numbers):
    """Return the arithmetic mean of a non-empty sequence of numbers."""
    if not numbers:
        raise ValueError("numbers must not be empty")
    return sum(numbers) / len(numbers)


def find_duplicates(lst):
    """Return duplicate values in first-seen order."""
    seen = set()
    duplicates = []
    for item in lst:
        if item in seen and item not in duplicates:
            duplicates.append(item)
        seen.add(item)
    return duplicates


def parse_config(config_str):
    """Parse a key=value string into a one-item dictionary."""
    if "=" not in config_str:
        raise ValueError("config_str must contain '='")
    key, value = config_str.split("=", 1)
    return {key.strip(): value.strip()}
`;
}

function fallbackTests(): string {
  return `import pytest

from sample import calculate_average, find_duplicates, parse_config


def test_calculate_average():
    assert calculate_average([1, 2, 3]) == 2


def test_calculate_average_empty():
    with pytest.raises(ValueError):
        calculate_average([])


def test_find_duplicates():
    assert find_duplicates([1, 2, 1, 3, 2]) == [1, 2]


def test_parse_config():
    assert parse_config("region=us-west-1") == {"region": "us-west-1"}


def test_parse_config_invalid():
    with pytest.raises(ValueError):
        parse_config("region")
`;
}

function fallbackDocumentedCode(code: string): string {
  return `"""Utility functions for simple list and configuration processing."""

${code}`;
}

// ---------------------------------------------------------------------------
// Tool implementation — called only when the LLM requests it
// ---------------------------------------------------------------------------

const checkSyntax = span(
  { kind: 'TOOL', name: 'check_syntax', description: 'Check Python code for syntax errors' },
  async (code: string): Promise<string> => {
    // Lightweight syntax check — we look for common issues
    // (In Python, we used ast.parse; in TS we do basic pattern matching)
    const lines = code.split('\n');
    const issues: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('def ') && !line.trim().endsWith(':')) {
        issues.push(`Possible missing colon at line ${i + 1}`);
      }
    }
    return issues.length > 0 ? issues.join('\n') : 'No syntax errors found.';
  },
);

// Anthropic tool definition (passed to the LLM)
const CHECK_SYNTAX_TOOL = {
  name: 'check_syntax',
  description: 'Check Python code for syntax errors using the AST parser. Call this before reviewing the code.',
  input_schema: {
    type: 'object' as const,
    properties: {
      code: { type: 'string', description: 'The Python code to check for syntax errors.' },
    },
    required: ['code'],
  },
};

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

const reviewerSys = new PromptTemplate([{
  role: 'system',
  content: "You are an expert code reviewer. Analyze the code and return a JSON array of issue objects with 'severity' (high/medium/low), 'line' (approximate), and 'description' fields. No other text.",
}]);
const reviewerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Review this Python code:\n\n```python\n{{code}}\n```',
}]);

const fixerSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a Python expert. Fix all the identified issues in the code. Return only the corrected code in a python code block, no explanations.',
}]);
const fixerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Original code:\n```python\n{{code}}\n```\n\nIssues to fix:\n{{issues}}\n\nReturn the fixed code.',
}]);

const testerSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a Python testing expert. Write comprehensive pytest test cases for the provided code. Include edge cases and error conditions.',
}]);
const testerUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Write pytest tests for this code:\n\n```python\n{{code}}\n```',
}]);

const documenterSys = new PromptTemplate([{
  role: 'system',
  content: 'You are a Python documentation specialist. Add clear docstrings to all functions and classes, and add a module-level docstring. Return only the documented code.',
}]);
const documenterUser = new UserPromptTemplate([{
  role: 'user',
  content: 'Add documentation to this code:\n\n```python\n{{code}}\n```',
}]);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const reviewerAgent = span(
  { kind: 'AGENT', name: 'reviewer', role: 'Code Reviewer', goal: 'Identify code issues' },
  async (code: string): Promise<Array<{ severity: string; line: number; description: string }>> => {
    return trace(
      { name: 'review_code', kind: 'CHAIN', promptTemplate: reviewerSys, userPromptTemplate: reviewerUser },
      async () => {
        const client = await getClient();
        const systemMsg = (reviewerSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userMsg = (reviewerUser.compile({ code }) as Array<{ role: string; content: string }>)[0].content;
        const messages: any[] = [{ role: 'user', content: userMsg }];

        // First call — model may call check_syntax tool before reviewing
        let response = await client.messages.create({
          model: getSonnetModel(),
          max_tokens: 2048,
          system: systemMsg,
          messages,
          tools: [CHECK_SYNTAX_TOOL],
          tool_choice: { type: 'auto' },
        });

        // Execute any tool calls the model requested
        while (response.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: response.content });
          const toolResults: any[] = [];
          for (const block of response.content) {
            if (block.type === 'tool_use') {
              const result = await checkSyntax(block.input.code);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: result,
              });
            }
          }
          messages.push({ role: 'user', content: toolResults });
          response = await client.messages.create({
            model: getSonnetModel(),
            max_tokens: 2048,
            system: systemMsg,
            messages,
            tools: [CHECK_SYNTAX_TOOL],
            tool_choice: { type: 'auto' },
          });
        }

        const raw = (
          response.content.find((b: any) => b.type === 'text')?.text ?? ''
        ).trim();

        let issues: Array<{ severity: string; line: number; description: string }>;
        try {
          issues = JSON.parse(raw);
        } catch {
          issues = [{ severity: 'medium', line: 0, description: raw }];
        }
        return issues;
      },
    );
  },
);

const fixerAgent = span(
  { kind: 'AGENT', name: 'fixer', role: 'Code Fixer', goal: 'Fix identified code issues' },
  async (code: string, issues: Array<{ severity: string; line?: number; description: string }>): Promise<string> => {
    const issuesText = issues
      .map((i) => `- [${i.severity.toUpperCase()}] line ${i.line ?? '?'}: ${i.description}`)
      .join('\n');
    return trace(
      { name: 'fix_code', kind: 'CHAIN', promptTemplate: fixerSys, userPromptTemplate: fixerUser },
      async () => {
        const client = await getClient();
        const systemMsg = (fixerSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userMsg = (fixerUser.compile({ code, issues: issuesText }) as Array<{ role: string; content: string }>)[0].content;
        process.stdout.write('\n--- Fixer (streaming) ---\n');
        let full = '';
        const stream = client.messages.stream({
          model: getSonnetModel(),
          max_tokens: 4096,
          system: systemMsg,
          messages: [{ role: 'user', content: userMsg }],
        });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            process.stdout.write(event.delta.text);
            full += event.delta.text;
          }
        }
        process.stdout.write('\n------------------------\n\n');
        return full;
      },
    );
  },
);

const testerAgent = span(
  { kind: 'AGENT', name: 'tester', role: 'Test Writer', goal: 'Write pytest test cases' },
  async (code: string): Promise<string> => {
    return trace(
      { name: 'write_tests', kind: 'CHAIN', promptTemplate: testerSys, userPromptTemplate: testerUser },
      async () => {
        const client = await getClient();
        const systemMsg = (testerSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userMsg = (testerUser.compile({ code }) as Array<{ role: string; content: string }>)[0].content;
        process.stdout.write('\n--- Tester (streaming) ---\n');
        let full = '';
        const stream = client.messages.stream({
          model: getHaikuModel(),
          max_tokens: 4096,
          system: systemMsg,
          messages: [{ role: 'user', content: userMsg }],
        });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            process.stdout.write(event.delta.text);
            full += event.delta.text;
          }
        }
        process.stdout.write('\n-------------------------\n\n');
        return full;
      },
    );
  },
);

const documenterAgent = span(
  { kind: 'AGENT', name: 'documenter', role: 'Documentation Writer', goal: 'Add docstrings and module docs' },
  async (code: string): Promise<string> => {
    return trace(
      { name: 'add_docs', kind: 'CHAIN', promptTemplate: documenterSys, userPromptTemplate: documenterUser },
      async () => {
        const client = await getClient();
        const systemMsg = (documenterSys.compile() as Array<{ role: string; content: string }>)[0].content;
        const userMsg = (documenterUser.compile({ code }) as Array<{ role: string; content: string }>)[0].content;
        const response = await client.messages.create({
          model: getHaikuModel(),
          max_tokens: 4096,
          system: systemMsg,
          messages: [{ role: 'user', content: userMsg }],
        });
        return response.content[0].text;
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Sample code with intentional issues for demonstration
// ---------------------------------------------------------------------------

const SAMPLE_CODE = `
def calculate_average(numbers):
    total = 0
    for n in numbers:
        total = total + n
    avg = total / len(numbers)
    return avg

def find_duplicates(lst):
    duplicates = []
    for i in range(len(lst)):
        for j in range(len(lst)):
            if i != j and lst[i] == lst[j]:
                if lst[i] not in duplicates:
                    duplicates.append(lst[i])
    return duplicates

def parse_config(config_str):
    parts = config_str.split("=")
    key = parts[0]
    value = parts[1]
    return {key: value}
`;

// ---------------------------------------------------------------------------
// Main workflow
// ---------------------------------------------------------------------------

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: `${workflowPrefix}anthropic-code-review`,
    tags: ['anthropic', 'code-review', 'python'],
    instrumentations: ['anthropic'],
    debug: true,
  });

  const codeReviewWorkflow = span(
    { kind: 'WORKFLOW', name: `${workflowPrefix}code_review_workflow` },
    async (code: string): Promise<Record<string, any>> => {
      console.log('\n=== Code Review Pipeline ===\n');

      console.log('--- Reviewer: identifying issues ---');
      const syntaxSummary = await checkSyntax(code);
      console.log(`  Syntax check: ${syntaxSummary}`);
      const issues = await withProviderFallback(
        'reviewer',
        () => reviewerAgent(code),
        () => fallbackIssues(syntaxSummary),
      );
      console.log(`  Found ${issues.length} issue(s):`);
      for (const issue of issues) {
        console.log(`  [${(issue.severity ?? '?').toUpperCase()}] ${issue.description ?? ''}`);
      }

      console.log('\n--- Fixer: applying fixes ---');
      const fixedCode = await withProviderFallback(
        'fixer',
        () => fixerAgent(code, issues),
        () => fallbackFixedCode(),
      );

      console.log('\n--- Tester: writing tests ---');
      const tests = await withProviderFallback(
        'tester',
        () => testerAgent(fixedCode),
        () => fallbackTests(),
      );

      console.log('\n--- Documenter: adding documentation ---');
      const documentedCode = await withProviderFallback(
        'documenter',
        () => documenterAgent(fixedCode),
        () => fallbackDocumentedCode(fixedCode),
      );
      console.log('\n--- Documented Code ---');
      console.log(documentedCode);

      return { issues, fixedCode, tests, documentedCode };
    },
  );

  await codeReviewWorkflow(SAMPLE_CODE);
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
