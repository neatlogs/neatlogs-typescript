import { afterEach, describe, expect, it } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { init, shutdown } from '../../src/init.js';
import { trace } from '../../src/core/context.js';

const previousResourceAttributes = process.env.OTEL_RESOURCE_ATTRIBUTES;

afterEach(async () => {
  await shutdown();
  if (previousResourceAttributes === undefined) {
    delete process.env.OTEL_RESOURCE_ATTRIBUTES;
  } else {
    process.env.OTEL_RESOURCE_ATTRIBUTES = previousResourceAttributes;
  }
});

describe('caller-owned provider lifecycle', () => {
  it('stamps the verification marker even when the provider resource is caller-owned', async () => {
    process.env.OTEL_RESOURCE_ATTRIBUTES =
      'neatlogs.verification.marker=verification-run';
    const provider = new NodeTracerProvider();
    const exporter = new InMemorySpanExporter();

    try {
      await init({
        apiKey: 'unused',
        disableExport: true,
        tracerProvider: provider,
        registerShutdownHandlers: false,
      });
      provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
      await trace({ name: 'verified', kind: 'WORKFLOW' }, async () => 'ok');

      const span = exporter
        .getFinishedSpans()
        .find((candidate) => candidate.name === 'verified');
      expect(span?.attributes['neatlogs.verification.marker']).toBe(
        'verification-run',
      );
    } finally {
      await shutdown();
      await provider.shutdown();
    }
  });

  it('leaves old processors inert when the same provider is reused', async () => {
    const provider = new NodeTracerProvider();
    const exporter = new InMemorySpanExporter();

    try {
      await init({
        apiKey: 'unused',
        disableExport: true,
        tracerProvider: provider,
        registerShutdownHandlers: false,
        mask: () => null,
      });
      await shutdown();

      await init({
        apiKey: 'unused',
        disableExport: true,
        tracerProvider: provider,
        registerShutdownHandlers: false,
      });
      provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
      await trace({ name: 'second-run', kind: 'WORKFLOW' }, async () => 'ok');

      const span = exporter
        .getFinishedSpans()
        .find((candidate) => candidate.name === 'second-run');
      expect(span).toBeDefined();
      expect(span?.attributes['neatlogs.dropped']).toBeUndefined();
    } finally {
      await shutdown();
      await provider.shutdown();
    }
  });

  it('does not leave a span opened in the shutdown-start race', async () => {
    const provider = new NodeTracerProvider();
    const exporter = new InMemorySpanExporter();
    try {
      await init({
        apiKey: 'unused',
        disableExport: true,
        tracerProvider: provider,
        registerShutdownHandlers: false,
      });
      provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

      const closing = shutdown('SIGTERM');
      await trace({ name: 'racing-span', kind: 'WORKFLOW' }, async () => 'late');
      await closing;

      const span = exporter
        .getFinishedSpans()
        .find((candidate) => candidate.name === 'racing-span');
      expect(span?.attributes['neatlogs.trace.interrupted']).toBe(true);
    } finally {
      await shutdown();
      await provider.shutdown();
    }
  });
});
