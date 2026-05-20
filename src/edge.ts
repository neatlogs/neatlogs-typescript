/**
 * Neatlogs Edge-compatible init.
 *
 * Uses @opentelemetry/sdk-trace-base (no Node.js deps) and a custom fetch-based
 * OTLP exporter to work in Edge runtimes (Vercel Edge, Cloudflare Workers, Deno).
 *
 * Usage:
 *   import { init } from 'neatlogs/edge';
 *   import { wrapAISDK } from 'neatlogs/ai';
 *
 *   await init({ apiKey: '...', endpoint: '...' });
 *   const { streamText } = wrapAISDK(ai);
 */

import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  type SpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { ProtobufTraceSerializer } from '@opentelemetry/otlp-transformer';

export interface EdgeInitOptions {
  apiKey: string;
  endpoint?: string;
  workflowName?: string;
  debug?: boolean;
}

let _provider: BasicTracerProvider | null = null;

class FetchSpanExporter implements SpanExporter {
  private _url: string;
  private _headers: Record<string, string>;
  private _debug: boolean;
  private _pendingExports: Promise<void>[] = [];

  constructor(url: string, headers: Record<string, string>, debug: boolean) {
    this._url = url;
    this._headers = headers;
    this._debug = debug;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const body = ProtobufTraceSerializer.serializeRequest(spans);

    const promise = fetch(this._url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-protobuf',
        ...this._headers,
      },
      body,
    })
      .then((res) => {
        if (this._debug) {
          console.log(`[neatlogs/edge] Export ${spans.length} spans: ${res.status}`);
        }
        resultCallback({ code: ExportResultCode.SUCCESS });
      })
      .catch((err) => {
        if (this._debug) {
          console.error('[neatlogs/edge] Export failed:', err);
        }
        resultCallback({ code: ExportResultCode.FAILED, error: err });
      });

    this._pendingExports.push(promise);
    promise.finally(() => {
      this._pendingExports = this._pendingExports.filter((p) => p !== promise);
    });
  }

  async shutdown(): Promise<void> {
    await Promise.all(this._pendingExports);
  }

  async forceFlush(): Promise<void> {
    await Promise.all(this._pendingExports);
  }
}

export async function init(options: EdgeInitOptions): Promise<void> {
  if (_provider) return;

  const {
    apiKey,
    endpoint = 'https://cloud.neatlogs.com',
    workflowName,
    debug = false,
  } = options;

  if (debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const tracesUrl = endpoint.endsWith('/v1/traces')
    ? endpoint
    : `${endpoint.replace(/\/$/, '')}/v1/traces`;

  const exporter = new FetchSpanExporter(
    tracesUrl,
    { 'x-api-key': apiKey },
    debug,
  );

  const resource = new Resource({
    'service.name': workflowName || 'neatlogs-edge',
    'neatlogs.sdk.language': 'typescript',
    'neatlogs.sdk.runtime': 'edge',
  });

  _provider = new BasicTracerProvider({ resource });
  _provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
    maxExportBatchSize: 50,
    scheduledDelayMillis: 1000,
  }));
  _provider.register();

  if (debug) {
    console.log(`[neatlogs/edge] Initialized — endpoint: ${tracesUrl}`);
  }
}

export async function flush(): Promise<void> {
  const provider = trace.getTracerProvider() as BasicTracerProvider;
  if (provider && typeof provider.forceFlush === 'function') {
    await provider.forceFlush();
  } else if (_provider) {
    await _provider.forceFlush();
  }
}

export async function shutdown(): Promise<void> {
  if (_provider) {
    await _provider.shutdown();
    _provider = null;
  }
}
