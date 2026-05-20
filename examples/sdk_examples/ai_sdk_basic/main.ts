/**
 * Vercel AI SDK basic example with Neatlogs.
 *
 * Demonstrates:
 *   - wrapAISDK around the `ai` module
 *   - generateText with Azure OpenAI
 *   - streamText with a tool call
 *   - input/output capture, token counts, model name in Neatlogs
 *
 * Span kinds produced: WORKFLOW (parent), LLM (ai.generateText, ai.streamText,
 * doGenerate, doStream), TOOL (ai.toolCall).
 *
 * Usage:
 *     npx tsx examples/sdk_examples/ai_sdk_basic/main.ts
 *
 * Required env vars (mirrors mastra_complex):
 *     AZURE_OPENAI_API_KEY
 *     AZURE_OPENAI_ENDPOINT
 *     AZURE_OPENAI_DEPLOYMENT (e.g. gpt-4o-mini)
 *     NEATLOGS_API_KEY (or set NEATLOGS_DISABLE_EXPORT=true to skip export)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'ai_sdk_basic_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'ai_sdk_basic_raw_spans.log';

import { init, flush, shutdown } from 'neatlogs';
import { wrapAISDK } from 'neatlogs/ai';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'ai-sdk-basic',
    tags: ['ai-sdk', 'basic'],
    captureLogs: false,
    disableExport: false,
    debug: true,
  });

  if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error('Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
  }
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';

  // Optional peer deps — cast through `as string` so the example type-checks
  // even when these packages aren't installed. They are required at runtime.
  const ai = await import('ai' as string);
  const { createAzure } = await import('@ai-sdk/azure' as string);
  const { z } = await import('zod' as string);

  const { generateText, streamText } = wrapAISDK(ai);

  const azureResourceName = process.env.AZURE_OPENAI_ENDPOINT!
    .replace(/^https?:\/\//, '')
    .replace(/\.(openai|cognitiveservices)\.azure\.com\/?$/, '');
  const azure = createAzure({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    resourceName: azureResourceName,
  });

  console.log('--- generateText ---');
  const { text } = await generateText({
    model: azure(azureDeployment),
    prompt: 'In one sentence, what is TypeScript?',
  });
  console.log(text);

  console.log('\n--- streamText with tool ---');
  const stream = streamText({
    model: azure(azureDeployment),
    prompt: 'What is the weather in San Francisco? Use the getWeather tool.',
    tools: {
      getWeather: {
        description: 'Get the current weather for a location',
        // AI SDK v3 uses `parameters`; v4+ uses `inputSchema`. Pick whichever
        // your installed `ai` version supports.
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }: { location: string }) => ({
          location,
          temperature: 72,
          conditions: 'sunny',
        }),
      },
    },
    // AI SDK v3 uses maxToolRoundtrips; v4+ uses maxSteps. The wrapper is
    // version-agnostic — pick whichever your installed `ai` version supports.
    maxSteps: 2,
  });

  for await (const delta of stream.textStream) {
    process.stdout.write(delta);
  }
  console.log();

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
