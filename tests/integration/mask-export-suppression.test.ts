/**
 * Integration test: verify that a MaskFunction returning null
 * suppresses span export as documented in README.md and types.ts.
 *
 * Documented API contract (README.md lines ~530-534, types.ts MaskFunction):
 *   "Return null to drop the span entirely"
 *
 * KEY DESIGN: Each test uses provider.getTracer() directly (NOT
 * otelTrace.getTracer() from the global API) so tests are isolated from
 * the global OTel provider and do not contaminate each other.
 */
import { describe, it, expect } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NeatlogsSpanProcessor } from '../../src/core/span-processor.js';
import { FilteringExporter } from '../../src/core/filtering-exporter.js';
import { registerMask, _clearMaskRegistry } from '../../src/core/mask.js';
import type { MaskFunction } from '../../src/types.js';

/**
 * Build an isolated provider + exporter without touching the global OTel state.
 *
 * NeatlogsSpanProcessor is added FIRST so its onEnd() runs before the
 * SimpleSpanProcessor. When the mask returns null, NeatlogsSpanProcessor
 * writes `neatlogs.dropped = true` to the span's attributes. The
 * FilteringExporter wrapper then filters out those spans before they
 * reach the InMemorySpanExporter.
 */
function makeIsolatedProvider(mask?: MaskFunction) {
  const memExporter = new InMemorySpanExporter();
  const filteringExporter = new FilteringExporter(memExporter);
  const provider = new NodeTracerProvider();
  const neatlogsProcessor = new NeatlogsSpanProcessor({ mask, debug: false });
  provider.addSpanProcessor(neatlogsProcessor);
  provider.addSpanProcessor(new SimpleSpanProcessor(filteringExporter));
  // NOTE: provider.register() is NOT called — we use provider.getTracer() directly
  // to avoid overwriting the global tracer provider between tests.
  return { provider, exporter: memExporter, neatlogsProcessor };
}

describe('MaskFunction null-return: "drop span" behaviour', () => {
  it('awaits async masking and applies it to events and resource attributes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const asyncMask: MaskFunction = async (spanData) => {
      await gate;
      return {
        ...spanData,
        name: `masked:${spanData.name}`,
        attributes: { visible: 'yes' },
        resource: { attributes: { 'service.name': 'redacted-service' } },
        events: spanData.events.map((event: Record<string, any>) => ({
          ...event,
          attributes: { redacted: true },
        })),
      };
    };
    const { provider, exporter } = makeIsolatedProvider(asyncMask);
    const tracer = provider.getTracer('tc-mask-async');
    const span = tracer.startSpan('sensitive-span');
    span.setAttribute('secret', 'do-not-export');
    span.addEvent('chunk', { secret: 'event-secret' });
    span.end();

    // Ending application work is not blocked by the unresolved masking task.
    expect(exporter.getFinishedSpans()).toEqual([]);
    release();
    await provider.forceFlush();

    const exported = exporter
      .getFinishedSpans()
      .find((item) => item.name === 'masked:sensitive-span');
    expect(exported?.attributes).toEqual({ visible: 'yes' });
    expect(exported?.events[0].attributes).toEqual({ redacted: true });
    expect(exported?.resource.attributes).toEqual({
      'service.name': 'redacted-service',
    });
    await provider.shutdown();
    _clearMaskRegistry();
  });

  it('drops a span when an async mask rejects', async () => {
    const failingMask: MaskFunction = async () => {
      throw new Error('redactor unavailable');
    };
    const { provider, exporter } = makeIsolatedProvider(failingMask);
    provider.getTracer('tc-mask-failure').startSpan('must-not-leak').end();

    await provider.forceFlush();

    expect(exporter.getFinishedSpans().some((span) => span.name === 'must-not-leak')).toBe(false);
    await provider.shutdown();
    _clearMaskRegistry();
  });

  /**
   * TC-MASK-1: Global mask returning null suppresses span export.
   */
  it('global mask returning null drops the span from export', async () => {
    const dropAllMask: MaskFunction = (_spanData) => null;
    const { provider, exporter } = makeIsolatedProvider(dropAllMask);

    const tracer = provider.getTracer('tc-mask-1');
    await new Promise<void>((resolve) => {
      tracer.startActiveSpan('should-be-dropped', (span) => {
        span.setAttribute('test.value', 'hello');
        span.end();
        resolve();
      });
    });
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    // Mask returned null → span should be dropped entirely
    expect(spans.length).toBe(0);

    await provider.shutdown();
    _clearMaskRegistry();
  });

  /**
   * TC-MASK-2: Global mask modifying span data — modifications are written
   * back to the OTel span via NeatlogsSpanProcessor's attribute write-back.
   */
  it('mask attribute modifications are written back to the OTel span', async () => {
    const addFlagMask: MaskFunction = (spanData) => ({
      ...spanData,
      attributes: { ...spanData.attributes, 'masked.was.applied': 'yes' },
    });
    const { provider, exporter } = makeIsolatedProvider(addFlagMask);

    const tracer = provider.getTracer('tc-mask-2');
    await new Promise<void>((resolve) => {
      tracer.startActiveSpan('modify-span', (span) => {
        span.setAttribute('original.attr', 'value');
        span.end();
        resolve();
      });
    });
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const target = spans.find((s) => s.name === 'modify-span');
    expect(target).toBeDefined();
    // Mask modifications are written back to the OTel span attributes
    expect(target!.attributes['masked.was.applied']).toBe('yes');

    await provider.shutdown();
    _clearMaskRegistry();
  });

  /**
   * TC-MASK-3: Per-span mask (set via neatlogs.mask_id attribute) returning null
   * also suppresses export.
   */
  it('per-span mask returning null drops the span from export', async () => {
    const dropMask: MaskFunction = () => null;
    const { provider, exporter } = makeIsolatedProvider(); // no global mask

    const tracer = provider.getTracer('tc-mask-3');
    await new Promise<void>((resolve) => {
      tracer.startActiveSpan('per-span-dropped', (span) => {
        // Simulate what span()/trace() does when mask option is provided:
        const maskId = registerMask(dropMask);
        span.setAttribute('neatlogs.mask_id', maskId);
        span.end();
        resolve();
      });
    });
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    // Per-span mask returned null → span should be dropped
    expect(spans.length).toBe(0);

    await provider.shutdown();
    _clearMaskRegistry();
  });

  /**
   * TC-MASK-4: Positive control — mask that modifies and returns data
   * does not prevent export (expected correct behaviour).
   */
  it('mask that modifies and returns data does not prevent export (positive control)', async () => {
    const redactMask: MaskFunction = (spanData) => ({
      ...spanData,
      name: 'REDACTED',
    });
    const { provider, exporter } = makeIsolatedProvider(redactMask);

    const tracer = provider.getTracer('tc-mask-4');
    await new Promise<void>((resolve) => {
      tracer.startActiveSpan('original-name', (span) => {
        span.end();
        resolve();
      });
    });
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    // Span is exported — mask modified but did not drop it
    expect(spans.length).toBeGreaterThan(0);

    await provider.shutdown();
    _clearMaskRegistry();
  });
});
