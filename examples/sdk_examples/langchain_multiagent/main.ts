/**
 * LangChain multi-provider research workflow with all span kinds.
 *
 * Span kinds demonstrated:
 *   WORKFLOW, AGENT, TOOL, RETRIEVER, EMBEDDING, RERANKER, LLM
 *
 * Providers:
 *   - OpenAI (gpt-4o-mini) — planner, report writer, embeddings
 *   - Anthropic (claude-haiku) — researcher
 *   - Google GenAI (gemini-2.5-flash) — analyst
 *
 * Usage:
 *     npx tsx examples/sdk_examples/langchain_multiagent/main.ts
 *     npx tsx examples/sdk_examples/langchain_multiagent/main.ts "quantum computing in drug discovery"
 *
 * Required env vars:
 *     OPENAI_API_KEY
 *     ANTHROPIC_API_KEY
 *     GOOGLE_API_KEY (or GEMINI_API_KEY)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'langchain_multiagent_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'langchain_multiagent_raw_spans.log';
process.env.NEATLOGS_LOG_LOGS ??= 'true';
process.env.NEATLOGS_LOG_LOGS_FILE ??= 'langchain_multiagent_logs.log';

import { init, span, trace, log, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'langchain-research-pipeline',
    tags: ['langchain', 'multi-provider', 'research'],
    instrumentations: ['langchain', 'openai'],
    captureLogs: true,
    disableExport: false,
    debug: true,
  });

  const { ChatOpenAI } = await import('@langchain/openai');
  const { ChatAnthropic } = await import('@langchain/anthropic');
  const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
  const { Document } = await import('@langchain/core/documents');
  const OpenAI = (await import('openai')).default;

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  const openaiLlm = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 2048 });
  const anthropicLlm = new ChatAnthropic({ model: 'claude-haiku-4-5-20251001', temperature: 0, maxTokens: 2048 });
  const geminiLlm = new ChatGoogleGenerativeAI({ model: 'gemini-2.5-flash', temperature: 0, maxOutputTokens: 2048 });
  const openaiClient = new OpenAI();

  // ---------------------------------------------------------------------------
  // Knowledge Base
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
  // TOOL: web_search
  // ---------------------------------------------------------------------------

  const webSearch = span(
    { kind: 'TOOL', name: 'web_search', toolName: 'web_search' },
    async (query: string): Promise<string> => {
      log('web_search: {query}', { query });
      return (
        `Web results for '${query}':\n` +
        `- Recent developments show significant progress in this area.\n` +
        `- Industry experts highlight growing investment and adoption.\n` +
        `- Key players are actively publishing findings and case studies.`
      );
    },
  );

  // ---------------------------------------------------------------------------
  // TOOL: calculate
  // ---------------------------------------------------------------------------

  const calculate = span(
    { kind: 'TOOL', name: 'calculate', toolName: 'calculate' },
    async (expression: string): Promise<string> => {
      log('calculate: {expression}', { expression });
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        return String(result);
      } catch (e) {
        return `Error: ${e}`;
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Prompt Templates
  // ---------------------------------------------------------------------------

  const plannerSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a research planner. Given a topic, return exactly 3 research questions as a JSON array of strings. No other text.',
  }]);
  const plannerUser = new UserPromptTemplate([{ role: 'user', content: 'Topic: {{topic}}' }]);

  const researcherSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a research assistant. Answer the question using the provided context. Be concise (3-5 bullet points).',
  }]);
  const researcherUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Question: {{question}}\n\nContext:\n{{context}}\n\nProvide findings as bullet points.',
  }]);

  const analystSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a senior analyst. Identify key themes, risks, and opportunities from the research findings. Be structured and concise.',
  }]);
  const analystUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Topic: {{topic}}\n\nFindings:\n{{findings}}\n\nProvide a structured analysis.',
  }]);

  const reporterSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a report writer. Write a concise research brief with executive summary, key findings, and conclusion. Use markdown. Under 300 words.',
  }]);
  const reporterUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Topic: {{topic}}\n\nAnalysis:\n{{analysis}}\n\nWrite a research brief.',
  }]);

  // ---------------------------------------------------------------------------
  // AGENT: Planner (OpenAI)
  // ---------------------------------------------------------------------------

  const plannerAgent = span(
    { kind: 'AGENT', name: 'planner', role: 'Research Planner', goal: 'Generate targeted research questions' },
    async (topic: string): Promise<string[]> => {
      return trace(
        { name: 'plan_questions', kind: 'LLM' as any, promptTemplate: plannerSys, userPromptTemplate: plannerUser },
        async () => {
          const msgs = [...plannerSys.compile(), ...plannerUser.compile({ topic })] as any[];
          const response = await openaiLlm.invoke(msgs);
          const raw = typeof response.content === 'string' ? response.content : '';
          try { return JSON.parse(raw); } catch { return [raw]; }
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Researcher (Anthropic) — uses retriever + reranker + tools
  // ---------------------------------------------------------------------------

  const researcherAgent = span(
    { kind: 'AGENT', name: 'researcher', role: 'Web Researcher', goal: 'Gather information using tools and knowledge base' },
    async (questions: string[]): Promise<string> => {
      const allFindings: string[] = [];

      for (const question of questions) {
        log('researching: {question}', { question });

        const retrieved = await retrieveDocuments(question);
        const reranked = await rerankDocuments(question, retrieved);
        const context = reranked.map((d: any) => d.pageContent).join('\n');
        const webResults = await webSearch(question);

        const findings = await trace(
          { name: 'synthesize_findings', kind: 'LLM' as any, promptTemplate: researcherSys, userPromptTemplate: researcherUser },
          async () => {
            const fullContext = `${context}\n\n${webResults}`;
            const msgs = [...researcherSys.compile(), ...researcherUser.compile({ question, context: fullContext })] as any[];
            const response = await anthropicLlm.invoke(msgs);
            return typeof response.content === 'string' ? response.content : '';
          },
        );

        allFindings.push(`Q: ${question}\n${findings}`);
      }

      return allFindings.join('\n\n');
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Analyst (Google GenAI)
  // ---------------------------------------------------------------------------

  const analystAgent = span(
    { kind: 'AGENT', name: 'analyst', role: 'Senior Analyst', goal: 'Identify themes, risks, and opportunities' },
    async (topic: string, findings: string): Promise<string> => {
      const growth = await calculate('150 * 1.4');
      log('projected spending: ${growth}B', { growth });

      return trace(
        { name: 'analyze_findings', kind: 'LLM' as any, promptTemplate: analystSys, userPromptTemplate: analystUser },
        async () => {
          const enrichedFindings = `${findings}\n\nProjected spending: $${growth}B`;
          const msgs = [...analystSys.compile(), ...analystUser.compile({ topic, findings: enrichedFindings })] as any[];
          const response = await geminiLlm.invoke(msgs);
          return typeof response.content === 'string' ? response.content : '';
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Reporter (OpenAI, streaming)
  // ---------------------------------------------------------------------------

  const reporterAgent = span(
    { kind: 'AGENT', name: 'reporter', role: 'Report Writer', goal: 'Write the final research brief' },
    async (topic: string, analysis: string): Promise<string> => {
      return trace(
        { name: 'write_report', kind: 'LLM' as any, promptTemplate: reporterSys, userPromptTemplate: reporterUser },
        async () => {
          const msgs = [...reporterSys.compile(), ...reporterUser.compile({ topic, analysis })] as any[];
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
    },
  );

  // ---------------------------------------------------------------------------
  // WORKFLOW
  // ---------------------------------------------------------------------------

  const researchWorkflow = span(
    { kind: 'WORKFLOW', name: 'research_workflow' },
    async (topic: string): Promise<string> => {
      log('starting research on {topic}', { topic });
      console.log(`\n=== Research Pipeline: ${topic} ===\n`);

      await indexKnowledgeBase();

      console.log('--- Planner: generating research questions ---');
      const questions = await plannerAgent(topic);
      for (const [i, q] of questions.entries()) {
        console.log(`  ${i + 1}. ${q}`);
      }

      console.log('\n--- Researcher: gathering findings ---');
      const findings = await researcherAgent(questions);

      console.log('\n--- Analyst: identifying themes ---');
      const analysis = await analystAgent(topic, findings);

      console.log('\n--- Reporter: writing brief ---');
      const report = await reporterAgent(topic, analysis);

      log('workflow complete');
      return report;
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
  console.error('[langchain] failed', err);
  process.exitCode = 1;
});
