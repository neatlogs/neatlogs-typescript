import { randomUUID } from 'node:crypto';
import { getNeatlogsProvider, runWithFreshNeatlogsContext } from '../core/provider.js';
import {
  DatasetCaptureApi, DatasetCaptureError, parseReceipt, parseStatus,
  validateDestination, uuid, serializeCaptureBody,
  type DatasetApiOptions, type DatasetCaptureDestination,
  type DatasetCaptureReceipt, type DatasetCaptureState, type DatasetCaptureStatus, type DatasetCaptureFailure,
} from './api.js';
import {
  assertCaptureNotNested, assertCaptureProvider, createCaptureScope, runInCaptureScope,
  flushCaptureScope, captureScopeIncomplete, captureScopeDeliveryFailed, capturedTraces, releaseCaptureScope,
} from './capture-scope.js';

export interface DatasetCaptureOptions extends DatasetApiOptions {
  environment: 'local' | 'ci' | 'production';
  allowProduction?: boolean;
  idempotencyKey?: string;
  flushTimeoutMillis?: number;
  /** Receives the registered handle before execution, including when execution throws. */
  onRegistered?: (capture: DatasetCaptureHandle) => void | Promise<void>;
}
export interface DatasetCaptureStatusOptions {
  /** Cursor returned by the preceding status page. */
  after?: string;
}
export interface DatasetCaptureWaitOptions {
  timeoutMillis?: number;
  pollIntervalMillis?: number;
}
export type DatasetCaptureResult<T> = DatasetCaptureHandle & { readonly result: T };

const handlesByError = new WeakMap<object, DatasetCaptureHandle>();
function associate(error: unknown, handle: DatasetCaptureHandle): void {
  if ((typeof error === 'object' && error !== null) || typeof error === 'function') handlesByError.set(error, handle);
}
export function getDatasetCaptureHandle(error: unknown): DatasetCaptureHandle | undefined {
  return (typeof error === 'object' && error !== null) || typeof error === 'function' ? handlesByError.get(error) : undefined;
}
function positive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new DatasetCaptureError(`${field} must be positive.`);
  return value;
}

export class DatasetCaptureHandle {
  readonly captureId: string;
  readonly datasetId: string;
  private currentState: DatasetCaptureState;
  private currentVersionId: string | null = null;
  private failure: DatasetCaptureError | null = null;
  private cachedStatus: DatasetCaptureStatus | null = null;
  #completionBody: string | null = null;
  readonly #api: DatasetCaptureApi;
  private readonly completeKey = randomUUID();
  private readonly abortKey = randomUUID();

  constructor(api: DatasetCaptureApi, receipt: DatasetCaptureReceipt) {
    this.#api = api;
    this.captureId = receipt.captureId;
    this.datasetId = receipt.datasetId;
    this.currentState = receipt.state;
  }
  get state(): DatasetCaptureState { return this.currentState; }
  get datasetVersionId(): string | null { return this.currentVersionId; }
  get captureError(): DatasetCaptureError | null { return this.failure; }
  get lastStatus(): DatasetCaptureStatus | null { return this.cachedStatus; }

