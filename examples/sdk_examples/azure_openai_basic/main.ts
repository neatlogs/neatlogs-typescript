/**
 * Azure OpenAI basic example with Neatlogs.
 *
 * Demonstrates:
 *   - wrapAzureOpenAI around the `openai` SDK's AzureOpenAI client
 *   - chat.completions.create (non-streaming) with a tool definition
 *   - chat.completions.create (streaming) with token usage
 *   - traceTool to wrap a tool function as a TOOL span
 *   - input/output capture, token counts, provider=azure in Neatlogs
 *
 * Span kinds produced: WORKFLOW (parent @span), LLM (azure_openai.chat.completions.create),
 * TOOL (the traced get_weather tool).
 *
 * Usage:
 *     npx tsx examples/sdk_examples/azure_openai_basic/main.ts
 *
 * Required env vars:
 *     AZURE_OPENAI_API_KEY
 *     AZURE_OPENAI_ENDPOINT      (e.g. https://my-resource.openai.azure.com)
 *     AZURE_OPENAI_DEPLOYMENT    (e.g. gpt-4o-mini)
 *     AZURE_OPENAI_API_VERSION   (default: 2024-10-21)
 *     NEATLOGS_API_KEY           (or set NEATLOGS_DISABLE_EXPORT=true to skip export)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'azure_openai_basic_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'azure_openai_basic_raw_spans.log';

import { init, flush, shutdown, span } from 'neatlogs';
import { wrapAzureOpenAI, traceTool } from 'neatlogs/azure-openai';

// A tool the model can call. Wrapped with traceTool so its execution is a TOOL span.
const getWeather = traceTool('get_weather', async ({ location }: { location: string }) => {
  return { location, temperature: 72, conditions: 'sunny' };
});

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'azure-openai-basic',
    tags: ['azure-openai', 'basic'],
    disableExport: false,
    debug: true,
  });

  if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error('Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
  }
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';

  // Optional peer dep — cast through `as string` so the example type-checks
  // even when `openai` isn't installed. It is required at runtime.
  const { AzureOpenAI } = await import('openai' as string);

  const client = wrapAzureOpenAI(
    new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
      deployment,
    }),
  );

  // This run is ONE logical turn made of several spans (LLM -> traceTool ->
  // LLM -> stream), so a WORKFLOW root groups them into a single trace. A lone
  // wrapped LLM call auto-roots on its own, but the traceTool TOOL span needs
  // this WORKFLOW parent to attach to — so the explicit root is required here.
  // (The wrapper detects the active WORKFLOW and does NOT add a second root.)
  const run = span({ kind: 'WORKFLOW', name: 'azure-weather-chat' }, async () => {
    console.log('--- non-streaming chat.completions.create (with tool) ---');
    const first = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: 'You are a concise weather assistant. Use the get_weather tool when asked about weather.' },
        { role: 'user', content: 'What is the weather in San Francisco?' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the current weather for a location',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        },
      ],
      // Reasoning-model deployments (o-series, gpt-5-*) only accept the default
      // temperature; pass AZURE_TEMPERATURE=0.2 for standard chat deployments.
      ...(process.env.AZURE_TEMPERATURE ? { temperature: Number(process.env.AZURE_TEMPERATURE) } : {}),
    });

    const toolCall = first.choices[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      const weather = await getWeather(args);
      console.log('tool result:', weather);

      const second = await client.chat.completions.create({
        model: deployment,
        messages: [
          { role: 'system', content: 'You are a concise weather assistant. Use the get_weather tool when asked about weather.' },
          { role: 'user', content: 'What is the weather in San Francisco?' },
          first.choices[0].message as any,
          { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(weather) },
        ],
      });
      console.log('final:', second.choices[0]?.message?.content);
    } else {
      console.log('final:', first.choices[0]?.message?.content);
    }

    console.log('\n--- streaming chat.completions.create ---');
    const stream = await client.chat.completions.create({
      model: deployment,
      messages: [{ role: 'user', content: 'In one sentence, what is OpenTelemetry?' }],
      stream: true,
    });
    for await (const chunk of stream) {
      process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
    }
    console.log();
  });
  await run();

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
