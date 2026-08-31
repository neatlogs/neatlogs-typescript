/**
 * Google GenAI (@google/genai) multi-agent content workflow with all span kinds.
 *
 * Custom TypeScript orchestration with span() wrappers.
 * Uses @google/genai for Gemini calls with generateContent / generateContentStream.
 *
 * Span kinds demonstrated:
 *   WORKFLOW, AGENT, TOOL, RETRIEVER, EMBEDDING, RERANKER, LLM
 *
 * Provider: Google GenAI (gemini-2.5-flash) + OpenAI (embeddings only)
 *
 * Usage:
 *     npx tsx examples/sdk_examples/google_genai_multiagent/main.ts
 *     npx tsx examples/sdk_examples/google_genai_multiagent/main.ts "The future of renewable energy"
 *
 * Required env vars:
 *     GOOGLE_API_KEY (or GEMINI_API_KEY)
 *     OPENAI_API_KEY (for embeddings)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'google_genai_multiagent_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'google_genai_multiagent_raw_spans.log';
process.env.NEATLOGS_LOG_LOGS ??= 'true';
process.env.NEATLOGS_LOG_LOGS_FILE ??= 'google_genai_multiagent_logs.log';

import { init, span, trace, log, flush, shutdown } from 'neatlogs';

async function main() {
  // Initialize Neatlogs before building the application.
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'google-genai-content-creation',
    tags: ['google-genai', 'content', 'blog'],
    captureLogs: true,
    disableExport: false,
    debug: true,
  });

  const OpenAI = (await import('openai')).default;
  const openaiClient = new OpenAI();

  // ---------------------------------------------------------------------------
  // Knowledge Base (content ideas & writing tips)
  // ---------------------------------------------------------------------------

  const CONTENT_KB = [
    { id: 'tip-001', title: 'Hook writing techniques', content: 'Start with a surprising statistic, a bold claim, or a relatable scenario. The first sentence determines if readers continue.' },
    { id: 'tip-002', title: 'SEO best practices', content: 'Include primary keyword in title and first paragraph. Use H2/H3 headings with related terms. Meta description under 160 chars.' },
    { id: 'tip-003', title: 'Healthcare AI trends 2024', content: 'AI diagnostics market growing 45% annually. FDA approved 500+ AI/ML devices. Radiology and pathology lead adoption.' },
    { id: 'tip-004', title: 'Energy transition outlook', content: 'Renewable energy reached 30% of global electricity in 2024. Solar costs dropped 90% in a decade. Battery storage scaling rapidly.' },
    { id: 'tip-005', title: 'Content structure patterns', content: 'Use the AIDA framework: Attention, Interest, Desire, Action. Break long posts into scannable sections with clear headers.' },
    { id: 'tip-006', title: 'Audience engagement metrics', content: 'Average blog read time is 7 minutes (1,600 words). Posts with images get 94% more views. Lists outperform paragraphs for retention.' },
  ];

  let kbEmbeddings: number[][] | null = null;

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
  // EMBEDDING: index content knowledge base
  // ---------------------------------------------------------------------------

  async function indexContentKB(): Promise<void> {
    if (kbEmbeddings) return;
    await trace({ name: 'index_content_kb', kind: 'EMBEDDING' as any }, async (s) => {
      const texts = CONTENT_KB.map(a => `${a.title}\n${a.content}`);
      s.setAttribute('neatlogs.embedding.model_name', 'text-embedding-3-small');
      s.setAttribute('neatlogs.embedding.text', JSON.stringify(texts.map(t => t.slice(0, 60))));

      const resp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      kbEmbeddings = resp.data.map(d => d.embedding);
      s.setAttribute('neatlogs.embedding.token_count', resp.usage.total_tokens);
      log('indexed {count} content tips ({tokens} tokens)', { count: CONTENT_KB.length, tokens: resp.usage.total_tokens });
    });
  }

  // ---------------------------------------------------------------------------
  // RETRIEVER: search content KB
  // ---------------------------------------------------------------------------

  async function retrieveContentTips(query: string, topK: number = 3): Promise<Array<{ id: string; title: string; content: string; score: number }>> {
    return trace({ name: 'content_kb_search', kind: 'RETRIEVER' as any }, async (s) => {
      s.setAttribute('neatlogs.retriever.query', query);
      s.setAttribute('neatlogs.retriever.top_k', topK);

      const qResp = await openaiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: [query],
      });
      const qVec = qResp.data[0].embedding;

      const scores = kbEmbeddings!.map((emb, i) => ({ idx: i, score: cosine(qVec, emb) }));
      scores.sort((a, b) => b.score - a.score);
      const results = scores.slice(0, topK);

      const docs = results.map(r => ({
        id: CONTENT_KB[r.idx].id,
        title: CONTENT_KB[r.idx].title,
        content: CONTENT_KB[r.idx].content,
        score: Math.round(r.score * 10000) / 10000,
      }));
      s.setAttribute('neatlogs.retriever.documents', JSON.stringify(docs));

      log('retrieved {count} content tips for: {query}', { count: results.length, query });
      return docs;
    });
  }

  // ---------------------------------------------------------------------------
  // RERANKER: re-rank content tips
  // ---------------------------------------------------------------------------

  async function rerankContentTips(query: string, docs: Array<{ id: string; title: string; content: string; score: number }>, topK: number = 2): Promise<typeof docs> {
    return trace({ name: 'content_reranker', kind: 'RERANKER' as any }, async (s) => {
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

      log('reranked {input} tips → top {output}', { input: docs.length, output: topResults.length });
      return topResults.map(r => ({ ...r.doc, score: Math.round(r.score * 10000) / 10000 }));
    });
  }

  const { ideationAgent, writerAgent, editorAgent, finalizerAgent } = await import('./agents.js');

  const blogCreationWorkflow = span(
    { kind: 'WORKFLOW', name: 'blog_creation_workflow' },
    async (topic: string): Promise<string> => {
      log('starting blog creation on {topic}', { topic });

      console.log(`\n=== Blog Creation: ${topic} ===\n`);

      await indexContentKB();

      console.log('--- Retrieving content tips ---');
      const retrieved = await retrieveContentTips(topic);
      const reranked = await rerankContentTips(topic, retrieved);
      console.log(`  Using ${reranked.length} relevant tips`);

      console.log('\n--- Ideation: generating content ideas ---');
      const idea = await ideationAgent(topic);
      log('ideation complete, selected title: {title}', { title: idea.title });
      console.log(`  Selected idea: ${idea.title}`);

      console.log('\n--- Writer: drafting post ---');
      const draft = await writerAgent(topic, idea);
      log('draft complete, {chars} chars', { chars: draft.length });

      console.log('\n--- Editor: improving draft ---');
      const edited = await editorAgent(topic, draft);
      log('editing complete, {chars} chars', { chars: edited.length });

      console.log('\n--- Finalizer: polishing post ---');
      const final = await finalizerAgent(topic, edited);
      log('finalization complete, {chars} chars', { chars: final.length });
      console.log('\n--- Final Post ---');
      console.log(final);

      return final;
    },
  );

  const topic = process.argv.slice(2).join(' ') || 'The future of AI in healthcare';
  await blogCreationWorkflow(topic);
  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
