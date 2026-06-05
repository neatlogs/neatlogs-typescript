/**
 * Vertex AI basic example with Neatlogs.
 *
 * Vertex AI is accessed through the `@google/genai` SDK in Vertex mode
 * (`new GoogleGenAI({ vertexai: true, project, location })`). This wrapper traces
 * those calls with provider=vertex_ai / system=vertexai.
 *
 * Demonstrates:
 *   - wrapVertexAI around a GoogleGenAI client in Vertex mode
 *   - models.generateContent (non-streaming)
 *   - models.generateContentStream (streaming)
 *   - models.embedContent (EMBEDDING span)
 *   - input/output capture, token counts, model name in Neatlogs
 *
 * Span kinds produced: WORKFLOW (parent @span), LLM (vertex_ai.models.generate_content),
 * EMBEDDING (vertex_ai.models.embed_content).
 *
 * Usage:
 *     npx tsx examples/sdk_examples/vertex_ai_basic/main.ts
 *
 * Required env vars:
 *     GOOGLE_CLOUD_PROJECT       your GCP project id
 *     GOOGLE_CLOUD_LOCATION      region (default: us-central1)
 *     GOOGLE_APPLICATION_CREDENTIALS  path to a service-account key (ADC)
 *     NEATLOGS_API_KEY           (or set NEATLOGS_DISABLE_EXPORT=true to skip export)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'vertex_ai_basic_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'vertex_ai_basic_raw_spans.log';

import { init, flush, shutdown, span } from 'neatlogs';
import { wrapVertexAI } from 'neatlogs/vertex-ai';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'vertex-ai-basic',
    tags: ['vertex-ai', 'basic'],
    disableExport: false,
    debug: true,
  });

  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey && !process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error(
      'Set GOOGLE_API_KEY for Vertex Express mode, or GOOGLE_CLOUD_PROJECT (+ ADC) for service-account mode',
    );
  }
  const model = process.env.VERTEX_MODEL ?? 'gemini-2.5-flash';

  // Optional peer dep — cast through `as string` so the example type-checks
  // even when `@google/genai` isn't installed. It is required at runtime.
  const { GoogleGenAI } = await import('@google/genai' as string);

  // Vertex Express mode (API key) when GOOGLE_API_KEY is set; otherwise ADC
  // (project + location) using a service account.
  const client = wrapVertexAI(
    apiKey
      ? new GoogleGenAI({ vertexai: true, apiKey })
      : new GoogleGenAI({
          vertexai: true,
          project: process.env.GOOGLE_CLOUD_PROJECT!,
          location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
        }),
  );

  const run = span({ kind: 'WORKFLOW', name: 'vertex-demo' }, async () => {
    console.log('--- generateContent ---');
    const res = await client.models.generateContent({
      model,
      contents: 'In one sentence, what is Vertex AI?',
      config: { temperature: 0.3, topP: 0.9, maxOutputTokens: 256 },
    });
    console.log(res.text ?? res.candidates?.[0]?.content?.parts?.[0]?.text);

    console.log('\n--- generateContentStream ---');
    const stream = await client.models.generateContentStream({
      model,
      contents: 'List three benefits of distributed tracing, one per line.',
      config: { temperature: 0.3, topP: 0.9, maxOutputTokens: 256 },
    });
    for await (const chunk of stream) {
      process.stdout.write(chunk.text ?? '');
    }
    console.log();

    console.log('\n--- embedContent ---');
    const emb = await client.models.embedContent({
      model: process.env.VERTEX_EMBED_MODEL ?? 'text-embedding-004',
      contents: 'Neatlogs traces Vertex AI calls.',
    });
    console.log('embedding dims:', emb.embeddings?.[0]?.values?.length);
  });
  await run();

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
