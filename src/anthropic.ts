/**
 * Neatlogs Anthropic wrapper — ES6 Proxy-based.
 *
 * Usage:
 *   import { wrapAnthropic, traceTool } from 'neatlogs/anthropic';
 *   import Anthropic from '@anthropic-ai/sdk';
 *   const client = wrapAnthropic(new Anthropic());
 *
 * Intercepts:
 *   - client.messages.create() — non-streaming and streaming (stream: true)
 *   - client.messages.stream() — Anthropic's streaming helper (MessageStream)
 *
 * Also exports traceTool() to wrap user-defined tool functions with TOOL spans.
 * Handles thinking blocks, tool_use blocks, and cache tokens.
 */

import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { getProviderTracer } from './core/auto-root.js';
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  withNeatlogsSpan,
} from './core/provider.js';

const TRACER_NAME = 'neatlogs.anthropic';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function wrapAnthropic<T extends object>(client: T): T {
  return wrapNamespace(client, []) as T;
}

/**
 * Wrap a tool/function implementation to emit TOOL spans when executed.
 *
 * Usage:
 *   const getWeather = traceTool('get_weather', async (input: { city: string }) => {
 *     return `Weather in ${input.city}: sunny`;
 *   });
 */
export function traceTool<TInput = any, TResult = any>(
  name: string,
  fn: (input: TInput) => TResult | Promise<TResult>,
): (input: TInput) => Promise<TResult> {
  return async function tracedTool(input: TInput): Promise<TResult> {
    const tracer = getNeatlogsTracer(TRACER_NAME);
    const span = tracer.startSpan(
      `tool.${name}`,
      {
        attributes: {
          'neatlogs.span.kind': 'TOOL',
          'neatlogs.tool.name': name,
          'input.value': safeStringify(input),
        },
      },
      getNeatlogsParentContext(),
    );
    return withNeatlogsSpan(span, async () => {
      try {
        const result = await fn(input);
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

      if (pathStr === 'messages.create' && typeof value === 'function') {
        return tracedMessagesCreate(value.bind(obj));
      }
      if (pathStr === 'messages.stream' && typeof value === 'function') {
        return tracedMessagesStream(value.bind(obj));
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
  return ['messages', 'beta'].includes(key);
}

// ---------------------------------------------------------------------------
// messages.create — non-streaming + streaming (stream: true)
// ---------------------------------------------------------------------------

function tracedMessagesCreate(original: (...args: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const model = opts?.model ?? '';
    const messages: any[] = opts?.messages ?? [];
    const isStream = opts?.stream === true;

    const span = tracer.startSpan('anthropic.messages.create', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': 'anthropic',
        'neatlogs.llm.system': 'anthropic',
        'neatlogs.llm.model_name': model,
        'neatlogs.llm.is_streaming': isStream,
      },
    }, getNeatlogsParentContext());

    setInputMessages(span, opts?.system, messages);
    setTools(span, opts?.tools);
    setInvocationParams(span, opts);

    const promise = withNeatlogsSpan(span, () => original(opts, ...rest));

    return promise.then(
      (response: any) => {
        if (isStream) {
          return wrapStreamIterable(response, span);
        }
        finalizeMessageResponse(span, response);
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
// messages.stream() — returns a MessageStream object
// ---------------------------------------------------------------------------

function tracedMessagesStream(original: (...args: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const model = opts?.model ?? '';
    const messages: any[] = opts?.messages ?? [];

    const span = tracer.startSpan('anthropic.messages.stream', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': 'anthropic',
        'neatlogs.llm.system': 'anthropic',
        'neatlogs.llm.model_name': model,
        'neatlogs.llm.is_streaming': true,
      },
    }, getNeatlogsParentContext());

    setInputMessages(span, opts?.system, messages);
    setTools(span, opts?.tools);
    setInvocationParams(span, opts);

    const messageStream = withNeatlogsSpan(span, () => original(opts, ...rest));

    return wrapMessageStream(messageStream, span);
  };
}

// ---------------------------------------------------------------------------
// Streaming: async iterable (stream: true returns events)
// ---------------------------------------------------------------------------

function wrapStreamIterable(stream: any, span: Span): any {
  const events: any[] = [];
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
            finalizeStreamEvents(span, events);
            return result;
          }
          events.push(result.value);
          return result;
        } catch (err) {
          recordError(span, err);
          throw err;
        }
      },
      async return(value?: any): Promise<IteratorResult<any>> {
        finalizeStreamEvents(span, events);
        return iterator.return?.(value) ?? { done: true, value: undefined };
      },
      async throw(err?: any): Promise<IteratorResult<any>> {
        recordError(span, err);
        return iterator.throw?.(err) ?? { done: true, value: undefined };
      },
    };
  };

  if (typeof stream.finalMessage === 'function') {
    const origFinal = stream.finalMessage.bind(stream);
    wrapped.finalMessage = async function () {
      return origFinal();
    };
  }

  return wrapped;
}

// ---------------------------------------------------------------------------
// Streaming: MessageStream (.on('end'), .finalMessage())
// ---------------------------------------------------------------------------

function wrapMessageStream(messageStream: any, span: Span): any {
  const origOn = messageStream.on?.bind(messageStream);
  if (origOn) {
    origOn('end', () => {
      const finalMsg = messageStream._finalMessage ?? messageStream.currentMessage;
      if (finalMsg) {
        finalizeMessageResponse(span, finalMsg);
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }
    });
    origOn('error', (err: any) => {
      if (span.isRecording()) recordError(span, err);
    });
  }

  if (typeof messageStream.finalMessage === 'function') {
    const origFinal = messageStream.finalMessage.bind(messageStream);
    messageStream.finalMessage = async function () {
      const result = await origFinal();
      if (span.isRecording()) {
        finalizeMessageResponse(span, result);
      }
      return result;
    };
  }

  return messageStream;
}

