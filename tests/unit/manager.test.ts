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

    it('should instrument openai via OpenInference when packages are installed', async () => {
      // openai has openinference set and both @arizeai/openinference-instrumentation-openai
      // and the openai package are real dependencies, so it instruments successfully.
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await mgr.instrument(['openai']);
      // Should not crash and openai should be instrumented via OpenInference
      expect(mgr.instrumented).toContain('openai');
    });

    it('should handle google_genai with no neatlogs custom instrumentor', async () => {
      // google_genai has neatlogs set to null (external package)
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await mgr.instrument(['google_genai']);
      // Should not throw, but won't instrument since no package is available in test env
    });

    it('should handle multiple libraries gracefully', async () => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mgr = new InstrumentationManager({ provider });
      await mgr.instrument(['openai', 'cohere', 'nonexistent']);
      // None should be instrumented in test env since packages aren't available
      // But it should not throw
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
});
