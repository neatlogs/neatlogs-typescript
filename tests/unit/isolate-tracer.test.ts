import { afterEach, describe, expect, it } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';

import {
  _setNeatlogsProvider,
  isolateTracer,
  withNeatlogsSpan,
} from '../../src/core/provider.js';

// Reproduces the reverse-leak the AI SDK caused: it receives a tracer from
// createAITelemetry() and calls startActiveSpan() on it internally. Without the
// facade those native spans (a) parent from the foreign global context and (b)
// get pushed onto the global context, so a co-tenant's next span inherits ours.

let neatlogsProvider: NodeTracerProvider;
let neatlogsExporter: InMemorySpanExporter;
let foreignProvider: NodeTracerProvider;

afterEach(async () => {
  _setNeatlogsProvider(null);
  if (neatlogsProvider) await neatlogsProvider.shutdown();
  if (foreignProvider) await foreignProvider.shutdown();
});

describe('isolateTracer (isolated mode)', () => {
  it('startActiveSpan parents from the private Neatlogs context, not the foreign global one', async () => {
    neatlogsExporter = new InMemorySpanExporter();
    neatlogsProvider = new NodeTracerProvider();
    neatlogsProvider.addSpanProcessor(new SimpleSpanProcessor(neatlogsExporter));
    _setNeatlogsProvider(neatlogsProvider);

    // A foreign provider owning the GLOBAL context, with a foreign active span.
    foreignProvider = new NodeTracerProvider();
    const foreignTracer = foreignProvider.getTracer('foreign');
    const foreignRoot = foreignTracer.startSpan('foreign-root');
    const foreignCtx = otelTrace.setSpan(otelContext.active(), foreignRoot);

    const nlTracer = neatlogsProvider.getTracer('neatlogs.ai-sdk');
    const facade = isolateTracer(nlTracer);

    // Open a Neatlogs parent span in the PRIVATE store...
    const nlParent = nlTracer.startSpan('ai.generateText');
    const childSpanId = await withNeatlogsSpan(nlParent, async () => {
      // ...then run the foreign active context (as the AI SDK would, since a
      // co-tenant may be the current global span) and have the facade create a
      // "native" span via startActiveSpan.
      return otelContext.with(foreignCtx, () => {
        return facade.startActiveSpan('ai-native-child', (span: any) => {
          const id = span.spanContext().spanId;
          span.end();
          return id;
        });
      });
    });
    nlParent.end();
    foreignRoot.end();

    const spans = neatlogsExporter.getFinishedSpans();
    const parent = spans.find((s) => s.name === 'ai.generateText')!;
    const child = spans.find((s) => s.name === 'ai-native-child')!;

    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    // The native child is parented by the Neatlogs span (private context), NOT
    // the foreign global active span.
    expect(child.parentSpanId).toBe(parent.spanContext().spanId);
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId);
    expect(child.parentSpanId).not.toBe(foreignRoot.spanContext().spanId);
    expect(childSpanId).toBe(child.spanContext().spanId);
  });

  it('startActiveSpan does not push the Neatlogs span onto the global context (no reverse-leak)', async () => {
    neatlogsExporter = new InMemorySpanExporter();
    neatlogsProvider = new NodeTracerProvider();
    neatlogsProvider.addSpanProcessor(new SimpleSpanProcessor(neatlogsExporter));
    _setNeatlogsProvider(neatlogsProvider);

    const nlTracer = neatlogsProvider.getTracer('neatlogs.ai-sdk');
    const facade = isolateTracer(nlTracer);

    let globalActiveInsideCallback: unknown;
    facade.startActiveSpan('ai-native-child', (span: any) => {
      // While the facade's span is "active", the GLOBAL OTel context must NOT
      // see it — a foreign tracer reading trace.getActiveSpan() must get nothing.
      globalActiveInsideCallback = otelTrace.getActiveSpan();
      span.end();
    });

    expect(globalActiveInsideCallback).toBeUndefined();
  });
});
