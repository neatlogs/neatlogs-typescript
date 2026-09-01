import { ROOT_CONTEXT } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';
import { ChoiceAccumulator } from '../../src/core/choice-accumulator.js';

describe('ChoiceAccumulator', () => {
  it('preserves multi-choice content and interleaved tool fragments', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(sink));
    const span = provider.getTracer('choice-test').startSpan('llm', undefined, ROOT_CONTEXT);
    const accumulator = new ChoiceAccumulator();

    accumulator.addChunk(span, {
      id: 'response-1',
      model: 'gpt-test',
      choices: [
        { index: 0, delta: { content: 'A' } },
        {
          index: 1,
          delta: {
            content: 'X',
            tool_calls: [
              { index: 0, function: { name: 'weather', arguments: '{"city":' } },
            ],
          },
        },
      ],
    });
    accumulator.addChunk(span, {
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7, vendor_field: 9 },
      choices: [
        { index: 0, delta: { content: 'B' }, finish_reason: 'stop' },
        {
          index: 1,
          delta: { content: 'Y', tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }] },
          finish_reason: 'tool_calls',
        },
      ],
    });
    accumulator.finish(span);
    await provider.forceFlush();

    const attributes = sink.getFinishedSpans()[0].attributes;
    expect(attributes['neatlogs.llm.output_messages.0.content']).toBe('AB');
    expect(attributes['neatlogs.llm.output_messages.1.content']).toBe('XY');
    expect(attributes['neatlogs.llm.choices.0.finish_reason']).toBe('stop');
    expect(attributes['neatlogs.llm.choices.1.finish_reason']).toBe('tool_calls');
    expect(attributes['neatlogs.llm.tool_calls.0.choice_index']).toBe(1);
    expect(attributes['neatlogs.llm.tool_calls.0.tool_call_index']).toBe(0);
    expect(attributes['neatlogs.llm.tool_calls.0.arguments']).toBe('{"city":"Paris"}');
    expect(attributes['neatlogs.llm.tool_calls.0.id_synthetic']).toBe(true);
    expect(attributes['neatlogs.llm.usage']).toContain('vendor_field');
    expect(sink.getFinishedSpans()[0].events).toHaveLength(2);
    expect(JSON.stringify(sink.getFinishedSpans()[0].events[0].attributes)).not.toContain('"A"');
  });

  it('does not overwrite tool calls from separate non-streamed choices', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(sink));
    const span = provider.getTracer('choice-test').startSpan('llm', undefined, ROOT_CONTEXT);
    const accumulator = new ChoiceAccumulator();
    accumulator.addResponse({
      choices: [
        {
          index: 0,
          message: { tool_calls: [{ id: 'a', function: { name: 'first', arguments: '{}' } }] },
        },
        {
          index: 1,
          message: { tool_calls: [{ id: 'b', function: { name: 'second', arguments: '{}' } }] },
        },
      ],
    });
    accumulator.finish(span);
    await provider.forceFlush();
    const attributes = sink.getFinishedSpans()[0].attributes;
    expect(attributes['neatlogs.llm.tool_calls.0.id']).toBe('a');
    expect(attributes['neatlogs.llm.tool_calls.1.id']).toBe('b');
    expect(attributes['neatlogs.llm.tool_calls.1.choice_index']).toBe(1);
  });

  it('emits non-streamed reasoning content under the backend thinking field', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(sink));
    const span = provider.getTracer('choice-test').startSpan('llm', undefined, ROOT_CONTEXT);
    const accumulator = new ChoiceAccumulator();
    accumulator.addResponse({
      choices: [{ message: { reasoning_content: 'private chain' } }],
    });
    accumulator.finish(span);
    await provider.forceFlush();

    const attributes = sink.getFinishedSpans()[0].attributes;
    expect(attributes['neatlogs.llm.output_messages.0.thinking']).toBe('private chain');
    expect(attributes['neatlogs.llm.output_messages.0.reasoning']).toBeUndefined();
  });

  it('emits streamed reasoning content under the backend thinking field', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(sink));
    const span = provider.getTracer('choice-test').startSpan('llm', undefined, ROOT_CONTEXT);
    const accumulator = new ChoiceAccumulator();
    accumulator.addChunk(span, {
      choices: [{ delta: { reasoning_content: 'private ' } }],
    });
    accumulator.addChunk(span, {
      choices: [{ delta: { reasoning_content: 'chain' } }],
    });
    accumulator.finish(span);
    await provider.forceFlush();

    const attributes = sink.getFinishedSpans()[0].attributes;
    expect(attributes['neatlogs.llm.output_messages.0.thinking']).toBe('private chain');
    expect(attributes['neatlogs.llm.output_messages.0.reasoning']).toBeUndefined();
  });

  it('reports flattened fidelity only when selected by an adapter', async () => {
    const sink = new InMemorySpanExporter();
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(sink));
    const span = provider.getTracer('choice-test').startSpan('llm', undefined, ROOT_CONTEXT);
    const accumulator = new ChoiceAccumulator('flattened');
    accumulator.addResponse({ choices: [{ message: { content: 'flat' } }] });
    accumulator.finish(span);
    await provider.forceFlush();

    expect(sink.getFinishedSpans()[0].attributes['neatlogs.capture_fidelity']).toBe('flattened');
  });
});