// ---------------------------------------------------------------------------
// Stream event finalization
// ---------------------------------------------------------------------------

function finalizeStreamEvents(span: Span, events: any[]): void {
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; input: string }> = [];
  let currentToolInput = '';
  let currentToolId = '';
  let currentToolName = '';
  let usage: any = null;
  let model = '';
  let stopReason = '';

  for (const event of events) {
    const type = event?.type ?? '';

    if (type === 'content_block_delta') {
      const delta = event?.delta;
      if (delta?.type === 'text_delta' && delta.text) textParts.push(delta.text);
      else if (delta?.type === 'thinking_delta' && delta.thinking) thinkingParts.push(delta.thinking);
      else if (delta?.type === 'input_json_delta' && delta.partial_json) currentToolInput += delta.partial_json;
    } else if (type === 'content_block_start') {
      const block = event?.content_block;
      if (block?.type === 'tool_use') {
        currentToolId = block.id ?? '';
        currentToolName = block.name ?? '';
        currentToolInput = '';
      }
    } else if (type === 'content_block_stop') {
      if (currentToolName) {
        toolCalls.push({ id: currentToolId, name: currentToolName, input: currentToolInput });
        currentToolId = '';
        currentToolName = '';
        currentToolInput = '';
      }
    } else if (type === 'message_start') {
      const msg = event?.message;
      if (msg?.model) model = msg.model;
      if (msg?.usage) usage = msg.usage;
    } else if (type === 'message_delta') {
      const delta = event?.delta;
      if (delta?.stop_reason) stopReason = delta.stop_reason;
      if (event?.usage) usage = { ...(usage ?? {}), ...event.usage };
    }
  }

  const fullText = textParts.join('');
  if (fullText) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', fullText);
  }

  const thinking = thinkingParts.join('');
  if (thinking) {
    span.setAttribute('neatlogs.llm.output_messages.0.thinking', thinking);
  }

  for (let j = 0; j < toolCalls.length; j++) {
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, toolCalls[j].id);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, toolCalls[j].name);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.arguments`, toolCalls[j].input);
  }

  if (model) span.setAttribute('neatlogs.llm.model_name', model);
  if (stopReason) span.setAttribute('neatlogs.llm.stop_reason', stopReason);
  setUsageAttrs(span, usage);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Non-streaming response finalization
// ---------------------------------------------------------------------------

function finalizeMessageResponse(span: Span, response: any): void {
  const content: any[] = response?.content ?? [];
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; input: string }> = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) textParts.push(block.text);
    else if (block.type === 'thinking' && block.thinking) thinkingParts.push(block.thinking);
    else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id ?? '',
        name: block.name ?? '',
        input: safeStringify(block.input ?? {}),
      });
    }
  }

  if (textParts.length) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', textParts.join(''));
  }
  if (thinkingParts.length) {
    span.setAttribute('neatlogs.llm.output_messages.0.thinking', thinkingParts.join(''));
  }

  for (let j = 0; j < toolCalls.length; j++) {
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, toolCalls[j].id);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, toolCalls[j].name);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.arguments`, toolCalls[j].input);
  }

  setUsageAttrs(span, response?.usage);
  if (response?.model) span.setAttribute('neatlogs.llm.model_name', response.model);
  if (response?.stop_reason) span.setAttribute('neatlogs.llm.stop_reason', response.stop_reason);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function setInputMessages(span: Span, system: any, messages: any[]): void {
  let idx = 0;
  if (system) {
    const content = typeof system === 'string' ? system : safeStringify(system);
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'system');
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, content);
    idx++;
  }
  for (const msg of messages) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, msg.role ?? '');
    if (typeof msg.content === 'string') {
      span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, msg.content);
    } else if (msg.content) {
      span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, safeStringify(msg.content));
    }
    idx++;
  }
}

function setTools(span: Span, tools: any[] | undefined): void {
  if (!tools) return;
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    span.setAttribute(`neatlogs.llm.tools.${i}.name`, tool.name ?? '');
    if (tool.description) span.setAttribute(`neatlogs.llm.tools.${i}.description`, tool.description);
    if (tool.input_schema) span.setAttribute(`neatlogs.llm.tools.${i}.input_schema`, safeStringify(tool.input_schema));
  }
}

function setInvocationParams(span: Span, opts: any): void {
  if (opts?.temperature != null) span.setAttribute('neatlogs.llm.temperature', opts.temperature);
  if (opts?.top_p != null) span.setAttribute('neatlogs.llm.top_p', opts.top_p);
  if (opts?.top_k != null) span.setAttribute('neatlogs.llm.top_k', opts.top_k);
  if (opts?.max_tokens != null) span.setAttribute('neatlogs.llm.max_tokens', opts.max_tokens);
  if (opts?.stop_sequences) span.setAttribute('neatlogs.llm.stop_sequences', safeStringify(opts.stop_sequences));
}

function setUsageAttrs(span: Span, usage: any): void {
  if (!usage) return;
  if (usage.input_tokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.input_tokens);
  if (usage.output_tokens != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.output_tokens);
  if (usage.cache_read_input_tokens != null) span.setAttribute('neatlogs.llm.token_count.cache_read', usage.cache_read_input_tokens);
  if (usage.cache_creation_input_tokens != null) span.setAttribute('neatlogs.llm.token_count.cache_write', usage.cache_creation_input_tokens);
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
