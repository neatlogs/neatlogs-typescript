/**
 * LangChain (TypeScript) basic example with Neatlogs.
 *
 * Attach `langchainHandler()` as a callback and LangChain LLM calls, chains,
 * tools, and retrievers are captured. The run self-roots — a WORKFLOW root is
 * opened automatically — so a bare `llm.invoke(..., { callbacks: [handler] })`
 * renders with no manual wrapper. (To group a multi-step run under one named
 * root, wrap it in `span({ kind: 'WORKFLOW' }, ...)`.)
 *
 * Points ChatOpenAI at OpenRouter (OpenAI-compatible) so it runs with just an
 * OpenRouter key.
 *
 * Usage:
 *     npx tsx examples/sdk_examples/langchain_basic/main.ts
 *
 * Required env vars:
 *     OPENROUTER_API_KEY
 *     LANGCHAIN_MODEL      (default: openai/gpt-4o-mini)
 *     NEATLOGS_API_KEY     (or NEATLOGS_DISABLE_EXPORT=true)
 */

import 'dotenv/config';

import { init, langchainHandler, flush, shutdown } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'langchain-basic-ts',
    tags: ['langchain', 'typescript', 'basic'],
  });

  const { ChatOpenAI } = await import('@langchain/openai');
  const llm = new ChatOpenAI({
    model: process.env.LANGCHAIN_MODEL ?? 'openai/gpt-4o-mini',
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: 'https://openrouter.ai/api/v1' },
    temperature: 0.3,
    maxTokens: 256,
  });

  const handler = langchainHandler();

  // Bare invoke — self-roots into a WORKFLOW automatically.
  const res = await llm.invoke('In one sentence, what is LangChain?', {
    callbacks: [handler],
  });
  console.log(typeof res.content === 'string' ? res.content : JSON.stringify(res.content));

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
