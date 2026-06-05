/**
 * Neatlogs OpenRouter Agent integration.
 *
 * Wraps the `@openrouter/agent` SDK so each `client.callModel(...)` is traced.
 * The OpenRouter client returns a `ModelResult`; telemetry is finalized when the
 * result is consumed (via `getText()` / awaiting it / iterating it), matching the
 * SDK's lazy-evaluation model — a result that is never consumed ships no span.
 *
 * Usage:
 *   import { init } from 'neatlogs';
 *   import { wrapOpenRouterAgent } from 'neatlogs/openrouter-agent';
 *   import { OpenRouter } from '@openrouter/agent';
 *
 *   await init({ apiKey, workflowName });
 *   const openrouter = wrapOpenRouterAgent(new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }));
 *   const result = openrouter.callModel({ model: 'openai/gpt-4o', messages: [...] });
 *   const text = await result.getText();
 *
 * Also exports wrapCallModel() for the standalone callModel helper:
 *   const trackedCallModel = wrapCallModel(callModel);
 *   const result = trackedCallModel(openrouter, { model, messages });
 */

import { trace, context as otelContext, SpanStatusCode, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'neatlogs.openrouter_agent';
const PROVIDER = 'openrouter';

/**
 * Wrap an OpenRouter client instance so `callModel` emits LLM spans. Returns a
 * Proxy over the client; all other methods pass through unchanged.
 */
export function wrapOpenRouterAgent<T extends object>(client: T): T {
  const c = client as any;
  if (!c || c._neatlogsWrapped) return client;

  return new Proxy(client, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (prop === 'callModel' && typeof value === 'function') {
        return tracedCallModel(value.bind(obj));
      }
      return value;
    },
  }) as T;
}

/**
 * Wrap the standalone `callModel(client, opts)` helper. The wrapped function is
 * invoked with the client passed in: `trackedCallModel(openrouter, {...})`.
 */
export function wrapCallModel<F extends (...args: any[]) => any>(callModel: F): F {
  return function (this: any, clientArg: any, opts: any, ...rest: any[]): any {
    const span = startLlmSpan(opts);
    const ctx = trace.setSpan(otelContext.active(), span);
    const result = otelContext.with(ctx, () => callModel.call(this, clientArg, opts, ...rest));
    return instrumentModelResult(result, span);
  } as unknown as F;
}

// ---------------------------------------------------------------------------
// callModel wrapping
// ---------------------------------------------------------------------------

function tracedCallModel(original: (...args: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const span = startLlmSpan(opts);
    const ctx = trace.setSpan(otelContext.active(), span);
    const result = otelContext.with(ctx, () => original(opts, ...rest));
    return instrumentModelResult(result, span);
  };
}

