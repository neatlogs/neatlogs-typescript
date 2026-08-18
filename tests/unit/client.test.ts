/**
 * Multi-tenant Client — routing, isolation, and lifecycle.
 *
 * Port-parity tests for Python's neatlogs.Client. Every routing test asserts on
 * BOTH exporters: a span must land in the right pipeline AND be absent from the
 * wrong one, since a leak is the failure mode that matters.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';

import { Client } from '../../src/core/client.js';
import { getActiveClient } from '../../src/core/active-client.js';
import {
  _setNeatlogsProvider,
  getNeatlogsTracer,
  getNeatlogsProvider,
} from '../../src/core/provider.js';
import { getProviderTracer } from '../../src/core/auto-root.js';

// ---------------------------------------------------------------------------
// Harness: a "global" pipeline standing in for init(), plus per-test clients.
// ---------------------------------------------------------------------------

const globalExporter = new InMemorySpanExporter();
const globalProvider = new NodeTracerProvider();
globalProvider.addSpanProcessor(new SimpleSpanProcessor(globalExporter));
_setNeatlogsProvider(globalProvider);

const openClients: Client[] = [];

/** A Client whose spans land in `exporter`, with no network export. */
function makeClient(workflowName: string): {
  client: Client;
  exporter: InMemorySpanExporter;
} {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  const client = new Client({
    workflowName,
    disableExport: true,
    tracerProvider: provider,
  });
  openClients.push(client);
  return { client, exporter };
}

/** End one span through the normal tracer-resolution path. */
function emit(name: string): void {
  getNeatlogsTracer('neatlogs.test').startSpan(name).end();
}

/**
 * User-visible span names in `exporter`.
 *
 * A parentless span makes NeatlogsSpanProcessor emit a `neatlogs.trace.complete`
 * marker into the SAME pipeline. That marker is correct behaviour — and its
 * presence in a client's exporter is itself evidence that routing reaches the
 * processor — but it is noise for name assertions, so drop it here.
 */
function names(exporter: InMemorySpanExporter): string[] {
  return exporter
    .getFinishedSpans()
    .map((s) => s.name)
    .filter((n) => n !== 'neatlogs.trace.complete');
}

/** Completion markers only — used to assert the marker follows the routing. */
function markerCount(exporter: InMemorySpanExporter): number {
  return exporter
    .getFinishedSpans()
    .filter((s) => s.name === 'neatlogs.trace.complete').length;
}

beforeEach(() => {
  globalExporter.reset();
});

