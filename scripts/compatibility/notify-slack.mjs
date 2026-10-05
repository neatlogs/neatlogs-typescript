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

export function verificationIsConsistent(report, verification) {
  const changes = report?.changes;
  const packages = verification?.packages;
  const counts = verification?.counts;
  const statuses = ['passed', 'failed', 'blocked', 'not-tested'];
  if (verification?.schemaVersion !== 1 || !Array.isArray(changes) || !Array.isArray(packages)
      || !counts || packages.length !== changes.length
      || changes.some((change) => !change || typeof change.package !== 'string' || typeof change.latest !== 'string')
      || packages.some((item) => !item || typeof item.package !== 'string')
      || statuses.some((status) => !Number.isSafeInteger(counts[status]) || counts[status] < 0)) return false;
  const changesByPackage = new Map(changes.map((change) => [change.package, change]));
  if (changesByPackage.size !== changes.length) return false;
  const seen = new Set();
  for (const item of packages) {
    const change = changesByPackage.get(item.package);
    if (!change || seen.has(item.package) || !statuses.includes(item.status)
        || item.baselineVersion !== (change.previouslyAnalyzed ?? null)
        || item.latestVersion !== change.latest) return false;
    seen.add(item.package);
    if (item.status === 'not-tested') {
      if (item.baseline || item.latest) return false;
    } else {
      const baseline = item.baseline?.status;
      const latest = item.latest?.status;
      if (!['passed', 'failed', 'blocked'].includes(baseline)
          || !['passed', 'failed', 'blocked'].includes(latest)) return false;
      const expected = latest === 'passed' ? 'passed'
        : latest === 'blocked' || baseline === 'blocked' ? 'blocked'
          : baseline === 'passed' && latest === 'failed' ? 'failed' : 'blocked';
      if (item.status !== expected) return false;
    }
  }
  return statuses.every((status) => counts[status] === packages.filter((item) => item.status === status).length);
}

function notificationSignals({ status, report, changesFound, analysis, verification, verificationOutcome, advisoryOutcome, proposalOutcome, priorPrsOutcome, proposalReady, validation, validationOutcome, validationJobStatus, publication, publicationOutcome, publicationJobStatus, prUrl }) {
  const detected = changesFound === true || changesFound === 'true' || (changesFound == null && Boolean(report?.changes?.length));
  const verificationValid = !detected || verificationIsConsistent(report, verification);
  const counts = verificationValid ? verification?.counts : null;
  const candidateRegression = Number(counts?.failed ?? 0) > 0;
  const checksIncomplete = detected && !verificationValid;
  const advisoryFailed = Boolean(analysis?.unavailable || advisoryOutcome === 'failure');
  const automationFailed = status !== 'success' || checksIncomplete || (verificationOutcome === 'failure' && !candidateRegression)
    || proposalOutcome === 'failure' || priorPrsOutcome === 'failure'
    || validation?.status === 'rejected' || validationOutcome === 'failure' || validationJobStatus === 'failure'
    || (proposalReady === 'true' && validationJobStatus === 'skipped')
    || publicationOutcome === 'failure' || publicationJobStatus === 'failure' || publication?.status === 'failed'
    || (validation?.status === 'validated' && !publication && !prUrl)
    || (validation?.status === 'validated' && publicationJobStatus === 'skipped')
    || publication?.status === 'existing_unverified';
  const prReady = Boolean(publication?.url || prUrl);
  return { candidateRegression, checksIncomplete, advisoryFailed, automationFailed, prReady, verificationValid };
}

export function shouldNotifySlack(context) {
  const { candidateRegression, advisoryFailed, automationFailed, prReady } = notificationSignals(context);
  return candidateRegression || advisoryFailed || automationFailed || prReady;
}

