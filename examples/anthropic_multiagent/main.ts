/**
 * Anthropic Code Review Workflow — TypeScript port
 * Original Python: examples/sdk_examples/anthropic_multiagent/
 *
 * Multi-agent code review pipeline using Azure OpenAI (adapted from Anthropic/Bedrock original).
 * Agents: Reviewer → Fixer → Tester → Documenter
 *
 * Uses spanWrap() to create AGENT spans and withTrace() for LLM spans.
 *
 * Usage:
 *   npx tsx --env-file=.env examples/anthropic_multiagent/main.ts
 *
 * Required env vars:
 *   NEATLOGS_API_KEY
 *   NEATLOGS_ENDPOINT
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_ENDPOINT
 *   AZURE_OPENAI_DEPLOYMENT_NAME
 *   AZURE_OPENAI_API_VERSION
 */

import * as dotenv from "dotenv";
dotenv.config();

import OpenAI, { AzureOpenAI } from "openai";
import * as neatlogs from "../../src/neatlogs";

// ---------------------------------------------------------------------------
// Initialize NeatLogs SDK
// ---------------------------------------------------------------------------

neatlogs.init({
  apiKey: process.env.NEATLOGS_API_KEY,
  endpoint: process.env.NEATLOGS_ENDPOINT || "https://staging-cloud.neatlogs.com",
  workflowName: "anthropic-code-review",
  tags: ["code-review", "multi-agent", "typescript"],
  debug: true,
});

// ---------------------------------------------------------------------------
// Azure OpenAI client
// ---------------------------------------------------------------------------

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview",
});

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT_NAME!;

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

const _reviewerSys = new neatlogs.PromptTemplate([{
  role: "system",
  content:
    "You are an expert code reviewer. Analyze the code and return a JSON array of issue objects " +
    "with 'severity' (high/medium/low), 'line' (approximate), and 'description' fields. No other text.",
}]);

const _reviewerUser = new neatlogs.UserPromptTemplate([{
  role: "user",
  content: "Review this code:\n\n```\n{{code}}\n```",
}]);

const _fixerSys = new neatlogs.PromptTemplate([{
  role: "system",
  content:
    "You are a code expert. Fix all the identified issues in the code. " +
    "Return only the corrected code in a code block, no explanations.",
}]);

const _fixerUser = new neatlogs.UserPromptTemplate([{
  role: "user",
  content: "Original code:\n```\n{{code}}\n```\n\nIssues to fix:\n{{issues}}\n\nReturn the fixed code.",
}]);

const _testerSys = new neatlogs.PromptTemplate([{
  role: "system",
  content:
    "You are a testing expert. Write comprehensive test cases for the provided code. " +
    "Include edge cases and error conditions.",
}]);

const _testerUser = new neatlogs.UserPromptTemplate([{
  role: "user",
  content: "Write tests for this code:\n\n```\n{{code}}\n```",
}]);

const _documenterSys = new neatlogs.PromptTemplate([{
  role: "system",
  content:
    "You are a documentation specialist. Add clear docstrings/comments to all functions and classes. " +
    "Return only the documented code.",
}]);

const _documenterUser = new neatlogs.UserPromptTemplate([{
  role: "user",
  content: "Add documentation to this code:\n\n```\n{{code}}\n```",
}]);

// ---------------------------------------------------------------------------
// Tool implementation — check_syntax wrapped with TOOL span
// ---------------------------------------------------------------------------

const checkSyntax = neatlogs.spanWrap(
  { kind: "TOOL", name: "check_syntax", toolName: "check_syntax", description: "Check code for syntax errors" },
  async (code: string): Promise<string> => {
    // Simple heuristic syntax check (no AST parser in JS for arbitrary languages)
    const issues: string[] = [];
    const lines = code.split("\n");
    let openBraces = 0;
    for (let i = 0; i < lines.length; i++) {
      openBraces += (lines[i].match(/\{/g) || []).length;
      openBraces -= (lines[i].match(/\}/g) || []).length;
    }
    if (openBraces !== 0) {
      issues.push(`Unbalanced braces: ${openBraces > 0 ? "missing closing" : "extra closing"} braces`);
    }
    return issues.length === 0 ? "No syntax errors found." : `Syntax issues: ${issues.join("; ")}`;
  }
);

// Tool definition for LLM
const CHECK_SYNTAX_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "check_syntax",
    description: "Check code for syntax errors before reviewing.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "The code to check for syntax errors." },
      },
      required: ["code"],
    },
  },
};

// ---------------------------------------------------------------------------
// Reviewer agent — with tool-calling (check_syntax before reviewing)
// ---------------------------------------------------------------------------

const reviewerAgent = neatlogs.spanWrap(
  { kind: "AGENT", name: "reviewer", role: "Code Reviewer", goal: "Identify code issues" },
  async (code: string): Promise<Array<{ severity: string; line: number; description: string }>> => {
    const systemMsg = _reviewerSys.compile({})[0].content;
    const userMsg = _reviewerUser.compile({ code })[0].content;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ];

    let raw = "";

    await neatlogs.withTrace(
      { name: "review_code", kind: "LLM", promptTemplate: _reviewerSys, userPromptTemplate: _reviewerUser },
      async () => {
        // First call — model may call check_syntax tool
        let response = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages,
          tools: [CHECK_SYNTAX_TOOL],
          tool_choice: "auto",
        });

        // Execute any tool calls
        while (response.choices[0].finish_reason === "tool_calls") {
          const aiMsg = response.choices[0].message;
          messages.push(aiMsg as OpenAI.ChatCompletionMessageParam);

          const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];
          for (const tc of aiMsg.tool_calls ?? []) {
            if (tc.type !== "function") continue;
            const args = JSON.parse(tc.function.arguments) as { code: string };
            const result = await checkSyntax(args.code);
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
          }
          messages.push(...toolResults);

          response = await client.chat.completions.create({
            model: DEPLOYMENT,
            messages,
            tools: [CHECK_SYNTAX_TOOL],
            tool_choice: "auto",
          });
        }

        raw = response.choices[0].message.content?.trim() ?? "";
        return raw;
      }
    );

    try {
      return JSON.parse(raw) as Array<{ severity: string; line: number; description: string }>;
    } catch {
      return [{ severity: "medium", line: 0, description: raw }];
    }
  }
);

