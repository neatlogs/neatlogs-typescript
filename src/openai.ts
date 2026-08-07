/**
 * Neatlogs OpenAI wrapper — ES6 Proxy-based.
 *
 * Usage:
 *   import { wrapOpenAI, traceTool } from 'neatlogs/openai';
 *   import OpenAI from 'openai';
 *   const client = wrapOpenAI(new OpenAI());
 *
 * Intercepts:
 *   - client.chat.completions.create() — non-streaming and streaming
 *   - client.responses.create() — Responses API
 *
 * Also exports traceTool() to wrap user-defined tool functions with TOOL spans.
 */

import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { getProviderTracer } from './core/auto-root.js';
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  withNeatlogsSpan,
} from './core/provider.js';

const TRACER_NAME = 'neatlogs.openai';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function wrapOpenAI<T extends object>(client: T): T {
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
    const tracer = getNeatlogsTracer(TRACER_NAME);
    const span = tracer.startSpan(
      `tool.${name}`,
      {
        attributes: {
          'neatlogs.span.kind': 'TOOL',
          'neatlogs.tool.name': name,
          'input.value': safeStringify(args),
        },
      },
      getNeatlogsParentContext(),
    );
    return withNeatlogsSpan(span, async () => {
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
    });
  };
}

// ---------------------------------------------------------------------------
// Proxy wrapping
// ---------------------------------------------------------------------------

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

    const span = tracer.startSpan('openai.chat.completions.create', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': 'openai',
        'neatlogs.llm.system': 'openai',
        'neatlogs.llm.model_name': model,
        'neatlogs.llm.is_streaming': isStream,
      },
    }, getNeatlogsParentContext());

    // Input messages
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

    // Tools
    if (opts?.tools) {
      for (let i = 0; i < opts.tools.length; i++) {
        const fn = opts.tools[i]?.function ?? {};
        span.setAttribute(`neatlogs.llm.tools.${i}.name`, fn.name ?? '');
        if (fn.description) span.setAttribute(`neatlogs.llm.tools.${i}.description`, fn.description);
        if (fn.parameters) span.setAttribute(`neatlogs.llm.tools.${i}.input_schema`, safeStringify(fn.parameters));
      }
    }

    // Invocation parameters
    setInvocationParams(span, opts);

    // Force stream_options.include_usage for streaming
    if (isStream) {
      opts = { ...opts };
      const streamOpts = opts.stream_options ?? {};
      if (!streamOpts.include_usage) {
        opts.stream_options = { ...streamOpts, include_usage: true };
      }
    }

    const promise = withNeatlogsSpan(span, () => original(opts, ...rest));

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
    const isStream = opts?.stream === true;

    const span = tracer.startSpan('openai.responses.create', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': 'openai',
        'neatlogs.llm.system': 'openai',
        'neatlogs.llm.model_name': model,
        'neatlogs.llm.is_streaming': isStream,
        'input.value': safeStringify(opts?.input ?? ''),
      },
    }, getNeatlogsParentContext());

    setInvocationParams(span, opts);

    const promise = withNeatlogsSpan(span, () => original(opts, ...rest));

    return promise.then(
      (response: any) => {
        if (isStream) {
          return wrapResponsesAsyncIterableStream(response, span);
        }
        finalizeResponsesResponse(span, response);
        return response;
      },
      (err: any) => {
        recordError(span, err);
        throw err;
      },
    );
  };
}

/**
 * Keep a Responses API LLM span open until a streamed response is consumed.
 * `responses.create({ stream: true })` resolves to an async iterable immediately;
 * the assistant text and usage arrive later in `response.*` events.
 */
function wrapResponsesAsyncIterableStream(stream: any, span: Span): any {
  const originalAsyncIterator = stream?.[Symbol.asyncIterator]?.bind(stream);

  if (!originalAsyncIterator) {
    // Be defensive about clients that ignore `stream: true` and return a normal
    // response object.
    finalizeResponsesResponse(span, stream);
    return stream;
  }

  const textParts: string[] = [];
  let completedResponse: any;
  let finalized = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    finalizeResponsesResponse(span, completedResponse, textParts.join(''));
  };

  // A proxy preserves the OpenAI stream's public surface. Binding methods back
  // to the original object also avoids breaking SDK classes with private fields.
  return new Proxy(stream, {
    get(target, prop) {
      if (prop === Symbol.asyncIterator) {
        return () => {
          const iterator = originalAsyncIterator();
          return {
            async next(): Promise<IteratorResult<any>> {
              try {
                const result = await iterator.next();
                if (result.done) {
                  finalize();
                  return result;
                }

                const event = result.value;
                if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                  textParts.push(event.delta);
                } else if (event?.type === 'response.completed') {
                  completedResponse = event.response;
                }
                return result;
              } catch (err) {
                if (!finalized) {
                  finalized = true;
                  recordError(span, err);
                }
                throw err;
              }
            },
            async return(value?: any): Promise<IteratorResult<any>> {
              try {
                return await (iterator.return?.(value) ?? { done: true, value });
              } finally {
                finalize();
              }
            },
            async throw(err?: any): Promise<IteratorResult<any>> {
              if (!finalized) {
                finalized = true;
                recordError(span, err);
              }
              if (iterator.throw) return iterator.throw(err);
              throw err;
            },
          };
        };
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function finalizeResponsesResponse(span: Span, response: any, streamedText = ''): void {
  const text = response?.output_text || streamedText || extractResponsesOutputText(response?.output);
  if (text) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', text);
    span.setAttribute('output.value', text);
  } else if (response?.output) {
    // Tool-call-only responses still have a meaningful structured output.
    span.setAttribute('output.value', safeStringify(response.output));
  }

  if (response?.model) span.setAttribute('neatlogs.llm.model_name', response.model);
  if (response?.status) span.setAttribute('neatlogs.llm.finish_reason', response.status);

  const usage = response?.usage;
  if (usage) {
    if (usage.input_tokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.input_tokens);
    if (usage.output_tokens != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.output_tokens);
    if (usage.total_tokens != null) span.setAttribute('neatlogs.llm.token_count.total', usage.total_tokens);
    if (usage.input_tokens_details?.cached_tokens != null) {
      span.setAttribute('neatlogs.llm.token_count.cache_read', usage.input_tokens_details.cached_tokens);
    }
    if (usage.output_tokens_details?.reasoning_tokens != null) {
      span.setAttribute('neatlogs.llm.token_count.reasoning', usage.output_tokens_details.reasoning_tokens);
    }
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

function extractResponsesOutputText(output: any): string {
  if (!Array.isArray(output)) return '';
  const parts: string[] = [];
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Streaming support
// ---------------------------------------------------------------------------

function wrapAsyncIterableStream(stream: any, span: Span): any {
  const chunks: any[] = [];
  const originalAsyncIterator = stream[Symbol.asyncIterator]?.bind(stream);

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
