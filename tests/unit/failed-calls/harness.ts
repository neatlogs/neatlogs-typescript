import { afterAll, beforeAll, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { _setNeatlogsProvider } from '../../../src/core/provider.js';

export const UNSET = 0;
export const OK = 1;
export const ERROR = 2;

/** Register the in-memory span pipeline for the calling test file. */
export function useSpans() {
  const exporter = new InMemorySpanExporter();
  let provider: NodeTracerProvider;
  let previousAutoRoot: string | undefined;

  beforeAll(() => {
    // Auto-root would add a WORKFLOW parent; these tests assert the wrapper's own span.
    previousAutoRoot = process.env.NEATLOGS_AUTO_ROOT;
    process.env.NEATLOGS_AUTO_ROOT = 'false';
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    _setNeatlogsProvider(provider);
  });
  afterAll(async () => {
    _setNeatlogsProvider(null);
    await provider.shutdown();
    if (previousAutoRoot === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
    else process.env.NEATLOGS_AUTO_ROOT = previousAutoRoot;
  });
  beforeEach(() => exporter.reset());

  const spans = (): ReadableSpan[] => exporter.getFinishedSpans();
  return {
    spans,
    /** The single finished span, or the single one with this name. */
    only(name?: string): ReadableSpan {
      const matching = name ? spans().filter((s) => s.name === name) : spans();
      if (matching.length !== 1) {
        throw new Error(
          `expected exactly one ${name ?? ''} span, got ${matching.length} of [${spans().map((s) => s.name).join(', ')}]`,
        );
      }
      return matching[0];
    },
  };
}

/** The `exception` event of a span, if it has one. */
export function exceptionOf(span: ReadableSpan): Record<string, unknown> | undefined {
  return span.events.find((event) => event.name === 'exception')?.attributes;
}

export async function* streamOf<T>(items: T[], thenThrow?: unknown): AsyncGenerator<T> {
  for (const item of items) yield item;
  if (thenThrow !== undefined) throw thenThrow;
}

/** Drain a stream, optionally stopping after `breakAfter` chunks; reports how it ended. */
export async function drain(stream: AsyncIterable<unknown>, breakAfter?: number): Promise<string> {
  let seen = 0;
  try {
    for await (const _chunk of stream) {
      seen += 1;
      if (breakAfter !== undefined && seen >= breakAfter) break;
    }
    return 'completed';
  } catch (err) {
    return `threw ${(err as Error)?.message}`;
  }
}

export const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

export function abortError(): Error {
  return new DOMException('This operation was aborted', 'AbortError');
}
