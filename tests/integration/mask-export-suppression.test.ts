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
function makeIsolatedProvider(mask?: MaskFunction, maskTimeoutMs?: number) {
  const memExporter = new InMemorySpanExporter();
  const filteringExporter = new FilteringExporter(memExporter);
  const provider = new NodeTracerProvider();
  const neatlogsProcessor = new NeatlogsSpanProcessor({ mask, maskTimeoutMs, debug: false });
  provider.addSpanProcessor(neatlogsProcessor);
  provider.addSpanProcessor(new SimpleSpanProcessor(filteringExporter));
  // NOTE: provider.register() is NOT called — we use provider.getTracer() directly
  // to avoid overwriting the global tracer provider between tests.
  return { provider, exporter: memExporter, filteringExporter, neatlogsProcessor };
}

describe('MaskFunction null-return: "drop span" behaviour', () => {
  /**
   * TC-MASK-1: Global mask returning null suppresses span export.
   */
  it('global mask returning null drops the span from export', async () => {
    const dropAllMask: MaskFunction = (_spanData) => null;
    const { provider, exporter, filteringExporter } = makeIsolatedProvider(dropAllMask);

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
    expect(filteringExporter.health()).toEqual({ droppedSpans: 1, exportFailures: 0 });

    await provider.shutdown();
    _clearMaskRegistry();
  });

  /**
   * TC-MASK-2: Global mask modifying span data — modifications are written
   * back to the OTel span via NeatlogsSpanProcessor's attribute write-back.
   */
  it('async masking redacts only the exported clone and leaves the application value unchanged', async () => {
    const applicationValue = { secret: 'sentinel-secret' };
    const addFlagMask: MaskFunction = (spanData) => ({
      ...spanData,
      attributes: {
        ...spanData.attributes,
        'original.attr': '[REDACTED]',
        'masked.was.applied': 'yes',
      },
    });
    const { provider, exporter } = makeIsolatedProvider(addFlagMask);

    const tracer = provider.getTracer('tc-mask-2');
    await new Promise<void>((resolve) => {
      tracer.startActiveSpan('modify-span', (span) => {
        span.setAttribute('original.attr', applicationValue.secret);
        span.end();
        resolve();
      });
    });

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const target = spans.find(s => s.name === 'modify-span');
    expect(target).toBeDefined();
    // Mask modifications are written back to the OTel span attributes
    expect(target!.attributes['masked.was.applied']).toBe('yes');
    expect(target!.attributes['original.attr']).toBe('[REDACTED]');
    expect(applicationValue.secret).toBe('sentinel-secret');

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

  it('rejecting mask fails closed and the exporter remains healthy', async () => {
    const { provider, exporter, filteringExporter } = makeIsolatedProvider();
    const tracer = provider.getTracer('tc-mask-health');
    const rejectId = registerMask(async () => { throw new Error('controlled failure'); });
    const safeId = registerMask((data) => ({ ...data, name: 'safe-after-failure' }));
    const failed = tracer.startSpan('must-not-export');
    failed.setAttribute('neatlogs.mask_id', rejectId);
    failed.end();
    const healthy = tracer.startSpan('health-check');
    healthy.setAttribute('neatlogs.mask_id', safeId);
    healthy.end();
    await provider.forceFlush();
    expect(exporter.getFinishedSpans().map((span) => span.name)).toEqual(['safe-after-failure']);
    expect(filteringExporter.health()).toEqual({ droppedSpans: 1, exportFailures: 0 });
    await provider.shutdown();
    _clearMaskRegistry();
  });

  it('times out fail-closed and flush waits for the masking decision', async () => {
    const never: MaskFunction = () => new Promise(() => {});
    const { provider, exporter } = makeIsolatedProvider(never, 20);
    provider.getTracer('tc-mask-timeout').startSpan('timeout-sentinel').end();
    const started = Date.now();
    await provider.forceFlush();
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
    expect(exporter.getFinishedSpans()).toHaveLength(0);
    await provider.shutdown();
    _clearMaskRegistry();
  });
});
