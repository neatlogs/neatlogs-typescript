import { flush, flushAll, init, shutdown, span } from '../../dist/index.mjs';
import { wrapOpenAI, traceTool } from '../../dist/openai.mjs';

type Scenario = () => Promise<Record<string, unknown>>;

const endpoint = process.env.NEATLOGS_ENDPOINT ?? 'https://ingest.neatlogs.com';
const apiKey = (process.env.NEATLOGS_API_KEY ?? '').trim();
const runId = process.env.PHASE4_RUN_ID ?? `${Date.now()}-${process.pid}`;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function redactSafely(value: unknown, key = ''): unknown {
  const credentialKeys = new Set([
    'api_key',
    'apikey',
    'authorization',
    'access_token',
    'refresh_token',
    'password',
    'secret',
  ]);

  if (credentialKeys.has(key.toLowerCase())) return '[REDACTED]';
  if (typeof value === 'string') {
    return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
  }
  if (Array.isArray(value)) return value.map((item) => redactSafely(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, redactSafely(child, childKey)]),
    );
  }
  return value;
}

async function configure(name: string, overrides: Record<string, unknown> = {}): Promise<void> {
  await init({
    apiKey,
    endpoint,
    workflowName: `phase4-${name}-${runId}`,
    debug: process.env.NEATLOGS_DEBUG === 'true',
    disableExport: process.env.NEATLOGS_LOCAL_ONLY === 'true',
    registerShutdownHandlers: false,
    batchSize: 25,
    flushInterval: 1,
    mask: async (data) => redactSafely(data) as Record<string, unknown>,
    ...overrides,
  });
}

function fakeOpenAIClient() {
  return {
    chat: {
      completions: {
        async create(request: Record<string, unknown>) {
          return {
            id: `fake-${runId}`,
            model: request.model,
            choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'safe response' } }],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 50,
              total_tokens: 170,
              prompt_tokens_details: { cached_tokens: 20 },
              completion_tokens_details: { reasoning_tokens: 10 },
            },
          };
        },
      },
    },
  };
}

async function numericTokensAndPii(): Promise<Record<string, unknown>> {
  await configure('numeric-pii');
  const client = wrapOpenAI(fakeOpenAIClient());
  const workflow = span(
    { kind: 'WORKFLOW', name: 'numeric-token-and-pii-contract', sessionId: `phase4-pii-${runId}` },
    async (input: Record<string, unknown>) => client.chat.completions.create({
      model: 'fake-launch-readiness-model',
      messages: [{ role: 'user', content: `Contact qa.user@example.com about ${String(input.topic)}` }],
      metadata: { access_token: 'must-not-leave-process', request_id: runId },
    }),
  );
  await workflow({ topic: 'numeric token validation', email: 'qa.user@example.com' });
  const flushed = await flushAll(10_000);
  await shutdown('phase4_numeric_pii_complete');
  return { expectedSpans: 2, expectedTokens: { prompt: 120, completion: 50, total: 170 }, flushed };
}

async function multiBatchTwelveSpan(): Promise<Record<string, unknown>> {
  await configure('multi-batch-12', { batchSize: 3, flushInterval: 1 });
  const fakeClient = wrapOpenAI(fakeOpenAIClient());
  const agents = Array.from({ length: 5 }, (_, index) => span(
    { kind: 'AGENT', name: `specialist-${index + 1}`, role: 'Launch readiness specialist' },
    async () => fakeClient.chat.completions.create({
      model: 'fake-launch-readiness-model',
      messages: [{ role: 'user', content: `specialist ${index + 1}` }],
    }),
  ));
  const scoringTool = traceTool('score-specialists', async (values: unknown[]) => ({ count: values.length, score: 1 }));
  const root = span(
    { kind: 'WORKFLOW', name: 'multi-batch-twelve-span', sessionId: `phase4-multi-${runId}` },
    async () => {
      const first = await agents[0]();
      await flush();
      await sleep(1_200);
      const parallel = await Promise.all(agents.slice(1, 4).map((agent) => agent()));
      await flush();
      await sleep(1_200);
      const reviewer = await agents[4]();
      const score = await scoringTool([first, ...parallel, reviewer]);
      return { score, reviewers: 5 };
    },
  );
  await root();
  const flushed = await flushAll(15_000);
  await shutdown('phase4_multi_batch_complete');
  return { expectedSpans: 12, expectedKinds: { WORKFLOW: 1, AGENT: 5, LLM: 5, TOOL: 1 }, flushed };
}

