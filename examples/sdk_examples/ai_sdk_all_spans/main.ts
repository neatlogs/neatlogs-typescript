/**
 * Vercel AI SDK — all span kinds example (OpenAI).
 *
 * Exercises every span type the AI SDK emits:
 *   - WORKFLOW (neatlogs wrapper root)
 *   - CHAIN (ai.generateText / ai.streamText orchestration)
 *   - LLM (ai.generateText.doGenerate / ai.streamText.doStream)
 *   - TOOL (ai.toolCall)
 *   - EMBEDDING (ai.embed / ai.embedMany)
 *   - RERANKER (ai.rerank)
 *
 * Usage:
 *     npx tsx examples/sdk_examples/ai_sdk_all_spans/main.ts
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'ai_sdk_all_spans.log';

// Set OPENAI_API_KEY in env or .env file

import { trace } from '@opentelemetry/api';
import { init, flush, shutdown, wrapAISDK } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'ai-sdk-all-spans',
    debug: true,
  });

  const ai = await import('ai' as string);
  const { openai } = await import('@ai-sdk/openai' as string);
  const { createGateway } = await import('@ai-sdk/gateway' as string);

  const { generateText, streamText, embed, embedMany, rerank } = wrapAISDK(ai);
  const { tool, jsonSchema } = ai;
  const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY ?? '' });

  const tracer = trace.getTracer('neatlogs.ai-sdk');

  await tracer.startActiveSpan('ai-sdk-all-spans', async (rootSpan) => {
    try {
      // ─── 1. generateText (WORKFLOW → CHAIN → LLM) ──────────────────────

      console.log('--- generateText (LLM span) ---');
      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        prompt: 'In one sentence, what is TypeScript?',
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.3,
      });
      console.log(text);

      // ─── 2. streamText (WORKFLOW → CHAIN → LLM) ────────────────────────

      console.log('\n--- streamText (streaming LLM span) ---');
      const stream = streamText({
        model: openai('gpt-4o-mini'),
        prompt: 'In one sentence, what makes Rust unique?',
        temperature: 0.5,
        maxOutputTokens: 150,
        topP: 0.95,
      });

      for await (const delta of stream.textStream) {
        process.stdout.write(delta);
      }
      console.log();

      // ─── 3. generateText with tool (WORKFLOW → CHAIN → LLM + TOOL) ─────

      console.log('\n--- generateText with tool (LLM + TOOL spans) ---');
      const { text: toolText } = await generateText({
        model: openai('gpt-4o-mini'),
        prompt: 'What is the weather in San Francisco? Use the getWeather tool, then tell me the result.',
        tools: {
          getWeather: tool({
            description: 'Get the current weather for a location',
            inputSchema: jsonSchema({
              type: 'object',
              properties: { location: { type: 'string', description: 'City name' } },
              required: ['location'],
            }),
            execute: async ({ location }: { location: string }) => ({
              location,
              temperature: 72,
              conditions: 'sunny',
            }),
          }),
        },
        maxSteps: 3,
      });
      console.log(toolText);

      // ─── 4. embed (WORKFLOW → EMBEDDING) ────────────────────────────────

      console.log('\n--- embed (EMBEDDING span) ---');
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: 'The quick brown fox jumps over the lazy dog',
      });
      console.log(`Embedding dimensions: ${embedding.length}`);

      // ─── 5. embedMany (WORKFLOW → EMBEDDING) ───────────────────────────

      console.log('\n--- embedMany (EMBEDDING spans) ---');
      const { embeddings } = await embedMany({
        model: openai.embedding('text-embedding-3-small'),
        values: [
          'First document about AI',
          'Second document about databases',
          'Third document about TypeScript',
        ],
      });
      console.log(`Embedded ${embeddings.length} documents, dim=${embeddings[0].length}`);

      // ─── 6. rerank (WORKFLOW → RERANKER) ─────────────────────────────────

      console.log('\n--- rerank (RERANKER span) ---');
      const { ranking } = await rerank({
        model: gateway.rerankingModel('cohere/rerank-v3.5'),
        query: 'What is TypeScript?',
        documents: [
          'TypeScript is a typed superset of JavaScript',
          'Python is a dynamic language',
          'TypeScript compiles to JavaScript',
        ],
      });
      console.log(`Reranked ${ranking.length} documents`);

    } finally {
      rootSpan.end();
    }
  });

  // ─── Done ─────────────────────────────────────────────────────────────────

  console.log('\n--- Flushing spans ---');
  await flush();
  await shutdown();
  console.log('Done. Check ai_sdk_all_spans.log for spans with kinds: WORKFLOW, CHAIN, LLM, TOOL, EMBEDDING, RERANKER');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
