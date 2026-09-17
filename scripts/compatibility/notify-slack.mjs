import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function optionalJSON(path) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch {
    return null;
  }
}

function workflowURL() {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runID = process.env.GITHUB_RUN_ID;
  return server && repository && runID ? `${server}/${repository}/actions/runs/${runID}` : null;
}

export function slackMessage({ status, report, analysis, url }) {
  const changes = report?.changes ?? [];
  const risk = analysis?.riskLevel ? ` Advisory risk: *${analysis.riskLevel}*.` : '';
  const link = url ? ` <${url}|Open workflow run>.` : '';
  if (status !== 'success') {
    return `:red_circle: *TypeScript SDK compatibility workflow failed.*${link}`;
  }
  const packages = changes.slice(0, 8).map((item) => `${item.package} ${item.previouslyAnalyzed ?? 'untracked'} → ${item.latest}`).join(', ');
  const remaining = changes.length > 8 ? `, +${changes.length - 8} more` : '';
  return `:warning: *TypeScript SDK compatibility review required:* ${changes.length} upstream release(s). ${packages}${remaining}.${risk}${link}`;
}

async function main() {
  const webhook = process.env.COMPAT_SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('Slack notification skipped: COMPAT_SLACK_WEBHOOK_URL is not configured');
    return;
  }
  const status = process.env.COMPAT_JOB_STATUS ?? 'unknown';
  if (status === 'success' && process.env.COMPAT_CHANGES_FOUND !== 'true') return;
  const report = await optionalJSON('compatibility-release-report.json');
  const analysis = await optionalJSON('compatibility-llm-analysis.json');
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: slackMessage({ status, report, analysis, url: workflowURL() }) }),
  });
  if (!response.ok) throw new Error(`Slack webhook returned ${response.status}`);
  console.log('Slack compatibility alert sent');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
