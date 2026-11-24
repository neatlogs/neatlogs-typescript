import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { z } from 'zod';
import { DatasetApi, DatasetCaptureError, json, serializeCaptureBody, type DatasetApiOptions, type DatasetJson } from './dataset/api.js';
import { withAllReplayLock } from './replay/all-state.js';
import { taskCredentialRefresh } from './task-credentials.js';
import { LocalRunApi, LocalRunApiError } from './replay/run-api.js';
import { trace } from './core/context.js';
import { TraceFlags } from '@opentelemetry/api';
import { setTimeout as delay } from 'node:timers/promises';
import { recoverRunRequest, uncertainRunMessage, isRunTerminal, type RunStatus } from './evals-recovery.js';
import { getNeatlogsProvider, runWithFreshNeatlogsContext } from './core/provider.js';
import { assertCaptureProvider } from './dataset/capture-scope.js';

export const LOCAL_ROUND_TRACKING_VERSION = 1;

export class Dataset {
  constructor(readonly name: string, readonly options: { versionId?: string } = {}) {}
}
export interface EvalContext {
  expected: unknown;
  metadata: Record<string, unknown>;
  trial: number;
  params: Record<string, string | number | boolean | null>;
  metrics: Record<string, number>;
  param(name: string, fallback?: string | number | boolean | null): string | number | boolean | null | undefined;
}
const gradingSchema = z.object({ formVersionId: z.string().uuid(), evaluatorIds: z.array(z.string().uuid()).min(1).max(20) }).strict();
export interface RunEvalOptions {
  dataset: Dataset | string;
  task: (input: DatasetJson, context: EvalContext) => unknown | Promise<unknown>;
  label: string;
  local?: { experimentId: string; roundId: string; variant: "A" | "B"; attempt: number };
  params?: EvalContext['params'];
  trials?: number;
  baseline?: string;
  gates?: string[];
  grading: z.infer<typeof gradingSchema>;
  checks?: string[];
  git?: { branch: string; sha?: string };
  api?: DatasetApiOptions;
  waitTimeoutMillis?: number;
  maxErrorRate?: number;
  statePath?: string;
  resume?: boolean;
  traceEvidence?: boolean;
  caseIds?: string[];
}
export interface EvalResult { runId: string; runState: string; comparison: Awaited<ReturnType<LocalRunApi['comparison']>>; gate: Awaited<ReturnType<LocalRunApi['gate']>> | null; errors: number; exitCode: 0 | 1 | 4 }
const slotSchema = z.object({ key: z.string().uuid(), executing: z.boolean(), accepted: z.boolean().optional(), rerun: z.boolean().optional(), start: z.object({ key: z.string().uuid(), startedAt: z.string().datetime() }).strict().optional(), body: z.object({ caseId: z.string().uuid(), trial: z.number().int(), traceId: z.string().regex(/^[a-f0-9]{32}$/).optional(), startedAt: z.string().datetime().optional(), endedAt: z.string().datetime().optional(), output: z.json().optional(), metrics: z.record(z.string(), z.number()).optional(), error: z.object({ code: z.string(), message: z.string() }).optional() }).strict().optional(),
  rejection: z.object({ key: z.string().uuid(), error: z.object({ code: z.literal('GRADING_EVIDENCE_LIMIT'), message: z.string().max(1000) }).strict() }).strict().optional() }).strict();
const dispatchSlotSchema = z.object({ batchId: z.string().uuid(), key: z.string().uuid(), accepted: z.boolean() }).strict();
const stateSchema = z.object({ projectId: z.string().uuid(), request: z.record(z.string(), z.json()), taskDigest: z.string().regex(/^[a-f0-9]{64}$/), registrationKey: z.string().uuid(), runId: z.string().uuid().nullable(), deadlineAt: z.string().datetime().optional(), traceEvidence: z.boolean().optional(), slots: z.record(z.string(), slotSchema),
  completionKey: z.string().uuid().optional(), gateKey: z.string().uuid().optional(), gradingDispatch: z.object({ evaluationId: z.string().uuid(), recorded: dispatchSlotSchema, candidate: dispatchSlotSchema }).strict().optional() }).strict();
