import { randomUUID } from 'node:crypto';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { z } from 'zod';
import { uuid, serializeCaptureBody, type DatasetApiOptions } from '../dataset/api.js';
import { replaySettingsSchema, type ReplaySettings } from './contracts.js';
import { datasetSelectionSchema, type DatasetSelection } from './all-selection.js';

const receiptSchema = z.object({
  runId: z.string().uuid(), state: z.string(), deadlineAt: z.string().datetime(), itemCount: z.number().int().nonnegative(),
}).strict();
const outputReceiptSchema = z.object({
  runId: z.string().uuid(), itemId: z.string().uuid(), outputId: z.string().uuid(), traceId: z.string().regex(/^[a-f0-9]{32}$/), state: z.literal('succeeded'),
}).strict();
const statusSchema = receiptSchema.extend({ completedCount: z.number().int().nonnegative(), failedCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(), gradingHandoffState: z.enum(['pending', 'ready', 'dispatched', 'failed']),
  caseOutputProtocol: z.literal(2).optional(),
  grading: z.object({ evaluationId: z.string().uuid(), candidateBatchId: z.string().uuid(), recordedBatchId: z.string().uuid() }).nullable().optional() }).strict();
const localConflict = z.object({
  runId: z.string().uuid(), state: z.enum(['queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'timed_out']),
  attempt: z.number().int().min(1).max(100),
}).strict();
type LocalConflict = z.infer<typeof localConflict>;
export class LocalRunApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string, readonly details?: LocalConflict) {
    super(message); this.name = 'LocalRunApiError';
  }
}
async function responseJson(response: Response, limit = 64 * 1024): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new LocalRunApiError('The run API returned an empty response.');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new LocalRunApiError('The run API response exceeds 64 KiB.');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel(); }
}
/** Time reserved for each TRACE_NOT_READY retry request. */
const TRACE_RETRY_REQUEST_MILLIS = 5_000;
export class LocalRunApi {
  private readonly origin: string;
  private readonly projectId: string;
  private token: string;
  private readonly refreshAccessToken?: DatasetApiOptions["refreshAccessToken"];
  constructor(options: DatasetApiOptions) {
    const url = new URL(options.baseUrl);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw new LocalRunApiError('Use an HTTPS API origin; HTTP is supported only on loopback.');
    if (!options.token.trim()) throw new LocalRunApiError('NEATLOGS_TOKEN is required to upload a run.');
    this.refreshAccessToken = options.refreshAccessToken;
    this.origin = url.origin; this.projectId = uuid(options.projectId, 'projectId'); this.token = options.token.trim();
  }
  private async request(path: string, body: unknown, key: string | undefined, timeout: number, method: 'GET' | 'POST' = 'POST', responseLimit = 64 * 1024, resource: 'runs' | 'evaluations' = 'runs'): Promise<unknown> {
    const serialized = body === undefined ? undefined : serializeCaptureBody(body), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let renewed = false;
      for (let attempt = 0; ; attempt++) {
        const sentToken = this.token;
        let response: Response;
        try {
          response = await context.with(suppressTracing(context.active()), () => fetch(`${this.origin}/api/v1/public/${resource}${path}`, {
            method, body: serialized, redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${sentToken}`, 'x-project-id': this.projectId, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
          }));
        } catch (error) { if (attempt === 0 && !controller.signal.aborted) continue; throw error; }
        if (attempt === 0 && [500, 502, 503, 504].includes(response.status)) { await response.body?.cancel(); continue; }
        if (response.status === 401 && !renewed && this.refreshAccessToken) {
          await response.body?.cancel();
          this.token = await this.refreshAccessToken(sentToken);
          renewed = true;
          continue;
        }
        const raw = await responseJson(response, responseLimit);
        if (!response.ok) {
          const error = z.object({ code: z.string().optional(), details: z.unknown().optional(), error: z.union([z.string(), z.object({ code: z.string().optional() }).passthrough()]).optional() }).passthrough().safeParse(raw);
          const code = error.success ? error.data.code ?? (typeof error.data.error === 'object' ? error.data.error.code : undefined) : undefined;
          const details = localConflict.safeParse(error.success ? error.data.details : undefined);
          if (response.status === 409 && code === 'LOCAL_ROUND_CONFLICT' && details.success) {
            const { runId, state, attempt } = details.data;
            throw new LocalRunApiError(`Attempt ${attempt} already has run ${runId} (${state}). Use --resume --state with the original private state file.`, 409, code, details.data);
          }
          throw new LocalRunApiError(`Run upload failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`, response.status, code);
        }
        return z.object({ success: z.literal(true), data: z.unknown() }).parse(raw).data;
      }
    } catch (error) {
      if (error instanceof LocalRunApiError) throw error;
      throw new LocalRunApiError(controller.signal.aborted ? 'Run API request timed out.' : 'Run API request failed.', undefined, 'RUN_API_TRANSPORT_FAILURE');
    } finally { clearTimeout(timer); }
  }
  async register(input: {
    datasetVersionId: string; label: string; caseIds: string[]; trials: number;
    grading: { formVersionId: string; evaluatorIds: string[] }; deadlineSeconds: number;
    baseline?: string; gates?: string[]; git?: { branch: string; sha?: string }; checks?: string[];
    params: Record<string, string | number | boolean | null>;
    replay?: ReplaySettings;
    selection?: DatasetSelection;
  }, key: string = randomUUID(), timeout = 30_000) {
    if (input.replay) replaySettingsSchema.parse(input.replay);
    if (input.selection) datasetSelectionSchema.parse(input.selection);
    return receiptSchema.parse(await this.request('', input, uuid(key, 'Idempotency-Key'), timeout));
  }
  async startOutput(runId: string, input: { caseId: string; trial: number; startedAt: string }, key: string, timeout = 30_000) {
    await this.request(`/${uuid(runId, 'runId')}/outputs/started`, input, key, timeout);
  }
  async taskOutput(runId: string, input: { caseId: string; trial: number; output?: unknown; metrics?: Record<string, number>; error?: { code: string; message: string }; traceId?: string; startedAt?: string; endedAt?: string }, key: string = randomUUID(), timeout = 30_000) {
    return z.object({ outputId: z.string().uuid(), state: z.enum(['succeeded', 'failed']) }).passthrough().parse(await this.request(`/${uuid(runId, 'runId')}/outputs`, input, key, timeout));
  }
  async complete(runId: string, key: string = randomUUID(), timeout = 30_000) {
    return statusSchema.parse(await this.request(`/${uuid(runId, 'runId')}/complete`, {}, key, timeout));
  }
  /** One detail page; coverage and gate summaries describe the entire run. */
  async comparison(runId: string, options: { baseline?: string; after?: string; limit?: number; newFailuresOnly?: boolean } = {}, timeout = 30_000) {
    const parsed = z.object({ baseline: z.string().min(1).max(200).optional(), after: z.string().min(1).max(1000).optional(), limit: z.number().int().min(1).max(100).optional(), newFailuresOnly: z.boolean().optional() }).strict().parse(options);
    const query = new URLSearchParams(Object.entries(parsed).map(([key, value]): [string, string] => [key, String(value)]));
    return z.object({ nextCursor: z.string().max(1000).nullable().optional() }).passthrough().parse(await this.request(`/${uuid(runId, 'runId')}/comparison${query.size ? '?' + query : ''}`, undefined, undefined, timeout, 'GET', 17 * 1024 * 1024));
  }
  async gate(runId: string, key: string = randomUUID(), timeout = 30_000) {
    return z.object({ verdict: z.enum(['pass', 'fail', 'incomplete']) }).passthrough().parse(await this.request(`/${uuid(runId, 'runId')}/gate`, {}, key, timeout));
  }
  async status(runId: string, includeGrading = false, timeout = 30_000, includeCaseOutputProtocol = false) {
    const id = uuid(runId, 'runId');
    const query = new URLSearchParams();
    if (includeGrading) query.set('includeGrading', 'true');
    if (includeCaseOutputProtocol) query.set('includeCaseOutputProtocol', 'true');
    const deadline = Date.now() + timeout;
    const read = () => this.request(`/${id}${query.size ? '?' + query : ''}`, undefined, undefined, Math.max(1, deadline - Date.now()), 'GET');
    let data: unknown;
    try {
      data = await read();
    } catch (error) {
      if (!includeCaseOutputProtocol || !(error instanceof LocalRunApiError) || error.status !== 400 || error.code !== 'VALIDATION_ERROR') throw error;
      // Older Apps validate the status query strictly.
      query.delete('includeCaseOutputProtocol');
      data = await read();
    }
    const result = statusSchema.parse(data);
    if (result.runId !== id) throw new LocalRunApiError('The run status belongs to a different run.');
    return result;
  }
  async upload(runId: string, input: { caseId: string; trial: number; traceId: string; startedAt?: string; endedAt?: string }, options: { key?: string; waitMillis?: number } = {}) {
    const key = uuid(options.key ?? randomUUID(), 'Idempotency-Key'), id = uuid(runId, 'runId');
    uuid(input.caseId, 'caseId');
    if (!/^[a-f0-9]{32}$/.test(input.traceId) || !Number.isInteger(input.trial) || input.trial < 1 || input.trial > 10)
      throw new LocalRunApiError('Upload needs one valid trace and a trial from 1 to 10.');
    const waitMillis = options.waitMillis ?? 60_000;
    if (!Number.isFinite(waitMillis) || waitMillis < 1 || waitMillis > 300_000) throw new LocalRunApiError('Upload wait must be between 1 ms and 5 minutes.');
    const deadline = Date.now() + waitMillis;
    for (let attempt = 0; ; attempt++) {
      try {
        const receipt = outputReceiptSchema.parse(await this.request(`/${id}/outputs`, input, key, Math.max(1, Math.min(30_000, deadline - Date.now()))));
        if (receipt.runId !== id || receipt.traceId !== input.traceId) throw new LocalRunApiError('The upload receipt belongs to a different run or trace.');
        return receipt;
      } catch (error) {
        const backoff = 1000 * 2 ** Math.min(attempt, 2);
        // A retry must fit its backoff and a full request before the deadline; a starved request would read as an uncertain write.
        if (!(error instanceof LocalRunApiError) || error.status !== 409 || error.code !== 'TRACE_NOT_READY' || deadline - Date.now() < backoff + TRACE_RETRY_REQUEST_MILLIS) throw error;
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }
}
