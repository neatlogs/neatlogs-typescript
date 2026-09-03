import { context, trace as otelTrace } from '@opentelemetry/api';
import { createHash } from 'node:crypto';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { beforeEach, describe, expect, it } from 'vitest';
import { capturePreparedSpans, clearDoctorCapture, getCapturedEnvelope } from '../../src/core/doctor-capture.js';
import { FilteringExporter } from '../../src/core/filtering-exporter.js';
import { NeatlogsSpanProcessor } from '../../src/core/span-processor.js';
import { _setNeatlogsProvider } from '../../src/core/provider.js';
import { wrapOpenAI } from '../../src/openai.js';
import { doctorLocalV2 } from '../../src/doctor-v2.js';

describe('Doctor capture through the real provider/export boundary', () => {
  beforeEach(clearDoctorCapture);

  it('preserves prototype-backed timing fields on masked spans and captures the trace', async () => {
    const transport = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new NeatlogsSpanProcessor({ ownAllSpans: true }));
    provider.addSpanProcessor(new SimpleSpanProcessor(
      new FilteringExporter(transport, undefined, undefined, capturePreparedSpans),
    ));
    const tracer = provider.getTracer('doctor-real-export');
    const root = tracer.startSpan('doctor.workflow', { attributes: { 'neatlogs.span.kind': 'WORKFLOW', 'input.value': JSON.stringify({ safe: true }) } });
    const traceId = root.spanContext().traceId;
    const parentContext = otelTrace.setSpan(context.active(), root);
    const tool = tracer.startSpan('doctor.tool', { attributes: { 'neatlogs.span.kind': 'TOOL', 'neatlogs.tool.name': 'lookup' } }, parentContext);
    tool.end();
    root.end();
    await provider.forceFlush();

    const envelope = getCapturedEnvelope(traceId);
    expect(envelope).toMatchObject({ trace_id: traceId, root_span_id: root.spanContext().spanId });
    expect(envelope?.spans).toHaveLength(2);
    expect(envelope?.spans.every((span) => typeof span.duration_ns === 'number' && typeof span.start_time_ns === 'number')).toBe(true);
    expect(transport.getFinishedSpans()).toHaveLength(2);
    await provider.shutdown();
  });

  it('does not retain spans when the ordinary exporter has no Doctor callback', async () => {
    const transport = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(new FilteringExporter(transport)));
    const root = provider.getTracer('ordinary-export').startSpan('ordinary.workflow');
    root.end();
    await provider.forceFlush();

    expect(transport.getFinishedSpans()).toHaveLength(1);
    expect(getCapturedEnvelope(root.spanContext().traceId)).toBeNull();
    await provider.shutdown();
  });

  it('fails closed when a real captured truncated span has no payload reference', async () => {
    const transport = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(
      new FilteringExporter(transport, undefined, undefined, capturePreparedSpans),
    ));
    const root = provider.getTracer('doctor-truncation').startSpan('doctor.payload', {
      attributes: {
        'neatlogs.span.kind': 'CHAIN',
        'neatlogs.capture.truncated': true,
      },
    });
    root.end();
    await provider.forceFlush();

    const envelope = getCapturedEnvelope(root.spanContext().traceId);
    expect(envelope?.spans[0]).toMatchObject({ oversized: true });
    expect(doctorLocalV2(envelope!).checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason_code: 'PAYLOAD_ATTACHMENT_REQUIRED' }),
    ]));
    await provider.shutdown();
  });

  it('projects real wrapper choices, streaming fragments, tool calls, and typed payloads', async () => {
    const previousAutoRoot = process.env.NEATLOGS_AUTO_ROOT;
    process.env.NEATLOGS_AUTO_ROOT = 'false';
    const transport = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new NeatlogsSpanProcessor({ ownAllSpans: true }));
    provider.addSpanProcessor(new SimpleSpanProcessor(
      new FilteringExporter(transport, undefined, undefined, capturePreparedSpans),
    ));
    _setNeatlogsProvider(provider);
    const payload = Buffer.from('doctor typed payload');
    const chunks = [
      {
        model: 'gpt-doctor',
        choices: [
          { index: 0, delta: { role: 'assistant', content: 'primary ' }, finish_reason: null },
          { index: 1, delta: { role: 'assistant', content: 'alternate' }, finish_reason: null },
        ],
      },
      {
        model: 'gpt-doctor',
        choices: [{
          index: 0,
          delta: {
            content: 'answer',
            tool_calls: [{
              index: 0,
              id: 'doctor_call_1',
              type: 'function',
              function: { name: 'doctor_lookup', arguments: '{"safe":true}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      },
      {
        model: 'gpt-doctor',
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      },
    ];
    async function* stream() {
      for (const chunk of chunks) yield chunk;
    }
    const wrapped = wrapOpenAI({
      chat: { completions: { create: async () => ({ [Symbol.asyncIterator]: stream }) } },
    } as any);

    try {
      const result = await wrapped.chat.completions.create({
        model: 'gpt-doctor',
        stream: true,
        messages: [{
          role: 'user',
          content: [{
            type: 'file',
            file: { file_data: payload.toString('base64'), filename: 'doctor.txt' },
          }],
        }],
      });
      for await (const _chunk of result as any) {
        // Consume the real wrapper stream so its LLM span finalizes.
      }
      await provider.forceFlush();

      const exported = transport.getFinishedSpans();
      const exportedLlm = exported.find((span) => span.name === 'openai.chat.completions.create');
      expect(exportedLlm).toBeDefined();
      expect(exported.map((span) => span.name)).toContain('neatlogs.trace.complete');
      const envelope = getCapturedEnvelope(exportedLlm!.spanContext().traceId);
      expect(envelope?.spans).toHaveLength(1);
      const llm = envelope?.spans[0];
      expect(llm?.choices).toEqual([
        {
          index: 0,
          message: { role: 'assistant', content: 'primary answer' },
          finish_reason: 'tool_calls',
        },
        {
          index: 1,
          message: { role: 'assistant', content: 'alternate' },
        },
      ]);
      expect(llm?.expected_choice_count).toBe(2);
      expect(llm?.tool_calls).toEqual([{
        id: 'doctor_call_1',
        name: 'doctor_lookup',
        arguments: { safe: true },
        choice_index: 0,
        tool_call_index: 0,
      }]);
      expect(llm?.streaming).toBe(true);
      expect(llm?.stream_fragments).toHaveLength(3);
      expect(llm?.payload_references).toEqual([{
        digest: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
        size: payload.byteLength,
        mime_type: 'application/octet-stream',
      }]);
      expect(llm?.input).toBeDefined();
      expect(llm?.output).toBeDefined();
    } finally {
      _setNeatlogsProvider(null);
      await provider.shutdown();
      if (previousAutoRoot === undefined) delete process.env.NEATLOGS_AUTO_ROOT;
      else process.env.NEATLOGS_AUTO_ROOT = previousAutoRoot;
    }
  });
});
