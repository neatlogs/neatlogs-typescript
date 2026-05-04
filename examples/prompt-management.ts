/**
 * PromptTemplate + trace() usage for prompt versioning and tracking.
 *
 * Run:
 *   NEATLOGS_API_KEY=... npx tsx examples/prompt-management.ts
 */
import { init, span, trace, PromptTemplate, shutdown } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    instrumentations: ['openai'],
  });

  const systemTemplate = new PromptTemplate(
    'You are a {{role}} assistant. Answer questions about {{topic}}.'
  );

  const userTemplate = new PromptTemplate([
    { role: 'user', content: '{{question}}' },
  ]);

  const askQuestion = span({ kind: 'WORKFLOW', name: 'qa-with-prompts' }, async (question: string) => {
    // trace() captures prompt template + variables for versioning
    return await trace({
      name: 'prompt-tracking',
      promptTemplate: systemTemplate,
    }, async () => {
      const systemMsg = systemTemplate.compile({ role: 'helpful', topic: 'TypeScript' });
      const userMsgs = userTemplate.compile({ question });
      // In a real app, pass these to your LLM client
      return `System: ${systemMsg}, User: ${JSON.stringify(userMsgs)}`;
    });
  });

  const result = await askQuestion('What are generics?');
  console.log(result);

  await shutdown();
}

main().catch(console.error);
