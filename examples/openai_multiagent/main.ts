/**
 * Entry point for the OpenAI investment research workflow.
 *
 * Custom TypeScript orchestration — no framework.
 * span() wrappers create the WORKFLOW + AGENT span hierarchy.
 *
 * Usage:
 *     npx tsx examples/openai_multiagent/main.ts
 *     npx tsx examples/openai_multiagent/main.ts "Tesla"
 *
 * Required env vars:
 *     NEATLOGS_API_KEY
 *     AZURE_OPENAI_ENDPOINT
 *     AZURE_OPENAI_API_KEY
 *     AZURE_LLM_DEPLOYMENT (or AZURE_OPENAI_DEPLOYMENT_NAME as fallback)
 */

import 'dotenv/config';

// Deterministic log env vars — set before init
process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/openai_multiagent_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/openai_multiagent_processed_spans.jsonl';

import { init, span, flush, shutdown } from 'neatlogs';

const workflowPrefix = process.env.NEATLOGS_WORKFLOW_PREFIX ?? '';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: `${workflowPrefix}openai-investment-research`,
    tags: ['openai', 'investment', 'research'],
    debug: true,
  });

  // Import the agent definitions after SDK initialization.
  const { plannerAgent, researcherAgent, analystAgent, reporterAgent } = await import('./agents.js');

  const investmentResearchWorkflow = span(
    { kind: 'WORKFLOW', name: `${workflowPrefix}investment_research_workflow` },
    async (company: string): Promise<string> => {
      console.log(`\n=== Investment Research: ${company} ===\n`);

      console.log('--- Planner: generating research questions ---');
      const questions = await plannerAgent(company);
      questions.forEach((q: string, i: number) => console.log(`  ${i + 1}. ${q}`));

      console.log('\n--- Researcher: gathering findings ---');
      const findings = await researcherAgent(questions);

      console.log('\n--- Analyst: analyzing findings ---');
      const analysis = await analystAgent(company, findings);

      console.log('\n--- Reporter: writing investment brief ---');
      const report = await reporterAgent(company, analysis);

      return report;
    },
  );

  const company = process.argv[2] ?? 'NVIDIA';
  await investmentResearchWorkflow(company);
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
