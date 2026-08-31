/**
 * Mastra multi-agent workflow example with all span kinds.
 *
 * Demonstrates a growth diagnostics workflow with:
 *   - Mastra workflow orchestration (steps, state)
 *   - Google GenAI (@google/genai) for LLM calls
 *   - Tool calls (load account metrics)
 *   - Knowledge base with EMBEDDING, RETRIEVER, RERANKER spans
 *   - neatlogs span() + trace() + log() for observability
 *
 * Span kinds demonstrated:
 *   WORKFLOW (Mastra workflow), AGENT (via neatlogs span),
 *   TOOL (load metrics step), RETRIEVER, EMBEDDING, RERANKER, LLM
 *
 * Usage:
 *     npx tsx examples/sdk_examples/mastra_multiagent/main.ts
 *
 * Required env vars:
 *     GOOGLE_API_KEY (or GEMINI_API_KEY)
 *     OPENAI_API_KEY (for embeddings)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'mastra_multiagent_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'mastra_multiagent_raw_spans.log';
process.env.NEATLOGS_LOG_LOGS ??= 'true';
process.env.NEATLOGS_LOG_LOGS_FILE ??= 'mastra_multiagent_logs.log';

import { init, trace, log, flush, shutdown, getMastraObservability } from 'neatlogs';

async function main() {
  // Initialize the SDK before building the Mastra application.
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'mastra-growth-diagnostics',
    tags: ['mastra', 'workflow'],
    captureLogs: true,
    disableExport: false,
    debug: true,
  });

  // Load application dependencies after SDK initialization.
  const { Mastra } = await import('@mastra/core');
  const { createStep, createWorkflow } = await import('@mastra/core/workflows');
  const { z } = await import('zod');
  const { GoogleGenAI } = await import('@google/genai');
  const OpenAI = (await import('openai')).default;

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) throw new Error('Set GOOGLE_API_KEY or GEMINI_API_KEY');
  const genai = new GoogleGenAI({ apiKey });
  const openaiClient = new OpenAI();

  // ---------------------------------------------------------------------------
  // Knowledge Base (growth strategies)
  // ---------------------------------------------------------------------------

  const STRATEGIES = [
    { id: 'strat-001', title: 'PLG onboarding funnel', content: 'Product-led growth requires frictionless onboarding. Target time-to-value under 5 minutes. Use progressive disclosure.' },
    { id: 'strat-002', title: 'Enterprise expansion playbook', content: 'Land with a team, expand to department, then org-wide. Champion identification and exec sponsorship are critical.' },
    { id: 'strat-003', title: 'Churn prevention signals', content: 'Key churn signals: declining DAU, support ticket spikes, missed QBR meetings. Intervene within 7 days of signal detection.' },
    { id: 'strat-004', title: 'Pricing tier optimization', content: 'Usage-based pricing drives expansion revenue. Free tier converts at 5-8%. Pro tier sweet spot is $50-200/seat/month.' },
    { id: 'strat-005', title: 'Support deflection tactics', content: 'AI chatbots deflect 40% of L1 tickets. Knowledge base search reduces support volume by 30%. In-app guides prevent issues.' },
    { id: 'strat-006', title: 'Retention metrics framework', content: 'Track NRR (target >120%), logo retention (>90%), and feature adoption depth. Weekly active feature count predicts retention.' },
  ];

  let strategyEmbeddings: number[][] | null = null;

  function cosine(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-12);
  }

  // ---------------------------------------------------------------------------
  // EMBEDDING: index strategies
  // ---------------------------------------------------------------------------

  async function indexStrategies(): Promise<void> {
    if (strategyEmbeddings) return;
    await trace({ name: 'index_strategies', kind: 'EMBEDDING' as any }, async (s) => {
      const texts = STRATEGIES.map(a => `${a.title}\n${a.content}`);
      s.setAttribute('neatlogs.embedding.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.embedding.text', JSON.stringify(texts.map(t => t.slice(0, 60))));

      const resp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      strategyEmbeddings = resp.data.map(d => d.embedding);
      s.setAttribute('neatlogs.embedding.token_count', resp.usage.total_tokens);
      log('indexed {count} strategies ({tokens} tokens)', { count: STRATEGIES.length, tokens: resp.usage.total_tokens });
    });
  }

  // ---------------------------------------------------------------------------
  // RETRIEVER: search strategies
  // ---------------------------------------------------------------------------

  async function retrieveStrategies(query: string, topK: number = 3): Promise<Array<{ id: string; title: string; content: string; score: number }>> {
    return trace({ name: 'strategy_search', kind: 'RETRIEVER' as any }, async (s) => {
      s.setAttribute('neatlogs.retriever.query', query);
      s.setAttribute('neatlogs.retriever.top_k', topK);

      const qResp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: [query],
      });
      const qVec = qResp.data[0].embedding;

      const scores = strategyEmbeddings!.map((emb, i) => ({ idx: i, score: cosine(qVec, emb) }));
      scores.sort((a, b) => b.score - a.score);
      const results = scores.slice(0, topK);

      const docs = results.map(r => ({
        id: STRATEGIES[r.idx].id,
        title: STRATEGIES[r.idx].title,
        content: STRATEGIES[r.idx].content,
        score: Math.round(r.score * 10000) / 10000,
      }));
      s.setAttribute('neatlogs.retriever.documents', JSON.stringify(docs));

      log('retrieved {count} strategies for: {query}', { count: results.length, query });
      return docs;
    });
  }

  // ---------------------------------------------------------------------------
  // RERANKER: re-rank strategies
  // ---------------------------------------------------------------------------

  async function rerankStrategies(query: string, docs: Array<{ id: string; title: string; content: string; score: number }>, topK: number = 2): Promise<typeof docs> {
    return trace({ name: 'strategy_reranker', kind: 'RERANKER' as any }, async (s) => {
      s.setAttribute('neatlogs.reranker.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.reranker.query', query);
      s.setAttribute('neatlogs.reranker.top_k', topK);
      s.setAttribute('neatlogs.reranker.input_documents', JSON.stringify(
        docs.map(d => ({ id: d.id, content: d.content })),
      ));

      const texts = [query, ...docs.map(d => d.content)];
      const resp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      const vectors = resp.data.map(d => d.embedding);
      const qVec = vectors[0];

      const scored = docs.map((doc, i) => ({
        doc,
        score: cosine(qVec, vectors[i + 1]),
      }));
      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, topK);

      s.setAttribute('neatlogs.reranker.output_documents', JSON.stringify(
        topResults.map(r => ({
          id: r.doc.id,
          content: r.doc.content,
          score: Math.round(r.score * 10000) / 10000,
        })),
      ));

      log('reranked {input} strategies → top {output}', { input: docs.length, output: topResults.length });
      return topResults.map(r => ({ ...r.doc, score: Math.round(r.score * 10000) / 10000 }));
    });
  }

  // ---------------------------------------------------------------------------
  // Workflow steps
  // ---------------------------------------------------------------------------

  const loadMetricsStep = createStep({
    id: 'load-metrics',
    inputSchema: z.object({ accountId: z.string(), company: z.string() }),
    outputSchema: z.object({ accountId: z.string(), company: z.string(), activeUsers: z.number(), churnRisk: z.number() }),
    execute: async ({ inputData }: any) => {
      log('loading metrics for {accountId}', { accountId: inputData.accountId });
      const res = await fetch('https://jsonplaceholder.typicode.com/users/1');
      const user = (await res.json()) as { id: number };
      return {
        accountId: inputData.accountId,
        company: inputData.company,
        activeUsers: user.id * 50000,
        churnRisk: 0.18,
      };
    },
  });

  const researchStep = createStep({
    id: 'research-strategies',
    inputSchema: z.object({ accountId: z.string(), company: z.string(), activeUsers: z.number(), churnRisk: z.number() }),
    outputSchema: z.object({ company: z.string(), activeUsers: z.number(), churnRisk: z.number(), strategyContext: z.string() }),
    execute: async ({ inputData }: any) => {
      log('researching strategies for {company}', { company: inputData.company });
      await indexStrategies();
      const query = `${inputData.company} churn risk ${inputData.churnRisk} active users growth`;
      const retrieved = await retrieveStrategies(query);
      const reranked = await rerankStrategies(query, retrieved);
      const strategyContext = reranked.map(s => `[${s.title}] ${s.content}`).join('\n');
      return {
        company: inputData.company,
        activeUsers: inputData.activeUsers,
        churnRisk: inputData.churnRisk,
        strategyContext,
      };
    },
  });

  const agentPlanStep = createStep({
    id: 'agent-plan',
    inputSchema: z.object({ company: z.string(), activeUsers: z.number(), churnRisk: z.number(), strategyContext: z.string() }),
    outputSchema: z.object({ company: z.string(), agentText: z.string() }),
    execute: async ({ inputData }: any) => {
      log('generating growth plan for {company}', { company: inputData.company });
      const result = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Company: ${inputData.company}. Active users: ${inputData.activeUsers}. Churn risk: ${inputData.churnRisk}.\n\nRelevant strategies:\n${inputData.strategyContext}\n\nCreate a concise 3-point growth plan in under 100 words, informed by the strategies above.`,
        config: { temperature: 0.3, maxOutputTokens: 1024 },
      });
      const text = result.text ?? '';
      console.log(`  [agent-plan] ${text.slice(0, 80)}...`);
      return { company: inputData.company, agentText: text };
    },
  });

  const finalizeStep = createStep({
    id: 'finalize-plan',
    inputSchema: z.object({ company: z.string(), agentText: z.string() }),
    outputSchema: z.object({ company: z.string(), plan: z.object({ title: z.string(), actions: z.array(z.string()) }) }),
    execute: async ({ inputData }: any) => {
      log('finalizing plan for {company}', { company: inputData.company });
      return {
        company: inputData.company,
        plan: {
          title: `${inputData.company} growth plan`,
          actions: [
            'Prioritize enterprise onboarding',
            'Instrument support deflection',
            `Use agent insight: ${inputData.agentText}`,
          ],
        },
      };
    },
  });

  // ---------------------------------------------------------------------------
  // Workflow assembly
  // ---------------------------------------------------------------------------

  const growthWorkflow = createWorkflow({
    id: 'growth-diagnostics-workflow',
    inputSchema: z.object({ accountId: z.string(), company: z.string() }),
    outputSchema: z.object({ company: z.string(), plan: z.object({ title: z.string(), actions: z.array(z.string()) }) }),
  })
    .then(loadMetricsStep)
    .then(researchStep)
    .then(agentPlanStep)
    .then(finalizeStep)
    .commit();

  const mastra = new Mastra({
    observability: await getMastraObservability(),
    workflows: { growthWorkflow },
  });

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  log('starting workflow for {company}', { company: 'Atlas Retail AI' });
  console.log('\n=== Growth Diagnostics: Atlas Retail AI ===\n');

  const workflow = mastra.getWorkflow('growthWorkflow');
  const run = await workflow.createRun();
  const result = await run.start({
    inputData: {
      accountId: 'acct-demo-001',
      company: 'Atlas Retail AI',
    },
  });

  log('workflow complete, status: {status}', { status: result?.status ?? 'done' });
  console.log('\n[result]', JSON.stringify(result, null, 2));

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error('[mastra] failed', err);
  process.exitCode = 1;
});
