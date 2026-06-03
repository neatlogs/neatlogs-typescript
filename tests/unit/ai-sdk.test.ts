import { describe, it, expect } from 'vitest';
import { wrapAISDK, createAITelemetry } from '../../src/ai-sdk.js';

describe('wrapAISDK', () => {
  it('wraps known AI SDK functions and passes other exports through unchanged', () => {
    const passthrough = { some: 'helper' };
    const aiModule = {
      generateText: async (_opts: any) => ({ text: 'hi', finishReason: 'stop' }),
      streamText: (_opts: any) => ({ stream: true }),
      generateObject: async (_opts: any) => ({ object: {} }),
      streamObject: (_opts: any) => ({ stream: true }),
      notAFunction: passthrough,
    };

    const wrapped = wrapAISDK(aiModule);

    // Wrapped functions are replaced with new function references.
    expect(typeof wrapped.generateText).toBe('function');
    expect(wrapped.generateText).not.toBe(aiModule.generateText);
    expect(wrapped.streamText).not.toBe(aiModule.streamText);

    // Non-function / unknown exports pass through unchanged.
    expect(wrapped.notAFunction).toBe(passthrough);
  });

  it('forces experimental_telemetry on the underlying call and records output', async () => {
    let receivedOpts: any;
    const aiModule = {
      generateText: async (opts: any) => {
        receivedOpts = opts;
        return { text: 'hello world', finishReason: 'stop' };
      },
    };

    const wrapped = wrapAISDK(aiModule);
    const result = await (wrapped.generateText as any)({ prompt: 'hi' });

    // Original call result is returned untouched.
    expect(result).toEqual({ text: 'hello world', finishReason: 'stop' });

    // Telemetry is forced on regardless of caller config.
    expect(receivedOpts.experimental_telemetry.isEnabled).toBe(true);
    expect(receivedOpts.experimental_telemetry.recordInputs).toBe(true);
    expect(receivedOpts.experimental_telemetry.recordOutputs).toBe(true);
    expect(receivedOpts.experimental_telemetry.metadata.neatlogsWrapped).toBe(true);
  });

  it('preserves and merges caller-supplied telemetry metadata', () => {
    const cfg = createAITelemetry({ metadata: { userId: 'u1' } });
    expect(cfg.isEnabled).toBe(true);
    expect(cfg.recordInputs).toBe(true);
    expect(cfg.recordOutputs).toBe(true);
    expect(cfg.metadata.userId).toBe('u1');
    expect(cfg.metadata.neatlogsWrapped).toBe(true);
  });
});
