/**
 * Tests that session identity (`neatlogs.session.id`) is stamped on the trace
 * ROOT span only, via trace({ sessionId }) and span({ sessionId }), and that
 * nested child spans do not carry it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';

import { trace, _setSessionConfig } from '../../src/core/context.js';
import { span } from '../../src/decorators/orchestration.js';
import { SESSION_ID_KEY } from '../../src/core/session.js';
import { END_USER_ID_KEY, END_USER_METADATA_KEY } from '../../src/core/end-user.js';
import {
  identify,
  currentSessionId,
  currentEndUserId,
  currentEndUserMetadata,
} from '../../src/core/identity.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;

beforeAll(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
});

afterAll(async () => {
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
  _setSessionConfig({});
});

describe('session identity', () => {
  it('stamps neatlogs.session.id on a trace() root', async () => {
    await trace({ name: 'chat_turn', sessionId: 'chat_123' }, async () => 'ok');

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'chat_turn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('chat_123');
  });

  it('does not stamp session on a nested child span', async () => {
    await trace({ name: 'outer', sessionId: 'chat_123' }, async () => {
      await trace({ name: 'inner' }, async () => 'deep');
    });

    const spans = exporter.getFinishedSpans();
    const outer = spans.find((s) => s.name === 'outer');
    const inner = spans.find((s) => s.name === 'inner');
    expect(outer?.attributes[SESSION_ID_KEY]).toBe('chat_123');
    expect(inner?.attributes[SESSION_ID_KEY]).toBeUndefined();
  });

  it('stamps session via the span() decorator on a WORKFLOW root', async () => {
    const handleTurn = span(
      { kind: 'WORKFLOW', name: 'handleTurn', sessionId: 'chat_123' },
      () => 42,
    );

    handleTurn();

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'handleTurn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('chat_123');
  });
});

describe('identify() request-scoped identity', () => {
  it('stamps session + end-user from identify() onto a trace() root', async () => {
    await identify(
      { sessionId: 'chat_123', endUserId: 'user_456', endUserMetadata: { plan: 'pro' } },
      async () => {
        await trace({ name: 'chat_turn' }, async () => 'ok');
      },
    );

    const root = exporter.getFinishedSpans().find((s) => s.name === 'chat_turn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('chat_123');
    expect(root?.attributes[END_USER_ID_KEY]).toBe('user_456');
    expect(root?.attributes[END_USER_METADATA_KEY]).toBe(JSON.stringify({ plan: 'pro' }));
  });

  it('stamps identity from identify() onto a span() decorator root', async () => {
    await identify({ sessionId: 'sess_dec', endUserId: 'eu_dec' }, async () => {
      const handle = span({ kind: 'WORKFLOW', name: 'handleTurn' }, () => 42);
      handle();
    });

    const root = exporter.getFinishedSpans().find((s) => s.name === 'handleTurn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('sess_dec');
    expect(root?.attributes[END_USER_ID_KEY]).toBe('eu_dec');
  });

  it('per-call arg wins over identify() context (per field)', async () => {
    await identify({ sessionId: 'ctx_sess', endUserId: 'ctx_eu' }, async () => {
      await trace(
        { name: 'chat_turn', sessionId: 'call_sess', endUserId: 'call_eu' },
        async () => 'ok',
      );
    });

    const root = exporter.getFinishedSpans().find((s) => s.name === 'chat_turn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('call_sess');
    expect(root?.attributes[END_USER_ID_KEY]).toBe('call_eu');
  });

  it('does not stamp identify() identity on a nested child span', async () => {
    await identify({ sessionId: 'chat_123', endUserId: 'user_456' }, async () => {
      await trace({ name: 'outer' }, async () => {
        await trace({ name: 'inner' }, async () => 'deep');
      });
    });

    const spans = exporter.getFinishedSpans();
    const outer = spans.find((s) => s.name === 'outer');
    const inner = spans.find((s) => s.name === 'inner');
    expect(outer?.attributes[SESSION_ID_KEY]).toBe('chat_123');
    expect(outer?.attributes[END_USER_ID_KEY]).toBe('user_456');
    expect(inner?.attributes[SESSION_ID_KEY]).toBeUndefined();
    expect(inner?.attributes[END_USER_ID_KEY]).toBeUndefined();
  });

  it('nested identify() merges fields without clobbering the others', async () => {
    let seen: { s?: string; e?: string } = {};
    await identify({ sessionId: 'outer_sess', endUserId: 'outer_eu' }, async () => {
      await identify({ endUserId: 'inner_eu' }, async () => {
        seen = { s: currentSessionId(), e: currentEndUserId() };
      });
    });
    expect(seen.s).toBe('outer_sess'); // preserved from outer
    expect(seen.e).toBe('inner_eu'); // overridden by inner
  });

  it('restores the previous identity after identify() returns', async () => {
    expect(currentSessionId()).toBeUndefined();
    await identify({ sessionId: 's', endUserId: 'e', endUserMetadata: { a: 1 } }, async () => {
      expect(currentSessionId()).toBe('s');
      expect(currentEndUserId()).toBe('e');
      expect(currentEndUserMetadata()).toEqual({ a: 1 });
    });
    expect(currentSessionId()).toBeUndefined();
    expect(currentEndUserId()).toBeUndefined();
    expect(currentEndUserMetadata()).toBeUndefined();
  });

  it('identify() returns the callback result (sync and async)', async () => {
    expect(identify({ sessionId: 's' }, () => 7)).toBe(7);
    await expect(identify({ sessionId: 's' }, async () => 'v')).resolves.toBe('v');
  });
});

describe('init() no longer carries session identity', () => {
  it('trace() ignores any leftover sessionId on the session config', async () => {
    // init() no longer writes sessionId into the session config, and trace()
    // no longer reads it. Even if something set it, it must not leak onto spans.
    _setSessionConfig({ sessionId: 'should_be_ignored' });
    await trace({ name: 'no_session' }, async () => 'ok');

    const root = exporter.getFinishedSpans().find((s) => s.name === 'no_session');
    expect(root?.attributes[SESSION_ID_KEY]).toBeUndefined();
  });

  it('InitOptions has no session/end-user fields (type-level)', () => {
    // @ts-expect-error sessionId removed from InitOptions
    const a: import('../../src/types.js').InitOptions = { sessionId: 'x' };
    // @ts-expect-error endUserId removed from InitOptions
    const b: import('../../src/types.js').InitOptions = { endUserId: 'x' };
    // @ts-expect-error autoSession removed from InitOptions
    const c: import('../../src/types.js').InitOptions = { autoSession: true };
    void a; void b; void c;
  });
});

/**
 * Span-processor fallback: identify() reaches ANY root span, including framework
 * roots (openai-agents/strands/pi-agent) that open their own root without
 * stamping identity. NeatlogsSpanProcessor.onStart fills it in as a fallback;
 * explicit trace()/span() values still override, child spans are skipped.
 */
