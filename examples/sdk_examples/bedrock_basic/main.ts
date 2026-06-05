/**
 * AWS Bedrock basic example with Neatlogs.
 *
 * Demonstrates:
 *   - wrapBedrock around an @aws-sdk/client-bedrock-runtime client
 *   - Converse API (client.send(new ConverseCommand(...)))
 *   - ConverseStream API (streaming)
 *   - traceTool to wrap a tool function as a TOOL span
 *   - input/output capture, token counts, provider=bedrock, system=<model vendor>
 *
 * Span kinds produced: WORKFLOW (parent @span), LLM (bedrock.converse,
 * bedrock.converse_stream), TOOL (the traced get_weather tool).
 *
 * Usage:
 *     npx tsx examples/sdk_examples/bedrock_basic/main.ts
 *
 * Required env vars:
 *     AWS_REGION                 (default: us-east-1)
 *     AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or any standard AWS credential chain)
 *     BEDROCK_MODEL_ID           (default: anthropic.claude-3-5-sonnet-20240620-v1:0)
 *     NEATLOGS_API_KEY           (or set NEATLOGS_DISABLE_EXPORT=true to skip export)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'bedrock_basic_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'bedrock_basic_raw_spans.log';

import { init, flush, shutdown, span } from 'neatlogs';
import { wrapBedrock, traceTool } from 'neatlogs/bedrock';

const getWeather = traceTool('get_weather', async ({ location }: { location: string }) => {
  return { location, temperature: 72, conditions: 'sunny' };
});

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'bedrock-basic',
    tags: ['bedrock', 'basic'],
    disableExport: false,
    debug: true,
  });

  const region = process.env.AWS_REGION ?? 'us-east-1';
  const modelId = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20240620-v1:0';

  // Optional peer dep — cast through `as string` so the example type-checks
  // even when @aws-sdk/client-bedrock-runtime isn't installed. Required at runtime.
  const { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } = await import(
    '@aws-sdk/client-bedrock-runtime' as string
  );

  const client = wrapBedrock(new BedrockRuntimeClient({ region }));

  const run = span({ kind: 'WORKFLOW', name: 'bedrock-demo' }, async () => {
    console.log('--- Converse ---');
    const res = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: 'In one sentence, what is AWS Bedrock?' }] }],
        inferenceConfig: { temperature: 0.2, maxTokens: 512 },
      }),
    );
    console.log(res.output?.message?.content?.[0]?.text);

    // Show traceTool producing a standalone TOOL span.
    console.log('tool:', await getWeather({ location: 'Seattle' }));

    console.log('\n--- ConverseStream ---');
    const stream = await client.send(
      new ConverseStreamCommand({
        modelId,
        messages: [
          { role: 'user', content: [{ text: 'List three uses for distributed tracing.' }] },
        ],
      }),
    );
    for await (const event of stream.stream ?? []) {
      const delta = event.contentBlockDelta?.delta?.text;
      if (delta) process.stdout.write(delta);
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