function startLlmSpan(opts: any): Span {
  const tracer = trace.getTracer(TRACER_NAME);
  const model = opts?.model ?? '';

  const span = tracer.startSpan('openrouter.call_model', {
    attributes: {
      'neatlogs.span.kind': 'LLM',
      'neatlogs.llm.provider': PROVIDER,
      'neatlogs.llm.system': PROVIDER,
      'neatlogs.llm.model_name': model,
    },
  }, otelContext.active());

  // The @openrouter/agent callModel input is `input` — either a string prompt or
  // a messages array (it also accepts `messages`/`instructions` in some shapes).
  // Capture whichever is present as indexed input messages + the flat input.value
  // blob (the canonical UI-rendered field, per attribute-mapping.json).
  const messages: any[] = Array.isArray(opts?.messages)
    ? opts.messages
    : Array.isArray(opts?.input)
      ? opts.input
      : [];
  if (messages.length) {
    messages.forEach((msg, i) => {
      span.setAttribute(`neatlogs.llm.input_messages.${i}.role`, msg?.role ?? 'user');
      const content = msg?.content;
      span.setAttribute(
        `neatlogs.llm.input_messages.${i}.content`,
        typeof content === 'string' ? content : safeStringify(content),
      );
    });
    span.setAttribute('input.value', safeStringify({ messages }));
  } else if (typeof opts?.input === 'string') {
    span.setAttribute('neatlogs.llm.input_messages.0.role', 'user');
    span.setAttribute('neatlogs.llm.input_messages.0.content', opts.input);
    span.setAttribute('input.value', opts.input);
  }
  if (typeof opts?.instructions === 'string' && opts.instructions) {
    span.setAttribute('neatlogs.llm.system_prompt', opts.instructions);
  }

  if (Array.isArray(opts?.tools)) {
    for (let i = 0; i < opts.tools.length; i++) {
      const t = opts.tools[i] ?? {};
      const name = t.name ?? t.function?.name;
      if (name) span.setAttribute(`neatlogs.llm.tools.${i}.name`, name);
      const desc = t.description ?? t.function?.description;
      if (desc) span.setAttribute(`neatlogs.llm.tools.${i}.description`, desc);
    }
  }

  // @openrouter/agent's callModel request uses camelCase sampling params
  // (topP, maxOutputTokens, frequencyPenalty, presencePenalty, topK) derived
  // from the OpenResponses ResponsesRequest. Accept both camelCase and the
  // snake_case OpenAI-style variants so params are captured regardless of how
  // the caller spelled them.
  const temperature = opts?.temperature;
  const topP = opts?.top_p ?? opts?.topP;
  const maxTokens = opts?.max_tokens ?? opts?.maxTokens ?? opts?.max_output_tokens ?? opts?.maxOutputTokens;
  const frequencyPenalty = opts?.frequency_penalty ?? opts?.frequencyPenalty;
  const presencePenalty = opts?.presence_penalty ?? opts?.presencePenalty;
  const topK = opts?.top_k ?? opts?.topK;

  if (temperature != null) span.setAttribute('neatlogs.llm.temperature', temperature);
  if (topP != null) span.setAttribute('neatlogs.llm.top_p', topP);
  if (maxTokens != null) span.setAttribute('neatlogs.llm.max_tokens', maxTokens);

  // The backend reads invocation params ONLY from this JSON-string blob (parsed
  // into metadata.model_settings, which the UI renders). Individual attrs above
  // are kept for other consumers but are NOT what the UI shows. Only include
  // keys that are actually present so we never emit nulls.
  const params: Record<string, unknown> = {};
  if (temperature != null) params.temperature = temperature;
  if (topP != null) params.top_p = topP;
  if (maxTokens != null) params.max_tokens = maxTokens;
  if (frequencyPenalty != null) params.frequency_penalty = frequencyPenalty;
  if (presencePenalty != null) params.presence_penalty = presencePenalty;
  if (topK != null) params.top_k = topK;
  if (Object.keys(params).length) {
    span.setAttribute('neatlogs.llm.invocation_parameters', JSON.stringify(params));
  }

  return span;
}

/**
 * Wrap a ModelResult so the span is finalized exactly once, when the caller
 * consumes the result. We patch the common consumption methods (getText,
 * getMessage, then) so finalization happens on first use; a result that is
 * never consumed never finalizes (matching SDK semantics).
 */
function instrumentModelResult(result: any, span: Span): any {
  if (!result || (typeof result !== 'object' && typeof result !== 'function')) {
    // Synchronous/primitive return — nothing to defer; close immediately.
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return result;
  }

  let finalized = false;
  const finalizeFromResult = (resolved: any) => {
    if (finalized) return;
    finalized = true;
    try {
      finalizeLlm(span, resolved);
    } catch {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }
  };
  const finalizeError = (err: unknown) => {
    if (finalized) return;
    finalized = true;
    recordError(span, err);
  };

  // The @openrouter/agent ModelResult is consumed via getText()/getResponse()/
  // getTextStream(). Wrap with a Proxy to intercept whichever the caller uses
  // first; finalize the span from that, and grab usage via getResponse().
  return new Proxy(result, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);

      if (prop === 'getResponse' && typeof value === 'function') {
        return function (...args: any[]) {
          return Promise.resolve(value.apply(obj, args)).then(
            (resp: any) => {
              finalizeFromResult(resp); // full OpenResponsesResult (text + usage)
              return resp;
            },
            (err: any) => {
              finalizeError(err);
              throw err;
            },
          );
        };
      }

      if (prop === 'getText' && typeof value === 'function') {
        return function (...args: any[]) {
          return Promise.resolve(value.apply(obj, args)).then(
            async (textStr: any) => {
              // getText() resolves to a bare string (no usage). Usage lives on
              // getResponse(); fetch it FIRST (the SDK supports concurrent
              // consumption) so the span carries tokens — then finalize ONCE.
              // Finalizing ends the span, so late attributes would be dropped.
              let resp: any;
              if (typeof obj?.getResponse === 'function') {
                try {
                  resp = await obj.getResponse();
                } catch {
                  resp = undefined;
                }
              }
              finalizeFromResult(resp ? { ...resp, text: textStr } : { text: textStr });
              return textStr;
            },
            (err: any) => {
              finalizeError(err);
              throw err;
            },
          );
        };
      }

      if (prop === 'then' && typeof value === 'function') {
        // Result is awaitable directly: await result.
        return function (onFulfilled?: any, onRejected?: any) {
          return value.call(
            obj,
            (resolved: any) => {
              finalizeFromResult(typeof resolved === 'string' ? { text: resolved } : (resolved ?? obj));
              return onFulfilled ? onFulfilled(resolved) : resolved;
            },
            (err: any) => {
              finalizeError(err);
              return onRejected ? onRejected(err) : Promise.reject(err);
            },
          );
        };
      }

      return value;
    },
  });
}

