import { describe, expect, it } from 'vitest';
import {
  TraceFlags,
  createTraceState,
} from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { injectTraceContext } from '../../src/core/propagation.js';
import {
  _setNeatlogsProvider,
  getActiveNeatlogsSpan,
  getNeatlogsParentContext,
  getNeatlogsRootSpan,
  getNeatlogsTracer,
  withNeatlogsSpan,
} from '../../src/core/provider.js';
import { extractTraceContext } from '../../src/core/propagation.js';

describe('private Neatlogs W3C propagation', () => {
  it('injects no headers when no private span is active', () => {
    const carrier: Record<string, string> = {};
    expect(injectTraceContext(carrier)).toBe(false);
    expect(carrier).toEqual({});
  });

  it('injects the private span without consulting global OTel context', () => {
    const provider = new BasicTracerProvider();
    _setNeatlogsProvider(provider);
    const span = provider.getTracer('test').startSpan('private-parent');
    const context = span.spanContext();
    const carrier: Record<string, string> = {};

    const injected = withNeatlogsSpan(span, () =>
      injectTraceContext(carrier),
    );

    expect(injected).toBe(true);
    expect(carrier.traceparent).toBe(
      `00-${context.traceId}-${context.spanId}-${
        context.traceFlags & TraceFlags.SAMPLED ? '01' : '00'
      }`,
    );
    span.end();
    _setNeatlogsProvider(null);
  });

  it('supports Headers-like carriers and tracestate', () => {
    const carrier = new Map<string, string>();
    const span = {
      spanContext: () => ({
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        traceFlags: TraceFlags.SAMPLED,
        traceState: createTraceState('vendor=value'),
      }),
    };
    const provider = new BasicTracerProvider();
    _setNeatlogsProvider(provider);

    const injected = withNeatlogsSpan(span as never, () =>
      injectTraceContext({
        set(name, value) {
          carrier.set(name, value);
        },
      }),
    );

    expect(injected).toBe(true);
    expect(carrier.get('traceparent')).toBe(
      '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    );
    expect(carrier.get('tracestate')).toBe('vendor=value');
    _setNeatlogsProvider(null);
  });

  it('extracts a remote parent without changing the process-global context', () => {
    const provider = new BasicTracerProvider();
    _setNeatlogsProvider(provider);
    const traceId = '0123456789abcdef0123456789abcdef';
    const spanId = 'fedcba9876543210';

    extractTraceContext(
      new Headers({
        traceparent: `00-${traceId}-${spanId}-01`,
        tracestate: 'vendor=value',
      }),
      () => {
        const remote = getActiveNeatlogsSpan()?.spanContext();
        expect(remote).toMatchObject({ traceId, spanId, isRemote: true });
        expect(remote?.traceState?.serialize()).toBe('vendor=value');
        expect(getNeatlogsRootSpan()).toBeUndefined();

        const child = getNeatlogsTracer('test').startSpan(
          'local-child',
          undefined,
          getNeatlogsParentContext(),
        );
        expect(child.spanContext().traceId).toBe(traceId);
        withNeatlogsSpan(child, () => {
          expect(getNeatlogsRootSpan()).toBe(child);
        });
        child.end();
      },
    );

    _setNeatlogsProvider(null);
  });

  it('ignores malformed or zero trace parents', () => {
    let calls = 0;
    for (const traceparent of [
      'not-a-traceparent',
      '00-00000000000000000000000000000000-0123456789abcdef-01',
      '00-0123456789abcdef0123456789abcdef-0000000000000000-01',
    ]) {
      extractTraceContext({ traceparent }, () => {
        calls += 1;
        expect(getActiveNeatlogsSpan()).toBeUndefined();
      });
    }
    expect(calls).toBe(3);
  });
});