  async status(options: DatasetCaptureStatusOptions = {}): Promise<DatasetCaptureStatus> {
    if (options.after !== undefined && !/^\d{1,20}$/.test(options.after)) throw new DatasetCaptureError('after must be a capture failure cursor.');
    return this.refresh(undefined, options.after);
  }
  private async refresh(timeoutMillis?: number, after?: string): Promise<DatasetCaptureStatus> {
    try {
      const status = parseStatus(await this.#api.request('GET', `/${this.captureId}${after === undefined ? '' : `?after=${encodeURIComponent(after)}`}`, undefined, undefined, timeoutMillis), this.captureId, this.datasetId);
      this.cachedStatus = status;
      this.currentState = status.state;
      this.currentVersionId = status.datasetVersionId;
      return status;
    } catch (error) {
      associate(error, this);
      throw error;
    }
  }
  async wait(options: DatasetCaptureWaitOptions = {}): Promise<DatasetCaptureStatus> {
    const deadline = Date.now() + positive(options.timeoutMillis ?? 60_000, 'timeoutMillis');
    const interval = positive(options.pollIntervalMillis ?? 1000, 'pollIntervalMillis');
    while (Date.now() < deadline) {
      const status = await this.refresh(Math.max(1, deadline - Date.now()));
      if (status.state === 'completed') return status;
      if (status.state === 'failed' || status.state === 'cancelled' || status.state === 'needs_review') {
        const error = new DatasetCaptureError(`Dataset capture ${status.state}: ${status.publicationError ?? 'inspect status() before retrying.'}`);
        associate(error, this);
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - Date.now()))));
    }
    const error = new DatasetCaptureError('Timed out waiting for dataset capture; the server job continues.');
    associate(error, this);
    throw error;
  }
  /** @internal Freeze and validate the manifest before any completion request. */
  _prepareCompletion(traces: Array<{ traceId: string; spanIds: string[] }>): void {
    if (this.#completionBody !== null) throw new DatasetCaptureError('Dataset capture completion manifest is already frozen.');
    this.#completionBody = serializeCaptureBody({ traces });
  }
  /** Retry an uncertain completion with its original bytes and idempotency key. */
  async retryCompletion(): Promise<void> {
    if (this.#completionBody === null) throw new DatasetCaptureError('This capture has no exported completion manifest.');
    try {
      const receipt = parseReceipt(await this.#api.requestSerialized('POST', `/${this.captureId}/complete`, this.#completionBody, this.completeKey));
      if (receipt.captureId !== this.captureId || receipt.datasetId !== this.datasetId) throw new DatasetCaptureError('Completion belongs to a different dataset capture.');
      if (this.currentState !== 'completed') this.currentState = receipt.state;
      this.failure = null;
    } catch (error) {
      if (error instanceof DatasetCaptureError) this.failure = error;
      associate(error, this);
      throw error;
    }
  }
  /** @internal Aborts metadata capture without interrupting normal trace ingestion. */
  async _abort(reason: 'export_failed' | 'incomplete_execution', error: DatasetCaptureError): Promise<void> {
    this.failure = error;
    const receipt = parseReceipt(await this.#api.request('POST', `/${this.captureId}/abort`, { reason }, this.abortKey));
    if (receipt.captureId !== this.captureId || receipt.datasetId !== this.datasetId) throw new DatasetCaptureError('Abort belongs to a different dataset capture.');
    this.currentState = receipt.state;
  }
  /** @internal Retains control-plane failures while preserving agent exceptions. */
  _setError(error: DatasetCaptureError): void { this.failure = error; }
}

async function capture<T>(destination: DatasetCaptureDestination, run: () => T | Promise<T>, options: DatasetCaptureOptions): Promise<DatasetCaptureResult<T>> {
  assertCaptureNotNested();
  if (!['local', 'ci', 'production'].includes(options.environment)) throw new DatasetCaptureError('An explicit local, ci, or production capture environment is required.');
  if (options.environment === 'production' && options.allowProduction !== true) throw new DatasetCaptureError('Production capture requires allowProduction: true.');
  const provider = getNeatlogsProvider();
  if (!provider) throw new DatasetCaptureError('Initialize Neatlogs or activate a Client before dataset capture.');
  assertCaptureProvider(provider);
  if (typeof run !== 'function') throw new DatasetCaptureError('Dataset capture requires an execution callback.');
  const flushTimeout = positive(options.flushTimeoutMillis ?? 30_000, 'flushTimeoutMillis');
  const api = new DatasetCaptureApi(options);
  const receipt = parseReceipt(await api.request('POST', '', { destination: validateDestination(destination) }, uuid(options.idempotencyKey ?? randomUUID(), 'idempotencyKey')));
  if (receipt.state !== 'recording') throw new DatasetCaptureError('The registered capture is no longer recording; execution was not started.');
  const handle = new DatasetCaptureHandle(api, receipt);
  const scope = createCaptureScope(provider);
  let execution: { ok: true; result: T } | { ok: false; error: unknown };
  try {
    try {
      await options.onRegistered?.(handle);
    } catch (error) {
      associate(error, handle);
      try { await handle._abort('incomplete_execution', new DatasetCaptureError('Capture registration callback failed before agent execution.')); } catch { /* The original callback error takes precedence. */ }
      throw error;
    }
    try {
      execution = { ok: true, result: await runInCaptureScope(scope, () => runWithFreshNeatlogsContext(run)) };
    } catch (error) {
      execution = { ok: false, error };
    } finally {
      scope.accepting = false;
    }
    let failure: DatasetCaptureError | null = null;
    let reason: 'export_failed' | 'incomplete_execution' = 'export_failed';
    let completionAttempted = false;
    const incomplete = captureScopeIncomplete(scope);
    const flushed = await flushCaptureScope(scope, flushTimeout);
    if (incomplete) {
      reason = 'incomplete_execution';
      failure = new DatasetCaptureError('Capture execution left spans open; await all traced work before returning.');
    } else if (!flushed || captureScopeDeliveryFailed(scope)) {
      failure = new DatasetCaptureError('Capture trace delivery failed or lost spans; no dataset version was requested.');
    }
    if (!failure) {
      let traces: Array<{ traceId: string; spanIds: string[] }> = [];
      try { traces = capturedTraces(scope); }
      catch {
        reason = 'incomplete_execution';
        failure = new DatasetCaptureError('Capture requires root traces created inside its callback.');
      }
      try {
        if (!failure) {
          handle._prepareCompletion(traces);
          completionAttempted = true;
          await handle.retryCompletion();
        }
      } catch (error) { failure = error instanceof DatasetCaptureError ? error : new DatasetCaptureError('Capture could not complete its root trace selection.'); }
    }
    if (failure) {
      handle._setError(failure);
      if (!completionAttempted) {
        try { await handle._abort(reason, failure); } catch { /* The handle retains the failure and status() can reconcile the job. */ }
      }
    }
    if (!execution.ok) {
      associate(execution.error, handle);
      throw execution.error;
    }
    if (failure) { associate(failure, handle); throw failure; }
    return Object.assign(handle, { result: execution.result });
  } finally {
    releaseCaptureScope(scope);
  }
}

export const datasets = { capture };
export { DatasetCaptureError };
export type { DatasetCaptureDestination, DatasetCaptureState, DatasetCaptureStatus, DatasetCaptureFailure };
