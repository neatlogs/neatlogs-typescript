/**
 * Real-call coverage for the maintained Agent class and low-level loop APIs.
 * The coherent product workflow lives in main.mts; this file is intentionally a
 * coverage probe so API edge cases do not distort that conversation.
 */

import 'dotenv/config';
import { deflateSync } from 'node:zlib';
import {
  Agent,
  AgentHarness,
  InMemorySessionRepo,
  agentLoop,
  agentLoopContinue,
  runAgentLoop,
  runAgentLoopContinue,
  setDefaultStreamFn,
  type AgentEvent,
  type AgentLoopConfig,
  type AgentMessage,
} from '@earendil-works/pi-agent-core';
import { identify, init, flush, shutdown } from 'neatlogs';
import { piAgentHooks, tracePiAgentEvents, tracePiStream } from 'neatlogs/pi-agent';
import {
  allTools,
  harnessTools,
  model,
  models,
  slowIncidentLookup,
  userMessage,
} from './tools.mjs';

const workflowName = 'pi-agent-current-surface';
const streamFn = models.streamSimple.bind(models);
const convertToLlm = (messages: AgentMessage[]) => messages as any;

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, 'ascii');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}

/** A self-contained 32×32 RGB PNG accepted by vision-capable providers. */
function testPngBase64() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(32, 0);
  header.writeUInt32BE(32, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const scanline = Buffer.concat([Buffer.from([0]), Buffer.alloc(32 * 3, 0x4f)]);
  const pixels = Buffer.concat(Array.from({ length: 32 }, () => scanline));
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function context(tools = allTools) {
  return {
    systemPrompt: 'Be concise. Use tools when explicitly requested.',
    messages: [] as AgentMessage[],
    tools,
  };
}

function config(_tools = allTools): AgentLoopConfig {
  return {
    model,
    convertToLlm,
    getApiKey: () => process.env.OPENAI_API_KEY,
    shouldStopAfterTurn: () => false,
    getSteeringMessages: async () => [],
    getFollowUpMessages: async () => [],
    prepareNextTurn: () => undefined,
    toolExecution: 'parallel',
  };
}

async function consume(stream: any, traceEvent: (event: unknown) => void) {
  for await (const event of stream) traceEvent(event);
  return stream.result();
}

async function main() {
  for (const key of ['NEATLOGS_API_KEY', 'OPENAI_API_KEY']) {
    if (!process.env[key]) throw new Error(`${key} is required in neatlogs-typescript/.env`);
  }
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    workflowName,
    tags: ['pi-agent', 'earendil-0.83', 'surface-coverage'],
  });

  setDefaultStreamFn(streamFn);
  let payloads = 0;
  let responses = 0;
  let beforeTools = 0;
  let afterTools = 0;
  let prepareCalls = 0;

  const agent = piAgentHooks(
    new Agent({
      initialState: {
        systemPrompt: 'Be concise and use tools when explicitly requested.',
        model,
        tools: allTools,
        messages: [],
        thinkingLevel: 'off',
      },
      streamFn: async (...args) => streamFn(...args), // valid Promise<EventStream> path
      convertToLlm,
      transformContext: async (messages) => messages,
      getApiKey: () => process.env.OPENAI_API_KEY,
      onPayload: () => {
        payloads += 1;
      },
      onResponse: () => {
        responses += 1;
      },
      beforeToolCall: async () => {
        beforeTools += 1;
        return undefined;
      },
      afterToolCall: async () => {
        afterTools += 1;
        return undefined;
      },
      prepareNextTurn: () => {
        prepareCalls += 1;
        return undefined;
      },
      prepareNextTurnWithContext: () => undefined,
      steeringMode: 'all',
      followUpMode: 'one-at-a-time',
      sessionId: `pi-agent-class-${Date.now()}`,
      thinkingBudgets: { low: 128, medium: 256, high: 512 },
      transport: 'sse',
      maxRetryDelayMs: 500,
      toolExecution: 'parallel',
    }),
  );

  let events = 0;
  const unsubscribe = agent.subscribe((_event: AgentEvent) => {
    events += 1;
  });

  // Public fields, state accessors and queue-mode accessors.
  agent.steeringMode = 'one-at-a-time';
  agent.followUpMode = 'all';
  agent.state.tools = [...allTools];
  agent.state.messages = [...agent.state.messages];
  agent.toolExecution = 'sequential';
  agent.transport = 'sse';
  agent.maxRetryDelayMs = 750;
  agent.sessionId = `pi-agent-class-updated-${Date.now()}`;

  const run = <T,>(label: string, fn: () => Promise<T>) =>
    identify(
      { sessionId: 'pi-agent-class-conversation', endUserId: 'pi-e2e-user' },
      async () => {
        const value = await fn();
        await agent.waitForIdle();
        console.log(`completed: ${label}`);
        return value;
      },
    );

  await run('prompt(text)', () => agent.prompt('Reply with exactly: text overload works'));
  await run('prompt(single AgentMessage)', () =>
    agent.prompt(userMessage('Reply with exactly: single message overload works')),
  );
  await run('prompt(message[])', () =>
    agent.prompt([userMessage('Reply with exactly: batch overload works')]),
  );

  // A generated PNG exercises prompt(text, images) without a binary fixture.
  await run('prompt(text, images)', () =>
    agent.prompt('Say whether an image attachment was supplied.', [
      {
        type: 'image',
        mimeType: 'image/png',
        data: testPngBase64(),
      },
    ]),
  );

  agent.state.messages = [...agent.state.messages, userMessage('Reply with exactly: continue works')];
  await run('continue()', () => agent.continue());

  const queued = agent.prompt('Call slow_incident_lookup for INC-99, then report its status.');
  await new Promise((resolve) => setTimeout(resolve, 250));
  agent.steer(userMessage('Also mention that steering was applied.'));
  agent.followUp(userMessage('End with exactly: follow-up complete'));
  console.log('queue/signal state', {
    queued: agent.hasQueuedMessages(),
    signalActive: Boolean(agent.signal),
    streaming: agent.state.isStreaming,
    pendingTools: agent.state.pendingToolCalls.size,
    partial: Boolean(agent.state.streamingMessage),
  });
  await queued;
  await agent.waitForIdle();

  agent.steer(userMessage('clear me'));
  agent.followUp(userMessage('clear me too'));
  agent.clearSteeringQueue();
  agent.clearFollowUpQueue();
  agent.clearAllQueues();

  const aborting = agent.prompt('Call slow_incident_lookup for INC-ABORT and wait for it.');
  await new Promise((resolve) => setTimeout(resolve, 250));
  agent.abort();
  await aborting.catch(() => undefined);
  await agent.waitForIdle();
  console.log('abort state', { error: agent.state.errorMessage, aborted: agent.signal?.aborted });

  agent.reset();
  await run('reset then reuse', () => agent.prompt('Reply with exactly: reset works'));
  unsubscribe();

  // AgentHarness.abort() has its own async public contract. Ordinary harness
  // runs still emit the same Agent events and should close cleanly on abort.
  const harnessSession = await new InMemorySessionRepo().create({
    id: `pi-harness-abort-${Date.now()}`,
  });
  const abortHarness = piAgentHooks(
    new AgentHarness({
      session: harnessSession,
      models,
      model,
      tools: harnessTools,
      systemPrompt: 'Use the requested tool.',
    }),
  );
  const harnessRun = abortHarness.prompt(
    'Call slow_incident_lookup for INC-HARNESS-ABORT and wait for it.',
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  const harnessAbort = await abortHarness.abort();
  await harnessRun.catch(() => undefined);
  await abortHarness.waitForIdle();
  console.log('completed: AgentHarness.abort()', harnessAbort);

  // All four functional loop entry points with real provider calls.
  const loopCtx = context([]);
  const firstTrace = tracePiAgentEvents(() => loopCtx.messages);
  const first = agentLoop(
    [userMessage('Reply with exactly: agentLoop works')],
    loopCtx,
    config([]),
    undefined,
    streamFn,
  );
  loopCtx.messages.push(...(await consume(first, firstTrace)));

  loopCtx.messages.push(userMessage('Reply with exactly: agentLoopContinue works'));
  const secondTrace = tracePiAgentEvents(() => loopCtx.messages);
  const second = agentLoopContinue(loopCtx, config([]), undefined, streamFn);
  await consume(second, secondTrace);

  const runCtx = context([]);
  const thirdTrace = tracePiAgentEvents(() => runCtx.messages);
  runCtx.messages.push(
    ...(await runAgentLoop(
      [userMessage('Reply with exactly: runAgentLoop works')],
      runCtx,
      config([]),
      (event) => thirdTrace(event),
      undefined,
      streamFn,
    )),
  );
  runCtx.messages.push(userMessage('Reply with exactly: runAgentLoopContinue works'));
  const fourthTrace = tracePiAgentEvents(() => runCtx.messages);
  await runAgentLoopContinue(
    runCtx,
    config([]),
    (event) => fourthTrace(event),
    undefined,
    streamFn,
  );

  // Standalone async StreamFn: validates Promise<EventStream>, chunk observation,
  // TTFT and synthetic WORKFLOW-root behavior with a real provider.
  const tracedStream = tracePiStream(async (...args: Parameters<typeof streamFn>) => streamFn(...args));
  const standalone = await tracedStream(model, {
    systemPrompt: 'Be concise.',
    messages: [userMessage('Give one two-word benefit of tracing.')],
  });
  for await (const _event of standalone) void _event;
  await standalone.result();

  console.log('Agent surface counters', {
    events,
    payloads,
    responses,
    beforeTools,
    afterTools,
    prepareCalls,
    tools: agent.state.tools.length,
    mode: agent.toolExecution,
    transport: agent.transport,
    slowToolPresent: agent.state.tools.includes(slowIncidentLookup),
  });
  setDefaultStreamFn(undefined);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await flush();
    await shutdown();
  });
