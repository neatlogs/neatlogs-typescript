import { describe, it, expect } from 'vitest';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import { suppressTracing, isTracingSuppressed } from '@opentelemetry/core';

// NOTE: The dedicated `src/instrumentation/http-context-propagation.ts` module
// (and its exported `SUPPRESS_INSTRUMENTATION_KEY` symbol) was intentionally
// removed in commit 09d5c15 ("detaches AI SDK spans from Next.js parent context
// and filter Next.js noise spans at export layer"). SDK self-instrumentation
// suppression is now handled directly via `suppressTracing` from
// `@opentelemetry/core` (see src/prompt/client.ts `_request`), rather than via a
// custom HTTP context-propagation layer. These tests pin that current contract.
describe('http-context-propagation', () => {
  describe('OTel instrumentation suppression for SDK HTTP calls', () => {
    it('suppressTracing marks a context as suppressed', () => {
      const suppressed = suppressTracing(ROOT_CONTEXT);
      expect(isTracingSuppressed(suppressed)).toBe(true);
    });

    it('an un-suppressed (root) context is not suppressed', () => {
      expect(isTracingSuppressed(ROOT_CONTEXT)).toBe(false);
    });

    it('returns a new context without mutating the original', () => {
      const suppressed = suppressTracing(ROOT_CONTEXT);
      expect(suppressed).not.toBe(ROOT_CONTEXT);
      expect(isTracingSuppressed(ROOT_CONTEXT)).toBe(false);
    });
  });
});
