/**
 * LangGraph multi-provider research workflow with all span kinds.
 *
 * Topology:
 *   START → planner
 *             ↓              ↓             ↓          (parallel fan-out)
 *     web_researcher    kb_researcher    arxiv_researcher
 *          ⇅ web_tools       (retriever+reranker)     ⇅ arxiv_tools
 *     web_done          kb_done          arxiv_done
 *             ↓              ↓             ↓          (fan-in)
 *                       synthesizer
 *                           ↓
 *                     report_writer → END
 *
 * Span kinds demonstrated:
 *   WORKFLOW, AGENT, TOOL, RETRIEVER, EMBEDDING, RERANKER, LLM
 *
 * Providers:
 *   - OpenAI (gpt-4o-mini) — planner, report writer (streaming), embeddings
 *   - Anthropic (claude-haiku) — web researcher
 *   - Google GenAI (gemini-2.5-flash) — arxiv researcher, synthesizer
 *
 * Usage:
 *     npx tsx examples/sdk_examples/langgraph_multiagent/main.ts
 *     npx tsx examples/sdk_examples/langgraph_multiagent/main.ts "quantum computing in drug discovery"
 *
 * Required env vars:
 *     OPENAI_API_KEY
 *     ANTHROPIC_API_KEY
 *     GOOGLE_API_KEY (or GEMINI_API_KEY)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'langgraph_multiagent_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'langgraph_multiagent_raw_spans.log';
process.env.NEATLOGS_LOG_LOGS ??= 'true';
process.env.NEATLOGS_LOG_LOGS_FILE ??= 'langgraph_multiagent_logs.log';

import { init, span, trace, log, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'langgraph-research-pipeline',
    tags: ['langgraph', 'multi-provider', 'research'],
    instrumentations: ['langchain', 'openai'],
    captureLogs: true,
    disableExport: false,
    debug: true,
  });

  const { ChatOpenAI } = await import('@langchain/openai');
  const { ChatAnthropic } = await import('@langchain/anthropic');
  const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
  const { Document } = await import('@langchain/core/documents');
  const { tool } = await import('@langchain/core/tools');
  const { StateGraph, START, END, Annotation } = await import('@langchain/langgraph');
  const { z } = await import('zod');
  const OpenAI = (await import('openai')).default;

  // ---------------------------------------------------------------------------
  // State Definition
  // ---------------------------------------------------------------------------

  const ResearchState = Annotation.Root({
    query: Annotation<string>(),
    plan: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    webResults: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    kbResults: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    arxivResults: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    synthesis: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    finalReport: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  });

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  const openaiLlm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 2048 });
  const anthropicLlm = new ChatAnthropic({ model: 'claude-haiku-4-5-20251001', temperature: 0, maxTokens: 2048 });
  const geminiLlm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: 0, maxOutputTokens: 2048 });
  const openaiClient = new OpenAI();

  // ---------------------------------------------------------------------------
  // Knowledge Base (for EMBEDDING / RETRIEVER / RERANKER spans)
  // ---------------------------------------------------------------------------

  const ARTICLES = [
    { id: 'ai-001', title: 'LLM scaling laws', content: 'Large language models have grown from 1B to 1T+ parameters in 5 years. Scaling laws predict performance gains with compute.' },
    { id: 'ai-002', title: 'Transformer vs SSM', content: 'Transformer architecture remains dominant but state-space models (Mamba, S4) show promise for long-context tasks.' },
    { id: 'ai-003', title: 'Enterprise AI spending', content: 'AI spending by enterprises reached $150B in 2024, up 40% year-over-year. Healthcare and finance lead adoption.' },
    { id: 'health-001', title: 'AI in radiology', content: 'AI-assisted diagnosis reduces error rates by 30% in radiology. FDA has approved 500+ AI/ML medical devices.' },
    { id: 'health-002', title: 'Drug discovery with ML', content: 'Drug discovery timelines shortened from 12 years to 4 years with ML. AlphaFold revolutionized protein structure prediction.' },
    { id: 'health-003', title: 'Regulatory landscape', content: 'Regulatory frameworks for AI in healthcare still evolving. EU AI Act classifies medical AI as high-risk.' },
  ];

  let articleEmbeddings: number[][] | null = null;

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
  // EMBEDDING: index knowledge base
  // ---------------------------------------------------------------------------

  async function indexKnowledgeBase(): Promise<void> {
    if (articleEmbeddings) return;
    await trace({ name: 'index_knowledge_base', kind: 'EMBEDDING' as any }, async (s) => {
      const texts = ARTICLES.map(a => `${a.title}\n${a.content}`);
      s.setAttribute('neatlogs.embedding.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.embedding.text', JSON.stringify(texts.map(t => t.slice(0, 60))));

      const resp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      articleEmbeddings = resp.data.map(d => d.embedding);
      s.setAttribute('neatlogs.embedding.token_count', resp.usage.total_tokens);
      log('indexed {count} articles ({tokens} tokens)', { count: ARTICLES.length, tokens: resp.usage.total_tokens });
    });
  }

  // ---------------------------------------------------------------------------
  // RETRIEVER: search knowledge base
  // ---------------------------------------------------------------------------

  async function retrieveDocuments(query: string, topK: number = 3): Promise<any[]> {
    return trace({ name: 'knowledge_base_search', kind: 'RETRIEVER' as any }, async (s) => {
      s.setAttribute('neatlogs.retriever.query', query);
      s.setAttribute('neatlogs.retriever.top_k', topK);

      const qResp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: [query],
      });
      const qVec = qResp.data[0].embedding;

      const scores = articleEmbeddings!.map((emb, i) => ({ idx: i, score: cosine(qVec, emb) }));
      scores.sort((a, b) => b.score - a.score);
      const results = scores.slice(0, topK);

      const docs = results.map(r => ({
        id: ARTICLES[r.idx].id,
        content: ARTICLES[r.idx].content,
        score: Math.round(r.score * 10000) / 10000,
        metadata: { title: ARTICLES[r.idx].title },
      }));
      s.setAttribute('neatlogs.retriever.documents', JSON.stringify(docs));

      log('retrieved {count} documents for: {query}', { count: results.length, query });
      return results.map(r => new Document({
        pageContent: ARTICLES[r.idx].content,
        metadata: { id: ARTICLES[r.idx].id, title: ARTICLES[r.idx].title, score: Math.round(r.score * 10000) / 10000 },
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // RERANKER: re-rank by query relevance
  // ---------------------------------------------------------------------------

  async function rerankDocuments(query: string, docs: any[], topK: number = 2): Promise<any[]> {
    return trace({ name: 'embedding_reranker', kind: 'RERANKER' as any }, async (s) => {
      s.setAttribute('neatlogs.reranker.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.reranker.query', query);
      s.setAttribute('neatlogs.reranker.top_k', topK);
      s.setAttribute('neatlogs.reranker.input_documents', JSON.stringify(
        docs.map((d: any) => ({ id: d.metadata?.id, content: d.pageContent })),
      ));

      const texts = [query, ...docs.map((d: any) => d.pageContent)];
      const resp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      const vectors = resp.data.map(d => d.embedding);
      const qVec = vectors[0];

      const scored = docs.map((doc: any, i: number) => ({
        doc,
        score: cosine(qVec, vectors[i + 1]),
      }));
      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, topK);

      s.setAttribute('neatlogs.reranker.output_documents', JSON.stringify(
        topResults.map(r => ({
          id: r.doc.metadata?.id,
          content: r.doc.pageContent,
          score: Math.round(r.score * 10000) / 10000,
        })),
      ));

      log('reranked {input} docs → top {output}', { input: docs.length, output: topResults.length });
      return topResults.map(r => {
        r.doc.metadata.rerank_score = Math.round(r.score * 10000) / 10000;
        return r.doc;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // LangGraph Tools (for TOOL spans via ToolNode)
  // ---------------------------------------------------------------------------

  const webSearchTool = tool(
    async (input: { query: string }): Promise<string> => {
      log('web_search: {query}', { query: input.query });
      return (
        `Web results for '${input.query}':\n` +
        `- Recent developments show significant progress in this area.\n` +
        `- Industry experts highlight growing investment and adoption.\n` +
        `- Key players are actively publishing findings and case studies.`
      );
    },
    {
      name: 'web_search',
      description: 'Search the web for current news and information on a topic.',
      schema: z.object({ query: z.string().describe('The search query') }) as any,
    },
  );

  const arxivSearchTool = tool(
    async (input: { query: string }): Promise<string> => {
      log('arxiv_search: {query}', { query: input.query });
      return (
        `ArXiv papers for '${input.query}':\n` +
        `- [2024] 'Advances in ${input.query}: A Systematic Review' — 94% accuracy improvement.\n` +
        `- [2024] 'Benchmarking Methods for ${input.query}' — new state-of-the-art baselines.\n` +
        `- [2025] 'Scaling ${input.query} to Production' — practical deployment framework.`
      );
    },
    {
      name: 'arxiv_search',
      description: 'Search for recent academic papers and research findings on a topic.',
      schema: z.object({ query: z.string().describe('The search query') }) as any,
    },
  );

  // ---------------------------------------------------------------------------
  // Prompt Templates
  // ---------------------------------------------------------------------------

  const plannerSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a research planner. Given a topic, write a concise 1-2 sentence research plan and return exactly 3 research questions as a JSON array of strings. No other text.',
  }]);
  const plannerUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}' }]);

  const webSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a web research specialist. Use the web_search tool to find current information about the topic. Return findings as bullet points.',
  }]);
  const webUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}\nPlan: {{plan}}' }]);

  const arxivSys = new PromptTemplate([{
    role: 'system',
    content: 'You are an academic research specialist. Use the arxiv_search tool to find recent papers. Summarize key findings as bullet points.',
  }]);
  const arxivUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}' }]);

  const synthSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a research synthesizer. Combine findings from multiple sources into a coherent summary. Identify common themes, risks, and opportunities. Be structured and concise.',
  }]);
  const synthUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Topic: {{topic}}\n\nWeb findings:\n{{web_results}}\n\nKnowledge base findings:\n{{kb_results}}\n\nAcademic findings:\n{{arxiv_results}}\n\nSynthesize these into a unified summary.',
  }]);

  const writerSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a report writer. Write a concise research brief with executive summary, key findings, and conclusion. Use markdown. Under 300 words.',
  }]);
  const writerUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Topic: {{topic}}\n\nSynthesis:\n{{synthesis}}\n\nWrite a research brief.',
  }]);

  // ---------------------------------------------------------------------------
  // Graph Node Functions
  // ---------------------------------------------------------------------------

  async function plannerNode(state: typeof ResearchState.State): Promise<Partial<typeof ResearchState.State>> {
    const plan = await trace(
      { name: 'plan_questions', kind: 'LLM' as any, promptTemplate: plannerSys, userPromptTemplate: plannerUser },
      async () => {
        const msgs = [...plannerSys.compile(), ...plannerUser.compile({ topic: state.query })] as any[];
        const response = await openaiLlm.invoke(msgs);
        return typeof response.content === 'string' ? response.content : '';
      },
    );
    log('planner: {plan}', { plan: plan.slice(0, 80) });
    return { plan };
  }

  async function webResearcherNode(state: typeof ResearchState.State): Promise<Partial<typeof ResearchState.State>> {
    const result = await trace(
      { name: 'web_research', kind: 'LLM' as any, promptTemplate: webSys, userPromptTemplate: webUser },
      async () => {
        const msgs = [...webSys.compile(), ...webUser.compile({ topic: state.query, plan: state.plan })] as any[];
        const llmWithTools = anthropicLlm.bindTools([webSearchTool]);
        const response = await llmWithTools.invoke(msgs);
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolMessages = [];
          for (const tc of response.tool_calls) {
            const toolResult = await webSearchTool.invoke(tc.args);
            toolMessages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
          }
          const followUp = await anthropicLlm.invoke([
            ...msgs,
            response,
            ...toolMessages,
          ] as any[]);
          return typeof followUp.content === 'string' ? followUp.content : '';
        }
        return typeof response.content === 'string' ? response.content : '';
      },
    );
    return { webResults: result };
  }

  async function kbResearcherNode(state: typeof ResearchState.State): Promise<Partial<typeof ResearchState.State>> {
    await indexKnowledgeBase();
    const retrieved = await retrieveDocuments(state.query);
    const reranked = await rerankDocuments(state.query, retrieved);
    const context = reranked.map((d: any) => `[${d.metadata.title}] ${d.pageContent}`).join('\n');
    log('kb_researcher: found {count} relevant docs', { count: reranked.length });
    return { kbResults: context };
  }

  async function arxivResearcherNode(state: typeof ResearchState.State): Promise<Partial<typeof ResearchState.State>> {
    const result = await trace(
      { name: 'arxiv_research', kind: 'LLM' as any, promptTemplate: arxivSys, userPromptTemplate: arxivUser },
      async () => {
        const msgs = [...arxivSys.compile(), ...arxivUser.compile({ topic: state.query })] as any[];
        const llmWithTools = geminiLlm.bindTools([arxivSearchTool]);
        const response = await llmWithTools.invoke(msgs);
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolMessages = [];
          for (const tc of response.tool_calls) {
            const toolResult = await arxivSearchTool.invoke(tc.args);
            toolMessages.push({ role: 'tool', content: toolResult, tool_call_id: tc.id });
          }
          const followUp = await geminiLlm.invoke([
            ...msgs,
            response,
            ...toolMessages,
          ] as any[]);
          return typeof followUp.content === 'string' ? followUp.content : '';
        }
        return typeof response.content === 'string' ? response.content : '';
      },
    );
    return { arxivResults: result };
  }

  async function synthesizerNode(state: typeof ResearchState.State): Promise<Partial<typeof ResearchState.State>> {
    const synthesis = await trace(
      { name: 'synthesize_findings', kind: 'LLM' as any, promptTemplate: synthSys, userPromptTemplate: synthUser },
      async () => {
        const msgs = [...synthSys.compile(), ...synthUser.compile({
          topic: state.query,
          web_results: state.webResults || 'N/A',
          kb_results: state.kbResults || 'N/A',
          arxiv_results: state.arxivResults || 'N/A',
        })] as any[];
        const response = await geminiLlm.invoke(msgs);
        return typeof response.content === 'string' ? response.content : '';
      },
    );
    return { synthesis };
  }

  async function reportWriterNode(state: typeof ResearchState.State): Promise<Partial<typeof ResearchState.State>> {
    const report = await trace(
      { name: 'write_report', kind: 'LLM' as any, promptTemplate: writerSys, userPromptTemplate: writerUser },
      async () => {
        const msgs = [...writerSys.compile(), ...writerUser.compile({ topic: state.query, synthesis: state.synthesis })] as any[];
        process.stdout.write('\n--- Report (streaming) ---\n');
        let full = '';
        const stream = await openaiLlm.stream(msgs);
        for await (const chunk of stream) {
          const text = typeof chunk.content === 'string' ? chunk.content : '';
          if (text) {
            process.stdout.write(text);
            full += text;
          }
        }
        process.stdout.write('\n--------------------------\n\n');
        return full;
      },
    );
    return { finalReport: report };
  }

  // ---------------------------------------------------------------------------
  // Build the Graph
  // ---------------------------------------------------------------------------

  const graph = new StateGraph(ResearchState)
    .addNode('planner', plannerNode)
    .addNode('web_researcher', webResearcherNode)
    .addNode('kb_researcher', kbResearcherNode)
    .addNode('arxiv_researcher', arxivResearcherNode)
    .addNode('synthesizer', synthesizerNode)
    .addNode('report_writer', reportWriterNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'web_researcher')
    .addEdge('planner', 'kb_researcher')
    .addEdge('planner', 'arxiv_researcher')
    .addEdge('web_researcher', 'synthesizer')
    .addEdge('kb_researcher', 'synthesizer')
    .addEdge('arxiv_researcher', 'synthesizer')
    .addEdge('synthesizer', 'report_writer')
    .addEdge('report_writer', END)
    .compile();

  // ---------------------------------------------------------------------------
  // WORKFLOW: run the graph
  // ---------------------------------------------------------------------------

  const researchWorkflow = span(
    { kind: 'WORKFLOW', name: 'research_workflow' },
    async (topic: string): Promise<string> => {
      log('starting research on {topic}', { topic });
      console.log(`\n=== LangGraph Research Pipeline: ${topic} ===\n`);

      const result = await graph.invoke({ query: topic });

      log('workflow complete');
      return result.finalReport;
    },
  );

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  const topic = process.argv.slice(2).join(' ') || 'AI in healthcare';
  await researchWorkflow(topic);
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error('[langgraph] failed', err);
  process.exitCode = 1;
});