async function lifecycleFailures(): Promise<Record<string, unknown>> {
  await configure('lifecycle');
  const successfulTool = traceTool('successful-tool', async () => ({ ok: true }));
  const failingTool = traceTool('failing-tool', async () => {
    throw new Error('phase4 expected tool failure');
  });
  const root = span(
    { kind: 'WORKFLOW', name: 'lifecycle-success-and-error', sessionId: `phase4-life-${runId}` },
    async () => {
      await successfulTool({});
      try {
        await failingTool({});
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'phase4 expected tool failure') throw error;
      }
      return { recovered: true };
    },
  );
  await root();
  const firstFlush = await flushAll(10_000);
  const secondFlush = await flushAll(10_000);
  await shutdown('phase4_lifecycle_complete');
  return { expectedSpans: 3, expectedErrorSpans: 1, firstFlush, secondFlush };
}

async function boundedBatchPressure(): Promise<Record<string, unknown>> {
  await configure('batch-pressure', { batchSize: 10, flushInterval: 1 });
  const root = span(
    { kind: 'WORKFLOW', name: 'bounded-batch-pressure', sessionId: `phase4-pressure-${runId}` },
    async () => {
      const tasks = Array.from({ length: 240 }, (_, index) => {
        const tool = span({ kind: 'TOOL', name: `bounded-tool-${index}`, captureInput: true }, async (value: number) => ({ value }));
        return tool(index);
      });
      return Promise.all(tasks);
    },
  );
  await root();
  const flushed = await flushAll(20_000);
  await shutdown('phase4_batch_pressure_complete');
  return { expectedSpans: 241, expectedDroppedSpans: 0, flushed };
}

async function clickhouseSafeLargePayload(): Promise<Record<string, unknown>> {
  await configure('large-safe-payload', { batchSize: 5 });
  const payload = {
    text: 'x'.repeat(128 * 1024),
    nested: { email: 'large.payload@example.com', access_token: 'must-be-redacted' },
    prompt_tokens: 4096,
    completion_tokens: 1024,
    total_tokens: 5120,
  };
  const root = span(
    { kind: 'WORKFLOW', name: 'clickhouse-safe-large-payload', sessionId: `phase4-large-${runId}` },
    async (input: typeof payload) => ({ accepted: true, bytes: input.text.length, ...input }),
  );
  await root(payload);
  const flushed = await flushAll(15_000);
  await shutdown('phase4_large_payload_complete');
  return { expectedSpans: 1, expectedPayloadBytesAtLeast: 128 * 1024, expectedTokenTypes: 'number', flushed };
}

const scenarios: Record<string, Scenario> = {
  'numeric-pii': numericTokensAndPii,
  'multi-batch-12': multiBatchTwelveSpan,
  lifecycle: lifecycleFailures,
  'batch-pressure': boundedBatchPressure,
  'large-safe-payload': clickhouseSafeLargePayload,
};

async function main(): Promise<void> {
  const selected = process.argv[2] ?? 'all';
  if (!apiKey && process.env.NEATLOGS_LOCAL_ONLY !== 'true') {
    throw new Error('Set NEATLOGS_API_KEY for hosted export or NEATLOGS_LOCAL_ONLY=true for a network-free run.');
  }
  const names = selected === 'all' ? Object.keys(scenarios) : [selected];
  for (const name of names) {
    const scenario = scenarios[name];
    if (!scenario) throw new Error(`Unknown scenario ${name}. Choose: all | ${Object.keys(scenarios).join(' | ')}`);
    const result = await scenario();
    console.log(JSON.stringify({ scenario: name, runId, workflow: `phase4-${name}-${runId}`, result }));
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await shutdown('phase4_unhandled_error'); } catch { /* preserve original error */ }
  process.exitCode = 1;
});
