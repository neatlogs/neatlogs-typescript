/**
 * Neatlogs Azure OpenAI wrapper — ES6 Proxy-based.
 *
 * Azure OpenAI is accessed through the `openai` SDK's `AzureOpenAI` client,
 * which exposes the same `chat.completions.create()` shape as `OpenAI`. This
 * wrapper traces those calls with provider `azure` so Azure traffic is
 * distinguished from direct OpenAI traffic.
 *
 * Usage:
 *   import { wrapAzureOpenAI } from 'neatlogs/azure-openai';
 *   import { AzureOpenAI } from 'openai';
 *   const client = wrapAzureOpenAI(new AzureOpenAI({ endpoint, apiKey, apiVersion }));
 *   await client.chat.completions.create({ model: 'gpt-4o', messages: [...] });
 *
 * Intercepts:
 *   - client.chat.completions.create() — non-streaming and streaming
 *   - client.responses.create()        — Responses API
 */

import { trace, context as otelContext, SpanStatusCode, type Span } from '@opentelemetry/api';
import { getProviderTracer } from './core/auto-root.js';

const TRACER_NAME = 'neatlogs.azure_openai';
const PROVIDER = 'azure';
const SYSTEM = 'azure';

export function wrapAzureOpenAI<T extends object>(client: T): T {
  return wrapNamespace(client, []) as T;
}

/**
 * Wrap a tool/function implementation to emit TOOL spans when executed.
 *
 * Usage:
 *   const getWeather = traceTool('get_weather', async (args: { city: string }) => {
 *     return `Weather in ${args.city}: sunny`;
 *   });
 */
export function traceTool<TArgs = any, TResult = any>(
  name: string,
  fn: (args: TArgs) => TResult | Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async function tracedTool(args: TArgs): Promise<TResult> {
    const tracer = getProviderTracer(TRACER_NAME);
    return tracer.startActiveSpan(
      `tool.${name}`,
      {
        attributes: {
          'neatlogs.span.kind': 'TOOL',
          'neatlogs.tool.name': name,
          'input.value': safeStringify(args),
        },
      },
      otelContext.active(),
      async (span) => {
        try {
          const result = await fn(args);
          span.setAttribute('output.value', safeStringify(result));
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          recordError(span, err);
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };
}

function wrapNamespace(target: any, path: string[]): any {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof prop === 'symbol' || String(prop).startsWith('_')) return value;

      const currentPath = [...path, String(prop)];
      const pathStr = currentPath.join('.');

      if (pathStr === 'chat.completions.create' && typeof value === 'function') {
        return tracedChatCompletionsCreate(value.bind(obj));
      }
      if (pathStr === 'responses.create' && typeof value === 'function') {
        return tracedResponsesCreate(value.bind(obj));
      }

      if (value && typeof value === 'object' && !Array.isArray(value) && isNamespace(currentPath)) {
        return wrapNamespace(value, currentPath);
      }

      return value;
    },
  });
}

function isNamespace(path: string[]): boolean {
  if (path.length > 3) return false;
  const key = path[path.length - 1];
  return ['chat', 'completions', 'responses', 'beta'].includes(key);
}

// ---------------------------------------------------------------------------
// chat.completions.create — non-streaming + streaming
// ---------------------------------------------------------------------------

