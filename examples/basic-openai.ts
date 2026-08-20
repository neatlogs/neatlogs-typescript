/**
 * Basic OpenAI usage with explicit Neatlogs instrumentation.
 *
 * Run:
 *   NEATLOGS_API_KEY=... OPENAI_API_KEY=... npx tsx examples/basic-openai.ts
 */
import { init, span, shutdown, wrapOpenAI } from 'neatlogs';
import OpenAI from 'openai';

async function main() {
  await init({ apiKey: process.env.NEATLOGS_API_KEY });

  const client = wrapOpenAI(new OpenAI());

  const myWorkflow = span({ kind: 'WORKFLOW', name: 'qa-bot' }, async (query: string) => {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: query }],
    });
    return response.choices[0].message.content;
  });

  const answer = await myWorkflow('What is TypeScript?');
  console.log(answer);

  await shutdown();
}

main().catch(console.error);
