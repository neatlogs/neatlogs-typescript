import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ReadableSpan,
  SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import {
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

import { Client } from '../../src/core/client.js';
import { trace } from '../../src/core/context.js';
import { _setOtelLogger, captureStdout, log } from '../../src/core/log.js';
import { wrapOpenAI } from '../../src/openai.js';
import { createAITelemetry } from '../../src/ai-sdk.js';
import { tracePiStream } from '../../src/pi-agent.js';

const clients: Client[] = [];

class RetainingSpanExporter implements SpanExporter {
  private readonly spans: ReadableSpan[] = [];

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.spans.push(...spans);
    resultCallback({ code: 0 });
  }

  getFinishedSpans(): ReadableSpan[] {
    return [...this.spans];
  }

  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

function makeClient(name: string, captureLogs = false) {
  const exporter = new RetainingSpanExporter();
  const client = new Client({
    apiKey: 'unused',
    workflowName: name,
    captureLogs,
    spanExporter: exporter,
    flushInterval: 60,
  });
  clients.push(client);
  return { client, exporter };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.shutdown()));
});

describe('Client', () => {
  it('routes concurrent trace calls to independent providers', async () => {
    const first = makeClient('first');
    const second = makeClient('second');

    await Promise.all([
      first.client.activate(() =>
        trace({ name: 'first-run', kind: 'WORKFLOW' }, async () => 'first'),
      ),
      second.client.activate(() =>
        trace({ name: 'second-run', kind: 'WORKFLOW' }, async () => 'second'),
      ),
    ]);
    await Promise.all([first.client.flush(), second.client.flush()]);

    expect(first.exporter.getFinishedSpans().map((span) => span.name)).toContain(
      'first-run',
    );
    expect(first.exporter.getFinishedSpans().map((span) => span.name)).not.toContain(
      'second-run',
    );
    expect(second.exporter.getFinishedSpans().map((span) => span.name)).toContain(
      'second-run',
    );
    expect(second.exporter.getFinishedSpans().map((span) => span.name)).not.toContain(
      'first-run',
    );
  });

  it('routes one shared provider wrapper at invocation time', async () => {
    const first = makeClient('first-project');
    const second = makeClient('second-project');
    const wrapped = wrapOpenAI({
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        },
      },
    });

    await first.client.activate(() =>
      wrapped.chat.completions.create({ model: 'gpt-test', messages: [] }),
    );
    await second.client.activate(() =>
      wrapped.chat.completions.create({ model: 'gpt-test', messages: [] }),
    );
    await Promise.all([first.client.flush(), second.client.flush()]);

    const firstSpans = first.exporter.getFinishedSpans();
    const secondSpans = second.exporter.getFinishedSpans();
    expect(firstSpans.some((span) => span.name === 'openai.chat.completions.create')).toBe(true);
    expect(secondSpans.some((span) => span.name === 'openai.chat.completions.create')).toBe(true);
    expect(firstSpans.find((span) => span.parentSpanId === undefined)?.name).toBe(
      'first-project',
    );
    expect(secondSpans.find((span) => span.parentSpanId === undefined)?.name).toBe(
      'second-project',
    );
  });

  it('routes reusable telemetry and Pi wrappers at invocation time', async () => {
    const first = makeClient('first');
    const second = makeClient('second');
    const telemetry = createAITelemetry();
    const tracedStream = tracePiStream(() => ({
      result: async () => ({
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        model: 'gpt-test',
        provider: 'test',
        usage: { input: 1, output: 1, totalTokens: 2 },
      }),
    }));

    for (const { client } of [first, second]) {
      await client.activate(async () => {
        telemetry.tracer.startSpan('ai-native').end();
        const stream = tracedStream(
          { id: 'gpt-test', provider: 'test' },
          { messages: [{ role: 'user', content: 'hello' }] },
        );
        await stream.result();
        await Promise.resolve();
      });
      await client.flush();
    }

    for (const entry of [first, second]) {
      const names = entry.exporter.getFinishedSpans().map((span) => span.name);
      expect(names).toContain('ai-native');
      expect(names).toContain('pi_agent.stream');
      expect(names).toContain('pi_agent.llm.gpt-test');
    }
  });

  it('routes structured logs to the active client', () => {
    const first = makeClient('first', true);
    const second = makeClient('second', true);
    const firstLogs = new InMemoryLogRecordExporter();
    const secondLogs = new InMemoryLogRecordExporter();
    first.client.logProvider!.addLogRecordProcessor(
      new SimpleLogRecordProcessor(firstLogs),
    );
    second.client.logProvider!.addLogRecordProcessor(
      new SimpleLogRecordProcessor(secondLogs),
    );

    first.client.activate(() => log('first message'));
    second.client.activate(() => log('second message'));

    expect(firstLogs.getFinishedLogRecords().map((item) => item.body)).toEqual([
      'first message',
    ]);
    expect(secondLogs.getFinishedLogRecords().map((item) => item.body)).toEqual([
      'second message',
    ]);
  });

  it('does not leak a log-disabled Client into the global project logger', () => {
    const { client } = makeClient('no-logs', false);
    const globalLogger = { emit: vi.fn() };
    _setOtelLogger(globalLogger, false);
    try {
      client.activate(() => log('must stay disabled'));
      expect(globalLogger.emit).not.toHaveBeenCalled();
    } finally {
      _setOtelLogger(null, false);
    }
  });

  it('keeps overlapping stdout capture scoped to each Client', async () => {
    const first = makeClient('first', true);
    const second = makeClient('second', true);
    const firstLogs = new InMemoryLogRecordExporter();
    const secondLogs = new InMemoryLogRecordExporter();
    first.client.logProvider!.addLogRecordProcessor(
      new SimpleLogRecordProcessor(firstLogs),
    );
    second.client.logProvider!.addLogRecordProcessor(
      new SimpleLogRecordProcessor(secondLogs),
    );

    await Promise.all([
      first.client.activate(() =>
        captureStdout(async () => {
          await Promise.resolve();
          console.log('first stdout');
        }),
      ),
      second.client.activate(() =>
        captureStdout(async () => {
          console.log('second stdout');
          await Promise.resolve();
        }),
      ),
    ]);

    expect(firstLogs.getFinishedLogRecords().map((item) => item.body)).toEqual([
      'first stdout',
    ]);
    expect(secondLogs.getFinishedLogRecords().map((item) => item.body)).toEqual([
      'second stdout',
    ]);
  });

  it('closes active spans once and makes cached tracers no-op', async () => {
    const { client, exporter } = makeClient('closing');
    const tracer = client.getTracer('neatlogs.client.test');
    const active = tracer.startSpan('active');

    const first = client.shutdown('SIGTERM');
    const second = client.shutdown('ignored');
    expect(second).toBe(first);
    await expect(first).resolves.toBe(true);
    expect(active.isRecording()).toBe(false);

    const finished = exporter
      .getFinishedSpans()
      .find((span) => span.name === 'active');
    expect(finished?.attributes['neatlogs.trace.interrupted']).toBe(true);
    expect(tracer.startSpan('late').isRecording()).toBe(false);
    expect(() => client.activate(() => undefined)).toThrow(/closing or closed/);
  });

  it('finalizes custom-scope Client roots', async () => {
    const { client, exporter } = makeClient('custom-scope');
    client.getTracer('application.custom').startSpan('custom-root').end();
    await client.flush();
    const names = exporter.getFinishedSpans().map((span) => span.name);
    expect(names).toContain('custom-root');
    expect(names).toContain('neatlogs.trace.complete');
  });

  it('copies the process-scoped verification marker into its resource', async () => {
    const previous = process.env.OTEL_RESOURCE_ATTRIBUTES;
    process.env.OTEL_RESOURCE_ATTRIBUTES =
      'deployment.environment=test,neatlogs.verification.marker=run-123';
    try {
      const client = new Client({
        apiKey: 'unused',
        workflowName: 'verification',
        disableExport: true,
      });
      clients.push(client);
      expect(
        client.tracerProvider.resource.attributes['neatlogs.verification.marker'],
      ).toBe('run-123');
    } finally {
      if (previous === undefined) delete process.env.OTEL_RESOURCE_ATTRIBUTES;
      else process.env.OTEL_RESOURCE_ATTRIBUTES = previous;
    }
  });
});