function tracedChatCompletionsCreate(original: (...args: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const model = opts?.model ?? '';
    const messages: any[] = opts?.messages ?? [];
    const isStream = opts?.stream === true;

    const span = tracer.startSpan('azure_openai.chat.completions.create', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': PROVIDER,
        'neatlogs.llm.system': SYSTEM,
        'neatlogs.llm.model_name': model,
        'neatlogs.llm.is_streaming': isStream,
      },
    }, otelContext.active());

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      span.setAttribute(`neatlogs.llm.input_messages.${i}.role`, msg.role ?? '');
      if (typeof msg.content === 'string') {
        span.setAttribute(`neatlogs.llm.input_messages.${i}.content`, msg.content);
      } else if (msg.content) {
        span.setAttribute(`neatlogs.llm.input_messages.${i}.content`, safeStringify(msg.content));
      }
      if (msg.tool_call_id) {
        span.setAttribute(`neatlogs.llm.input_messages.${i}.tool_call_id`, msg.tool_call_id);
      }
    }

    if (opts?.tools) {
      for (let i = 0; i < opts.tools.length; i++) {
        const fn = opts.tools[i]?.function ?? {};
        span.setAttribute(`neatlogs.llm.tools.${i}.name`, fn.name ?? '');
        if (fn.description) span.setAttribute(`neatlogs.llm.tools.${i}.description`, fn.description);
        if (fn.parameters) span.setAttribute(`neatlogs.llm.tools.${i}.input_schema`, safeStringify(fn.parameters));
      }
    }

    setInvocationParams(span, opts);

    if (isStream) {
      opts = { ...opts };
      const streamOpts = opts.stream_options ?? {};
      if (!streamOpts.include_usage) {
        opts.stream_options = { ...streamOpts, include_usage: true };
      }
    }

    const ctx = trace.setSpan(otelContext.active(), span);
    const promise = otelContext.with(ctx, () => original(opts, ...rest));

    return promise.then(
      (response: any) => {
        if (isStream) {
          return wrapAsyncIterableStream(response, span);
        }
        finalizeChatResponse(span, response);
        return response;
      },
      (err: any) => {
        recordError(span, err);
        throw err;
      },
    );
  };
}

// ---------------------------------------------------------------------------
// responses.create
// ---------------------------------------------------------------------------

function tracedResponsesCreate(original: (...args: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const model = opts?.model ?? '';

    const span = tracer.startSpan('azure_openai.responses.create', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': PROVIDER,
        'neatlogs.llm.system': SYSTEM,
        'neatlogs.llm.model_name': model,
        'input.value': safeStringify(opts?.input ?? ''),
      },
    }, otelContext.active());

    const ctx = trace.setSpan(otelContext.active(), span);
    const promise = otelContext.with(ctx, () => original(opts, ...rest));

    return promise.then(
      (response: any) => {
        if (response?.output_text) {
          span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
          span.setAttribute('neatlogs.llm.output_messages.0.content', response.output_text);
        }
        if (response?.model) span.setAttribute('neatlogs.llm.model_name', response.model);
        if (response?.usage) {
          if (response.usage.input_tokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', response.usage.input_tokens);
          if (response.usage.output_tokens != null) span.setAttribute('neatlogs.llm.token_count.completion', response.usage.output_tokens);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return response;
      },
      (err: any) => {
        recordError(span, err);
        throw err;
      },
    );
  };
}

// ---------------------------------------------------------------------------
// Streaming support
// ---------------------------------------------------------------------------

function wrapAsyncIterableStream(stream: any, span: Span): any {
  const chunks: any[] = [];
  const originalAsyncIterator = stream?.[Symbol.asyncIterator]?.bind(stream);

  if (!originalAsyncIterator) {
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return stream;
  }

  const wrapped = Object.create(Object.getPrototypeOf(stream));
  Object.assign(wrapped, stream);

  wrapped[Symbol.asyncIterator] = function () {
    const iterator = originalAsyncIterator();
    return {
      async next(): Promise<IteratorResult<any>> {
        try {
          const result = await iterator.next();
          if (result.done) {
            finalizeStreamChunks(span, chunks);
            return result;
          }
          chunks.push(result.value);
          return result;
        } catch (err) {
          recordError(span, err);
          throw err;
        }
      },
      async return(value?: any): Promise<IteratorResult<any>> {
        finalizeStreamChunks(span, chunks);
        return iterator.return?.(value) ?? { done: true, value: undefined };
      },
      async throw(err?: any): Promise<IteratorResult<any>> {
        recordError(span, err);
        return iterator.throw?.(err) ?? { done: true, value: undefined };
      },
    };
  };

  return wrapped;
}

