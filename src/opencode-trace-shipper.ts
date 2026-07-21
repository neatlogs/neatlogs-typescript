/**
 * Direct OTLP trace shipper for the opencode plugin.
 *
 * opencode loads the plugin in-process but `opencode run` is short-lived — it
 * tears down the moment a session goes idle. The OpenTelemetry BatchSpanProcessor
 * (async, scheduled-delay export + a `beforeExit` shutdown) races that teardown,
 * dropping spans or leaving aborted half-sent requests. This shipper mirrors the
 * proven `neatlogs-claude-code` design instead: spans are queued, then `flush()`
 * does a single AWAITED `fetch(POST /v1/traces)` round-trip that completes before
 * the host process can exit. No batch processor, no exit-time race.
 *
 * Self-contained (inlined OTLP protobuf schema) so it adds no runtime file I/O.
 */

import protobuf from 'protobufjs';
import { __version__ } from './version.js';

const PACKAGE_NAME = 'neatlogs.opencode';

export interface OtlpKeyValue {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

export interface OtlpSpan {
  traceId: Uint8Array;
  spanId: Uint8Array;
  parentSpanId?: Uint8Array;
  name: string;
  /** OTLP SpanKind enum (0=unspecified, 1=internal, …). Neatlogs kind rides in attributes. */
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  status?: { code: number; message?: string };
}

// Inlined OTLP proto definition — avoids .proto file I/O at runtime.
const OTLP_PROTO_JSON: protobuf.INamespace = {
  nested: {
    opentelemetry: {
      nested: {
        proto: {
          nested: {
            common: {
              nested: {
                v1: {
                  nested: {
                    AnyValue: {
                      oneofs: {
                        value: {
                          oneof: [
                            'stringValue',
                            'boolValue',
                            'intValue',
                            'doubleValue',
                            'arrayValue',
                            'kvlistValue',
                            'bytesValue',
                          ],
                        },
                      },
                      fields: {
                        stringValue: { type: 'string', id: 1 },
                        boolValue: { type: 'bool', id: 2 },
                        intValue: { type: 'int64', id: 3 },
                        doubleValue: { type: 'double', id: 4 },
                        arrayValue: { type: 'ArrayValue', id: 5 },
                        kvlistValue: { type: 'KeyValueList', id: 6 },
                        bytesValue: { type: 'bytes', id: 7 },
                      },
                    },
                    ArrayValue: { fields: { values: { rule: 'repeated', type: 'AnyValue', id: 1 } } },
                    KeyValueList: { fields: { values: { rule: 'repeated', type: 'KeyValue', id: 1 } } },
                    KeyValue: {
                      fields: { key: { type: 'string', id: 1 }, value: { type: 'AnyValue', id: 2 } },
                    },
                    InstrumentationScope: {
                      fields: { name: { type: 'string', id: 1 }, version: { type: 'string', id: 2 } },
                    },
                  },
                },
              },
            },
            resource: {
              nested: {
                v1: {
                  nested: {
                    Resource: {
                      fields: {
                        attributes: {
                          rule: 'repeated',
                          type: 'opentelemetry.proto.common.v1.KeyValue',
                          id: 1,
                        },
                      },
                    },
                  },
                },
              },
            },
            trace: {
              nested: {
                v1: {
                  nested: {
                    ResourceSpans: {
                      fields: {
                        resource: { type: 'opentelemetry.proto.resource.v1.Resource', id: 1 },
                        scopeSpans: { rule: 'repeated', type: 'ScopeSpans', id: 2 },
                      },
                    },
                    ScopeSpans: {
                      fields: {
                        scope: { type: 'opentelemetry.proto.common.v1.InstrumentationScope', id: 1 },
                        spans: { rule: 'repeated', type: 'Span', id: 2 },
                      },
                    },
                    Span: {
                      fields: {
                        traceId: { type: 'bytes', id: 1 },
                        spanId: { type: 'bytes', id: 2 },
                        traceState: { type: 'string', id: 3 },
                        parentSpanId: { type: 'bytes', id: 4 },
                        name: { type: 'string', id: 5 },
                        kind: { type: 'SpanKind', id: 6 },
                        startTimeUnixNano: { type: 'fixed64', id: 7 },
                        endTimeUnixNano: { type: 'fixed64', id: 8 },
                        attributes: {
                          rule: 'repeated',
                          type: 'opentelemetry.proto.common.v1.KeyValue',
                          id: 9,
                        },
                        droppedAttributesCount: { type: 'uint32', id: 10 },
                        status: { type: 'Status', id: 15 },
                      },
                    },
                    Status: {
                      fields: { message: { type: 'string', id: 2 }, code: { type: 'StatusCode', id: 3 } },
                    },
                    StatusCode: {
                      values: { STATUS_CODE_UNSET: 0, STATUS_CODE_OK: 1, STATUS_CODE_ERROR: 2 },
                    },
                    SpanKind: {
                      values: {
                        SPAN_KIND_UNSPECIFIED: 0,
                        SPAN_KIND_INTERNAL: 1,
                        SPAN_KIND_SERVER: 2,
                        SPAN_KIND_CLIENT: 3,
                        SPAN_KIND_PRODUCER: 4,
                        SPAN_KIND_CONSUMER: 5,
                      },
                    },
                  },
                },
              },
            },
            collector: {
              nested: {
                trace: {
                  nested: {
                    v1: {
                      nested: {
                        ExportTraceServiceRequest: {
                          fields: {
                            resourceSpans: {
                              rule: 'repeated',
                              type: 'opentelemetry.proto.trace.v1.ResourceSpans',
                              id: 1,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const protoRoot = protobuf.Root.fromJSON(OTLP_PROTO_JSON);
const ExportTraceServiceRequest = protoRoot.lookupType(
  'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest',
);

export const SpanStatusCode = { UNSET: 0, OK: 1, ERROR: 2 } as const;

// ---------------------------------------------------------------------------
// ID + time + attribute helpers
// ---------------------------------------------------------------------------

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function generateTraceId(): Uint8Array {
  return randomBytes(16);
}

export function generateSpanId(): Uint8Array {
  return randomBytes(8);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function nowNanoString(): string {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

export function msToNanoString(ms: number): string {
  return (BigInt(Math.floor(ms)) * 1_000_000n).toString();
}

export function attrStr(key: string, value: string | undefined): OtlpKeyValue | undefined {
  if (value === undefined || value === null) return undefined;
  return { key, value: { stringValue: String(value) } };
}

export function attrInt(key: string, value: number | undefined): OtlpKeyValue | undefined {
  if (value === undefined || value === null || !Number.isFinite(value)) return undefined;
  return { key, value: { intValue: String(Math.trunc(value)) } };
}

export function attrDouble(key: string, value: number | undefined): OtlpKeyValue | undefined {
  if (value === undefined || value === null || !Number.isFinite(value)) return undefined;
  return { key, value: { doubleValue: value } };
}

export interface TraceShipperOptions {
  apiKey: string;
  endpoint: string;
  debug?: boolean;
  maxRetries?: number;
  workflowName?: string;
}

export class TraceShipper {
  private apiKey: string;
  private endpoint: string;
  private debug: boolean;
  private maxRetries: number;
  workflowName: string;
  private queue: OtlpSpan[] = [];
  private prefix = '[neatlogs/opencode]';
  /** In-flight flush round-trips — awaited by `settle()` on dispose so a
   * short-lived host (`opencode run`) can force pending exports to complete. */
  private inflight = new Set<Promise<void>>();

  constructor(opts: TraceShipperOptions) {
    this.apiKey = opts.apiKey;
    this.endpoint = opts.endpoint.endsWith('/') ? opts.endpoint.slice(0, -1) : opts.endpoint;
    this.debug = !!opts.debug;
    this.maxRetries = opts.maxRetries ?? 3;
    this.workflowName = opts.workflowName || '';
  }

  enqueue(span: OtlpSpan): void {
    this.queue.push(span);
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Ship all queued spans in a single awaited POST. Resolves only once the HTTP
   * response is received (or all retries are exhausted) — so a short-lived host
   * can safely exit immediately after awaiting this.
   *
   * The returned promise is also tracked in `inflight` so `settle()` can await
   * it even when the caller (an un-awaited opencode `event` hook) drops it.
   */
  flush(): Promise<void> {
    const p = this._flush().finally(() => this.inflight.delete(p));
    this.inflight.add(p);
    return p;
  }

  /**
   * Await every flush started so far (including ones whose promise the caller
   * discarded). Called from the plugin's `dispose` hook, which opencode DOES
   * await on scope teardown — unlike the fire-and-forget `event` hook.
   */
  async settle(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled(Array.from(this.inflight));
    }
  }

  private async _flush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (!this.apiKey) {
      this.queue = [];
      return;
    }

    const spans = this.queue.splice(0);
    const payload = this.buildProtobuf(spans);
    const url = `${this.endpoint}/v1/traces`;

    if (this.debug) console.log(`${this.prefix} Shipping ${spans.length} spans to ${url}`);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-protobuf',
            'x-api-key': this.apiKey,
          },
          body: payload as any,
        });

        if (resp.ok) {
          if (this.debug) console.log(`${this.prefix} Shipped ${spans.length} spans`);
          return;
        }
        if (resp.status === 401) {
          console.warn(`${this.prefix} Invalid API key (401) — dropping ${spans.length} spans`);
          return;
        }
        if (resp.status < 500 && resp.status !== 429) {
          if (this.debug) console.warn(`${this.prefix} HTTP ${resp.status} — dropping spans`);
          return;
        }
        // 429 / 5xx → retry
      } catch (err) {
        if (this.debug) {
          console.warn(
            `${this.prefix} Attempt ${attempt}/${this.maxRetries}: ${(err as Error).message}`,
          );
        }
      }
      if (attempt < this.maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }
    console.warn(`${this.prefix} Failed to ship ${spans.length} spans after ${this.maxRetries} attempts`);
  }

  private buildProtobuf(spans: OtlpSpan[]): Uint8Array {
    const protoSpans = spans.map((span) => ({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId || undefined,
      name: span.name,
      kind: span.kind,
      startTimeUnixNano: nanoToLong(span.startTimeUnixNano),
      endTimeUnixNano: nanoToLong(span.endTimeUnixNano),
      attributes: span.attributes.map((a) => ({
        key: a.key,
        value:
          a.value.intValue !== undefined
            ? { intValue: nanoToLong(a.value.intValue) }
            : a.value,
      })),
      status: span.status ? { code: span.status.code, message: span.status.message } : undefined,
    }));

    const resourceAttributes: Array<{ key: string; value: { stringValue: string } }> = [
      { key: 'service.name', value: { stringValue: 'neatlogs.opencode' } },
      { key: 'service.version', value: { stringValue: __version__ } },
    ];
    if (this.workflowName) {
      resourceAttributes.push({
        key: 'neatlogs.workflow_name',
        value: { stringValue: this.workflowName },
      });
    }

    const message = {
      resourceSpans: [
        {
          resource: { attributes: resourceAttributes },
          scopeSpans: [
            {
              scope: { name: PACKAGE_NAME, version: __version__ },
              spans: protoSpans,
            },
          ],
        },
      ],
    };

    const errMsg = ExportTraceServiceRequest.verify(message);
    if (errMsg && this.debug) console.warn(`${this.prefix} Proto verify: ${errMsg}`);

    return ExportTraceServiceRequest.encode(ExportTraceServiceRequest.fromObject(message)).finish();
  }
}

/** protobufjs encodes fixed64/int64 from a {low,high,unsigned} Long-like. */
function nanoToLong(nanoStr: string): { low: number; high: number; unsigned: boolean } {
  const big = BigInt(nanoStr);
  const low = Number(big & 0xffffffffn);
  const high = Number((big >> 32n) & 0xffffffffn);
  return { low, high, unsigned: true };
}
