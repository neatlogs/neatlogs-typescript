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

export function slackMessage({ status, report, analysis, url, issueUrl = null, upstreamIssue = null }) {
  const changes = report?.changes ?? [];
  const risk = analysis?.riskLevel
    ? ` Gemini flagged *${analysis.riskLevel} potential compatibility risk* (unverified).`
    : ' Gemini impact analysis unavailable.';
  const link = url ? ` <${url}|Open workflow run>.` : '';
  if (status !== 'success') {
    return `:red_circle: *TypeScript SDK compatibility workflow failed.* Check the failed step in the run.${link}`;
  }
  const packages = changes.slice(0, 3).map((item) => `${item.package} ${item.previouslyAnalyzed ?? 'untracked'} → ${item.latest}`).join(', ');
  const remaining = changes.length > 3 ? `, +${changes.length - 3} more` : '';
  const examples = packages ? ` Examples: ${packages}${remaining}.` : '';
  const packageCount = changes.length === 1
    ? '1 watched package has a version'
    : `${changes.length} watched packages have versions`;
  const issue = upstreamIssue?.url
    ? ` Referenced upstream issue: <${upstreamIssue.url}|${upstreamIssue.title ?? upstreamIssue.url}>.`
    : '';
  const reviewLink = issueUrl ? ` <${issueUrl}|Review discovery issue and analysis>.` : '';
  return `:warning: *TypeScript SDK: ${packageCount} newer than the recorded baseline.*${risk} This workflow did not test the SDK against these versions; no regression is confirmed.${examples}${issue}${reviewLink}${link}`;
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
  const upstreamIssue = await optionalJSON(process.env.COMPAT_UPSTREAM_ISSUE_FILE ?? 'compatibility-upstream-issue.json');
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: slackMessage({ status, report, analysis, upstreamIssue, issueUrl: process.env.COMPAT_DISCOVERY_ISSUE_URL, url: workflowURL() }) }),
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
