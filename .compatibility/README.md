# Compatibility automation

This directory defines the integrations, package-manager matrix, supported
versions, and cross-integration contracts exercised by the compatibility
workflows.

## Scope source of truth

The inventory is limited to integrations documented for the TypeScript SDK in
`neatlogs-docs`. The opencode entry is included because it is a documented
coding-agent integration implemented by this package. Claude Code and Codex
are intentionally excluded because they are maintained in separate
repositories. Unsupported/rejection-only stubs are not release-watch targets.

These workflows analyze real published package contents, exported APIs,
dependency graphs, changed source excerpts, the relevant adapter source, and
the official project documentation URLs declared for every integration.
Documentation fetch failures are retained as evidence gaps. The scheduled
workflow also installs a tarball built from the current SDK checkout with
exact upstream package versions in isolated consumers and runs bounded smoke
probes. These probes do not call a live model provider, export traces, or
query a Neatlogs backend.

## Pull requests

The pull-request workflow is deterministic and does not receive external
service credentials. It builds and packs the SDK, installs that tarball into
isolated npm, pnpm, and Yarn Berry/PnP consumers, and verifies the public AI
SDK instrumentation interface against the supported AI SDK v6 and v7 lines.

## Scheduled release monitoring

Twice a day, the scheduled workflow:

1. compares the analyzed version lock with the npm registry;
2. builds the SDK and runs isolated consumer smoke probes against each
   recorded baseline and detected version, verifying the exact installed
   version; the machine-readable report records pass, candidate regression,
   blocked, or not-tested and names the probe scope for every package;
3. records dependency, exported API, source-content, adapter-source, and
   official project-documentation evidence;
4. optionally asks Gemini for an advisory impact assessment;
5. asks Gemini for one code-specific adapter fix, considering up to three
   affected packages per run with bounded, package-specific evidence;
6. updates a GitHub issue and optionally alerts Slack when review is needed.

The smoke probes import the real upstream package and packed SDK adapter. The
OpenAI, Anthropic, Bedrock, Google GenAI, and AI SDK probes also construct or
wrap the upstream client or SDK. Passing one of these probes demonstrates only
that limited operation; it does not establish full integration compatibility.
Only a latest-version runtime failure after the same baseline probe passes is
reported as a candidate regression. Installation or version-resolution
problems, and failures present at baseline, are marked blocked. They require
triage before compatibility can be judged. A candidate regression fails the
workflow after the issue and Slack alert are written.

Release discovery and the smoke probes run in jobs with read-only repository
permission and no service secrets. The smoke probes import published upstream
code, so their runner is discarded before a separate job receives the Gemini
API key to analyze evidence or propose a fix. The release and verification
reports cross that boundary as JSON artifacts; a failed verifier still leaves
the assessment job able to record an incomplete check and notify maintainers.
The jobs do not share a writable npm cache, so code loaded by smoke probes or
patch validation cannot leave cached files for a later secret-bearing job.

Scheduled runs do not change the recorded version lock. A validated fix PR
includes a publisher-controlled update for its selected package only when the
patched SDK passes the exact latest-version smoke probe. That version becomes
the recorded baseline only if a maintainer merges the PR. Other packages can
be rediscovered on successive schedules; the discovery issue is updated in
place.

The Gemini assessment is advisory only. It cannot change a compatibility
verdict or make a workflow pass. The advisory request uses bounded excerpts
while preserving every tracked adapter source path; the full upstream evidence
remains in the run artifact. If Gemini times out or returns malformed JSON,
the issue and Slack alert say the advisory failed and link the workflow run.
Model explanations for rejected fix proposals remain labeled unverified in
the artifact instead of appearing as factual issue conclusions.

An aggregate `high` risk rating does not open a PR. For a review PR, Gemini
must provide a specific upstream-to-adapter rationale and a patch that changes
an affected existing adapter and an existing test. A separate read-only job
checks paths and patch size, runs the changed test against the original SDK,
then applies the patch, runs TypeScript lint and the full test suite, rebuilds
the SDK, and repeats the selected package's published-version smoke probe.
The test result on the original SDK and post-patch probe scope are recorded in
the PR. A passing smoke probe
or patched test suite does not prove that the proposed fix is necessary; the
PR is opened ready for human code review. No review is approved and no PR is
merged automatically. If no safe patch is produced, the issue records that
outcome and the remaining candidates. Confirmed smoke failures are considered
first on every run; future schedules rotate through other candidates and skip
packages already covered by any prior automated
compatibility PR, including one closed
by a maintainer.
Gemini proposal request failures fail the run and alert maintainers instead
of being silently treated as a no-fix decision.

The PR publishing job has write permission only after validation. It checks
the original proposal, base commit, patch digest, and affected adapter paths
again before pushing. Repository settings must allow GitHub Actions to create
pull requests; otherwise publication is reported as a failure. The optional
`COMPAT_PR_TOKEN` secret may hold a GitHub App token or PAT with repository
contents and pull-request write access when organization policy blocks PR
creation with `GITHUB_TOKEN`. It is used only in the publishing job. PR checks
started by `GITHUB_TOKEN` can require maintainer approval before running.
If a branch push succeeds but PR creation fails, a later run may create the PR
from that branch only when its bot author, base commit, changed paths, and file
contents exactly match the newly validated patch and mechanical lock update.
An existing generated draft PR is marked ready only when its provenance
marker, bot commit author, base commit, changed files, and file contents match
the newly validated patch. Other existing PRs are left unchanged and reported.
Slack distinguishes deterministic smoke regressions from unverified Gemini
advice, patch validation, PR publication, and workflow failures. Every sent
alert links the actual workflow run, and a published fix links its review PR.

Configure these GitHub Actions settings:

- Secret `COMPAT_GEMINI_API_KEY` (optional): a dedicated, quota-limited Gemini
  API key. Without it, deterministic discovery/evidence still runs and the LLM
  step records that it was skipped.
- Variable `COMPAT_GEMINI_MODEL` (optional): model override; defaults to
  `gemini-2.5-flash`.
- Secret `COMPAT_SLACK_WEBHOOK_URL` (optional): a channel-specific Slack
  Incoming Webhook. Without it, Slack notification is skipped.
- Secret `COMPAT_PR_TOKEN` (optional): a GitHub App token or PAT authorized to
  push fix branches and create review PRs when `GITHUB_TOKEN` cannot do so.

Organization-level secrets scoped only to the SDK repositories are preferred.
The credentials are used only by the scheduled/default-branch workflow and are
never passed to pull-request jobs. Slack delivery failures are non-blocking;
alerts are sent for candidate regressions, incomplete checks or advisory
analysis, fix automation failures, and reviewable fix PRs. A high Gemini risk
label alone does not send Slack when all version probes pass and no SDK patch
is selected. The discovery issue and run artifact still record those releases.
