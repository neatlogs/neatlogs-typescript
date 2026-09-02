/**
 * LangChain ReAct agent with custom tools, a mocked retriever, and a report-formatting chain.
 *
 * Topology:
 *   run_workflow (WORKFLOW)
 *     ├── react_agent (CHAIN) — ReAct loop: LLM ↔ tools
 *     │     ├── knowledge_base_search (TOOL → knowledge_base_retriever RETRIEVER)
 *     │     ├── web_search            (TOOL)
 *     │     ├── arxiv_search          (TOOL)
 *     │     └── calculate             (TOOL)
 *     └── report_writer (CHAIN) — formats final report
 *
 * Tools are mocked (no real HTTP calls or embeddings).
 * Uses Azure OpenAI via @langchain/openai AzureChatOpenAI.
 *
 * Usage:
 *   npx tsx examples/langchain_react/main.ts
 *
 * Required env vars:
 *   NEATLOGS_API_KEY
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_ENDPOINT
 *   AZURE_LLM_DEPLOYMENT or AZURE_OPENAI_DEPLOYMENT_NAME
 */

import 'dotenv/config';

// ---------------------------------------------------------------------------
// Deterministic log env vars — must be set before init
// ---------------------------------------------------------------------------
process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/langchain_react_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/langchain_react_processed_spans.jsonl';

import {
  init,
  span,
  trace,
  flush,
  shutdown,
  PromptTemplate,
  UserPromptTemplate,
} from 'neatlogs';

const workflowPrefix = process.env.NEATLOGS_WORKFLOW_PREFIX ?? '';

// ---------------------------------------------------------------------------
// Mocked knowledge-base data
// ---------------------------------------------------------------------------

const KNOWLEDGE_BASE: Record<string, string[]> = {
  quantum: [
    'Quantum computers use qubits that can exist in superposition, enabling parallel computation.',
    'Variational Quantum Eigensolvers (VQE) can simulate molecular energy surfaces cheaply.',
    'Quantum annealing is used for combinatorial optimization problems in drug binding.',
  ],
  drug: [
    'Drug discovery involves target identification, hit finding, lead optimization, and clinical trials.',
    'Molecular docking predicts how small molecules bind to protein targets.',
    'ADMET properties (absorption, distribution, metabolism, excretion, toxicity) filter drug candidates.',
  ],
  default: [
    'Recent advances combine classical ML with domain-specific algorithms for improved accuracy.',
    'Hybrid quantum-classical approaches show promise for near-term NISQ devices.',
    'Benchmarking studies show 10-100x speedup on specific problem classes.',
  ],
};

// ---------------------------------------------------------------------------
// Prompt templates (neatlogs)
// ---------------------------------------------------------------------------

const reactSystemPrompt = new PromptTemplate(
  'You are a research assistant with access to tools. '
  + 'Use them to gather information, then provide a comprehensive answer. '
  + 'Always search the knowledge base first, then supplement with web and arxiv searches.',
);

const reactUserPrompt = new UserPromptTemplate([{
  role: 'user',
  content: 'Research the following topic thoroughly: {{topic}}',
}]);

const reportSystemPrompt = new PromptTemplate([{
  role: 'system',
  content: 'You are a technical writer. Format the research findings into a concise structured report.',
}]);

