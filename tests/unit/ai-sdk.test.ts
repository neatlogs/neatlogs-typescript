import { describe, it, expect } from 'vitest';
import * as ai from 'ai';
import type { TelemetrySettings } from 'ai';
import type { Span, Tracer } from '@opentelemetry/api';
import { wrapAISDK, createAITelemetry } from '../../src/ai-sdk.js';
import type { TraceOptions } from '../../src/types.js';

function createRecordingTracer() {
  const calls: string[] = [];
  const attributes: Record<string, unknown> = {};
  const span: Span = {
    spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }),
    setAttribute(key, value) {
      attributes[key] = value;
      return this;
    },
    setAttributes(values) {
      Object.assign(attributes, values);
      return this;
    },
    addEvent() {
      return this;
    },
    addLink() {
      return this;
    },
    addLinks() {
      return this;
    },
    setStatus() {
      return this;
    },
    updateName() {
      return this;
    },
    end() {
      calls.push('end');
    },
    isRecording: () => true,
    recordException() {},
  };
  const tracer: Tracer = {
    startSpan(name) {
      calls.push(name);
      return span;
    },
    startActiveSpan(name, arg2?: unknown, arg3?: unknown, arg4?: unknown) {
      calls.push(name);
      const fn = [arg2, arg3, arg4].find((arg) => typeof arg === 'function') as (
        activeSpan: Span,
      ) => unknown;
      return fn(span);
    },
  } as Tracer;
  return { tracer, calls, attributes };
}

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

  it('mirrors native spans when createAITelemetry receives an existing tracer', async () => {
    const caller = createRecordingTracer();
    const cfg = createAITelemetry({
      tracer: caller.tracer,
      functionId: 'zest-search-agent-progress',
      metadata: { owner: 'laminar' },
    });

    await cfg.tracer.startActiveSpan('ai.streamText.doStream', (span) => {
      span.setAttribute('ai.model.id', 'progress-model');
      span.end();
    });

    expect(caller.calls).toEqual(['ai.streamText.doStream', 'end']);
    expect(caller.attributes['ai.model.id']).toBe('progress-model');
    expect(cfg.functionId).toBe('zest-search-agent-progress');
    expect(cfg.metadata).toEqual({ owner: 'laminar' });
  });

  it('mirrors native AI SDK spans to a caller-owned tracer without changing its settings', async () => {
    const caller = createRecordingTracer();
    let receivedTelemetry: any;
    const aiModule = {
      generateText: async (opts: any) => {
        receivedTelemetry = opts.experimental_telemetry;
        return opts.experimental_telemetry.tracer.startActiveSpan(
          'ai.generateText.doGenerate',
          { attributes: { 'ai.model.id': 'test-model' } },
          async (span: Span) => {
            span.setAttribute('ai.usage.promptTokens', 12);
            span.end();
            return { text: 'mirrored', finishReason: 'stop' };
          },
        );
      },
    };

    const wrapped = wrapAISDK(aiModule);
    const result = await (wrapped.generateText as any)({
      prompt: 'hi',
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        tracer: caller.tracer,
        functionId: 'laminar-search-agent',
        metadata: { owner: 'laminar' },
      },
    });

    expect(result).toEqual({ text: 'mirrored', finishReason: 'stop' });
    expect(caller.calls).toEqual(['ai.generateText.doGenerate', 'end']);
    expect(caller.attributes['ai.usage.promptTokens']).toBe(12);
    expect(receivedTelemetry.tracer).not.toBe(caller.tracer);
    expect(receivedTelemetry.recordInputs).toBe(false);
    expect(receivedTelemetry.functionId).toBe('laminar-search-agent');
    expect(receivedTelemetry.metadata).toEqual({ owner: 'laminar' });
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

  it('retains constructor telemetry when prepareCall does not return telemetry', async () => {
    const caller = createRecordingTracer();
    class FakeToolLoopAgent {
      constructor(public readonly settings: any) {}
    }
    const wrapped = wrapAISDK({ ToolLoopAgent: FakeToolLoopAgent });
    const agent = new wrapped.ToolLoopAgent({
      experimental_telemetry: {
        isEnabled: true,
        tracer: caller.tracer,
        functionId: 'zest-search-agent',
        metadata: { owner: 'laminar' },
      },
      prepareCall: () => ({ temperature: 0 }),
    });

    const prepared = await agent.settings.prepareCall();
    await prepared.experimental_telemetry.tracer.startActiveSpan(
      'ai.generateText.doGenerate',
      (span: Span) => {
        span.end();
      },
    );

    expect(caller.calls).toEqual(['ai.generateText.doGenerate', 'end']);
    expect(prepared.experimental_telemetry.functionId).toBe('zest-search-agent');
    expect(prepared.experimental_telemetry.metadata).toEqual({ owner: 'laminar' });
  });

  it('types custom rerankers as trace-only span kinds', () => {
    const options: TraceOptions = {
      name: 'weighted_rrf',
      kind: 'RERANKER',
    };
    expect(options.kind).toBe('RERANKER');
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
