/**
 * Nested spans with WORKFLOW > AGENT > TOOL hierarchy.
 *
 * Run:
 *   NEATLOGS_API_KEY=... npx tsx examples/multi-agent-workflow.ts
 */
import { init, span, shutdown } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    debug: true,
  });

  const searchTool = span({ kind: 'TOOL', name: 'web-search' }, async (query: string) => {
    // Simulate a tool call
    return { results: [`Result for: ${query}`] };
  });

  const researchAgent = span({
    kind: 'AGENT',
    name: 'researcher',
    role: 'Research Assistant',
    goal: 'Find relevant information',
  }, async (topic: string) => {
    const results = await searchTool(topic);
    return `Found: ${JSON.stringify(results)}`;
  });

  const workflow = span({ kind: 'WORKFLOW', name: 'research-pipeline' }, async (question: string) => {
    const research = await researchAgent(question);
    return `Answer based on: ${research}`;
  });

  const answer = await workflow('What is the latest in AI?');
  console.log(answer);

  await shutdown();
}

main().catch(console.error);
