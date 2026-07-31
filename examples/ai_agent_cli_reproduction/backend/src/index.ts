import { agentLoop } from './agent-loop';
import { sessionManager } from './manager/session.manager';
import { type Messages } from './types';
import { getSessionId } from './utils/session.utils';
import { askQuestion } from './utils/tool.utils';
import { init, flush, shutdown, span } from 'neatlogs';

let firstTimeLoop = true;
const initialQueryFromCli = process.argv.slice(2).join(" ").trim();

const messages: Messages = sessionManager.getMessages();

console.log("ALL_SESSION_IDs", Object.keys(messages));

const { sessionId } = initialQueryFromCli
  ? { sessionId: process.env.NEATLOGS_SESSION_ID ?? crypto.randomUUID() }
  : await getSessionId();

console.log("\nCURRENT_SESSION_ID\n", sessionId);

await init({
  apiKey: process.env.NEATLOGS_API_KEY,
  workflowName: process.env.NEATLOGS_WORKFLOW_NAME ?? 'ai-agent-cli',
});

async function main(firstTime: boolean, providedAnswer?: string) {
  return new Promise<void | string>(async (res, rej) => {
    let isThereFileChanges = false;
    const answer = providedAnswer ?? await askQuestion(firstTime ? "How can i help you? " : "Any follow up? ");

    if (answer.trim().toLowerCase() === "no") {
      res();
      return;
    }

    const runAgentLoop = span({ kind: 'WORKFLOW', name: 'my_agent_loop', sessionId }, async (initialQuery: string) => {
      return await agentLoop(initialQuery, sessionId, isThereFileChanges, "openai");
    });

    const agentLoopResponse = await runAgentLoop(answer);

    if (!agentLoopResponse.success) console.log("Something went wrong with that turn - try again.");
    else console.log("WORKFLOW_RESPONSE", agentLoopResponse.response);

    if (providedAnswer !== undefined) {
      res(agentLoopResponse.response);
      return;
    }

    firstTimeLoop = false;
    main(firstTimeLoop)
  })
};

main(firstTimeLoop, initialQueryFromCli || undefined)
  .then(async () => {
    await flush();
    await shutdown();
  })
  .catch(async () => {
    await flush();
    await shutdown();
  })
