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

export function slackMessage({ status, report, analysis, verification = null, verificationOutcome = null, proposal = null, validation = null, publication = null, prUrl = null, proposalOutcome = null, priorPrsOutcome = null, validationOutcome = null, publicationOutcome = null, validationJobStatus = null, publicationJobStatus = null, url, issueUrl = null, upstreamIssue = null }) {
  const changes = report?.changes ?? [];
  const risk = analysis?.riskLevel
    ? ` Gemini flagged *${analysis.riskLevel} potential compatibility risk* (unverified).`
    : ' Gemini impact analysis unavailable.';
  const link = url ? ` <${url}|Open workflow run>.` : '';
  const reviewLink = issueUrl ? ` <${issueUrl}|Review discovery issue and analysis>.` : '';
  const counts = verification?.counts;
  const checks = counts
    ? ` Limited smoke checks: ${counts.passed} passed, ${counts.failed} candidate regressions, ${counts.blocked} blocked, ${counts['not-tested']} not tested. A pass covers only the stated probe scope, not full SDK compatibility.`
    : verificationOutcome === 'failure'
      ? ' Version smoke checks failed before producing a report; compatibility remains unknown.'
      : ' Published-version checks did not complete; compatibility remains unknown.';
  const fix = publication?.url || prUrl
    ? ` Gemini-proposed fix: <${publication?.url || prUrl}|review draft PR>.`
    : publication?.status === 'skipped_closed'
      ? ' A maintainer closed the prior fix PR; no new PR was opened.'
    : priorPrsOutcome === 'failure'
      ? ' Prior compatibility PR lookup failed; no new fix was proposed.'
    : publicationOutcome === 'failure' || publicationJobStatus === 'failure'
      ? ' Gemini-proposed fix passed local validation, but draft PR creation failed; review the run.'
      : validation?.status === 'validated' && !publication
        ? ' Gemini-proposed fix passed validation, but PR publication did not complete; review the run.'
      : validation?.status === 'rejected' || validationOutcome === 'failure' || validationJobStatus === 'failure'
        ? ' Gemini-proposed fix failed patch validation or tests; no PR was opened.'
        : proposal?.decision === 'review_only'
          ? ' Gemini produced no safe, code-specific fix to propose; review the issue.'
          : proposalOutcome === 'failure'
            ? ' Gemini fix proposal failed; review the run.'
            : '';
  if (status !== 'success') {
    return `:red_circle: *TypeScript SDK compatibility workflow failed.*${checks}${fix} Check the failed step in the run.${reviewLink}${link}`;
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
  const marker = counts?.failed || verificationOutcome === 'failure' || priorPrsOutcome === 'failure' || validationOutcome === 'failure' || publicationOutcome === 'failure' || validationJobStatus === 'failure' || publicationJobStatus === 'failure' || (validation?.status === 'validated' && !publication) ? ':red_circle:' : ':warning:';
  return `${marker} *TypeScript SDK: ${packageCount} newer than the recorded baseline.*${checks}${risk}${fix}${examples}${issue}${reviewLink}${link}`;
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
  const verification = await optionalJSON(process.env.COMPAT_VERIFICATION_FILE ?? 'compatibility-verification.json');
  const proposal = await optionalJSON(process.env.COMPAT_PROPOSAL_FILE ?? 'compatibility-fix-proposal.json');
  const validation = await optionalJSON(process.env.COMPAT_VALIDATION_FILE ?? 'compatibility-fix-validation.json');
  const publication = await optionalJSON(process.env.COMPAT_PUBLICATION_FILE ?? 'compatibility-fix-publication.json');
  const upstreamIssue = await optionalJSON(process.env.COMPAT_UPSTREAM_ISSUE_FILE ?? 'compatibility-upstream-issue.json');
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: slackMessage({
      status, report, analysis, verification, proposal, validation, publication,
      verificationOutcome: process.env.COMPAT_VERIFICATION_OUTCOME,
      proposalOutcome: process.env.COMPAT_PROPOSAL_OUTCOME,
      priorPrsOutcome: process.env.COMPAT_PRIOR_PRS_OUTCOME,
      validationOutcome: process.env.COMPAT_VALIDATION_OUTCOME,
      publicationOutcome: process.env.COMPAT_PUBLICATION_OUTCOME,
      validationJobStatus: process.env.COMPAT_VALIDATION_JOB_STATUS,
      publicationJobStatus: process.env.COMPAT_PUBLICATION_JOB_STATUS,
      prUrl: process.env.COMPAT_PR_URL,
      upstreamIssue, issueUrl: process.env.COMPAT_DISCOVERY_ISSUE_URL, url: workflowURL(),
    }) }),
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
