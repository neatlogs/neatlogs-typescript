import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'google_genai_basic_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'google_genai_basic_raw_spans.log';

import { init, flush, shutdown, span } from 'neatlogs';
import { wrapGoogleGenAI, wrapGoogleGenAIChat } from 'neatlogs/google-genai';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    workflowName: 'google-genai-basic',
    tags: ['google-genai', 'gemini', 'basic'],
    disableExport: false,
    debug: true,
  });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Set GOOGLE_API_KEY (Gemini / AI Studio key) — https://aistudio.google.com/apikey');
  }
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  // Optional peer dep — cast through `as string` so the example type-checks
  // even when `@google/genai` isn't installed. It is required at runtime.
  const { GoogleGenAI } = await import('@google/genai' as string);

  const client = wrapGoogleGenAI(new GoogleGenAI({ apiKey }));

  const run = span({ kind: 'WORKFLOW', name: 'gemini-demo' }, async () => {
    console.log('--- generateContent ---');
    const res = await client.models.generateContent({
      model,
      contents: 'In one sentence, what is Google Gemini?',
      // gemini-2.5-flash is a reasoning model — thinking tokens count against
      // maxOutputTokens, so keep it generous or the visible text gets truncated.
      config: { temperature: 0.3, topP: 0.9, maxOutputTokens: 2048 },
    });
    console.log(res.text ?? res.candidates?.[0]?.content?.parts?.[0]?.text);

    console.log('\n--- generateContentStream ---');
    const stream = await client.models.generateContentStream({
      model,
      contents: 'List three benefits of distributed tracing, one per line.',
      config: { temperature: 0.3, topP: 0.9, maxOutputTokens: 2048 },
    });
    for await (const chunk of stream) {
      process.stdout.write(chunk.text ?? '');
    }
    console.log();

    console.log('\n--- embedContent ---');
    try {
      const emb = await client.models.embedContent({
        model: process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
        contents: 'Neatlogs traces Gemini calls.',
      });
      console.log('embedding dims:', emb.embeddings?.[0]?.values?.length);
    } catch (err) {
      // Keep the demo going even if the embed model isn't available on this key;
      // the EMBEDDING span is still recorded (with error status) by the wrapper.
      console.log('embedContent skipped:', (err as Error).message?.slice(0, 80));
    }

    console.log('\n--- chat session (multi-turn) ---');
    // client.chats.create returns a Chat; wrap it so each turn is an LLM span.
    const chat = wrapGoogleGenAIChat(client.chats.create({ model }));
    const t1 = await chat.sendMessage({ message: 'My name is Dave.' });
    console.log('turn 1:', (t1.text ?? '').trim());
    const t2 = await chat.sendMessage({ message: 'What did I just say my name was?' });
    console.log('turn 2:', (t2.text ?? '').trim());
  });
  await run();

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
