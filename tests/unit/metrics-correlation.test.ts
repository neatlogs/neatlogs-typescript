import { describe, it, expect } from 'vitest';
import {
  extractTokenUsage,
  calculateCost,
  MetricEmitter,
} from '../../src/core/metrics-correlation.js';

describe('metrics-correlation', () => {
  describe('extractTokenUsage', () => {
    it('should extract from OpenInference attributes', () => {
      const usage = extractTokenUsage({
        'llm.token_count.prompt': 100,
        'llm.token_count.completion': 50,
        'llm.token_count.total': 150,
      });
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
    });

    it('should extract from gen_ai attributes', () => {
      const usage = extractTokenUsage({
        'gen_ai.usage.input_tokens': 200,
        'gen_ai.usage.output_tokens': 80,
      });
      expect(usage.promptTokens).toBe(200);
      expect(usage.completionTokens).toBe(80);
      expect(usage.totalTokens).toBe(280); // calculated sum
    });

    it('should extract from llm.usage attributes', () => {
      const usage = extractTokenUsage({
        'llm.usage.prompt_tokens': 300,
        'llm.usage.completion_tokens': 100,
        'llm.usage.total_tokens': 400,
      });
      expect(usage.promptTokens).toBe(300);
      expect(usage.completionTokens).toBe(100);
      expect(usage.totalTokens).toBe(400);
    });

    it('should prefer OpenInference over gen_ai', () => {
      const usage = extractTokenUsage({
        'llm.token_count.prompt': 100,
        'gen_ai.usage.input_tokens': 999,
      });
      expect(usage.promptTokens).toBe(100);
    });

    it('should return zeros for empty attributes', () => {
      const usage = extractTokenUsage({});
      expect(usage.promptTokens).toBe(0);
      expect(usage.completionTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
    });

    it('should handle string values', () => {
      const usage = extractTokenUsage({
        'llm.token_count.prompt': '100',
        'llm.token_count.completion': '50',
      });
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
    });

    it('should compute total from prompt + completion if total is missing', () => {
      const usage = extractTokenUsage({
        'llm.token_count.prompt': 100,
        'llm.token_count.completion': 50,
      });
      expect(usage.totalTokens).toBe(150);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for known model', () => {
      const cost = calculateCost('gpt-4o', 1000, 500);
      expect(cost).toBeGreaterThan(0);
      // gpt-4o: 2.5e-6 prompt, 10e-6 completion
      expect(cost).toBeCloseTo(1000 * 2.5e-6 + 500 * 10e-6, 8);
    });

    it('should use prefix matching for versioned models', () => {
      const cost = calculateCost('gpt-4o-2024-05-13', 1000, 500);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeCloseTo(1000 * 2.5e-6 + 500 * 10e-6, 8);
    });

    it('should return 0 for unknown model', () => {
      expect(calculateCost('unknown-model-xyz', 1000, 500)).toBe(0);
    });

    it('should return 0 for empty model', () => {
      expect(calculateCost('', 1000, 500)).toBe(0);
    });

    it('should be case-insensitive', () => {
      const cost1 = calculateCost('GPT-4o', 1000, 500);
      const cost2 = calculateCost('gpt-4o', 1000, 500);
      expect(cost1).toBe(cost2);
    });

    it('should calculate cost for Claude models', () => {
      const cost = calculateCost('claude-3-5-sonnet-20241022', 1000, 500);
      // claude-3-5-sonnet: 3e-6 prompt, 15e-6 completion
      expect(cost).toBeCloseTo(1000 * 3e-6 + 500 * 15e-6, 8);
    });

    it('should calculate cost for Gemini models', () => {
      const cost = calculateCost('gemini-1.5-pro', 1000, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it('should handle zero tokens', () => {
      expect(calculateCost('gpt-4o', 0, 0)).toBe(0);
    });

    it('should use longest prefix match', () => {
      // gpt-4o-mini should match gpt-4o-mini (more specific) not gpt-4o
      const cost = calculateCost('gpt-4o-mini', 1000, 500);
      // gpt-4o-mini: 0.15e-6 prompt, 0.6e-6 completion
      expect(cost).toBeCloseTo(1000 * 0.15e-6 + 500 * 0.6e-6, 8);
    });
  });

  describe('MetricEmitter', () => {
    it('should emit metric points with trace context', () => {
      const exported: any[] = [];
      const exporter = {
        exportMetrics(points: any[]) {
          exported.push(...points);
        },
      };
      const emitter = new MetricEmitter(exporter);

      emitter.emit({
        metricName: 'test.counter',
        metricType: 'sum',
        value: 42,
        unit: 'tokens',
        description: 'Test counter',
        traceId: 'abc123',
        spanId: 'def456',
      });

      expect(exported).toHaveLength(1);
      expect(exported[0].metricName).toBe('test.counter');
      expect(exported[0].value).toBe(42);
      expect(exported[0].traceId).toBe('abc123');
      expect(exported[0].spanId).toBe('def456');
    });

    it('should not emit without trace context', () => {
      const exported: any[] = [];
      const exporter = {
        exportMetrics(points: any[]) {
          exported.push(...points);
        },
      };
      const emitter = new MetricEmitter(exporter);

      emitter.emit({
        metricName: 'test.counter',
        metricType: 'sum',
        value: 42,
        unit: 'tokens',
        description: 'Test counter',
      });

      expect(exported).toHaveLength(0);
    });

    it('should swallow exporter errors', () => {
      const exporter = {
        exportMetrics() {
          throw new Error('boom');
        },
      };
      const emitter = new MetricEmitter(exporter);

      // Should not throw
      expect(() =>
        emitter.emit({
          metricName: 'test.counter',
          metricType: 'sum',
          value: 42,
          unit: 'tokens',
          description: 'Test',
          traceId: 'abc',
          spanId: 'def',
        }),
      ).not.toThrow();
    });
  });
});