describe('span-processor identity fallback (framework roots)', () => {
  let fwProvider: NodeTracerProvider;
  let fwExporter: InMemorySpanExporter;

  beforeAll(async () => {
    const { NeatlogsSpanProcessor } = await import('../../src/core/span-processor.js');
    fwExporter = new InMemorySpanExporter();
    fwProvider = new NodeTracerProvider();
    fwProvider.addSpanProcessor(new NeatlogsSpanProcessor());
    fwProvider.addSpanProcessor(new SimpleSpanProcessor(fwExporter));
  });

  afterAll(async () => {
    await fwProvider.shutdown();
  });

  beforeEach(() => {
    fwExporter.reset();
    _setSessionConfig({});
  });

  it('stamps identify() onto a bare framework root', async () => {
    const { trace: otTrace } = await import('@opentelemetry/api');
    const tracer = fwProvider.getTracer('test');
    await identify({ sessionId: 'conv_fw', endUserId: 'u_fw' }, async () => {
      // Framework-style own root: a plain WORKFLOW root, no explicit stamp.
      tracer
        .startSpan('openai_agents.trace', {
          attributes: { 'openinference.span.kind': 'WORKFLOW' },
        })
        .end();
    });
    void otTrace;
    const root = fwExporter
      .getFinishedSpans()
      .find((s) => s.name === 'openai_agents.trace');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('conv_fw');
    expect(root?.attributes[END_USER_ID_KEY]).toBe('u_fw');
  });

  it('does not stamp identity on child spans', async () => {
    const { trace: otTrace, context: otCtx } = await import('@opentelemetry/api');
    const tracer = fwProvider.getTracer('test');
    await identify({ sessionId: 'conv_fw' }, async () => {
      const root = tracer.startSpan('root2', {
        attributes: { 'openinference.span.kind': 'WORKFLOW' },
      });
      const ctx = otTrace.setSpan(otCtx.active(), root);
      tracer
        .startSpan('child', { attributes: { 'openinference.span.kind': 'LLM' } }, ctx)
        .end();
      root.end();
    });
    const child = fwExporter.getFinishedSpans().find((s) => s.name === 'child');
    expect(child?.attributes[SESSION_ID_KEY]).toBeUndefined();
  });

  it('no-ops without an active identify()', async () => {
    const tracer = fwProvider.getTracer('test');
    tracer
      .startSpan('bare', { attributes: { 'openinference.span.kind': 'WORKFLOW' } })
      .end();
    const root = fwExporter.getFinishedSpans().find((s) => s.name === 'bare');
    expect(root?.attributes[SESSION_ID_KEY]).toBeUndefined();
  });
});
