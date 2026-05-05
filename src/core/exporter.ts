/**
 * NeatlogsExporter — batch HTTP exporter for log spans.
 *
 * Buffers span-like dicts and flushes them in batches to the
 * Neatlogs API at /api/data/v4/batch.
 */

import { getLogger } from './logger.js';

const logger = getLogger();

export interface NeatlogsExporterOptions {
  baseUrl: string;
  apiKey: string;
  batchSize?: number;       // default 50
  flushIntervalMs?: number; // default 5000
  disableExport?: boolean;
}

export class NeatlogsExporter {
  private baseUrl: string;
  private apiKey: string;
  private batchSize: number;
  private flushIntervalMs: number;
  private disableExport: boolean;
  private buffer: Record<string, any>[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private _shutdown = false;

  constructor(options: NeatlogsExporterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.batchSize = options.batchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.disableExport = options.disableExport ?? false;

    if (!this.disableExport) {
      this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
      // Don't keep the process alive just for flushing
      if (this.flushTimer.unref) {
        this.flushTimer.unref();
      }
    }
  }

  /** Add a span-like dict to the buffer. */
  export(spanData: Record<string, any>): void {
    if (this._shutdown || this.disableExport) return;

    this.buffer.push(spanData);

    if (this.buffer.length >= this.batchSize) {
      this.flush().catch((err) => {
        logger.warn(`Failed to flush batch: ${err}`);
      });
    }
  }

  /** Flush all buffered spans to the API. */
  async flush(): Promise<void> {
    if (this.disableExport || this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      const url = `${this.baseUrl}/api/data/v4/batch`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({ spans: batch }),
      });

      if (!response.ok) {
        logger.warn(
          `Failed to export batch: ${response.status} ${response.statusText}`,
        );
        this._requeueBatch(batch);
      } else {
        logger.debug(`Exported ${batch.length} log spans`);
      }
    } catch (err) {
      logger.warn(`Failed to export batch: ${err}`);
      this._requeueBatch(batch);
    }
  }

  /** Re-insert a failed batch into the buffer for retry, up to a limit. */
  private _requeueBatch(batch: Record<string, any>[]): void {
    if (this.buffer.length < this.batchSize * 3) {
      this.buffer.unshift(...batch);
    }
  }

  /** Shutdown the exporter, flushing remaining items. */
  async shutdown(): Promise<void> {
    this._shutdown = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
