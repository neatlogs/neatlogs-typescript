/**
 * Entry point for the OpenAI investment research workflow.
 * TypeScript port of: examples/sdk_examples/openai_multiagent/main.py
 *
 * Custom TypeScript orchestration — no framework.
 * spanWrap() calls create the WORKFLOW + AGENT span hierarchy.
 *
 * Usage:
 *   npx ts-node src/main.ts
 *   npx ts-node src/main.ts "Tesla"
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

import * as neatlogs from "../../src/neatlogs";
import { plannerAgent, researcherAgent, analystAgent, reporterAgent } from "./agents";

// ---------------------------------------------------------------------------
// Initialize NeatLogs SDK
// ---------------------------------------------------------------------------

neatlogs.init({
  apiKey: process.env.NEATLOGS_API_KEY,
  endpoint: process.env.NEATLOGS_ENDPOINT || "https://staging-cloud.neatlogs.com",
  workflowName: "openai-investment-research",
  tags: ["openai", "investment", "research", "typescript"],
  debug: true,
});

// ---------------------------------------------------------------------------
// Workflow — wraps the full multi-agent pipeline
// ---------------------------------------------------------------------------

const runInvestmentResearch = neatlogs.spanWrap(
  { kind: "WORKFLOW", name: "investment_research_workflow" },
  async (company: string): Promise<string> => {
    console.log(`\n=== Investment Research: ${company} ===\n`);

    console.log("--- Planner: generating research questions ---");
    const questions = await plannerAgent(company);
    questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

    console.log("\n--- Researcher: gathering findings ---");
    const findings = await researcherAgent(questions);

    console.log("\n--- Analyst: analyzing findings ---");
    const analysis = await analystAgent(company, findings);

    console.log("\n--- Reporter: writing investment brief ---");
    const report = await reporterAgent(company, analysis);

    return report;
  }
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const company = process.argv[2] ?? "NVIDIA";

  try {
    const report = await runInvestmentResearch(company);
    console.log("\n=== Final Report ===");
    console.log(report);
  } catch (err) {
    console.error("Workflow failed:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[neatlogs] Flushing spans...");
    await neatlogs.flush();
    // Second flush ensures the completion marker (emitted during root span onEnd)
    // is exported — it queues into BatchSpanProcessor after the first flush starts.
    await new Promise((r) => setTimeout(r, 500));
    await neatlogs.flush();
    await neatlogs.shutdown();
    console.log("[neatlogs] Done.");
  }
}

main();
