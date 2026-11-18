import { setTimeout as delay } from 'node:timers/promises';
import { LocalRunApiError, type LocalRunApi } from './replay/run-api.js';

export type RunStatus = Awaited<ReturnType<LocalRunApi['status']>>;

export function isRunTerminal(status: RunStatus): boolean {
  return ['completed', 'partial', 'failed', 'cancelled', 'timed_out'].includes(status.state);
}

function isUncertain(error: unknown) {
  return error instanceof LocalRunApiError && (
    error.status === 504 ||
    error.code === 'RUN_API_TRANSPORT_FAILURE' ||
    error.code === 'IDEMPOTENCY_REQUEST_IN_PROGRESS' ||
    error.code === 'IDEMPOTENCY_STORE_UNAVAILABLE'
  );
}

export async function recoverRunRequest<T>(
  operation: (timeout: number) => Promise<T>, deadline: number,
  recovery?: { api: LocalRunApi; runId: string },
): Promise<{ data: T; terminal?: never } | { terminal: RunStatus; data?: never }> {
  for (;;) {
    try {
      return { data: await operation(Math.max(1, Math.min(30_000, deadline - Date.now()))) };
    } catch (error) {
      const closed = error instanceof LocalRunApiError && error.code === 'RUN_CLOSED';
      if (!isUncertain(error) && !closed) throw error;
      if (recovery) {
        try {
          // Give the final read time to confirm a mutation that consumed the deadline.
          const probeTimeout = Math.max(1000, Math.min(30_000, deadline - Date.now()));
          const status = await recovery.api.status(recovery.runId, false, probeTimeout);
          if (isRunTerminal(status)) return { terminal: status };
        } catch (probeError) {
          if (!isUncertain(probeError)) throw probeError;
        }
      }
      if (closed && recovery) {
        throw new LocalRunApiError('The closed run status could not be confirmed.', undefined, 'RUN_API_TRANSPORT_FAILURE');
      }
      const remaining = deadline - Date.now();
      if (closed || remaining <= 0) throw error;
      await delay(Math.min(1000, remaining));
    }
  }
}

export function uncertainRunMessage(error: unknown, runId: string | null, statePath: string | undefined) {
  if (!isUncertain(error)) return error;
  const run = runId ? `Run ${runId}` : 'Run registration';
  const resume = statePath ? ` Use --resume --state "${statePath}" to reconcile the saved run.` : '';
  return new LocalRunApiError(`${run} could not be confirmed before its deadline.${resume}`, undefined, 'RUN_API_TRANSPORT_FAILURE');
}