const reportUserPrompt = new UserPromptTemplate([{
  role: 'user',
  content: 'Topic: {{topic}}\n\nResearch findings:\n{{findings}}\n\nWrite a short structured report.',
}]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: `${workflowPrefix}langchain-react-agent`,
    tags: ['langchain', 'react', 'research', 'retriever'],
    instrumentations: ['langchain'],
    debug: true,
  });

  // IMPORTANT: Import LangChain modules AFTER init() so instrumentation patches them
  const { AzureChatOpenAI } = await import('@langchain/openai');
  const { tool: lcTool } = await import('@langchain/core/tools');
  const { ChatPromptTemplate } = await import('@langchain/core/prompts');
  const { z } = await import('zod');

  // ---------------------------------------------------------------------------
  // Azure OpenAI LLM — created lazily after init()
  // ---------------------------------------------------------------------------
  const deployment = process.env.AZURE_LLM_DEPLOYMENT
    ?? process.env.AZURE_OPENAI_DEPLOYMENT_NAME
    ?? 'gpt-5-nano';

  const llm = new AzureChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAIApiDeploymentName: deployment,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
  });

  // ---------------------------------------------------------------------------
  // Mocked tools
  // ---------------------------------------------------------------------------

  const knowledgeBaseSearch = lcTool(
    async (input): Promise<string> => {
      const query = (input as { query: string }).query;
      // Wrap in a RETRIEVER trace for span topology
      return trace({ name: 'knowledge_base_retriever', kind: 'RETRIEVER' }, async (span) => {
        span.setAttribute('neatlogs.retrieval.query', query);
        span.setAttribute('neatlogs.retrieval.top_k', 4);
        const queryLower = query.toLowerCase();
        const docs: Array<{ content: string; source: string }> = [];

        for (const [keyword, passages] of Object.entries(KNOWLEDGE_BASE)) {
          if (queryLower.includes(keyword)) {
            docs.push(...passages.map(p => ({ content: p, source: `kb_${keyword}` })));
          }
        }
        if (docs.length === 0) {
          docs.push(...KNOWLEDGE_BASE.default.map(p => ({ content: p, source: 'kb_default' })));
        }
        const sliced = docs.slice(0, 4);
        span.setAttribute('neatlogs.retrieval.documents', JSON.stringify(sliced));
        return `Knowledge base results for '${query}':\n` + sliced.map(d => `- ${d.content}`).join('\n');
      });
    },
    {
      name: 'knowledge_base_search',
      description: 'Search the internal knowledge base for background facts on a topic.',
      schema: z.object({ query: z.string().describe('The search query') }),
    },
  );

  const webSearch = lcTool(
    async (input): Promise<string> => {
      const query = (input as { query: string }).query;
      return (
        `Web search results for '${query}':\n`
        + '- Recent developments show significant progress in this area.\n'
        + '- Industry experts highlight growing investment and adoption.\n'
        + '- Key players are actively publishing findings and case studies.\n'
        + '- Multiple startups and research groups are advancing the field.'
      );
    },
    {
      name: 'web_search',
      description: 'Search the web for current news and information on a topic.',
      schema: z.object({ query: z.string().describe('The search query') }),
    },
  );

  const arxivSearch = lcTool(
    async (input): Promise<string> => {
      const query = (input as { query: string }).query;
      return (
        `ArXiv papers for '${query}':\n`
        + `- [2024] 'Advances in ${query}: A Systematic Review' — 94% accuracy improvement.\n`
        + `- [2024] 'Benchmarking Methods for ${query}' — new state-of-the-art baselines.\n`
        + `- [2025] 'Scaling ${query} to Production' — practical deployment framework.\n`
        + `- [2025] 'Hybrid Approaches in ${query}' — combines classical and quantum methods.`
      );
    },
    {
      name: 'arxiv_search',
      description: 'Search ArXiv for recent academic papers on a topic.',
      schema: z.object({ query: z.string().describe('The search query') }),
    },
  );

  const calculate = lcTool(
    async (input): Promise<string> => {
      const expression = (input as { expression: string }).expression;
      const allowed = new Set('0123456789+-*/.() '.split(''));
      if (![...expression].every(c => allowed.has(c))) {
        return 'Error: only basic arithmetic is supported.';
      }
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        return String(result);
      } catch (e) {
        return `Error: ${e}`;
      }
    },
    {
      name: 'calculate',
      description: 'Evaluate a simple arithmetic expression (e.g. "2 ** 10" or "1024 / 8").',
      schema: z.object({ expression: z.string().describe('The arithmetic expression') }),
    },
  );

  const tools = [knowledgeBaseSearch, webSearch, arxivSearch, calculate];

  // ---------------------------------------------------------------------------
  // ReAct agent using @langchain/langgraph createReactAgent
  // ---------------------------------------------------------------------------
  const { createReactAgent } = await import('@langchain/langgraph/prebuilt');

  const agentExecutor = createReactAgent({
    llm,
    tools,
  });

  // ---------------------------------------------------------------------------
  // Report-formatting chain (LangChain LCEL)
  // ---------------------------------------------------------------------------
  const reportSysTpl = reportSystemPrompt.template;
  const reportUserTpl = reportUserPrompt.template;
  const sysMsgContent = Array.isArray(reportSysTpl)
    ? reportSysTpl[0].content
    : reportSysTpl;
  const userMsgContent = Array.isArray(reportUserTpl)
    ? reportUserTpl[0].content.replace(/\{\{/g, '{').replace(/\}\}/g, '}')
    : reportUserTpl.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
  const reportLcPrompt = ChatPromptTemplate.fromMessages([
    ['system', sysMsgContent],
    ['user', userMsgContent],
  ]);
  const reportChain = reportLcPrompt.pipe(llm);

  // ---------------------------------------------------------------------------
  // Workflow
  // ---------------------------------------------------------------------------
  const runWorkflow = span(
    { kind: 'WORKFLOW', name: `${workflowPrefix}react_research_workflow` },
    async (topic: string): Promise<string> => {
      // Step 1: ReAct agent gathers information using tools
      const findings = await trace(
        {
          name: 'react_agent',
          kind: 'CHAIN',
          promptTemplate: reactSystemPrompt,
          userPromptTemplate: reactUserPrompt,
        },
        async () => {
          reactSystemPrompt.compile();
          reactUserPrompt.compile({ topic });
          const result = await agentExecutor.invoke({
            messages: [{ role: 'user', content: topic }],
          });
          // Extract the last AI message content
          const msgs = result.messages ?? [];
          const lastAi = [...msgs].reverse().find(
            (m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage',
          );
          return lastAi?.content ?? '';
        },
      );

      // Step 2: Format findings into a report
      const report = await trace(
        {
          name: 'report_writer',
          kind: 'CHAIN',
          promptTemplate: reportSystemPrompt,
          userPromptTemplate: reportUserPrompt,
        },
        async () => {
          reportSystemPrompt.compile();
          reportUserPrompt.compile({ topic, findings: String(findings) });
          const result = await reportChain.invoke({ topic, findings: String(findings) });
          if (typeof result === 'object' && 'content' in result) {
            return String(result.content);
          }
          return String(result);
        },
      );

      return report;
    },
  );

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------
  const topic = 'quantum computing in drug discovery';
  console.log(`Researching: ${topic}\n`);
  const report = await runWorkflow(topic);
  console.log('\n--- Final Report ---');
  console.log(report);

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