// ---------------------------------------------------------------------------
// Fixer agent — streaming
// ---------------------------------------------------------------------------

const fixerAgent = neatlogs.spanWrap(
  { kind: "AGENT", name: "fixer", role: "Code Fixer", goal: "Fix identified code issues" },
  async (code: string, issues: Array<{ severity: string; line: number; description: string }>): Promise<string> => {
    const issuesText = issues
      .map((i) => `- [${i.severity.toUpperCase()}] line ${i.line ?? "?"}: ${i.description}`)
      .join("\n");

    const systemMsg = _fixerSys.compile({})[0].content;
    const userMsg = _fixerUser.compile({ code, issues: issuesText })[0].content;

    let full = "";
    await neatlogs.withTrace(
      { name: "fix_code", kind: "LLM", promptTemplate: _fixerSys, userPromptTemplate: _fixerUser },
      async () => {
        console.log("\n--- Fixer (streaming) ---");
        const stream = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          stream: true,
          stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            process.stdout.write(delta);
            full += delta;
          }
        }
        console.log("\n------------------------\n");
        return full;
      }
    );

    return full;
  }
);

// ---------------------------------------------------------------------------
// Tester agent — streaming
// ---------------------------------------------------------------------------

const testerAgent = neatlogs.spanWrap(
  { kind: "AGENT", name: "tester", role: "Test Writer", goal: "Write test cases" },
  async (code: string): Promise<string> => {
    const systemMsg = _testerSys.compile({})[0].content;
    const userMsg = _testerUser.compile({ code })[0].content;

    let full = "";
    await neatlogs.withTrace(
      { name: "write_tests", kind: "LLM", promptTemplate: _testerSys, userPromptTemplate: _testerUser },
      async () => {
        console.log("\n--- Tester (streaming) ---");
        const stream = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          stream: true,
          stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            process.stdout.write(delta);
            full += delta;
          }
        }
        console.log("\n-------------------------\n");
        return full;
      }
    );

    return full;
  }
);

// ---------------------------------------------------------------------------
// Documenter agent — non-streaming
// ---------------------------------------------------------------------------

const documenterAgent = neatlogs.spanWrap(
  { kind: "AGENT", name: "documenter", role: "Documentation Writer", goal: "Add docstrings and module docs" },
  async (code: string): Promise<string> => {
    const systemMsg = _documenterSys.compile({})[0].content;
    const userMsg = _documenterUser.compile({ code })[0].content;

    let result = "";
    await neatlogs.withTrace(
      { name: "add_docs", kind: "LLM", promptTemplate: _documenterSys, userPromptTemplate: _documenterUser },
      async () => {
        const response = await client.chat.completions.create({
          model: DEPLOYMENT,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
        });
        result = response.choices[0].message.content ?? "";
        return result;
      }
    );

    return result;
  }
);

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

const SAMPLE_CODE = `
function calculateAverage(numbers) {
  let total = 0;
  for (let n of numbers) {
    total = total + n;
  }
  const avg = total / numbers.length;
  return avg;
}

function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      if (i !== j && arr[i] === arr[j]) {
        if (!duplicates.includes(arr[i])) {
          duplicates.push(arr[i]);
        }
      }
    }
  }
  return duplicates;
}

function parseConfig(configStr) {
  const parts = configStr.split("=");
  const key = parts[0];
  const value = parts[1];
  return { [key]: value };
}
`;

const runCodeReview = neatlogs.spanWrap(
  { kind: "WORKFLOW", name: "code_review_workflow" },
  async (code: string): Promise<{
    issues: Array<{ severity: string; line: number; description: string }>;
    fixedCode: string;
    tests: string;
    documentedCode: string;
  }> => {
    console.log("\n=== Code Review Pipeline ===\n");

    console.log("--- Reviewer: identifying issues ---");
    const issues = await reviewerAgent(code);
    console.log(`  Found ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.log(`  [${(issue.severity ?? "?").toUpperCase()}] ${issue.description}`);
    }

    console.log("\n--- Fixer: applying fixes ---");
    const fixedCode = await fixerAgent(code, issues);

    console.log("\n--- Tester: writing tests ---");
    const tests = await testerAgent(fixedCode);

    console.log("\n--- Documenter: adding documentation ---");
    const documentedCode = await documenterAgent(fixedCode);
    console.log("\n--- Documented Code ---");
    console.log(documentedCode);

    return { issues, fixedCode, tests, documentedCode };
  }
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    await runCodeReview(SAMPLE_CODE);
  } catch (err) {
    console.error("Workflow failed:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[neatlogs] Flushing spans...");
    await neatlogs.flush();
    await new Promise((r) => setTimeout(r, 500));
    await neatlogs.flush();
    await neatlogs.shutdown();
    console.log("[neatlogs] Done.");
  }
}

main();
