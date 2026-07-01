import { init, flush, shutdown, span, trace, identify } from '../../dist/index.mjs';
import { wrapAzureOpenAI } from '../../dist/azure-openai.mjs';

const ENDPOINT = process.env.NEATLOGS_ENDPOINT ?? '';
const API_KEY = (process.env.NEATLOGS_API_KEY ?? '').trim();
const PREFIX = 'ts-matrix';

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

async function reinit(workflowName: string): Promise<void> {
  await init({ apiKey: API_KEY, endpoint: ENDPOINT, workflowName });
}

// 1. wrapper-only: identity comes from identify() (NOT init). The auto-root
//    created inside wrap() picks up session + end-user from context.
async function scenario1(): Promise<void> {
  await reinit(`${PREFIX}-s1`);
  const client = wrapAzureOpenAI(await azureClient());
  await identify(
    { sessionId: 'ts_s1_session', endUserId: 'ts_s1_user', endUserMetadata: { plan: 'pro' } },
    async () => {
      await llmCall(client, 'Say hi in 3 words.');
    },
  );
  await flush();
}

// 2. wrapper + span WORKFLOW root: decorator root owns identity; wrapped LLM nested.
async function scenario2(): Promise<void> {
  await reinit(`${PREFIX}-s2`);
  const client = wrapAzureOpenAI(await azureClient());
  const turn = span(
    { kind: 'WORKFLOW', name: `${PREFIX}-s2`, sessionId: 'ts_s2_session', endUserId: 'ts_s2_user' },
    async () => llmCall(client, 'Say bye in 3 words.'),
  );
  await turn();
  await flush();
}

// 3. decorator-only: WORKFLOW root + nested TOOL span (no LLM).
async function scenario3(): Promise<void> {
  await reinit(`${PREFIX}-s3`);
  const turn = span(
    { kind: 'WORKFLOW', name: `${PREFIX}-s3`, sessionId: 'ts_s3_session' },
    async () => {
      const tool = span({ kind: 'TOOL', name: 'noop', toolName: 'noop' }, async () => 'ok');
      return tool();
    },
  );
  await turn();
  await flush();
}

// 4. workflow.
async function scenario4(): Promise<void> {
  await reinit(`${PREFIX}-s4`);
  const wf = span({ kind: 'WORKFLOW', name: `${PREFIX}-s4`, sessionId: 'ts_s4_session' }, async () => 'done');
  await wf();
  await flush();
}

// 5. multi-turn NOT workflow: 3x trace() sharing a session.
async function scenario5(): Promise<void> {
  await reinit(`${PREFIX}-s5`);
  for (const _q of ['turn one', 'turn two', 'turn three']) {
    await trace({ name: 'chat_turn', sessionId: 'ts_s5_session' }, async () => {});
  }
  await flush();
}

// 6. end-user per session: two trace() roots, distinct session + end-user.
async function scenario6(): Promise<void> {
  await reinit(`${PREFIX}-s6`);
  await trace(
    { name: 'turn', sessionId: 'ts_s6_sessionA', endUserId: 'ts_s6_userA', endUserMetadata: { plan: 'free' } },
    async () => {},
  );
  await trace(
    { name: 'turn', sessionId: 'ts_s6_sessionB', endUserId: 'ts_s6_userB', endUserMetadata: { plan: 'pro' } },
    async () => {},
  );
  await flush();
}

// 7. no session -> backend falls back to trace_id.
async function scenario7(): Promise<void> {
  await reinit(`${PREFIX}-s7`);
  const wf = span({ kind: 'WORKFLOW', name: `${PREFIX}-s7` }, async () => 'no session set');
  await wf();
  await flush();
}

// 8. session via identify + root override: per-call must win; sibling inherits ctx.
async function scenario8(): Promise<void> {
  await reinit(`${PREFIX}-s8`);
  await identify({ sessionId: 'ts_s8_ctx_session' }, async () => {
    const wf = span(
      { kind: 'WORKFLOW', name: `${PREFIX}-s8`, sessionId: 'ts_s8_root_session' },
      async () => 'override',
    );
    await wf();
    const wf2 = span({ kind: 'WORKFLOW', name: `${PREFIX}-s8b` }, async () => 'inherit');
    await wf2();
  });
  await flush();
}

// 9. end-user via identify + root override: per-call wins.
async function scenario9(): Promise<void> {
  await reinit(`${PREFIX}-s9`);
  await identify({ endUserId: 'ts_s9_ctx_user', endUserMetadata: { plan: 'free' } }, async () => {
    const wf = span(
      {
        kind: 'WORKFLOW',
        name: `${PREFIX}-s9`,
        sessionId: 'ts_s9_session',
        endUserId: 'ts_s9_root_user',
        endUserMetadata: { plan: 'enterprise' },
      },
      async () => 'root enduser',
    );
    await wf();
  });
  await flush();
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  '1': scenario1,
  '2': scenario2,
  '3': scenario3,
  '4': scenario4,
  '5': scenario5,
  '6': scenario6,
  '7': scenario7,
  '8': scenario8,
  '9': scenario9,
};

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('NEATLOGS_API_KEY required');
    process.exit(1);
  }
  const only = process.argv[2];
  if (!only || !SCENARIOS[only]) {
    console.error(`Pass a scenario number 1-9. Got: ${only}`);
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
