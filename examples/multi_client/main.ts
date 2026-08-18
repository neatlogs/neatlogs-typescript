/**
 * Two independent pipelines in one process.
 *
 * `init()` is process-wide and single-shot — a second call is a no-op — so a
 * codebase running several independent features cannot give each its own API
 * key, workflow name, or tags. `Client` is that second pipeline: it applies
 * only inside `client.activate(...)`, and everything outside keeps using
 * `init()`.
 *
 * Run:  NEATLOGS_API_KEY=... NEATLOGS_SUMMARIZER_KEY=... tsx examples/multi_client/main.ts
 */

import { init, span, flush, Client } from '../../src/index.js';

async function main(): Promise<void> {
  // The process-wide default: the customer-facing copilot.
  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    workflowName: 'support-copilot',
    tags: ['production'],
  });

  // A second, fully independent pipeline for the nightly batch job — different
  // key, different workflow, different tags.
  const summarizer = new Client({
    apiKey: process.env.NEATLOGS_SUMMARIZER_KEY ?? process.env.NEATLOGS_API_KEY,
    workflowName: 'nightly-summarizer',
    tags: ['batch'],
  });

  const handleTicket = span({ kind: 'WORKFLOW' }, async (question: string) => {
    return `answer to: ${question}`;
  });

  const summarize = span({ kind: 'WORKFLOW' }, async (docs: string[]) => {
    return `summary of ${docs.length} docs`;
  });

  // → support-copilot pipeline
  await handleTicket('how do I rotate my key?');

  // → nightly-summarizer pipeline
  await summarizer.activate(async () => {
    await summarize(['doc-1', 'doc-2', 'doc-3']);
  });

  // → back to support-copilot
  await handleTicket('what are my usage limits?');

  await flush();
  await summarizer.shutdown();

  console.log('Two workflows should now appear in the dashboard.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
