/**
 * Neatlogs OpenAI Agents SDK trace processor.
 *
 * Usage:
 *   import { openaiAgentsProcessor } from 'neatlogs/openai-agents';
 *   import { addTraceProcessor } from '@openai/agents';
 *   addTraceProcessor(openaiAgentsProcessor());
 *
 * Creates spans: WORKFLOW (traces), AGENT (agent runs), LLM (generations), TOOL (function calls).
 */

import { trace, context as otelContext, SpanStatusCode, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'neatlogs.openai_agents';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function openaiAgentsProcessor(): any {
  return new NeatlogsTraceProcessor();
}

// ---------------------------------------------------------------------------
// Trace Processor (implements OpenAI Agents SDK TracingProcessor protocol)
// ---------------------------------------------------------------------------

class NeatlogsTraceProcessor {
  private _spans: Map<string, Span> = new Map();
  private _startTimes: Map<string, number> = new Map();

  // The @openai/agents SDK passes a Trace object: { traceId, name, groupId, metadata }.
  onTraceStart(traceData: any): void {
    const tracer = trace.getTracer(TRACER_NAME);
    const attrs: Record<string, any> = { 'neatlogs.span.kind': 'WORKFLOW' };

    const workflowName = traceData?.name ?? traceData?.workflow_name;
    if (workflowName) attrs['neatlogs.workflow.name'] = workflowName;

    const traceId = traceData?.traceId ?? traceData?.trace_id;
    if (traceId) attrs['neatlogs.agent.trace_id'] = String(traceId);

    const span = tracer.startSpan('openai_agents.trace', { attributes: attrs }, otelContext.active());
    const key = String(traceId ?? `trace_${Date.now()}`);
    this._spans.set(key, span);
    this._startTimes.set(key, Date.now());
  }

  onTraceEnd(traceData: any): void {
    const key = String(traceData?.traceId ?? traceData?.trace_id ?? '');
    const span = this._spans.get(key);
    if (!span) return;

    const startTime = this._startTimes.get(key);
    if (startTime) {
      span.setAttribute('neatlogs.metrics.duration_ms', Date.now() - startTime);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    this._spans.delete(key);
    this._startTimes.delete(key);
  }

  // The SDK passes a Span object: { type, spanId, traceId, parentId?, spanData: {...} }.
  // The meaningful payload (type, name, input, output, usage, ...) lives in `spanData`.
  onSpanStart(span: any): void {
    const tracer = trace.getTracer(TRACER_NAME);
    const data = span?.spanData ?? span ?? {};
    const spanType = data?.type ?? data?.span_type ?? span?.type ?? '';
    const spanId = String(span?.spanId ?? span?.span_id ?? data?.span_id ?? `span_${Date.now()}`);

    // Parent context: nest under the trace span (or a parent span) so the tree forms.
    const parentKey = String(span?.parentId ?? span?.traceId ?? span?.trace_id ?? '');
    const parentSpan = this._spans.get(parentKey);
    const parentCtx = parentSpan
      ? trace.setSpan(otelContext.active(), parentSpan)
      : otelContext.active();

    let otelSpan: Span;

    if (spanType === 'agent' || spanType === 'agent_run') {
      const agentName = data?.name ?? data?.agent_name ?? 'agent';
      const attrs: Record<string, any> = {
        'neatlogs.span.kind': 'AGENT',
        'neatlogs.agent.name': agentName,
      };
      if (Array.isArray(data?.tools) && data.tools.length) {
        attrs['neatlogs.agent.available_tools'] = data.tools.join(',');
      }
      otelSpan = tracer.startSpan(`openai_agents.agent.${agentName}`, { attributes: attrs }, parentCtx);

    } else if (spanType === 'response' || spanType === 'generation' || spanType === 'llm') {
      const attrs: Record<string, any> = {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': 'openai',
      };

      const model = data?.model;
      if (model) attrs['neatlogs.llm.model_name'] = model;

      const inputMsgs = data?.input ?? data?.messages;
      if (inputMsgs && Array.isArray(inputMsgs)) {
        for (let i = 0; i < inputMsgs.length; i++) {
          const msg = inputMsgs[i];
          const role = typeof msg === 'object' ? (msg.role ?? '') : '';
          const content = typeof msg === 'object' ? (msg.content ?? '') : String(msg);
          if (role) attrs[`neatlogs.llm.input_messages.${i}.role`] = role;
          if (content) attrs[`neatlogs.llm.input_messages.${i}.content`] = (typeof content === 'string' ? content : safeStringify(content)).slice(0, 10000);
        }
      }

      otelSpan = tracer.startSpan('openai_agents.generation', { attributes: attrs }, parentCtx);

    } else if (spanType === 'function' || spanType === 'tool' || spanType === 'tool_call') {
      const toolName = data?.name ?? data?.function_name ?? 'tool';
      const attrs: Record<string, any> = {
        'neatlogs.span.kind': 'TOOL',
        'neatlogs.tool.name': toolName,
      };

      const toolInput = data?.input ?? data?.arguments;
      if (toolInput !== undefined) {
        attrs['input.value'] = (typeof toolInput === 'string' ? toolInput : safeStringify(toolInput)).slice(0, 10000);
      }

      otelSpan = tracer.startSpan(`openai_agents.tool.${toolName}`, { attributes: attrs }, parentCtx);

    } else if (spanType === 'handoff') {
      const attrs: Record<string, any> = { 'neatlogs.span.kind': 'AGENT' };
      if (data?.from_agent) attrs['neatlogs.agent.handoff_from'] = String(data.from_agent);
      if (data?.to_agent) attrs['neatlogs.agent.name'] = String(data.to_agent);

      otelSpan = tracer.startSpan('openai_agents.handoff', { attributes: attrs }, parentCtx);

    } else {
      const attrs: Record<string, any> = { 'neatlogs.span.kind': 'CHAIN' };
      otelSpan = tracer.startSpan(`openai_agents.${spanType || 'span'}`, { attributes: attrs }, parentCtx);
    }

    this._spans.set(spanId, otelSpan);
    this._startTimes.set(spanId, Date.now());
  }

  onSpanEnd(span: any): void {
    const data = span?.spanData ?? span ?? {};
    const spanId = String(span?.spanId ?? span?.span_id ?? data?.span_id ?? '');
    const otelSpan = this._spans.get(spanId);
    if (!otelSpan) return;

    const spanType = data?.type ?? data?.span_type ?? span?.type ?? '';
    const startTime = this._startTimes.get(spanId);

    if (spanType === 'response' || spanType === 'generation' || spanType === 'llm') {
      // @openai/agents 'response' span nests the full Responses API object under
      // `_response` and the request under `_input`. Older shapes use output/usage/model directly.
      const resp = data?._response ?? data?.response ?? {};
      const model = data?.model ?? resp?.model;
      if (model) otelSpan.setAttribute('neatlogs.llm.model_name', model);

      // Output text: Responses API output[] has message items with content[].text
      const outputItems = data?.output ?? resp?.output;
      if (Array.isArray(outputItems)) {
        const text = outputItems
          .filter((o: any) => o?.type === 'message' || o?.role === 'assistant')
          .flatMap((o: any) => (Array.isArray(o.content) ? o.content : [o.content]))
          .map((c: any) => (typeof c === 'string' ? c : c?.text ?? ''))
          .join('');
        if (text) {
          otelSpan.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
          otelSpan.setAttribute('neatlogs.llm.output_messages.0.content', text.slice(0, 10000));
        }
        // Tool-call items advertised in the response output
        const toolCalls = outputItems.filter((o: any) => o?.type === 'function_call');
        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i];
          otelSpan.setAttribute(`neatlogs.llm.tool_calls.${i}.name`, tc.name ?? '');
          otelSpan.setAttribute(`neatlogs.llm.tool_calls.${i}.arguments`, typeof tc.arguments === 'string' ? tc.arguments : safeStringify(tc.arguments ?? {}));
          if (tc.callId ?? tc.id) otelSpan.setAttribute(`neatlogs.llm.tool_calls.${i}.id`, tc.callId ?? tc.id);
        }
      } else if (outputItems?.content) {
        otelSpan.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
        const c = outputItems.content;
        otelSpan.setAttribute('neatlogs.llm.output_messages.0.content', (typeof c === 'string' ? c : safeStringify(c)).slice(0, 10000));
      }

      const usage = data?.usage ?? resp?.usage;
      if (usage) {
        const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens;
        const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens;
        const totalTokens = usage.total_tokens ?? usage.totalTokens;
        if (inputTokens != null) otelSpan.setAttribute('neatlogs.llm.token_count.prompt', inputTokens);
        if (outputTokens != null) otelSpan.setAttribute('neatlogs.llm.token_count.completion', outputTokens);
        if (totalTokens != null) otelSpan.setAttribute('neatlogs.llm.token_count.total', totalTokens);
        else if (inputTokens != null && outputTokens != null) {
          otelSpan.setAttribute('neatlogs.llm.token_count.total', inputTokens + outputTokens);
        }
      }

    } else if (spanType === 'function' || spanType === 'tool' || spanType === 'tool_call') {
      const output = data?.output ?? data?.result;
      if (output != null) {
        otelSpan.setAttribute('output.value', (typeof output === 'string' ? output : safeStringify(output)).slice(0, 10000));
      }

    } else if (spanType === 'agent' || spanType === 'agent_run') {
      const output = data?.output;
      if (output != null) {
        otelSpan.setAttribute('output.value', (typeof output === 'string' ? output : safeStringify(output)).slice(0, 10000));
      }
    }

    const error = data?.error ?? span?.error;
    if (error) {
      if (error instanceof Error) {
        otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        otelSpan.recordException(error);
      } else {
        otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      }
    } else {
      otelSpan.setStatus({ code: SpanStatusCode.OK });
    }

    if (startTime) {
      otelSpan.setAttribute('neatlogs.llm.metrics.duration_ms', Date.now() - startTime);
    }

    otelSpan.end();
    this._spans.delete(spanId);
    this._startTimes.delete(spanId);
  }

  shutdown(): void {
    for (const [, span] of this._spans) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Processor shutdown before span completed' });
      span.end();
    }
    this._spans.clear();
    this._startTimes.clear();
  }

  forceFlush(): void {}
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return '';
  }
}