/** Stamp usage from an @openrouter/agent OpenResponsesResult (inputTokens/outputTokens/...). */
function setOpenResponsesUsage(span: Span, resp: any): void {
  const u = resp?.usage ?? resp;
  if (!u) return;
  const input = u.inputTokens ?? u.input_tokens ?? u.prompt_tokens;
  const output = u.outputTokens ?? u.output_tokens ?? u.completion_tokens;
  const total = u.totalTokens ?? u.total_tokens;
  const cached = u.cachedTokens ?? u.cached_tokens;
  if (input != null) span.setAttribute('neatlogs.llm.token_count.prompt', input);
  if (output != null) span.setAttribute('neatlogs.llm.token_count.completion', output);
  if (total != null) span.setAttribute('neatlogs.llm.token_count.total', total);
  else if (input != null && output != null) span.setAttribute('neatlogs.llm.token_count.total', input + output);
  if (cached != null) span.setAttribute('neatlogs.llm.token_count.cache_read', cached);
}

function finalizeLlm(span: Span, result: any): void {
  // Text output. getText() gives a bare string (wrapped here as {text}); the
  // OpenResponsesResult from getResponse() carries text under output[]/output_text.
  const text =
    result?.text ??
    result?.output_text ??
    result?.content ??
    extractOpenResponsesText(result) ??
    result?.choices?.[0]?.message?.content ??
    result?.message?.content;
  if (text) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', String(text));
    span.setAttribute('output.value', String(text));
  }

  // Tool calls (OpenAI-compatible shape; OpenResponses uses output[] function_call items).
  const toolCalls =
    result?.toolCalls ??
    result?.tool_calls ??
    result?.choices?.[0]?.message?.tool_calls ??
    result?.message?.tool_calls;
  if (Array.isArray(toolCalls)) {
    toolCalls.forEach((tc: any, j: number) => {
      span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, tc?.id ?? '');
      span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, tc?.function?.name ?? tc?.name ?? '');
      const args = tc?.function?.arguments ?? tc?.arguments;
      span.setAttribute(`neatlogs.llm.tool_calls.${j}.arguments`, typeof args === 'string' ? args : safeStringify(args ?? {}));
    });
  }

  const model = result?.model ?? result?.response?.model;
  if (model) span.setAttribute('neatlogs.llm.model_name', String(model));

  const responseId = result?.id ?? result?.response?.id;
  if (responseId) span.setAttribute('neatlogs.llm.response_id', String(responseId));

  const finishReason = result?.finishReason ?? result?.finish_reason ?? result?.choices?.[0]?.finish_reason;
  if (finishReason) span.setAttribute('neatlogs.llm.finish_reason', String(finishReason));

  // Usage — OpenResponsesResult uses inputTokens/outputTokens; also handle the
  // OpenAI-compatible prompt_tokens/completion_tokens shape.
  setOpenResponsesUsage(span, result);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/** Pull assistant text out of an OpenResponses-style result (output[] of message items). */
function extractOpenResponsesText(result: any): string | undefined {
  const output = result?.output;
  if (!Array.isArray(output)) return undefined;
  const parts: string[] = [];
  for (const item of output) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string') parts.push(c.text);
      }
    }
  }
  return parts.length ? parts.join('') : undefined;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function recordError(span: Span, err: unknown): void {
  if (err instanceof Error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.recordException(err);
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  }
  span.end();
}
