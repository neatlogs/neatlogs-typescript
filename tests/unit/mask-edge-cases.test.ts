/**
 * Additional edge-case tests for core/mask.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerMask,
  applyMask,
  _clearMaskRegistry,
} from '../../src/core/mask.js';

describe('mask edge cases', () => {
  beforeEach(() => {
    _clearMaskRegistry();
  });

  describe('registerMask', () => {
    it('should return incrementing keys', () => {
      const fn1 = (data: Record<string, any>) => data;
      const fn2 = (data: Record<string, any>) => data;
      const fn3 = (data: Record<string, any>) => data;
      const key1 = registerMask(fn1);
      const key2 = registerMask(fn2);
      const key3 = registerMask(fn3);
      expect(Number(key2)).toBeGreaterThan(Number(key1));
      expect(Number(key3)).toBeGreaterThan(Number(key2));
    });
  });

  describe('applyMask', () => {
    it('should return original data when mask returns undefined', () => {
      const mask = () => undefined as any;
      const spanData = { name: 'test', attributes: {} };
      const result = applyMask(spanData, mask);
      expect(result).toBe(spanData);
    });

    it('should handle per-span mask that modifies attributes deeply', () => {
      const perSpanMask = (data: Record<string, any>) => {
        const copy = { ...data };
        copy.attributes = {
          ...copy.attributes,
          'sensitive.data': '[REDACTED]',
        };
        return copy;
      };
      const maskId = registerMask(perSpanMask);
      const spanData = {
        name: 'sensitive-span',
        attributes: {
          'neatlogs.mask_id': maskId,
          'sensitive.data': 'secret-password',
        },
      };
      const result = applyMask(spanData, null);
      expect(result.attributes['sensitive.data']).toBe('[REDACTED]');
    });

    it('should handle mask that adds new attributes', () => {
      const mask = (data: Record<string, any>) => ({
        ...data,
        extra: 'added-by-mask',
      });
      const spanData = { name: 'test', attributes: {} };
      const result = applyMask(spanData, mask);
      expect(result.extra).toBe('added-by-mask');
    });

    it('should handle mask that removes attributes', () => {
      const mask = (data: Record<string, any>) => {
        const { secret, ...rest } = data;
        return rest;
      };
      const spanData = { name: 'test', secret: 'hidden', attributes: {} };
      const result = applyMask(spanData, mask);
      expect(result.secret).toBeUndefined();
      expect(result.name).toBe('test');
    });

    it('should prefer per-span mask even when it returns the same data', () => {
      let perSpanCalled = false;
      let globalCalled = false;

      const perSpanMask = (data: Record<string, any>) => {
        perSpanCalled = true;
        return data;
      };
      const globalMask = (data: Record<string, any>) => {
        globalCalled = true;
        return data;
      };

      const maskId = registerMask(perSpanMask);
      const spanData = {
        name: 'test',
        attributes: { 'neatlogs.mask_id': maskId },
      };
      applyMask(spanData, globalMask);
      expect(perSpanCalled).toBe(true);
      expect(globalCalled).toBe(false);
    });

    it('should handle spanData with missing attributes key', () => {
      const mask = (data: Record<string, any>) => data;
      const spanData = { name: 'test' } as any;
      const result = applyMask(spanData, mask);
      expect(result).toBe(spanData);
    });

    it('should handle null spanData gracefully', () => {
      // applyMask checks spanData?.attributes, so null is handled
      const result = applyMask(null as any, null);
      expect(result).toBeNull();
    });
  });

  describe('_clearMaskRegistry', () => {
    it('should reset ID counter so new masks start from 1', () => {
      registerMask((d) => d);
      registerMask((d) => d);
      _clearMaskRegistry();
      const key = registerMask((d) => d);
      expect(key).toBe('1');
    });
  });
});