afterAll(async () => {
  for (const c of openClients) await c.shutdown();
  _setNeatlogsProvider(null);
  await globalProvider.shutdown();
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

describe('Client routing', () => {
  it('routes spans inside activate() to the client, not the global pipeline', () => {
    const { client, exporter } = makeClient('scoped');

    client.activate(() => emit('inside'));

    expect(names(exporter)).toEqual(['inside']);
    expect(names(globalExporter)).toEqual([]);
    // The completion marker follows the span into the client's pipeline — the
    // whole processor chain is routed, not just tracer creation.
    expect(markerCount(exporter)).toBe(1);
    expect(markerCount(globalExporter)).toBe(0);
  });

  it('leaves spans outside activate() on the global pipeline', () => {
    const { exporter } = makeClient('scoped');

    emit('outside');

    expect(names(globalExporter)).toEqual(['outside']);
    expect(names(exporter)).toEqual([]);
  });

  it('restores the outer client when a nested activate() exits', () => {
    const a = makeClient('a');
    const b = makeClient('b');

    a.client.activate(() => {
      emit('in-a');
      b.client.activate(() => emit('in-b'));
      emit('back-in-a');
    });

    expect(names(a.exporter)).toEqual(['in-a', 'back-in-a']);
    expect(names(b.exporter)).toEqual(['in-b']);
    expect(names(globalExporter)).toEqual([]);
  });

  it('keeps the client active across an await boundary', async () => {
    const { client, exporter } = makeClient('async');

    await client.activate(async () => {
      emit('before-await');
      await new Promise((r) => setTimeout(r, 5));
      emit('after-await');
    });

    expect(names(exporter)).toEqual(['before-await', 'after-await']);
    expect(names(globalExporter)).toEqual([]);
  });

  it('does not cross-contaminate concurrent clients', async () => {
    const a = makeClient('concurrent-a');
    const b = makeClient('concurrent-b');

    // Interleaved awaits force the two AsyncLocalStorage scopes to overlap in
    // wall-clock time — the case a naive module-level variable gets wrong.
    await Promise.all([
      a.client.activate(async () => {
        emit('a1');
        await new Promise((r) => setTimeout(r, 20));
        emit('a2');
      }),
      b.client.activate(async () => {
        await new Promise((r) => setTimeout(r, 10));
        emit('b1');
        await new Promise((r) => setTimeout(r, 20));
        emit('b2');
      }),
    ]);

    expect(names(a.exporter).sort()).toEqual(['a1', 'a2']);
    expect(names(b.exporter).sort()).toEqual(['b1', 'b2']);
    expect(names(globalExporter)).toEqual([]);
  });

  it('exposes the active client and clears it on exit', () => {
    const { client } = makeClient('probe');

    expect(getActiveClient()).toBeUndefined();
    client.activate(() => {
      expect(getActiveClient()).toBe(client);
    });
    expect(getActiveClient()).toBeUndefined();
  });

  it('routes getNeatlogsProvider() to the client provider while active', () => {
    const { client } = makeClient('provider-probe');

    expect(getNeatlogsProvider()).toBe(globalProvider);
    client.activate(() => {
      expect(getNeatlogsProvider()).toBe(client.tracerProvider);
    });
    expect(getNeatlogsProvider()).toBe(globalProvider);
  });
});

// ---------------------------------------------------------------------------
// Auto-root naming (Python seam: _resolve_root_workflow_name)
// ---------------------------------------------------------------------------

describe('Client auto-root', () => {
  it("names the auto-root after the client's workflow, in the client pipeline", () => {
    const { client, exporter } = makeClient('nightly-summarizer');

    client.activate(() => {
      getProviderTracer('neatlogs')
        .startSpan('openai.chat.completions.create', {
          attributes: { 'neatlogs.span.kind': 'LLM' },
        })
        .end();
    });

    const spans = exporter.getFinishedSpans();
    const root = spans.find(
      (s) => s.attributes['neatlogs.auto_root'] === true,
    );
    expect(root).toBeDefined();
    expect(root!.name).toBe('nightly-summarizer');
    expect(names(globalExporter)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('Client lifecycle', () => {
  it('leaves the global pipeline working after the client shuts down', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    const client = new Client({
      workflowName: 'short-lived',
      disableExport: true,
      tracerProvider: provider,
    });

    await client.shutdown();
    emit('after-client-shutdown');

    expect(names(globalExporter)).toEqual(['after-client-shutdown']);
    await provider.shutdown();
  });

  it('refuses to activate a closed client', async () => {
    const { client } = makeClient('closed');
    await client.shutdown();

    expect(() => client.activate(() => emit('nope'))).toThrow(/closed/i);
  });

  it('is idempotent on repeated shutdown', async () => {
    const { client } = makeClient('idempotent');

    expect(await client.shutdown()).toBe(true);
    expect(await client.shutdown()).toBe(true);
  });

  it('never shuts down a caller-supplied provider', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    const client = new Client({
      workflowName: 'borrowed',
      disableExport: true,
      tracerProvider: provider,
    });

    await client.shutdown();

    // Still usable: shutdown() would have made this a no-op.
    provider.getTracer('probe').startSpan('still-alive').end();
    expect(names(exporter)).toContain('still-alive');
    await provider.shutdown();
  });

  it('works with no init() — a Client is standalone', () => {
    _setNeatlogsProvider(null);
    try {
      const { client, exporter } = makeClient('standalone');
      client.activate(() => emit('standalone-span'));
      expect(names(exporter)).toEqual(['standalone-span']);
    } finally {
      _setNeatlogsProvider(globalProvider);
    }
  });

  it('caches tracers per scope', () => {
    const { client } = makeClient('cache');
    expect(client.getTracer('a')).toBe(client.getTracer('a'));
    expect(client.getTracer('a')).not.toBe(client.getTracer('b'));
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('Client validation', () => {
  it('requires an apiKey unless export is disabled', () => {
    expect(() => new Client({ workflowName: 'w' })).toThrow(/apiKey is required/);
    expect(
      () => new Client({ workflowName: 'w', disableExport: true }),
    ).not.toThrow();
  });

  it('requires a workflowName', () => {
    expect(
      () => new Client({ workflowName: '  ', disableExport: true }),
    ).toThrow(/workflowName is required/);
  });

  it('rejects non-string tags', () => {
    expect(
      () =>
        new Client({
          workflowName: 'w',
          disableExport: true,
          tags: ['ok', 42 as unknown as string],
        }),
    ).toThrow(/tags must be a list of strings/);
  });
});

// ---------------------------------------------------------------------------
// Dual CJS/ESM safety
// ---------------------------------------------------------------------------

describe('active-client storage', () => {
  it('lives on globalThis so CJS and ESM copies share one instance', () => {
    // A plain module-level AsyncLocalStorage would be duplicated across the two
    // build formats and silently misroute spans. The registry symbol is the fix.
    const key = Symbol.for('neatlogs.active_client_storage');
    expect((globalThis as Record<symbol, unknown>)[key]).toBeDefined();
  });
});
