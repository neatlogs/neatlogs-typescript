/**
 * Demonstrate all span kinds: WORKFLOW, CHAIN, AGENT, TOOL, RETRIEVER,
 * EMBEDDING, and GUARDRAIL.
 *
 * Run:
 *   NEATLOGS_API_KEY=... NEATLOGS_ENDPOINT=https://ingest.neatlogs.com npx tsx examples/custom-spans.ts
 */
import { init, span, trace, log, flush, shutdown } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'https://ingest.neatlogs.com',
    workflowName: `custom-spans-${Date.now()}`,
    captureLogs: true,
  });

  // WORKFLOW — top-level orchestration
  const pipeline = span({ kind: 'WORKFLOW', name: 'demo-pipeline' }, async () => {
    // CHAIN — sequential processing step
    const preprocess = span({ kind: 'CHAIN', name: 'preprocess' }, async (input: string) => {
      return input.trim().toLowerCase();
    });

    // AGENT — autonomous agent
    const agent = span({
      kind: 'AGENT',
      name: 'classifier',
      role: 'Text Classifier',
      goal: 'Classify input text',
    }, async (text: string) => {
      return { category: 'technical', confidence: 0.95 };
    });

    // TOOL — external tool call
    const dbLookup = span({ kind: 'TOOL', name: 'database-lookup' }, async (category: string) => {
      return { count: 42, examples: ['example1', 'example2'] };
    });

    // RETRIEVER — document retrieval
    const retriever = span({ kind: 'RETRIEVER', name: 'doc-retriever' }, async (query: string) => {
      return [
        { document: { content: 'Doc 1 content', id: '1' } },
        { document: { content: 'Doc 2 content', id: '2' } },
      ];
    });

    // EMBEDDING — vector embedding
    const embedder = span({ kind: 'EMBEDDING', name: 'text-embedder' }, async (text: string) => {
      return { vector: [0.1, 0.2, 0.3], dimension: 3 };
    });

    // GUARDRAIL — safety check
    const guardrail = span({ kind: 'GUARDRAIL', name: 'content-filter' }, async (text: string) => {
      return { safe: true, score: 0.99 };
    });

    // Execute the pipeline
    const processed = await preprocess('  Hello World  ');
    const classification = await agent(processed);
    const docs = await retriever(processed);
    const embedding = await embedder(processed);
    const safety = await guardrail(processed);
    const dbResults = await dbLookup(classification.category);

    // Use log() to capture intermediate steps
    log('Pipeline completed with {count} results', { count: dbResults.count });

    return { classification, docs: docs.length, embedding: embedding.dimension, safe: safety.safe };
  });

  const result = await pipeline();
  console.log('Pipeline result:', result);

  await flush();
  await shutdown();
}

main().catch(console.error);
