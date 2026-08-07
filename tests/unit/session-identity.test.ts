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
import {
  PARENT_SESSION_ID_KEY,
  SESSION_ENTRY_POINT_KEY,
  SESSION_FEATURE_NAME_KEY,
  SESSION_ID_KEY,
} from '../../src/core/session.js';
import { END_USER_ID_KEY, END_USER_METADATA_KEY } from '../../src/core/end-user.js';
import {
  identify,
  currentSessionId,
  currentParentSessionId,
  currentSessionFeatureName,
  currentSessionEntryPoint,
  currentEndUserId,
  currentEndUserMetadata,
} from '../../src/core/identity.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';

let provider: NodeTracerProvider;
let exporter: InMemorySpanExporter;

beforeAll(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  _setNeatlogsProvider(provider);
});

afterAll(async () => {
  _setNeatlogsProvider(null);
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

  it('stamps trimmed session lineage and origin fields on a trace() root', async () => {
    await trace(
      {
        name: 'delegated_turn',
        sessionId: 'child_123',
        parentSessionId: '  parent_456  ',
        sessionFeatureName: '  copilot  ',
        sessionEntryPoint: '  api  ',
      },
      async () => 'ok',
    );

    const root = exporter.getFinishedSpans().find((s) => s.name === 'delegated_turn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('child_123');
    expect(root?.attributes[PARENT_SESSION_ID_KEY]).toBe('parent_456');
    expect(root?.attributes[SESSION_FEATURE_NAME_KEY]).toBe('copilot');
    expect(root?.attributes[SESSION_ENTRY_POINT_KEY]).toBe('api');
  });

  it('ignores empty values and a parent equal to the current session', async () => {
    await trace(
      {
        name: 'self_parented_turn',
        sessionId: 'same_123',
        parentSessionId: '  same_123  ',
        sessionFeatureName: '   ',
        sessionEntryPoint: '',
      },
      async () => 'ok',
    );

    const root = exporter.getFinishedSpans().find((s) => s.name === 'self_parented_turn');
    expect(root?.attributes[PARENT_SESSION_ID_KEY]).toBeUndefined();
    expect(root?.attributes[SESSION_FEATURE_NAME_KEY]).toBeUndefined();
    expect(root?.attributes[SESSION_ENTRY_POINT_KEY]).toBeUndefined();
  });

  it('ignores malformed optional values without breaking the trace', async () => {
    await expect(
      trace(
        {
          name: 'malformed_session_context',
          sessionId: 'session_123',
          parentSessionId: 42,
          sessionFeatureName: {},
          sessionEntryPoint: false,
        } as any,
        async () => 'ok',
      ),
    ).resolves.toBe('ok');

    const root = exporter.getFinishedSpans().find((s) => s.name === 'malformed_session_context');
    expect(root?.attributes[PARENT_SESSION_ID_KEY]).toBeUndefined();
    expect(root?.attributes[SESSION_FEATURE_NAME_KEY]).toBeUndefined();
    expect(root?.attributes[SESSION_ENTRY_POINT_KEY]).toBeUndefined();
  });

  it('stamps explicit session fields via the span() decorator on a WORKFLOW root', async () => {
    const handleTurn = span(
      {
        kind: 'WORKFLOW',
        name: 'handleTurn',
        sessionId: 'chat_123',
        parentSessionId: 'parent_123',
        sessionFeatureName: 'copilot',
        sessionEntryPoint: 'api',
      },
      () => 42,
    );

    handleTurn();

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'handleTurn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('chat_123');
    expect(root?.attributes[PARENT_SESSION_ID_KEY]).toBe('parent_123');
    expect(root?.attributes[SESSION_FEATURE_NAME_KEY]).toBe('copilot');
    expect(root?.attributes[SESSION_ENTRY_POINT_KEY]).toBe('api');
  });

  it('ignores explicit session fields on a nested span() child', async () => {
    const child = span(
      {
        kind: 'TOOL',
        name: 'nestedTool',
        sessionId: 'child_session',
        parentSessionId: 'child_parent',
        sessionFeatureName: 'child_feature',
        sessionEntryPoint: 'child_entry',
      },
      () => 42,
    );

    await trace({ name: 'outer', sessionId: 'root_session' }, async () => child());

    const nested = exporter.getFinishedSpans().find((s) => s.name === 'nestedTool');
    expect(nested?.attributes[SESSION_ID_KEY]).toBeUndefined();
    expect(nested?.attributes[PARENT_SESSION_ID_KEY]).toBeUndefined();
    expect(nested?.attributes[SESSION_FEATURE_NAME_KEY]).toBeUndefined();
    expect(nested?.attributes[SESSION_ENTRY_POINT_KEY]).toBeUndefined();
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

  it('stamps request-scoped session lineage and origin fields from identify()', async () => {
    await identify(
      {
        sessionId: 'child_ctx',
        parentSessionId: ' parent_ctx ',
        sessionFeatureName: ' assistant ',
        sessionEntryPoint: ' web ',
      },
      async () => {
        expect(currentParentSessionId()).toBe(' parent_ctx ');
        expect(currentSessionFeatureName()).toBe(' assistant ');
        expect(currentSessionEntryPoint()).toBe(' web ');
        await trace({ name: 'context_turn' }, async () => 'ok');
      },
    );

    const root = exporter.getFinishedSpans().find((s) => s.name === 'context_turn');
    expect(root?.attributes[PARENT_SESSION_ID_KEY]).toBe('parent_ctx');
    expect(root?.attributes[SESSION_FEATURE_NAME_KEY]).toBe('assistant');
    expect(root?.attributes[SESSION_ENTRY_POINT_KEY]).toBe('web');
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
    await identify({
      sessionId: 'ctx_sess',
      parentSessionId: 'ctx_parent',
      sessionFeatureName: 'ctx_feature',
      sessionEntryPoint: 'ctx_entry',
      endUserId: 'ctx_eu',
    }, async () => {
      await trace(
        {
          name: 'chat_turn',
          sessionId: 'call_sess',
          parentSessionId: 'call_parent',
          sessionFeatureName: 'call_feature',
          sessionEntryPoint: 'call_entry',
          endUserId: 'call_eu',
        },
        async () => 'ok',
      );
    });

    const root = exporter.getFinishedSpans().find((s) => s.name === 'chat_turn');
    expect(root?.attributes[SESSION_ID_KEY]).toBe('call_sess');
    expect(root?.attributes[PARENT_SESSION_ID_KEY]).toBe('call_parent');
    expect(root?.attributes[SESSION_FEATURE_NAME_KEY]).toBe('call_feature');
    expect(root?.attributes[SESSION_ENTRY_POINT_KEY]).toBe('call_entry');
    expect(root?.attributes[END_USER_ID_KEY]).toBe('call_eu');
  });

  it('does not stamp identify() identity on a nested child span', async () => {
    await identify({
      sessionId: 'chat_123',
      parentSessionId: 'parent_123',
      sessionFeatureName: 'chat',
      sessionEntryPoint: 'web',
      endUserId: 'user_456',
    }, async () => {
      await trace({ name: 'outer' }, async () => {
        await trace({ name: 'inner' }, async () => 'deep');
      });
    });

    const spans = exporter.getFinishedSpans();
    const outer = spans.find((s) => s.name === 'outer');
    const inner = spans.find((s) => s.name === 'inner');
    expect(outer?.attributes[SESSION_ID_KEY]).toBe('chat_123');
    expect(outer?.attributes[PARENT_SESSION_ID_KEY]).toBe('parent_123');
    expect(outer?.attributes[SESSION_FEATURE_NAME_KEY]).toBe('chat');
    expect(outer?.attributes[SESSION_ENTRY_POINT_KEY]).toBe('web');
    expect(outer?.attributes[END_USER_ID_KEY]).toBe('user_456');
    expect(inner?.attributes[SESSION_ID_KEY]).toBeUndefined();
    expect(inner?.attributes[PARENT_SESSION_ID_KEY]).toBeUndefined();
    expect(inner?.attributes[SESSION_FEATURE_NAME_KEY]).toBeUndefined();
    expect(inner?.attributes[SESSION_ENTRY_POINT_KEY]).toBeUndefined();
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
    await identify({
      sessionId: 'conv_fw',
      parentSessionId: 'parent_fw',
      sessionFeatureName: 'agent_framework',
      sessionEntryPoint: 'worker',
      endUserId: 'u_fw',
    }, async () => {
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
    expect(root?.attributes[PARENT_SESSION_ID_KEY]).toBe('parent_fw');
    expect(root?.attributes[SESSION_FEATURE_NAME_KEY]).toBe('agent_framework');
    expect(root?.attributes[SESSION_ENTRY_POINT_KEY]).toBe('worker');
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
