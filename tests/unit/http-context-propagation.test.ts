import { describe, it, expect } from 'vitest';
import { SUPPRESS_INSTRUMENTATION_KEY } from '../../src/instrumentation/http-context-propagation.js';

describe('http-context-propagation', () => {
  describe('SUPPRESS_INSTRUMENTATION_KEY', () => {
    it('should be a Symbol', () => {
      expect(typeof SUPPRESS_INSTRUMENTATION_KEY).toBe('symbol');
    });

    it('should have the expected description', () => {
      expect(SUPPRESS_INSTRUMENTATION_KEY.description).toBe(
        'OpenTelemetry SDK suppress instrumentation',
      );
    });

    it('should be the same symbol when using Symbol.for', () => {
      const same = Symbol.for('OpenTelemetry SDK suppress instrumentation');
      expect(SUPPRESS_INSTRUMENTATION_KEY).toBe(same);
    });
  });
});
