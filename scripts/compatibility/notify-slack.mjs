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

export function slackMessage({ status, report, analysis, verification = null, verificationOutcome = null, advisoryOutcome = null, proposal = null, proposalReady = null, validation = null, publication = null, prUrl = null, proposalOutcome = null, priorPrsOutcome = null, validationOutcome = null, publicationOutcome = null, validationJobStatus = null, publicationJobStatus = null, url, issueUrl = null, upstreamIssue = null }) {
  const changes = report?.changes ?? [];
  const risk = analysis?.riskLevel
    ? `Gemini advisory: *${analysis.riskLevel} potential risk* (unverified; this does not establish an SDK regression).`
    : analysis?.unavailable || advisoryOutcome === 'failure'
      ? `Gemini advisory failed: ${analysis?.reason ?? 'no assessment was produced.'} Deterministic smoke results remain separate.`
      : analysis?.skipped
        ? 'Gemini advisory skipped: API key is not configured.'
        : 'Gemini advisory: unavailable.';
  const counts = verification?.counts;
  const regressionPackages = verification?.packages?.filter((item) => item.status === 'failed') ?? [];
  const examples = regressionPackages.slice(0, 3).map((item) => `${item.package}@${item.latestVersion}`).join(', ');
  const checks = counts?.failed
    ? `Deterministic smoke check: ${counts.failed} candidate SDK regression${counts.failed === 1 ? '' : 's'} (recorded baseline passed; detected version failed)${examples ? `: ${examples}` : ''}. This bounded probe needs triage; it does not establish full SDK behavior. Other results: ${counts.passed} passed, ${counts.blocked} blocked, ${counts['not-tested']} not tested.`
    : counts
      ? `Deterministic smoke checks: ${counts.passed} passed, 0 candidate regressions, ${counts.blocked} blocked, ${counts['not-tested']} not tested. Passes cover only the stated probes, not full SDK compatibility.`
      : verificationOutcome === 'failure'
        ? 'Deterministic smoke checks failed before producing a report; compatibility remains unknown.'
        : 'Deterministic smoke checks did not complete; compatibility remains unknown.';
  const validationText = validation?.status === 'validated'
    ? 'Gemini-proposed SDK patch passed local patch and test validation.'
    : validation?.status === 'rejected' || validationOutcome === 'failure' || validationJobStatus === 'failure'
      ? 'Gemini-proposed SDK patch failed validation or tests; no PR was opened.'
      : proposalReady === 'true' && validationJobStatus === 'skipped'
        ? 'Gemini-proposed SDK patch validation was unexpectedly skipped; no PR was opened.'
        : '';
  const fix = publication?.url || prUrl
    ? `Validated SDK fix: <${publication?.url || prUrl}|open ready-for-review PR>. No approval or merge was automated.`
    : publication?.status === 'skipped_closed'
      ? 'A maintainer closed the prior fix PR; no new PR was opened.'
    : publication?.status === 'existing_unverified'
      ? `An <${publication.priorPrUrl}|existing PR> lacks verified bot provenance; it was left unchanged${publication.existingWasDraft ? ' as a draft' : ''}. No new PR was opened.`
    : priorPrsOutcome === 'failure'
      ? 'Fix automation failed to look up prior PRs; no new fix was proposed.'
    : publicationOutcome === 'failure' || publicationJobStatus === 'failure'
      ? `PR publication failed after patch validation${publication?.priorPrUrl ? `; <${publication.priorPrUrl}|existing PR> was left unchanged` : ''}; review the workflow run.`
      : validation?.status === 'validated' && !publication
        ? 'PR publication did not complete after patch validation; review the workflow run.'
        : proposalOutcome === 'failure'
          ? 'Gemini fix proposal failed; review the workflow run.'
          : proposal?.decision === 'review_only'
            ? 'Gemini produced no safe, code-specific fix to propose; review the issue.'
            : '';
  const packages = changes.slice(0, 3).map((item) => `${item.package} ${item.previouslyAnalyzed ?? 'untracked'} → ${item.latest}`).join(', ');
  const remaining = changes.length > 3 ? `, +${changes.length - 3} more` : '';
  const packageExamples = packages ? ` Examples: ${packages}${remaining}.` : '';
  const packageCount = changes.length === 1
    ? '1 watched package has a version'
    : `${changes.length} watched packages have versions`;
  const issue = upstreamIssue?.url
    ? `Referenced upstream issue: <${upstreamIssue.url}|${upstreamIssue.title ?? upstreamIssue.url}>.`
    : '';
  const automationFailed = status !== 'success' || (verificationOutcome === 'failure' && !counts?.failed) || proposalOutcome === 'failure' || priorPrsOutcome === 'failure' || validationOutcome === 'failure' || publicationOutcome === 'failure' || validationJobStatus === 'failure' || publicationJobStatus === 'failure' || (proposalReady === 'true' && validationJobStatus === 'skipped') || (validation?.status === 'validated' && !publication && !prUrl);
  const marker = counts?.failed || automationFailed ? ':red_circle:' : ':warning:';
  const heading = status !== 'success'
    ? '*TypeScript SDK compatibility workflow failed.*'
    : `*TypeScript SDK: ${packageCount} newer than the recorded baseline.*`;
  const parts = [heading, checks, risk, validationText, fix, packageExamples.trim(), issue,
    issueUrl ? `<${issueUrl}|Review discovery issue and analysis>.` : '',
    automationFailed ? 'Automation failure requires attention.' : '',
    url ? `<${url}|Open workflow run>.` : ''];
  return `${marker} ${parts.filter(Boolean).join(' ')}`;
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
      advisoryOutcome: process.env.COMPAT_ADVISORY_OUTCOME,
      proposalOutcome: process.env.COMPAT_PROPOSAL_OUTCOME,
      proposalReady: process.env.COMPAT_PROPOSAL_READY,
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
