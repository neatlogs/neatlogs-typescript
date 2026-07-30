/**
 * A coherent, real multi-turn Pi AgentHarness workflow.
 *
 * This is the maintained @earendil-works/pi-* path. It keeps one session and
 * one end-user across an incident-response conversation, exercises tools,
 * steering/follow-up/next-turn queues, skills, prompt templates, branching and
 * compaction, and sends every real provider call through Neatlogs.
 */

import 'dotenv/config';
import {
  AgentHarness,
  InMemorySessionRepo,
  type AgentHarnessEvent,
} from '@earendil-works/pi-agent-core';
import { identify, init, flush, shutdown } from 'neatlogs';
import { piAgentHooks } from 'neatlogs/pi-agent';
import { harnessTools, model, models } from './tools.mjs';

const sessionId = `pi-current-${Date.now()}`;
const endUserId = 'pi-e2e-user';
const workflowName = process.env.NEATLOGS_WORKFLOW_NAME ?? 'pi-agent-current-workflow';

async function main() {
  for (const key of ['NEATLOGS_API_KEY', 'OPENAI_API_KEY']) {
    if (!process.env[key]) throw new Error(`${key} is required in neatlogs-typescript/.env`);
  }

  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    workflowName,
    tags: ['pi-agent', 'earendil-0.83', 'real-multi-turn'],
  });

  const repo = new InMemorySessionRepo();
  const session = await repo.create({ id: sessionId });
  const resources = {
    skills: [
      {
        name: 'incident-triage',
        description: 'Triage an operational incident.',
        content: 'Summarize symptoms, likely cause, current status, and the next safe action.',
        filePath: '/virtual/skills/incident-triage/SKILL.md',
      },
    ],
    promptTemplates: [
      {
        name: 'executive-update',
        description: 'Create a short executive incident update.',
        content: 'Write a two-sentence executive update for incident $1 using the conversation history.',
      },
    ],
  };

  const harness = piAgentHooks(
    new AgentHarness({
      session,
      models,
      model,
      tools: harnessTools,
      resources,
      systemPrompt:
        'You are an incident-response agent. Use tools when requested and preserve conversation context.',
      streamOptions: { maxRetries: 1, metadata: { example: 'neatlogs-pi-current' } },
      steeringMode: 'all',
      followUpMode: 'one-at-a-time',
    }),
  );

  let eventCount = 0;
  const unsubscribe = harness.subscribe((_event: AgentHarnessEvent) => {
    eventCount += 1;
  });

  // Exercise the public hook API without changing provider/tool behavior.
  const unhook = [
    harness.on('before_agent_start', () => undefined),
    harness.on('before_provider_request', () => undefined),
    harness.on('before_provider_payload', (event) => ({ payload: event.payload })),
    harness.on('tool_call', () => undefined),
    harness.on('tool_result', () => undefined),
    harness.on('session_before_compact', () => undefined),
    harness.on('session_before_tree', () => undefined),
  ];

  // Exercise configuration/state methods. These do not create spans themselves;
  // their effects are visible on subsequent real provider/tool calls.
  await harness.setModel(model);
  await harness.setThinkingLevel('off');
  await harness.setTools(harnessTools);
  await harness.setActiveTools(harnessTools.map((tool) => tool.name));
  await harness.setSteeringMode('all');
  await harness.setFollowUpMode('one-at-a-time');
  await harness.setResources(resources);
  await harness.setStreamOptions({ maxRetries: 1, metadata: { example: 'neatlogs-pi-current' } });
  console.log('configured', {
    model: harness.getModel().id,
    thinking: harness.getThinkingLevel(),
    tools: harness.getTools().length,
    activeTools: harness.getActiveTools().length,
    steering: harness.getSteeringMode(),
    followUp: harness.getFollowUpMode(),
    resources: Object.keys(harness.getResources()),
    streamOptions: harness.getStreamOptions(),
  });

  const turn = async <T,>(label: string, run: () => Promise<T>): Promise<T> => {
    const result = await identify(
      { sessionId, endUserId, endUserMetadata: { plan: 'e2e', workflow: 'incident-response' } },
      run,
    );
    await harness.waitForIdle();
    console.log(`completed: ${label}`);
    return result;
  };

  await turn('weather and air-quality tool turn', () =>
    harness.prompt('Use get_weather and get_air_quality for Bergen, then compare the results.'),
  );
  const branchPoint = (await session.getEntries()).find(
    (entry) => entry.type === 'message' && entry.message.role === 'assistant',
  )?.id;

  await harness.nextTurn('Remember that customer impact is limited to the Bergen region.');
  await turn('queued nextTurn plus prompt', () =>
    harness.prompt('Based on the evidence so far, state the current customer impact.'),
  );

  await turn('skill invocation', () =>
    harness.skill('incident-triage', 'Treat this as incident INC-42 and remain concise.'),
  );
  await turn('prompt-template invocation', () =>
    harness.promptFromTemplate('executive-update', ['INC-42']),
  );

  await turn('streaming tool plus steering and follow-up', async () => {
    const running = harness.prompt(
      'Call slow_incident_lookup for INC-42. When it returns, give the operational status.',
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await harness.steer('Also mention the customer-impact scope.');
    await harness.followUp('Finish with exactly one recommended next action.');
    return running;
  });

  await harness.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'Operator note: monitoring is stable.' }],
    timestamp: Date.now(),
  });
  await turn('appendMessage followed by another turn', () =>
    harness.prompt('Acknowledge the operator note and retain it as conversation context.'),
  );

  // navigateTree(summarize=true) makes a real branch-summary model call. The
  // wrapper records that otherwise-out-of-loop call as CHAIN → LLM.
  if (branchPoint) {
    await identify({ sessionId, endUserId }, async () => {
      await harness.navigateTree(branchPoint, {
        summarize: true,
        customInstructions: 'Preserve incident status, customer impact, and next action.',
        label: 'post-triage-branch',
      });
    });
    console.log('completed: navigateTree with real branch summary');
  }

  await turn('new branch after navigation', () =>
    harness.prompt('Continue from the restored branch: what is the safest next action?'),
  );

  // Force enough real transcript text for Pi's default 20k-token retained tail,
  // then compact it with the real OpenAI model. This is deliberately last because
  // compaction rewrites the active session branch.
  await harness.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: `Historical diagnostic context:\n${'stable telemetry sample '.repeat(5000)}` }],
    timestamp: Date.now(),
  });
  await identify({ sessionId, endUserId }, async () => {
    await harness.compact('Keep only decisions, incident status, customer impact, and next action.');
  });
  console.log('completed: compact with real provider call');

  const metadata = await session.getMetadata();
  const entries = await session.getEntries();
  const branch = await session.getBranch();
  const contextEntries = await session.buildContextEntries();
  const context = await session.buildContext();
  const stats = await session.getSessionStats();
  const leafId = await session.getLeafId();
  if (leafId) {
    await session.appendLabel(leafId, 'final-leaf');
    await session.getEntry(leafId);
    await session.getLabel(leafId);
  }
  await session.appendSessionName('Pi current E2E');
  await session.getSessionName();
  await session.appendCustomEntry('audit', { eventCount });
  await session.appendCustomMessageEntry('note', 'E2E complete', false, { eventCount });
  await session.getStorage().getMetadata();
  console.log('session verified', {
    metadata,
    entries: entries.length,
    branch: branch.length,
    contextEntries: contextEntries.length,
    contextMessages: context.messages.length,
    stats,
    events: eventCount,
  });

  // Repository methods are persistence/state operations, not model calls; they
  // intentionally emit no Neatlogs spans but are exercised for surface coverage.
  const listed = await repo.list();
  const reopened = await repo.open(metadata);
  const forked = await repo.fork(metadata, { id: `${sessionId}-fork` });
  await forked.getMetadata();
  await repo.delete((await forked.getMetadata()));
  await reopened.getMetadata();
  console.log('repository verified', { sessions: listed.length });

  unsubscribe();
  for (const remove of unhook) remove();
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
