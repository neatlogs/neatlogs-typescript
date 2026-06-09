/**
 * OpenAI (TypeScript) basic example with Neatlogs.
 *
 * Wrap the OpenAI client with `wrapOpenAI` and every chat / responses /
 * embeddings call is captured as an `LLM` span. The wrapped call self-roots — a
 * WORKFLOW root is opened automatically — so a single call renders with no extra
 * wrapper. (To group several calls into ONE trace, wrap them in
 * `span({ kind: 'WORKFLOW' }, ...)`.)
 *
 * Points the OpenAI SDK at OpenRouter (OpenAI-compatible) so it runs with just
 * an OpenRouter key; the instrumentation is identical for api.openai.com.
 *
 * Usage:
 *     npx tsx examples/sdk_examples/openai_basic/main.ts
 *
 * Required env vars:
 *     OPENROUTER_API_KEY   (or OPENAI_API_KEY + drop baseURL for real OpenAI)
 *     OPENAI_MODEL         (default: openai/gpt-4o-mini)
 *     NEATLOGS_API_KEY     (or NEATLOGS_DISABLE_EXPORT=true)
 */

import 'dotenv/config';

import { init, wrapOpenAI, flush, shutdown } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'openai-basic-ts',
    tags: ['openai', 'typescript', 'basic'],
  });

  const { default: OpenAI } = await import('openai');
  const client = wrapOpenAI(
    new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY!,
    }),
  );

  const model = process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini';

  console.log('--- chat.completions.create (non-streaming) ---');
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: 'In one sentence, what is OpenAI?' }],
    temperature: 0.3,
    max_tokens: 256,
  });
  console.log(res.choices[0].message.content);

  console.log('\n--- chat.completions.create (streaming) ---');
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: 'List three uses for tracing.' }],
    max_tokens: 256,
    stream: true,
  });
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
  }
  console.log();

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
