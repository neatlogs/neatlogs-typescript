import { describe, it, expect } from 'vitest';
import * as ai from 'ai';
import type { TelemetrySettings } from 'ai';
import { wrapAISDK, createAITelemetry } from '../../src/ai-sdk.js';

describe('wrapAISDK', () => {
  it('wraps known AI SDK functions and passes other exports through unchanged', () => {
    const passthrough = { some: 'helper' };
    const aiModule = {
      generateText: async (_opts: any) => ({
        text: 'hi',
        finishReason: 'stop',
      }),
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
    expect(receivedOpts.experimental_telemetry.metadata.neatlogsWrapped).toBe(
      true,
    );
  });

  it('preserves and merges caller-supplied telemetry metadata', () => {
    const cfg: TelemetrySettings = createAITelemetry({
      functionId: 'creator-search',
      metadata: { userId: 'u1' },
    });
    expect(cfg.isEnabled).toBe(true);
    expect(cfg.recordInputs).toBe(true);
    expect(cfg.recordOutputs).toBe(true);
    expect(cfg.functionId).toBe('creator-search');
    expect(cfg.metadata.userId).toBe('u1');
    expect(cfg.metadata.neatlogsWrapped).toBe(true);
  });

  it('wraps ToolLoopAgent and its alias with constructor telemetry', async () => {
    class FakeToolLoopAgent {
      constructor(public readonly settings: any) {}
    }
    const aiModule = {
      ToolLoopAgent: FakeToolLoopAgent,
      Experimental_Agent: FakeToolLoopAgent,
    };

    const wrapped = wrapAISDK(aiModule);
    expect(wrapped.ToolLoopAgent).not.toBe(FakeToolLoopAgent);
    expect(wrapped.ToolLoopAgent).toBe(wrapped.Experimental_Agent);

    const agent = new wrapped.ToolLoopAgent({
      id: 'search-agent',
      experimental_telemetry: {
        functionId: 'creator-search',
        metadata: { userId: 'u1' },
      },
      prepareCall: () => ({
        experimental_telemetry: {
          functionId: 'prepared-search',
          metadata: { phase: 'prepared' },
        },
      }),
    });

    expect(agent).toBeInstanceOf(FakeToolLoopAgent);
    expect(agent.settings.experimental_telemetry).toMatchObject({
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'creator-search',
      metadata: { userId: 'u1', neatlogsWrapped: true },
    });

    const prepared = await agent.settings.prepareCall();
    expect(prepared.experimental_telemetry).toMatchObject({
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'prepared-search',
      metadata: { phase: 'prepared', neatlogsWrapped: true },
    });
  });

  it('wraps the installed AI SDK v6 ToolLoopAgent without breaking its class contract', () => {
    const wrapped = wrapAISDK(ai);
    const agent = new wrapped.ToolLoopAgent({
      model: {} as any,
      experimental_telemetry: {
        functionId: 'real-agent',
        metadata: { test: true },
      },
    });

    expect(agent).toBeInstanceOf(ai.ToolLoopAgent);
    expect(agent.version).toBe('agent-v1');
    expect((agent as any).settings.experimental_telemetry).toMatchObject({
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'real-agent',
      metadata: { test: true, neatlogsWrapped: true },
    });
  });

  it('does not stack wrappers when wrapAISDK is called again', () => {
    class FakeToolLoopAgent {
      constructor(public readonly settings: any) {}
    }
    const aiModule = {
      generateText: async (_opts: any) => ({
        text: 'hi',
        finishReason: 'stop',
      }),
      ToolLoopAgent: FakeToolLoopAgent,
    };

    const once = wrapAISDK(aiModule);
    const twice = wrapAISDK(once);

    expect(twice.generateText).toBe(once.generateText);
    expect(twice.ToolLoopAgent).toBe(once.ToolLoopAgent);
  });
});
