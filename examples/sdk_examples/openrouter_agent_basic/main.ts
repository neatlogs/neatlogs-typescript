/**
 * OpenRouter Agent basic example with Neatlogs.
 *
 * Wraps the `@openrouter/agent` SDK so each `client.callModel(...)` is traced.
 * Telemetry is finalized when the ModelResult is consumed (e.g. via getText()).
 *
 * Demonstrates:
 *   - wrapOpenRouterAgent around an OpenRouter client
 *   - callModel(...) + getText() (LLM span finalized on consume)
 *   - input/output capture, token counts, provider=openrouter, response id
 *
 * Span kinds produced: WORKFLOW (parent @span), LLM (openrouter.call_model).
 *
 * Usage:
 *     npx tsx examples/sdk_examples/openrouter_agent_basic/main.ts
 *
 * Required env vars:
 *     OPENROUTER_API_KEY
 *     OPENROUTER_MODEL   (default: openai/gpt-4o-mini)
 *     NEATLOGS_API_KEY   (or set NEATLOGS_DISABLE_EXPORT=true to skip export)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'openrouter_agent_basic_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'openrouter_agent_basic_raw_spans.log';

import { init, flush, shutdown, span } from 'neatlogs';
import { wrapOpenRouterAgent } from 'neatlogs/openrouter-agent';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'openrouter-agent-basic',
    tags: ['openrouter', 'basic'],
    disableExport: false,
    debug: true,
  });

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('Set OPENROUTER_API_KEY');
  }
  const model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';

  // Optional peer dep — cast through `as string` so the example type-checks
  // even when `@openrouter/agent` isn't installed. It is required at runtime.
  const { OpenRouter } = await import('@openrouter/agent' as string);

  const openrouter = wrapOpenRouterAgent(
    new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! }),
  );

  const run = span({ kind: 'WORKFLOW', name: 'openrouter-demo' }, async () => {
    console.log('--- callModel + getText ---');
    // @openrouter/agent: callModel(request) on the client; `input` is the prompt
    // (string or messages). The LLM span finalizes when the result is consumed.
    // @openrouter/agent's callModel request derives its sampling params from the
    // OpenResponses ResponsesRequest type, which uses camelCase key names:
    // temperature, topP, maxOutputTokens (NOT maxTokens/max_tokens).
    const result = openrouter.callModel({
      model,
      input: 'In one sentence, what is OpenRouter?',
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: 256,
    });
    const text = await result.getText();
    console.log(text);
  });
  await run();

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