type State = z.infer<typeof stateSchema>;
/** How long a required trace may stay unavailable before it is treated as lost. */
const TRACE_EVIDENCE_WAIT_MILLIS = 60_000;
async function flushOptionalTrace(flush: () => Promise<boolean>, deadline: number): Promise<boolean> {
  const remaining = Math.min(10_000, deadline - Date.now());
  if (remaining <= 0) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(flush),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), remaining); }),
    ]);
  } catch { return false; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
function boundedOutput(body: NonNullable<State['slots'][string]['body']>): NonNullable<State['slots'][string]['body']> {
  try {
    if (body.metrics && Object.keys(body.metrics).some(key => key.length > 100)) throw new DatasetCaptureError('Task metric names must be at most 100 UTF-16 units.');
    serializeCaptureBody(body); return body;
  }
  catch (error) {
    if (!(error instanceof DatasetCaptureError)) throw error;
    const { output: _output, metrics: _metrics, ...execution } = body;
    return { ...execution, error: {
      code: error.message.includes('64 KiB') ? 'OUTPUT_TOO_LARGE' : 'INVALID_TASK_OUTPUT',
      message: `The task output cannot be uploaded losslessly: ${error.message}. No output was truncated or task re-executed.`,
    } };
  }
}
function save(path: string | undefined, state: State) {
  if (!path) return;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
const caseSchema = z.object({ caseId: z.string().uuid(), revisionId: z.string().uuid(), input: z.json(), expected: z.unknown(), metadata: z.record(z.string(), z.unknown()) }).passthrough();
async function resolve(api: DatasetApi, dataset: Dataset, requested?: string[]) {
  let id = dataset.name;
  if (!z.string().uuid().safeParse(id).success) {
    const matches = new Set<string>(), seen = new Set<string>();
    let cursor: string | null | undefined;
    do {
      const page = z.object({ datasets: z.array(z.object({ id: z.string().uuid(), name: z.string() }).passthrough()).max(500), nextCursor: z.string().uuid().nullable().optional() }).parse(await api.request('GET', `/datasets${cursor ? `?before=${cursor}` : ''}`));
      for (const item of page.datasets) if (item.name === dataset.name) matches.add(item.id);
      if (matches.size > 1) throw new Error('Use a dataset UUID or one unambiguous dataset name.');
      if ((page.nextCursor === undefined && page.datasets.length === 500) || (page.nextCursor && seen.has(page.nextCursor))) throw new Error('Dataset catalog pagination is incomplete; use a dataset UUID.');
      cursor = page.nextCursor;
      if (cursor) seen.add(cursor);
    } while (cursor);
    const [match] = matches;
    if (!match) throw new Error('Use a dataset UUID or one unambiguous dataset name.');
    id = match;
  }
  const suffix = dataset.options.versionId ? `?versionId=${z.string().uuid().parse(dataset.options.versionId)}` : '';
  const overview = z.object({ dataset: z.object({ caseCount: z.number().int().min(1).max(100000) }), version: z.object({ id: z.string().uuid() }) }).parse(await api.request('GET', `/datasets/${id}${suffix}`));
  const versionId = overview.version.id;
  if (!requested && overview.dataset.caseCount > 100) throw new Error('Select up to 100 cases for one run.');
  const entries: { caseId: string }[] = [];
  for (let offset = 0; offset < overview.dataset.caseCount; offset += 100) {
    const page = z.object({ cases: z.array(z.object({ caseId: z.string().uuid() })), total: z.number().int() }).parse(await api.request('GET', `/datasets/${id}/cases?versionId=${versionId}&offset=${offset}&limit=100`));
    if (page.total !== overview.dataset.caseCount || page.cases.length !== Math.min(100, page.total - offset)) throw new Error('Dataset enumeration is incomplete.');
    entries.push(...page.cases);
  }
  if (requested && requested.some(id => !entries.some(item => item.caseId === id))) throw new Error('Selected cases must belong to the pinned dataset.');
  const cases = [];
  for (const item of entries.filter(item => !requested || requested.includes(item.caseId))) cases.push(z.object({ case: caseSchema }).parse(await api.request('GET', `/datasets/${id}/cases/${item.caseId}?versionId=${versionId}`)).case);
  return { versionId, cases };
}

/** Resume saved outputs without repeating uncertain work. The returned comparison is one detail page; follow nextCursor with LocalRunApi.comparison for more rows. */
export async function runEval(options: RunEvalOptions): Promise<EvalResult> {
  if (!gradingSchema.safeParse(options.grading).success) throw new Error('Select valid grading with a formVersionId and 1–20 evaluatorIds.');
  if ((options.maxErrorRate ?? 0) !== 0) throw new Error('maxErrorRate must be zero: graded runs require every selected case to complete.');
  if (options.statePath) {
    return withAllReplayLock(options.statePath, statePath => runEvalLocked({ ...options, statePath }));
  }
  return runEvalLocked(options);
}

async function runEvalLocked(options: RunEvalOptions): Promise<EvalResult> {
  const provider = getNeatlogsProvider();
  if (options.traceEvidence && !provider) throw new Error('Initialize the Neatlogs SDK before running with trace evidence.');
  let flushTrace: (() => Promise<boolean>) | null = null;
  if (provider && (options.traceEvidence || options.local)) {
    try { flushTrace = assertCaptureProvider(provider); }
    catch (error) { if (options.traceEvidence) throw error; }
  }
  const trials = z.number().int().min(1).max(10).parse(options.trials ?? 1);
  const timeout = z.number().finite().positive().parse(options.waitTimeoutMillis ?? 300_000);
  const maxErrorRate = z.number().min(0).max(1).parse(options.maxErrorRate ?? 0);
  if (options.resume && !options.statePath) throw new Error('Resume requires the original statePath.');
  const selectedApi = options.api ?? { token: process.env.NEATLOGS_TOKEN ?? '', projectId: process.env.NEATLOGS_PROJECT_ID ?? '', baseUrl: process.env.NEATLOGS_HOST ?? 'https://app.neatlogs.com' };
  const apiOptions = { ...selectedApi, refreshAccessToken: selectedApi.refreshAccessToken ?? taskCredentialRefresh(selectedApi) };
  const datasetApi = new DatasetApi(apiOptions), runApi = new LocalRunApi(apiOptions);
  const saved = options.resume && options.statePath ? stateSchema.parse(JSON.parse(readFileSync(options.statePath, 'utf8'))) : null;
  const selected = typeof options.dataset === 'string' ? new Dataset(options.dataset) : options.dataset;
  const dataset = saved ? new Dataset(selected.name, { versionId: z.string().uuid().parse(saved.request.datasetVersionId) }) : selected;
  const requested = options.caseIds === undefined ? undefined : z.array(z.string().uuid()).min(1).max(100).parse(options.caseIds);
  if (requested && new Set(requested).size !== requested.length) throw new Error('Selected cases must be unique.');
  const resolved = await resolve(datasetApi, dataset, requested);
  const versionId = resolved.versionId;
  if (requested && (new Set(requested).size !== requested.length || requested.some(id => !resolved.cases.some(item => item.caseId === id)))) throw new Error('Selected cases must be unique and belong to the pinned dataset.');
  const cases = requested ? resolved.cases.filter(item => requested.includes(item.caseId)) : resolved.cases;
  const local = options.local ? z.object({ experimentId: z.string().uuid(), roundId: z.string().uuid(), variant: z.enum(["A", "B"]), attempt: z.number().int().min(1).max(100) }).strict().parse(options.local) : undefined;
  const request = { ...(local ? { local } : {}), datasetVersionId: versionId, caseIds: cases.map(item => item.caseId), label: z.string().trim().min(1).parse(options.label), params: options.params ?? {}, trials, deadlineSeconds: 900,
    grading: options.grading, ...(options.baseline ? { baseline: options.baseline } : {}), ...(options.gates ? { gates: options.gates } : {}), ...(options.git ? { git: options.git } : {}), ...(options.checks ? { checks: options.checks } : {}) };
  const taskDigest = createHash('sha256').update(options.task.toString()).digest('hex');
  const requestJson = z.record(z.string(), z.json()).parse(json(request));
  if (saved && (JSON.stringify(saved.request) !== JSON.stringify(requestJson) || saved.projectId !== apiOptions.projectId || saved.taskDigest !== taskDigest || Boolean(saved.traceEvidence) !== Boolean(options.traceEvidence))) throw new Error('Resume must use the same project, pinned dataset and run configuration.');
  if (!saved && options.statePath && existsSync(options.statePath)) throw new Error('State file exists; use resume or choose a new path.');
  const state: State = saved ?? { projectId: apiOptions.projectId, request: requestJson, taskDigest, registrationKey: randomUUID(), runId: null, traceEvidence: Boolean(options.traceEvidence), slots: {} };
  save(options.statePath, state);
  try {
    let ownedRunId = state.runId;
    if (!ownedRunId) {
      const registration = await recoverRunRequest(
        requestTimeout => runApi.register(request, state.registrationKey, requestTimeout),
        Date.now() + request.deadlineSeconds * 1000,
      );
      if (!registration.data) throw new Error('The run registration could not be confirmed.');
      ownedRunId = registration.data.runId;
      state.deadlineAt = registration.data.deadlineAt;
    }
    const runId = ownedRunId;
    const receipt = process.env.NEATLOGS_EVAL_RESULT_FILE;
    if (receipt) {
      try { writeFileSync(receipt, runId, { flag: 'wx', mode: 0o600 }); }
      catch { /* A CLI activity receipt must never change the run outcome. */ }
    }
    if (!state.runId) { state.runId = runId; save(options.statePath, state); }
    let status: RunStatus | undefined;
    let caseOutputDetails = false;
    if (!state.deadlineAt || options.resume || options.local) {
      const existing = await recoverRunRequest(
        requestTimeout => runApi.status(runId, false, requestTimeout, Boolean(options.local)),
        Date.now() + timeout,
      );
      if (existing.data) {
        state.deadlineAt = existing.data.deadlineAt;
        caseOutputDetails = existing.data.caseOutputProtocol === 2;
        save(options.statePath, state);
        if (isRunTerminal(existing.data)) status = existing.data;
      }
    }
    if (!state.deadlineAt) throw new Error("The run deadline could not be confirmed.");
    const runDeadline = Date.parse(state.deadlineAt);
    const recovery = { api: runApi, runId };
    casesLoop: for (const item of cases) for (let trial = 1; trial <= trials; trial++) {
      if (status) break casesLoop;
      const key = `${item.caseId}:${trial}`;
      let slot = state.slots[key];
      if (slot?.accepted) continue;
      if (slot?.executing) throw new Error('Task execution may have started without a saved output. Inspect it before starting a new run.');
      if (slot && !slot.body && !slot.start) throw new Error('Saved output is missing. Inspect the private state file before resuming.');
      // A trace that never reaches ingest cannot be uploaded; the case is re-run once under the same server attempt.
      for (;;) {
        if (!slot?.body) {
          if (Date.now() >= runDeadline) {
            status = await runApi.status(runId);
            break casesLoop;
          }
          slot ??= { key: randomUUID(), executing: false };
          state.slots[key] = slot;
          if (caseOutputDetails) {
            const start = slot.start ??= { key: randomUUID(), startedAt: new Date().toISOString() };
            save(options.statePath, state);
            const accepted = await recoverRunRequest(requestTimeout => runApi.startOutput(
              runId, { caseId: item.caseId, trial, startedAt: start.startedAt }, start.key, requestTimeout,
            ), runDeadline, recovery);
            if (accepted.terminal) { status = accepted.terminal; break casesLoop; }
          }
          slot.executing = true;
          save(options.statePath, state);
          const caseStartedAt = new Date().toISOString();
          const params = options.params ?? {}, started = performance.now();
          const context: EvalContext = { expected: item.expected, metadata: item.metadata, trial, params, metrics: {}, param: (name, fallback) => Object.hasOwn(params, name) ? params[name] : fallback };
          let traceId: string | undefined;
          try {
            const output = json(await runWithFreshNeatlogsContext(() => trace({ name: options.label, kind: 'WORKFLOW', input: item.input, attributes: { 'neatlogs.origin': 'simulation', 'neatlogs.replay.run_id': runId, 'neatlogs.replay.case_id': item.caseId, 'neatlogs.replay.trial': trial } }, (span) => {
              const spanContext = span.spanContext();
              if ((spanContext.traceFlags & TraceFlags.SAMPLED) && /^[a-f0-9]{32}$/.test(spanContext.traceId) && !/^0+$/.test(spanContext.traceId)) {
                traceId = spanContext.traceId;
              }
              return options.task(item.input, context);
            })));
            if (options.traceEvidence) {
              if (!traceId) throw new Error('Initialize the Neatlogs SDK before running with trace evidence.');
              slot.body = { caseId: item.caseId, trial, traceId };
            } else slot.body = { caseId: item.caseId, trial, output, metrics: { ...context.metrics, latencyMs: performance.now() - started } };
          } catch (error) { slot.body = { caseId: item.caseId, trial, error: { code: error instanceof Error ? error.name.slice(0, 100) : 'TASK_ERROR', message: (error instanceof Error ? error.message : String(error)).slice(0, 1000) } }; }
          if (caseOutputDetails) {
            const endedAt = new Date().toISOString();
            slot.body = { ...slot.body, startedAt: caseStartedAt, endedAt: endedAt < caseStartedAt ? caseStartedAt : endedAt,
              ...(traceId && flushTrace ? { traceId } : {}) };
          }
          slot.body = boundedOutput(slot.body);
          slot.executing = false; save(options.statePath, state);
        }
        const body = boundedOutput(slot.body);
        if (body !== slot.body) { slot.body = body; save(options.statePath, state); }
        if (body.traceId && options.traceEvidence && !('output' in body || 'error' in body)) {
          const traceId = body.traceId;
          if (!flushTrace || !await flushTrace()) throw new Error('Could not export the task trace. Resume after checking the SDK connection.');
          const traced = slot, runRemaining = runDeadline - Date.now();
          try {
            const uploaded = await recoverRunRequest(() => runApi.upload(runId, { ...body, traceId }, {
              key: traced.key, waitMillis: Math.max(1, Math.min(TRACE_EVIDENCE_WAIT_MILLIS, runDeadline - Date.now())),
            }), runDeadline, recovery);
            if (uploaded.terminal) { status = uploaded.terminal; break casesLoop; }
          } catch (error) {
            if (!(error instanceof LocalRunApiError) || error.code !== 'TRACE_NOT_READY') throw error;
            // The run deadline, not the trace check, ended polling: keep the saved upload for reconciliation.
            if (runRemaining <= TRACE_EVIDENCE_WAIT_MILLIS) { status = await runApi.status(runId); break casesLoop; }
            if (traced.rerun) throw new Error(`Trace ${traceId} did not reach Neatlogs after the case was re-run. Check the SDK ingest connection; resuming checks this trace again without re-running the task.`);
            // The saved trace was lost. The one re-run is saved before the task runs again, and a fresh start
            // operation makes the server confirm the attempt is still writable instead of replaying the first start.
            traced.rerun = true;
            delete traced.body;
            traced.key = randomUUID();
            if (traced.start) traced.start = { key: randomUUID(), startedAt: new Date().toISOString() };
            save(options.statePath, state);
            continue;
          }
        } else {
          const output = slot;
          // Ambiguous writes keep their original body/key while reconciling.
          const traceDeadline = Math.min(runDeadline - 5000, Date.now() + 60_000);
          const upload = () => {
            const value = output.body!;
            if (!output.rejection) return value;
            const { output: _output, metrics: _metrics, ...execution } = value;
            return { ...execution, error: output.rejection.error };
          };
          const deliver = () => recoverRunRequest(requestTimeout => {
            const value = upload();
            const evidenceRemaining = traceDeadline - Date.now();
            const timeout = value.traceId && evidenceRemaining > 0 ? Math.min(requestTimeout, evidenceRemaining) : requestTimeout;
            return runApi.taskOutput(runId, value, output.rejection?.key ?? output.key, timeout);
          }, runDeadline, recovery);
          const withoutTrace = () => {
            const { traceId: _traceId, ...unlinked } = output.body!;
            output.body = unlinked;
            if (output.rejection) output.rejection.key = randomUUID(); else output.key = randomUUID();
            save(options.statePath, state);
          };
          // Optional evidence must leave time to deliver the computed value.
          if (body.traceId && flushTrace && !await flushOptionalTrace(flushTrace, traceDeadline)) withoutTrace();
          for (;;) {
            if (output.body?.traceId && Date.now() >= traceDeadline) withoutTrace();
            try {
              const uploaded = await deliver();
              if (uploaded.terminal) { status = uploaded.terminal; break casesLoop; }
              break;
            } catch (error) {
              if (!(error instanceof LocalRunApiError)) throw error;
              if (output.body?.traceId && error.code === 'TRACE_NOT_READY' && Date.now() < traceDeadline) {
                await delay(Math.min(1000, traceDeadline - Date.now()));
                continue;
              }
              if (output.body?.traceId && (error.code === 'TRACE_NOT_READY' || error.code === 'INVALID_TRACE_IDENTITY')) {
                withoutTrace();
                continue;
              }
              if (output.rejection || !('output' in body) || error.status !== 413 || error.code !== 'GRADING_EVIDENCE_LIMIT') throw error;
              output.rejection = { key: randomUUID(), error: { code: 'GRADING_EVIDENCE_LIMIT', message: 'The answer exceeds the combined grading evidence limit. No output was truncated or task rerun. Use a smaller case for a new run.' } };
              save(options.statePath, state);
            }
          }
        }
        break;
      }
      slot.accepted = true; save(options.statePath, state);
    }
    if (!status) {
      state.completionKey ??= randomUUID();
      save(options.statePath, state);
      const completed = await recoverRunRequest(requestTimeout => runApi.complete(runId, state.completionKey, requestTimeout), runDeadline, recovery);
      status = completed.data ?? completed.terminal;
    }
    const errors = Math.max(status.failedCount, Object.values(state.slots).filter(slot => slot.rejection || slot.body?.error).length);
    const deadline = Date.now() + timeout;
    while (options.grading && status.state === 'completed' &&
      (status.gradingHandoffState === 'pending' || status.gradingHandoffState === 'ready') && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
      if (Date.now() >= deadline) break;
      status = (await recoverRunRequest(requestTimeout => runApi.status(runId, false, requestTimeout), deadline)).data ?? status;
    }
    const readComparison = async (readDeadline: number) => {
      const response = await recoverRunRequest(requestTimeout => runApi.comparison(runId, {}, requestTimeout), readDeadline);
      if (!response.data) throw new Error('The comparison could not be confirmed.');
      return response.data;
    };
    // A handoff wait can consume the polling budget; one bounded receipt read remains.
    let comparison = await readComparison(Math.max(deadline, Date.now() + 5000));
    while (comparison.state === 'pending' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
      if (Date.now() >= deadline) break;
      comparison = await readComparison(deadline);
    }
    const coverage = z.object({ complete: z.boolean() }).parse(comparison.coverage);
    if (errors / (cases.length * trials) > maxErrorRate || !coverage.complete) return { runId, runState: status.state, comparison, gate: null, errors, exitCode: 4 };
    if (!options.gates?.length) return { runId, runState: status.state, comparison, gate: null, errors, exitCode: 0 };
    state.gateKey ??= randomUUID();
    save(options.statePath, state);
    const gateDeadline = Math.max(deadline, Date.now() + 5000);
    const gated = await recoverRunRequest(requestTimeout => runApi.gate(runId, state.gateKey, requestTimeout), gateDeadline);
    const gate = gated.data;
    if (!gate) throw new Error('The quality gate could not be confirmed.');
    return { runId, runState: status.state, comparison, gate, errors, exitCode: gate.verdict === 'pass' ? 0 : gate.verdict === 'fail' ? 1 : 4 };
  } catch (error) {
    throw uncertainRunMessage(error, state.runId, options.statePath);
  }
}
