/**
 * OpenAI SDK multi-agent investment research workflow with all span kinds.
 *
 * Custom orchestration (no framework) — uses neatlogs span() + trace() directly.
 *
 * Span kinds demonstrated:
 *   WORKFLOW, AGENT, TOOL, RETRIEVER, EMBEDDING, RERANKER, LLM
 *
 * Provider: OpenAI (gpt-4o-mini, text-embedding-3-small)
 *
 * Usage:
 *     npx tsx examples/sdk_examples/openai_multiagent/main.ts
 *     npx tsx examples/sdk_examples/openai_multiagent/main.ts "Tesla"
 *
 * Required env vars:
 *     OPENAI_API_KEY
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'openai_multiagent_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'openai_multiagent_raw_spans.log';
process.env.NEATLOGS_LOG_LOGS ??= 'true';
process.env.NEATLOGS_LOG_LOGS_FILE ??= 'openai_multiagent_logs.log';

import { init, span, trace, log, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'openai-investment-research',
    tags: ['openai', 'investment', 'research'],
    instrumentations: ['openai'],
    captureLogs: true,
    disableExport: false,
    debug: true,
  });

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI();

  // ---------------------------------------------------------------------------
  // Knowledge Base
  // ---------------------------------------------------------------------------

  const ARTICLES = [
    { id: 'fin-001', title: 'NVIDIA earnings beat', content: 'NVIDIA reported Q4 revenue of $22.1B, up 265% YoY. Data center revenue hit $18.4B driven by AI demand.' },
    { id: 'fin-002', title: 'AI chip market share', content: 'NVIDIA holds 80% of AI accelerator market. AMD and Intel compete for remaining share with MI300 and Gaudi.' },
    { id: 'fin-003', title: 'Semiconductor capex surge', content: 'Global semiconductor capex reached $180B in 2024. TSMC alone spending $30B+ on advanced nodes.' },
    { id: 'fin-004', title: 'Cloud AI spending', content: 'Hyperscalers (AWS, Azure, GCP) increased AI infra spending by 60% in 2024. Total cloud AI market at $90B.' },
    { id: 'fin-005', title: 'Tesla autonomous driving', content: 'Tesla FSD v12 uses end-to-end neural nets. Robotaxi launch planned for 2025. Revenue from FSD subscriptions growing 30% QoQ.' },
    { id: 'fin-006', title: 'EV market dynamics', content: 'Global EV sales hit 14M units in 2024. China accounts for 60% of sales. Price competition intensifying.' },
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

      const resp = await client.embeddings.create({
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

  async function retrieveDocuments(query: string, topK: number = 3): Promise<Array<{ id: string; content: string; title: string; score: number }>> {
    return trace({ name: 'knowledge_base_search', kind: 'RETRIEVER' as any }, async (s) => {
      s.setAttribute('neatlogs.retrieval.query', query);
      s.setAttribute('neatlogs.retrieval.top_k', topK);

      const qResp = await client.embeddings.create({
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
        title: ARTICLES[r.idx].title,
        score: Math.round(r.score * 10000) / 10000,
      }));
      s.setAttribute('neatlogs.retrieval.documents', JSON.stringify(docs));

      log('retrieved {count} documents for: {query}', { count: results.length, query });
      return docs;
    });
  }

  // ---------------------------------------------------------------------------
  // RERANKER: re-rank by query relevance
  // ---------------------------------------------------------------------------

  async function rerankDocuments(query: string, docs: Array<{ id: string; content: string; title: string; score: number }>, topK: number = 2): Promise<typeof docs> {
    return trace({ name: 'embedding_reranker', kind: 'RERANKER' as any }, async (s) => {
      s.setAttribute('neatlogs.reranker.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.reranker.query', query);
      s.setAttribute('neatlogs.reranker.top_k', topK);
      s.setAttribute('neatlogs.reranker.input_documents', JSON.stringify(
        docs.map(d => ({ id: d.id, content: d.content })),
      ));

      const texts = [query, ...docs.map(d => d.content)];
      const resp = await client.embeddings.create({
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

      log('reranked {input} docs → top {output}', { input: docs.length, output: topResults.length });
      return topResults.map(r => ({ ...r.doc, score: Math.round(r.score * 10000) / 10000 }));
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
        `- Strong revenue growth and expanding market share reported.\n` +
        `- Recent product launches receiving positive analyst coverage.\n` +
        `- Management reaffirmed full-year guidance above consensus.`
      );
    },
  );

  // OpenAI tool definition
  const WEB_SEARCH_TOOL = {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web for current financial information.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The search query.' } },
        required: ['query'],
      },
    },
  };

  // ---------------------------------------------------------------------------
  // Prompt Templates
  // ---------------------------------------------------------------------------

  const plannerSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a financial research planner. Given a company, return exactly 3 research questions as a JSON array of strings. No other text.',
  }]);
  const plannerUser = new UserPromptTemplate([{ role: 'user', content: 'Company: {{company}}' }]);

  const researcherSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a web research assistant. Use the web_search tool to find information, then summarize findings as concise bullet points relevant to investment analysis.',
  }]);
  const researcherUser = new UserPromptTemplate([{ role: 'user', content: 'Research question: {{question}}' }]);

  const analystSys = new PromptTemplate([{
    role: 'system',
    content: 'You are a senior investment analyst. Identify key investment themes, risks, and opportunities from the research findings.',
  }]);
  const analystUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Company: {{company}}\n\nResearch findings:\n{{findings}}\n\nKnowledge base context:\n{{kb_context}}\n\nProvide a structured analysis.',
  }]);

  const reporterSys = new PromptTemplate([{
    role: 'system',
    content: 'You are an investment report writer. Write a clear, professional investment brief with executive summary, key findings, risks, and recommendation. Use markdown. Under 300 words.',
  }]);
  const reporterUser = new UserPromptTemplate([{
    role: 'user',
    content: 'Company: {{company}}\n\nAnalysis:\n{{analysis}}\n\nWrite a complete investment brief.',
  }]);

  // ---------------------------------------------------------------------------
  // AGENT: Planner
  // ---------------------------------------------------------------------------

  const plannerAgent = span(
    { kind: 'AGENT', name: 'planner', role: 'Research Planner', goal: 'Generate targeted research questions' },
    async (company: string): Promise<string[]> => {
      return trace(
        { name: 'plan_questions', kind: 'LLM' as any, promptTemplate: plannerSys, userPromptTemplate: plannerUser },
        async () => {
          const msgs = [...plannerSys.compile(), ...plannerUser.compile({ company })];
          const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 2048,
            messages: msgs as any,
          });
          const raw = response.choices[0].message.content?.trim() ?? '[]';
          try { return JSON.parse(raw); } catch { return [raw]; }
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Researcher (with tool calling)
  // ---------------------------------------------------------------------------

  const researcherAgent = span(
    { kind: 'AGENT', name: 'researcher', role: 'Web Researcher', goal: 'Find current information on each question' },
    async (questions: string[]): Promise<string> => {
      const allSummaries: string[] = [];

      for (const question of questions) {
        log('researching: {question}', { question });

        const summary = await trace(
          { name: 'research_question', kind: 'LLM' as any, promptTemplate: researcherSys, userPromptTemplate: researcherUser },
          async () => {
            const msgs: any[] = [...researcherSys.compile(), ...researcherUser.compile({ question })];

            const response = await client.chat.completions.create({
              model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 2048,
              messages: msgs,
              tools: [WEB_SEARCH_TOOL],
              tool_choice: 'auto',
            });

            const aiMsg = response.choices[0].message;
            msgs.push(aiMsg);

            if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
              for (const tc of aiMsg.tool_calls) {
                const args = JSON.parse((tc as any).function.arguments);
                const result = await webSearch(args.query);
                msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
              }
              const final = await client.chat.completions.create({
                model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 2048,
                messages: msgs,
              });
              return final.choices[0].message.content ?? '';
            }
            return aiMsg.content ?? '';
          },
        );

        allSummaries.push(`Q: ${question}\n${summary}`);
      }

      return allSummaries.join('\n\n');
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Analyst (streaming)
  // ---------------------------------------------------------------------------

  const analystAgent = span(
    { kind: 'AGENT', name: 'analyst', role: 'Investment Analyst', goal: 'Identify investment themes and risks' },
    async (company: string, findings: string, kbContext: string): Promise<string> => {
      return trace(
        { name: 'analyze_findings', kind: 'LLM' as any, promptTemplate: analystSys, userPromptTemplate: analystUser },
        async () => {
          const msgs = [...analystSys.compile(), ...analystUser.compile({ company, findings, kb_context: kbContext })];
          const stream = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 2048,
            messages: msgs as any,
            stream: true,
          });
          process.stdout.write('\n--- Analyst (streaming) ---\n');
          let full = '';
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) {
              process.stdout.write(text);
              full += text;
            }
          }
          process.stdout.write('\n---------------------------\n\n');
          return full;
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // AGENT: Reporter (streaming)
  // ---------------------------------------------------------------------------

  const reporterAgent = span(
    { kind: 'AGENT', name: 'reporter', role: 'Report Writer', goal: 'Write the final investment brief' },
    async (company: string, analysis: string): Promise<string> => {
      return trace(
        { name: 'write_report', kind: 'LLM' as any, promptTemplate: reporterSys, userPromptTemplate: reporterUser },
        async () => {
          const msgs = [...reporterSys.compile(), ...reporterUser.compile({ company, analysis })];
          const stream = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 2048,
            messages: msgs as any,
            stream: true,
          });
          process.stdout.write('\n--- Investment Brief (streaming) ---\n');
          let full = '';
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) {
              process.stdout.write(text);
              full += text;
            }
          }
          process.stdout.write('\n------------------------------------\n\n');
          return full;
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // TOOL: validate_ticker (demonstrates error spans)
  // ---------------------------------------------------------------------------

  const validateTicker = span(
    { kind: 'TOOL', name: 'validate_ticker', toolName: 'validate_ticker' },
    async (ticker: string): Promise<string> => {
      log('validating ticker: {ticker}', { ticker });
      const valid = /^[A-Z]{1,5}$/.test(ticker);
      if (!valid) {
        throw new Error(`Invalid ticker symbol: '${ticker}' — must be 1-5 uppercase letters`);
      }
      return `Ticker ${ticker} is valid`;
    },
  );

  // ---------------------------------------------------------------------------
  // WORKFLOW
  // ---------------------------------------------------------------------------

  const investmentWorkflow = span(
    { kind: 'WORKFLOW', name: 'investment_research_workflow' },
    async (company: string): Promise<string> => {
      log('starting investment research on {company}', { company });
      console.log(`\n=== Investment Research: ${company} ===\n`);

      // Demonstrate error span — intentionally validate an invalid ticker
      console.log('--- Validating ticker (error demo) ---');
      try {
        await validateTicker('invalid-ticker!');
      } catch (e) {
        console.log(`  [expected error] ${(e as Error).message}`);
      }

      await indexKnowledgeBase();

      console.log('\n--- Planner: generating research questions ---');
      const questions = await plannerAgent(company);
      for (const [i, q] of questions.entries()) {
        console.log(`  ${i + 1}. ${q}`);
      }

      console.log('\n--- Researcher: gathering findings ---');
      const findings = await researcherAgent(questions);

      console.log('\n--- Knowledge Base: retrieving context ---');
      const retrieved = await retrieveDocuments(company);
      const reranked = await rerankDocuments(company, retrieved);
      const kbContext = reranked.map(d => `[${d.title}] ${d.content}`).join('\n');

      console.log('\n--- Analyst: analyzing findings ---');
      const analysis = await analystAgent(company, findings, kbContext);

      console.log('\n--- Reporter: writing investment brief ---');
      const report = await reporterAgent(company, analysis);

      log('workflow complete');
      return report;
    },
  );

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  const company = process.argv.slice(2).join(' ') || 'NVIDIA';
  await investmentWorkflow(company);
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error('[openai] failed', err);
  process.exitCode = 1;
});
