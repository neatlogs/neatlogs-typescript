import { init, flush, shutdown, span, identify } from '../../dist/index.mjs';
import { wrapAzureOpenAI } from '../../dist/azure-openai.mjs';

const ENDPOINT = process.env.NEATLOGS_ENDPOINT ?? '';
const API_KEY = (process.env.NEATLOGS_API_KEY ?? '').trim();

async function azureClient(): Promise<any> {
  const { AzureOpenAI } = await import('openai' as string);
  return new AzureOpenAI({
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_API_BASE!,
    apiVersion: process.env.AZURE_API_VERSION!,
  });
}

async function llmCall(client: any, prompt: string): Promise<string> {
  const deployment = process.env.AZURE_API_DEPLOYMENT_NAME!;
  // gpt-5-nano is a reasoning model: needs generous max_completion_tokens.
  const resp = await client.chat.completions.create({
    model: deployment,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 2000,
  });
  return resp.choices?.[0]?.message?.content ?? '';
}

// WRAPPER loop: 3 turns, each wrapped in identify() over a real Azure call.
// The wrapper auto-root picks up session + end-user from identify() context.
async function wrapperScenario(): Promise<void> {
  await init({ apiKey: API_KEY, endpoint: ENDPOINT, workflowName: 'mt-ts-wrapper' });
  const client = wrapAzureOpenAI(await azureClient());
  const prompts = ['Say hi in 3 words.', 'Now say bye in 3 words.', 'One more: say ok in 1 word.'];
  for (let i = 0; i < prompts.length; i++) {
    await identify(
      { sessionId: 'mt_ts_conv1', endUserId: 'mt_ts_user1', endUserMetadata: { plan: 'pro' } },
      async () => {
        const out = await llmCall(client, prompts[i]);
        console.log(`    turn ${i + 1}: ${JSON.stringify(out).slice(0, 60)}`);
      },
    );
  }
  await flush();
}

// DECORATOR loop: 3 turns, each a WORKFLOW root span with a nested TOOL span.
async function decoratorScenario(): Promise<void> {
  await init({ apiKey: API_KEY, endpoint: ENDPOINT, workflowName: 'mt-ts-decorator' });
  for (let i = 0; i < 3; i++) {
    const turn = span(
      {
        kind: 'WORKFLOW',
        name: 'turn',
        sessionId: 'mt_ts_conv2',
        endUserId: 'mt_ts_user2',
        endUserMetadata: { plan: 'team' },
      },
      async () => {
        const tool = span({ kind: 'TOOL', name: 'noop', toolName: 'noop' }, async () => 'ok');
        return tool();
      },
    );
    await turn();
    console.log(`    turn ${i + 1}: done`);
  }
  await flush();
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  wrapper: wrapperScenario,
  decorator: decoratorScenario,
};

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('NEATLOGS_API_KEY required');
    process.exit(1);
  }
  const only = process.argv[2];
  if (!only || !SCENARIOS[only]) {
    console.error(`Pass a scenario: wrapper | decorator. Got: ${only}`);
    process.exit(1);
  }
  console.log(`--- scenario ${only} ---`);
  await SCENARIOS[only]();
  console.log(`    done: ${only}`);
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
