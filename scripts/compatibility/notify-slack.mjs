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

function notificationSignals({ status, report, changesFound, analysis, verification, verificationOutcome, advisoryOutcome, proposalOutcome, priorPrsOutcome, proposalReady, validation, validationOutcome, validationJobStatus, publication, publicationOutcome, publicationJobStatus, prUrl }) {
  const detected = changesFound === true || changesFound === 'true' || (changesFound == null && Boolean(report?.changes?.length));
  const counts = verification?.counts;
  const candidateRegression = Number(counts?.failed ?? 0) > 0;
  const checksIncomplete = (verificationOutcome === 'failure' && !candidateRegression)
    || (detected && !counts) || Number(counts?.blocked ?? 0) > 0 || Number(counts?.['not-tested'] ?? 0) > 0;
  const advisoryFailed = Boolean(analysis?.unavailable || advisoryOutcome === 'failure');
  const automationFailed = status !== 'success' || (verificationOutcome === 'failure' && !candidateRegression)
    || proposalOutcome === 'failure' || priorPrsOutcome === 'failure'
    || validation?.status === 'rejected' || validationOutcome === 'failure' || validationJobStatus === 'failure'
    || (proposalReady === 'true' && validationJobStatus === 'skipped')
    || publicationOutcome === 'failure' || publicationJobStatus === 'failure' || publication?.status === 'failed'
    || (validation?.status === 'validated' && !publication && !prUrl)
    || (validation?.status === 'validated' && publicationJobStatus === 'skipped')
    || publication?.status === 'existing_unverified';
  const prReady = Boolean(publication?.url || prUrl);
  return { candidateRegression, checksIncomplete, advisoryFailed, automationFailed, prReady };
}

export function shouldNotifySlack(context) {
  return Object.values(notificationSignals(context)).some(Boolean);
}

export function slackMessage(context) {
  const { status, report, analysis, verification = null, verificationOutcome = null, advisoryOutcome = null, proposal = null, proposalReady = null, validation = null, publication = null, prUrl = null, proposalOutcome = null, priorPrsOutcome = null, validationOutcome = null, publicationOutcome = null, validationJobStatus = null, publicationJobStatus = null, url, issueUrl = null, upstreamIssue = null } = context;
  const signals = notificationSignals(context);
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
  const postPatchSmoke = validation?.postPatchSmoke
    ? validation.postPatchSmoke.latestStatus === 'passed'
      ? `Patched SDK passed the bounded ${validation.postPatchSmoke.scope ?? 'runtime'} smoke probe against ${validation.postPatchSmoke.package}@${validation.postPatchSmoke.latestVersion}; this does not prove full compatibility.`
      : `Patched SDK latest-version smoke probe was ${validation.postPatchSmoke.latestStatus}; compatibility remains unknown and the recorded baseline was not advanced.`
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
            ? 'No SDK patch was selected for validation; no PR was opened.'
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
  const marker = signals.candidateRegression || signals.automationFailed ? ':red_circle:' : ':warning:';
  const heading = status !== 'success'
    ? '*TypeScript SDK compatibility workflow failed.*'
    : signals.candidateRegression
      ? '*TypeScript SDK: candidate regression found by version smoke checks.*'
      : signals.automationFailed
        ? '*TypeScript SDK compatibility automation failed.*'
        : signals.prReady
          ? '*TypeScript SDK fix ready for code review.*'
          : signals.checksIncomplete || signals.advisoryFailed
            ? '*TypeScript SDK compatibility scan incomplete.*'
            : `*TypeScript SDK: ${packageCount} newer than the recorded baseline.*`;
  const parts = [heading, checks, risk, validationText, postPatchSmoke, fix,
    proposalOutcome === 'failure' && (publication?.url || prUrl) ? 'Gemini proposal requests for other candidates were incomplete; review the workflow run.' : '',
    packageExamples.trim(), issue,
    issueUrl ? `<${issueUrl}|Review discovery issue and analysis>.` : '',
    signals.automationFailed ? 'Automation failure requires attention.' : '',
    signals.checksIncomplete ? 'Some compatibility checks are incomplete; review the report before judging these versions.' : '',
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
  const report = await optionalJSON('compatibility-release-report.json');
  const analysis = await optionalJSON('compatibility-llm-analysis.json');
  const verification = await optionalJSON(process.env.COMPAT_VERIFICATION_FILE ?? 'compatibility-verification.json');
  const proposal = await optionalJSON(process.env.COMPAT_PROPOSAL_FILE ?? 'compatibility-fix-proposal.json');
  const validation = await optionalJSON(process.env.COMPAT_VALIDATION_FILE ?? 'compatibility-fix-validation.json');
  const publication = await optionalJSON(process.env.COMPAT_PUBLICATION_FILE ?? 'compatibility-fix-publication.json');
  const upstreamIssue = await optionalJSON(process.env.COMPAT_UPSTREAM_ISSUE_FILE ?? 'compatibility-upstream-issue.json');
  const context = {
    status, report, analysis, verification, proposal, validation, publication,
    changesFound: process.env.COMPAT_CHANGES_FOUND,
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
  };
  if (!shouldNotifySlack(context)) {
    console.log('Slack notification skipped: no actionable compatibility result');
    return;
  }
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: slackMessage(context) }),
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
