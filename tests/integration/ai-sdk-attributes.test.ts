import { describe, it, expect } from 'vitest';
import { UnifiedAttributeProcessor, type SpanDict } from '../../src/core/attribute-processor.js';
import { AttributeMapper } from '../../src/config/attribute-mapper.js';

const mapper = new AttributeMapper();

function processSpan(spanDict: SpanDict): Record<string, any> {
  return new UnifiedAttributeProcessor(mapper, false).normalize(spanDict);
}

function makeAiSdkSpan(name: string, attrs: Record<string, any>): SpanDict {
  return {
    name,
    kind: 1,
    trace_id: '0'.repeat(32),
    span_id: '0'.repeat(16),
    start_time: 0,
    end_time: 1_000_000_000,
    status: { code: 0, message: '' },
    attributes: attrs,
    resource: {},
    instrumentation_scope: { name: 'ai' },
    events: [],
  };
}

describe('Vercel AI SDK attribute extraction', () => {
  it('maps ai.model.id to llm.model_name and neatlogs.llm.model_name', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.model.provider': 'openai.chat',
      }),
    );
    expect(out['neatlogs.llm.model_name']).toBe('gpt-4o-mini');
    expect(out['neatlogs.llm.provider']).toBe('openai');
  });

  it('maps ai.usage.* tokens', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.usage.promptTokens': 42,
        'ai.usage.completionTokens': 17,
        'ai.usage.totalTokens': 59,
      }),
    );
    expect(out['neatlogs.llm.token_count.prompt']).toBe(42);
    expect(out['neatlogs.llm.token_count.completion']).toBe(17);
    expect(out['neatlogs.llm.token_count.total']).toBe(59);
  });

  it('explodes ai.prompt.messages into indexed input messages', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.prompt.messages': JSON.stringify([
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ]),
      }),
    );
    expect(out['neatlogs.llm.input_messages.0.role']).toBe('system');
    expect(out['neatlogs.llm.input_messages.0.content']).toBe('You are helpful.');
    expect(out['neatlogs.llm.input_messages.1.role']).toBe('user');
    expect(out['neatlogs.llm.input_messages.1.content']).toBe('Hello');
  });

  it('captures ai.response.text as output message 0 with assistant role', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.response.text': 'Hi there!',
      }),
    );
    expect(out['neatlogs.llm.output_messages.0.role']).toBe('assistant');
    expect(out['neatlogs.llm.output_messages.0.content']).toBe('Hi there!');
  });

  it('infers LLM kind for ai.generateText spans without explicit openinference.span.kind', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
      }),
    );
    expect(out['neatlogs.span.kind']).toBe('llm');
  });

  it('infers TOOL kind for ai.toolCall spans', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.toolCall', {
        'ai.toolCall.name': 'getWeather',
        'ai.toolCall.args': JSON.stringify({ location: 'SF' }),
        'ai.toolCall.result': JSON.stringify({ temperature: 72 }),
      }),
    );
    expect(out['neatlogs.span.kind']).toBe('tool');
  });

  it('maps ai.toolCall.{name,args,result} to neatlogs tool span attrs', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.toolCall', {
        'ai.toolCall.name': 'getWeather',
        'ai.toolCall.args': JSON.stringify({ location: 'SF' }),
        'ai.toolCall.result': JSON.stringify({ temperature: 72 }),
      }),
    );
    expect(out['neatlogs.tool.name']).toBe('getWeather');
    expect(out['neatlogs.tool.input']).toContain('SF');
    expect(out['neatlogs.tool.output']).toContain('72');
  });

  it('maps ai.settings.* to gen_ai.request.*', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.settings.temperature': 0.7,
        'ai.settings.maxTokens': 256,
        'ai.settings.topP': 0.95,
      }),
    );
    expect(out['neatlogs.llm.temperature']).toBe(0.7);
    expect(out['neatlogs.llm.max_tokens']).toBe(256);
    expect(out['neatlogs.llm.top_p']).toBe(0.95);
  });

  it('infers EMBEDDING kind for ai.embed spans', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.embed', {
        'ai.model.id': 'text-embedding-3-small',
      }),
    );
    expect(out['neatlogs.span.kind']).toBe('embedding');
  });
});
