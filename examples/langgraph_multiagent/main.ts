/**
 * Entry point for the LangGraph multi-provider research workflow.
 *
 * Topology:
 *   START → supervisor
 *     → web_researcher ⇄ web_tools → web_done
 *     → wiki_researcher ⇄ wiki_tools → wiki_done
 *     → arxiv_researcher ⇄ arxiv_tools → arxiv_done
 *     → synthesizer → report_writer → END
 *
 * Uses:
 *   - Azure OpenAI: supervisor, web researcher, report writer
 *   - Google GenAI (gemini-2.5-flash): wiki researcher, arxiv researcher, synthesizer
 *
 * Usage:
 *   npx tsx examples/langgraph_multiagent/main.ts
 *   npx tsx examples/langgraph_multiagent/main.ts --stream
 *
 * Required env vars:
 *   NEATLOGS_API_KEY
 *   AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY
 *   AZURE_LLM_DEPLOYMENT or AZURE_OPENAI_DEPLOYMENT_NAME
 *   GOOGLE_API_KEY
 */

import 'dotenv/config';

// ---------------------------------------------------------------------------
// Deterministic log env vars — must be set before init
// ---------------------------------------------------------------------------
process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/langgraph_multiagent_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/langgraph_multiagent_processed_spans.jsonl';

import {
  init,
  span,
  flush,
  shutdown,
} from 'neatlogs';

const workflowPrefix = process.env.NEATLOGS_WORKFLOW_PREFIX ?? '';

async function main(): Promise<void> {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: `${workflowPrefix}langgraph-multiagent`,
    tags: ['langgraph', 'multi-provider', 'research'],
    instrumentations: ['langchain'],
    debug: true,
  });

  // Import graph AFTER init so instrumentation patches LangChain classes
  const { buildGraph } = await import('./graph.js');
  const graph = buildGraph();

  // ---------------------------------------------------------------------------
  // Workflow
  // ---------------------------------------------------------------------------
  const runWorkflow = span(
    { kind: 'WORKFLOW', name: `${workflowPrefix}research_workflow` },
    async (query: string, stream: boolean = false): Promise<string> => {
      const initialState = {
        query,
        plan: '',
        web_messages: [],
        wiki_messages: [],
        arxiv_messages: [],
        web_results: '',
        wiki_results: '',
        arxiv_results: '',
        synthesis: '',
        final_report: '',
        messages: [],
      };

      if (stream) {
        console.log(`\nResearching: ${query}\n`);
        for await (const event of await graph.stream(initialState)) {
          for (const nodeName of Object.keys(event)) {
            console.log(`[${nodeName}] completed`);
          }
        }
        return '';
      } else {
        const result = await graph.invoke(initialState);
        return result.final_report ?? '';
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------
  const streamMode = process.argv.includes('--stream');
  const topic = 'CRISPR gene editing in cancer treatment';
  const report = await runWorkflow(topic, streamMode);
  if (!streamMode && report) {
    console.log('\n--- Final Report ---');
    console.log(report);
  }

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
