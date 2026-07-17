import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TracerProvider } from '@opentelemetry/api';
import { InstrumentationManager } from '../../src/instrumentation/manager.js';

// Create a mock TracerProvider
function createMockProvider(): TracerProvider {
  return {
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(),
      startActiveSpan: vi.fn(),
    })),
  } as unknown as TracerProvider;
}

describe('InstrumentationManager', () => {
  let provider: TracerProvider;

  beforeEach(() => {
    provider = createMockProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should set provider from options', () => {
      const mgr = new InstrumentationManager({ provider });
      expect(mgr.instrumented).toEqual([]);
    });

    it('should default debug to false', () => {
      const mgr = new InstrumentationManager({ provider });
      // Access private field indirectly through behavior
      expect(mgr.instrumented).toEqual([]);
    });

    it('should accept debug option', () => {
      const mgr = new InstrumentationManager({ provider, debug: true });
      expect(mgr.instrumented).toEqual([]);
    });

    it('should accept excludedUrls option', () => {
      const mgr = new InstrumentationManager({
        provider,
        excludedUrls: ['http://example.com'],
      });
      expect(mgr.instrumented).toEqual([]);
    });
  });

  describe('instrumented getter', () => {
    it('should return empty array initially', () => {
      const mgr = new InstrumentationManager({ provider });
      expect(mgr.instrumented).toEqual([]);
    });

    it('should return a copy (not the internal array)', () => {
      const mgr = new InstrumentationManager({ provider });
      const a = mgr.instrumented;
      const b = mgr.instrumented;
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('instrument()', () => {
    it('should warn for unknown library', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await mgr.instrument(['totally_unknown_lib']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('totally_unknown_lib'),
      );
    });

    it('should skip libraries with no instrumentor available', async () => {
      // cohere has null openinference and null neatlogs in TS
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider, debug: true });
      await mgr.instrument(['cohere']);
      expect(mgr.instrumented).toEqual([]);
    });

    it('should reject OpenInference OpenAI auto-instrumentation', async () => {
      const mgr = new InstrumentationManager({ provider });
      await expect(mgr.instrument(['openai'])).rejects.toThrow(/wrapOpenAI/);
      expect(mgr.instrumented).toEqual([]);
    });

    it('should reject google_genai auto-instrumentation and name its wrapper', async () => {
      const mgr = new InstrumentationManager({ provider });
      await expect(mgr.instrument(['google_genai'])).rejects.toThrow(
        /wrapGoogleGenAI/,
      );
    });

    it('should handle multiple libraries gracefully', async () => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await expect(
        mgr.instrument(['openai', 'cohere', 'nonexistent']),
      ).rejects.toThrow(/openai/);
    });

    it('should not log instrumented message when nothing instrumented', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await mgr.instrument(['cohere']);
      // Should not have called info with "Instrumented:" since nothing was instrumented
      const instrCalls = infoSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('Instrumented:'),
      );
      expect(instrCalls).toHaveLength(0);
    });

    it('should handle empty libraries array', async () => {
      const mgr = new InstrumentationManager({ provider });
      await mgr.instrument([]);
      expect(mgr.instrumented).toEqual([]);
    });
  });

  describe('private-provider safety gate', () => {
    it('rejects a library whose auto-instrumentor drives the global context', async () => {
      const mgr = new InstrumentationManager({ provider });
      await expect(mgr.instrument(['openai'])).rejects.toThrow(
        /cannot guarantee isolation/,
      );
      // Names the explicit wrapper and makes clear there is no shared mode.
      await expect(mgr.instrument(['openai'])).rejects.toThrow(/wrapOpenAI/);
      await expect(mgr.instrument(['openai'])).rejects.toThrow(
        /does not support shared global-context instrumentation/,
      );
    });

    it('rejects BEFORE instrumenting any library in the batch', async () => {
      const mgr = new InstrumentationManager({ provider });
      // cohere (no-op) is fine but anthropic (loads OpenInference) is not — the
      // whole batch must be rejected up front so nothing gets partially patched.
      await expect(
        mgr.instrument(['cohere', 'anthropic']),
      ).rejects.toThrow(/anthropic/);
      expect(mgr.instrumented).toEqual([]);
    });

    it('does NOT reject a known library with no instrumentor (no-op entry)', async () => {
      // cohere has both openinference and neatlogs null — it patches nothing, so
      // nothing can leak; the gate must let it through (it simply skips).
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await expect(mgr.instrument(['cohere'])).resolves.toBeUndefined();
      expect(mgr.instrumented).toEqual([]);
    });

    it('does NOT reject an unknown library (nothing to instrument)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await expect(
        mgr.instrument(['totally_unknown_lib']),
      ).resolves.toBeUndefined();
    });
  });

  describe('disable() lifecycle', () => {
    it('is a no-op when nothing was instrumented and clears state', () => {
      const mgr = new InstrumentationManager({ provider });
      expect(() => mgr.disable()).not.toThrow();
      expect(mgr.instrumented).toEqual([]);
    });

  });
});
