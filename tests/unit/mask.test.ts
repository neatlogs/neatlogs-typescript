import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerMask,
  applyMask,
  _clearMaskRegistry,
} from '../../src/core/mask.js';

describe('mask', () => {
  beforeEach(() => {
    _clearMaskRegistry();
  });

  describe('registerMask', () => {
    it('should return a unique key for each registered mask', async () => {
      const fn1 = (data: Record<string, any>) => data;
      const fn2 = (data: Record<string, any>) => data;
      const key1 = registerMask(fn1);
      const key2 = registerMask(fn2);
      expect(key1).not.toBe(key2);
    });

    it('should return string keys', async () => {
      const fn = (data: Record<string, any>) => data;
      const key = registerMask(fn);
      expect(typeof key).toBe('string');
    });
  });

  describe('applyMask', () => {
    it('should return span data unchanged when no mask is provided', async () => {
      const spanData = { name: 'test', attributes: {} };
      const result = await applyMask(spanData, null);
      expect(result).toBe(spanData);
    });

    it('should apply global mask when no per-span mask', async () => {
      const globalMask = (data: Record<string, any>) => ({
        ...data,
        name: 'masked',
      });
      const spanData = { name: 'original', attributes: {} };
      const result = await applyMask(spanData, globalMask);
      expect(result.name).toBe('masked');
    });

    it('should apply per-span mask over global mask', async () => {
      const perSpanMask = (data: Record<string, any>) => ({
        ...data,
        name: 'per-span-masked',
      });
      const globalMask = (data: Record<string, any>) => ({
        ...data,
        name: 'global-masked',
      });
      const maskId = registerMask(perSpanMask);
      const spanData = {
        name: 'original',
        attributes: { 'neatlogs.mask_id': maskId },
      };
      const result = await applyMask(spanData, globalMask);
      expect(result.name).toBe('per-span-masked');
    });

    it('should fall back to global mask when per-span mask id is not found', async () => {
      const globalMask = (data: Record<string, any>) => ({
        ...data,
        name: 'global-masked',
      });
      const spanData = {
        name: 'original',
        attributes: { 'neatlogs.mask_id': '999' },
      };
      const result = await applyMask(spanData, globalMask);
      expect(result.name).toBe('global-masked');
    });

    it('should return null when mask returns null (drop span)', async () => {
      const mask = () => null;
      const spanData = { name: 'test', attributes: {} };
      const result = await applyMask(spanData, mask);
      expect(result).toBeNull();
    });

    it('should fail closed when mask throws', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mask = () => {
        throw new Error('mask error');
      };
      const spanData = { name: 'test', attributes: {} };
      const result = await applyMask(spanData, mask);
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should handle undefined globalMask', async () => {
      const spanData = { name: 'test', attributes: {} };
      const result = await applyMask(spanData, undefined);
      expect(result).toBe(spanData);
    });
  });

  describe('_clearMaskRegistry', () => {
    it('should clear all registered masks', async () => {
      const mask = (data: Record<string, any>) => ({
        ...data,
        name: 'masked',
      });
      const maskId = registerMask(mask);
      _clearMaskRegistry();

      // The registered mask should no longer be found
      const globalMask = (data: Record<string, any>) => ({
        ...data,
        name: 'global',
      });
      const spanData = {
        name: 'test',
        attributes: { 'neatlogs.mask_id': maskId },
      };
      const result = await applyMask(spanData, globalMask);
      expect(result.name).toBe('global');
    });
  });
});