function finalizeStreamChunks(span: Span, chunks: any[]): void {
  const textParts: string[] = [];
  const toolCallsAcc: Record<number, { id: string; name: string; arguments: string }> = {};
  let finishReason = '';
  let model = '';
  let usage: any = null;

  for (const chunk of chunks) {
    if (!chunk?.choices?.length) {
      if (chunk?.usage) usage = chunk.usage;
      continue;
    }
    const choice = chunk.choices[0];
    const delta = choice?.delta;
    if (delta?.content) textParts.push(delta.content);
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { id: '', name: '', arguments: '' };
        if (tc.id) toolCallsAcc[idx].id = tc.id;
        if (tc.function?.name) toolCallsAcc[idx].name = tc.function.name;
        if (tc.function?.arguments) toolCallsAcc[idx].arguments += tc.function.arguments;
      }
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk?.model) model = chunk.model;
  }

  const fullText = textParts.join('');
  if (fullText) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', fullText);
  }

  let j = 0;
  for (const tc of Object.values(toolCallsAcc)) {
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, tc.id);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, tc.name);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.arguments`, tc.arguments);
    j++;
  }

  if (model) span.setAttribute('neatlogs.llm.model_name', model);
  if (finishReason) span.setAttribute('neatlogs.llm.finish_reason', finishReason);

  if (usage) {
    if (usage.prompt_tokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.prompt_tokens);
    if (usage.completion_tokens != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.completion_tokens);
    if (usage.total_tokens != null) span.setAttribute('neatlogs.llm.token_count.total', usage.total_tokens);
    if (usage.prompt_tokens_details?.cached_tokens != null) {
      span.setAttribute('neatlogs.llm.token_count.cache_read', usage.prompt_tokens_details.cached_tokens);
    }
    if (usage.completion_tokens_details?.reasoning_tokens != null) {
      span.setAttribute('neatlogs.llm.token_count.reasoning', usage.completion_tokens_details.reasoning_tokens);
    }
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Non-streaming response finalization
// ---------------------------------------------------------------------------

function finalizeChatResponse(span: Span, response: any): void {
  const choices = response?.choices ?? [];
  for (let i = 0; i < choices.length; i++) {
    const message = choices[i]?.message;
    if (!message) continue;

    span.setAttribute(`neatlogs.llm.output_messages.${i}.role`, 'assistant');
    if (message.content) {
      span.setAttribute(`neatlogs.llm.output_messages.${i}.content`, message.content);
    }
    if (message.tool_calls) {
      for (let j = 0; j < message.tool_calls.length; j++) {
        const tc = message.tool_calls[j];
        span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, tc.id ?? '');
        span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, tc.function?.name ?? '');
        span.setAttribute(`neatlogs.llm.tool_calls.${j}.arguments`, tc.function?.arguments ?? '');
      }
    }
    if (choices[i].finish_reason) {
      span.setAttribute('neatlogs.llm.finish_reason', choices[i].finish_reason);
    }
  }

  const usage = response?.usage;
  if (usage) {
    if (usage.prompt_tokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.prompt_tokens);
    if (usage.completion_tokens != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.completion_tokens);
    if (usage.total_tokens != null) span.setAttribute('neatlogs.llm.token_count.total', usage.total_tokens);
    if (usage.prompt_tokens_details?.cached_tokens != null) {
      span.setAttribute('neatlogs.llm.token_count.cache_read', usage.prompt_tokens_details.cached_tokens);
    }
    if (usage.completion_tokens_details?.reasoning_tokens != null) {
      span.setAttribute('neatlogs.llm.token_count.reasoning', usage.completion_tokens_details.reasoning_tokens);
    }
  }

  if (response?.model) span.setAttribute('neatlogs.llm.model_name', response.model);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function setInvocationParams(span: Span, opts: any): void {
  if (opts?.temperature != null) span.setAttribute('neatlogs.llm.temperature', opts.temperature);
  if (opts?.top_p != null) span.setAttribute('neatlogs.llm.top_p', opts.top_p);
  if (opts?.max_tokens != null) span.setAttribute('neatlogs.llm.max_tokens', opts.max_tokens);
  if (opts?.frequency_penalty != null) span.setAttribute('neatlogs.llm.frequency_penalty', opts.frequency_penalty);
  if (opts?.presence_penalty != null) span.setAttribute('neatlogs.llm.presence_penalty', opts.presence_penalty);
  if (opts?.stop) span.setAttribute('neatlogs.llm.stop_sequences', safeStringify(opts.stop));
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
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