function brief(value, limit = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function slackPayload(context) {
  const { status, report, analysis, verification = null, verificationOutcome = null, advisoryOutcome = null, proposal = null, proposalReady = null, validation = null, publication = null, prUrl = null, proposalOutcome = null, priorPrsOutcome = null, validationOutcome = null, publicationOutcome = null, validationJobStatus = null, publicationJobStatus = null, url, issueUrl = null, upstreamIssue = null } = context;
  const signals = notificationSignals(context);
  const counts = signals.verificationValid ? verification?.counts : null;
  const total = counts ? ['passed', 'failed', 'blocked', 'not-tested'].reduce((sum, key) => sum + Number(counts[key] ?? 0), 0) : 0;
  const checked = counts
    ? `${counts.passed}/${total} passed (bounded smoke probes)${counts.blocked ? `, ${counts.blocked} blocked` : ''}${counts['not-tested'] ? `, ${counts['not-tested']} not tested` : ''}`
    : verificationOutcome === 'failure' ? 'failed before a valid report was produced' : 'no valid completed report';
  const regression = Number(counts?.failed ?? 0) > 0
    ? `${counts.failed} candidate${counts.failed === 1 ? '' : 's'} (baseline passed; latest failed)`
    : counts && Number(counts.passed ?? 0) > 0 ? 'none found in tested scope' : 'unknown';
  const fixUrl = publication?.url || prUrl;
  const pr = fixUrl ? `<${fixUrl}|ready for code review>` : 'none';

  let heading;
  let why;
  let action;
  if (status !== 'success') {
    heading = 'Compatibility workflow failed; inspect the run.';
    why = 'Automation did not complete; the check result may be incomplete.';
    action = 'Review the failed job before judging SDK compatibility.';
  } else if (signals.prReady) {
    heading = 'Validated SDK fix PR ready; review the code.';
    why = validation?.regressionProof === 'targeted-test-red-green'
      ? 'A focused test failed on the unchanged SDK and passed after the patch; bounded published-version smoke checks passed.'
      : validation?.regressionProof === 'baseline-latest-smoke'
        ? 'The newer version failed a baseline-passing smoke probe before the patch and passed afterward.'
        : validation?.postPatchSmoke?.latestStatus === 'passed'
          ? `The patch passed validation and a bounded ${brief(validation.postPatchSmoke.scope ?? 'runtime')} smoke probe against ${brief(validation.postPatchSmoke.package)}@${brief(validation.postPatchSmoke.latestVersion)}.`
          : 'The SDK patch passed validation; bounded checks do not prove full compatibility.';
    action = proposalOutcome === 'failure'
      ? 'Review the PR; Gemini requests for other candidates were incomplete.'
      : 'Review and approve the PR manually.';
  } else if (signals.candidateRegression) {
    heading = 'Candidate SDK regression found; triage the failing probe.';
    why = validation?.status === 'rejected' || validationOutcome === 'failure' || validationJobStatus === 'failure'
      ? `The baseline passed and the newer version failed; the proposed SDK patch failed validation${validation?.reason ? `: ${brief(validation.reason)}` : ''}, so no PR was opened.`
      : proposalOutcome === 'failure'
        ? 'The baseline passed and the newer version failed; Gemini fix proposal failed, so no PR was opened.'
        : 'The recorded baseline passed and the newer version failed a bounded probe; no validated SDK fix PR was opened.';
    action = 'Inspect the failing probe and fix automation result.';
  } else if (signals.automationFailed) {
    heading = 'Compatibility automation failed; inspect the run.';
    if (signals.checksIncomplete) {
      why = 'The smoke verification report is missing or inconsistent with the discovered package versions; SDK regression status is unknown.';
    } else if (validation?.status === 'rejected' || validationOutcome === 'failure' || validationJobStatus === 'failure') {
      why = `Gemini-proposed SDK patch failed validation or tests${validation?.reason ? `: ${brief(validation.reason)}` : ''}; no PR was opened.`;
    } else if (proposalReady === 'true' && validationJobStatus === 'skipped') {
      why = 'SDK patch validation was unexpectedly skipped; no PR was opened.';
    } else if (publication?.status === 'existing_unverified') {
      why = `An <${publication.priorPrUrl}|existing PR> lacks verified bot provenance and was left unchanged${publication.existingWasDraft ? ' as a draft' : ''}; no new PR was opened.`;
    } else if (publication?.status === 'skipped_closed') {
      why = 'A maintainer closed the prior fix PR; no new PR was opened.';
    } else if (priorPrsOutcome === 'failure') {
      why = 'Prior PR lookup failed; no new SDK fix was proposed.';
    } else if (publicationOutcome === 'failure' || publicationJobStatus === 'failure' || validation?.status === 'validated' && !publication) {
      why = `PR publication failed after patch validation${publication?.priorPrUrl ? `; <${publication.priorPrUrl}|existing PR> was left unchanged` : ''}.`;
    } else if (proposalOutcome === 'failure') {
      why = 'Gemini fix proposal failed; no validated SDK patch was available.';
    } else {
      why = 'A required compatibility automation step failed; no validated fix PR was opened.';
    }
    action = 'Inspect the failed step and retry after it is fixed.';
  } else if (signals.advisoryFailed) {
    heading = 'Gemini analysis failed; review the workflow run.';
    why = `${brief(analysis?.reason || 'no assessment was produced').replace(/[.!?]+$/, '')}. No validated SDK fix was proposed.`;
    action = 'Inspect the Gemini failure; use the separate smoke results to assess the tested scope.';
  } else {
    heading = `${report?.changes?.length ?? 0} newer package versions checked; no candidate regression found.`;
    why = 'All completed bounded smoke probes passed; no SDK fix PR was opened.';
    action = 'Review the discovery issue for package details.';
  }

  const links = [
    issueUrl ? `<${issueUrl}|Discovery issue>` : null,
    upstreamIssue?.url ? `<${upstreamIssue.url}|Upstream issue>` : null,
    url ? `<${url}|Workflow run>` : null,
  ].filter(Boolean).join(' · ');
  const marker = signals.candidateRegression || signals.automationFailed ? ':red_circle:' : ':warning:';
  const title = `${marker} *TypeScript SDK: ${heading}*`;
  const sections = [
    `*Checked:* ${checked}`,
    `*Regression:* ${regression}`,
    `*Fix PR:* ${pr}`,
    `*Why:* ${why}`,
    `*Action:* ${action}`,
  ];
  return {
    // Slack uses blocks for clear separation; text remains useful as a fallback and in notifications.
    text: [title, '', ...sections.slice(0, 3), '', sections[3], '', sections[4], ...(links ? ['', links] : [])].join('\n'),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'divider' },
      ...sections.map((text) => ({ type: 'section', text: { type: 'mrkdwn', text } })),
      ...(links ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: links }] }] : []),
    ],
  };
}

export function slackMessage(context) {
  return slackPayload(context).text;
}

export async function deliverSlackAlert(context, webhook, fetcher = fetch) {
  if (!shouldNotifySlack(context)) return false;
  if (!webhook) throw new Error('COMPAT_SLACK_WEBHOOK_URL is not configured for an actionable alert');
  const response = await fetcher(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(slackPayload(context)),
  });
  if (!response.ok) throw new Error(`Slack webhook returned ${response.status}`);
  return true;
}

async function main() {
  const webhook = process.env.COMPAT_SLACK_WEBHOOK_URL;
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
  if (!await deliverSlackAlert(context, webhook)) {
    console.log('Slack notification skipped: no actionable compatibility result');
    return;
  }
  console.log('Slack compatibility alert sent');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
