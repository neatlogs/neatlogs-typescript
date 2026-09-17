import { describe, it, expect, afterEach } from 'vitest';
import {
  spanLimitsForCaptureEverything,
  DEFAULT_MAX_SPAN_ATTRIBUTES,
} from '../../src/constants.js';

describe('spanLimitsForCaptureEverything', () => {
  const ORIGINAL_SPAN = process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT;
  const ORIGINAL_GENERAL = process.env.OTEL_ATTRIBUTE_COUNT_LIMIT;

  afterEach(() => {
    if (ORIGINAL_SPAN === undefined) delete process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT;
    else process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT = ORIGINAL_SPAN;
    if (ORIGINAL_GENERAL === undefined) delete process.env.OTEL_ATTRIBUTE_COUNT_LIMIT;
    else process.env.OTEL_ATTRIBUTE_COUNT_LIMIT = ORIGINAL_GENERAL;
  });

  it('raises the budget when no OTel env limits are set', () => {
    delete process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT;
    delete process.env.OTEL_ATTRIBUTE_COUNT_LIMIT;
    expect(spanLimitsForCaptureEverything()).toEqual({
      attributeCountLimit: DEFAULT_MAX_SPAN_ATTRIBUTES,
    });
  });

  it('respects OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT by leaving the limit unset', () => {
    process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT = '64';
    expect(spanLimitsForCaptureEverything()).toEqual({});
  });

  it('respects OTEL_ATTRIBUTE_COUNT_LIMIT by leaving the limit unset', () => {
    process.env.OTEL_ATTRIBUTE_COUNT_LIMIT = '64';
    expect(spanLimitsForCaptureEverything()).toEqual({});
  });

  it('treats whitespace-only env values as unset', () => {
    process.env.OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT = '   ';
    process.env.OTEL_ATTRIBUTE_COUNT_LIMIT = ' ';
    expect(spanLimitsForCaptureEverything()).toEqual({
      attributeCountLimit: DEFAULT_MAX_SPAN_ATTRIBUTES,
    });
  });
});
