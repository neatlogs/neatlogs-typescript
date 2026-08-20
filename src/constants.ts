/** Stable SDK-wide defaults shared by every NeatLogs entry point. */
export const DEFAULT_INGEST_ENDPOINT = 'https://ingest.neatlogs.com' as const;
export const DEFAULT_MAX_QUEUE_ITEMS = 2048;

export function exportQueueCapacity(batchSize: number): number {
  return Math.max(DEFAULT_MAX_QUEUE_ITEMS, batchSize * 4);
}
