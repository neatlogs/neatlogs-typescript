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
import {
  DEFAULT_MAX_STREAM_CAPTURE_BYTES,
  DEFAULT_MAX_STREAM_CAPTURE_ITEMS,
  utf8ByteLength,
} from './constants.js';
import { getProviderTracer } from './core/auto-root.js';
import { captureMedia, captureMediaWithIndex } from './core/media.js';
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
        },
      },
      getNeatlogsParentContext(),
    );
    span.setAttribute(
      'input.value',
      safeStringify(captureMedia(span, 'neatlogs.tool.input', input, 'input')),
    );
    return withNeatlogsSpan(span, async () => {
      try {
        const result = await fn(input);
        span.setAttribute(
          'output.value',
          safeStringify(captureMedia(span, 'neatlogs.tool.output', result, 'output')),
        );
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
  const accumulated = newAnthropicStreamAccumulator();
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
            finalizeStreamEvents(span, accumulated);
            return result;
          }
          addStreamEvent(span, accumulated, result.value);
          return result;
        } catch (err) {
          recordError(span, err);
          throw err;
        }
      },
      async return(value?: any): Promise<IteratorResult<any>> {
        markStreamIncomplete(accumulated, 'consumer_cancelled');
        span.setAttribute('neatlogs.stream.cancelled', true);
        const result = await (iterator.return?.(value) ?? { done: true, value: undefined });
        if (result.done) finalizeStreamEvents(span, accumulated);
        else addStreamEvent(span, accumulated, result.value);
        return result;
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

interface AnthropicStreamAccumulator {
  textParts: string[];
  thinkingParts: string[];
  toolCalls: Array<{ id: string; name: string; input: string; incomplete: boolean }>;
  currentToolInput: string[];
  currentToolId: string;
  currentToolName: string;
  currentToolIncomplete: boolean;
  usage: any;
  model: string;
  stopReason: string;
  mediaCount: number;
  capturedBytes: number;
  capturedItems: number;
  droppedBytes: number;
  droppedItems: number;
  incompleteReasons: Set<string>;
}

function newAnthropicStreamAccumulator(): AnthropicStreamAccumulator {
  return {
    textParts: [],
    thinkingParts: [],
    toolCalls: [],
    currentToolInput: [],
    currentToolId: '',
    currentToolName: '',
    currentToolIncomplete: false,
    usage: null,
    model: '',
    stopReason: '',
    mediaCount: 0,
    capturedBytes: 0,
    capturedItems: 0,
    droppedBytes: 0,
    droppedItems: 0,
    incompleteReasons: new Set(),
  };
}

function addStreamEvent(
  span: Span,
  accumulated: AnthropicStreamAccumulator,
  event: any,
): void {
  const type = event?.type ?? '';
  if (type === 'content_block_delta') {
    const delta = event?.delta;
    if (delta?.type === 'text_delta' && delta.text) {
      retainStreamString(accumulated, String(delta.text), (value) => {
        accumulated.textParts.push(value);
      });
    }
    else if (delta?.type === 'thinking_delta' && delta.thinking) {
      retainStreamString(accumulated, String(delta.thinking), (value) => {
        accumulated.thinkingParts.push(value);
      });
    } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
      const retained = retainStreamString(accumulated, String(delta.partial_json), (value) => {
        accumulated.currentToolInput.push(value);
      });
      if (!retained) accumulated.currentToolIncomplete = true;
    }
  } else if (type === 'content_block_start') {
    const captured = captureMediaWithIndex(
      span,
      'neatlogs.llm.output_messages.0',
      event?.content_block,
      'output',
      accumulated.mediaCount,
    );
    accumulated.mediaCount += captured.count;
    const block = captured.value as any;
    if (block?.type === 'tool_use') {
      accumulated.currentToolId = block.id ?? '';
      accumulated.currentToolName = block.name ?? '';
      accumulated.currentToolInput = [];
      accumulated.currentToolIncomplete = false;
      if (block.input != null && safeStringify(block.input) !== '{}') {
        const retained = retainStreamString(accumulated, safeStringify(block.input), (value) => {
          accumulated.currentToolInput.push(value);
        });
        if (!retained) accumulated.currentToolIncomplete = true;
      }
    }
  } else if (type === 'content_block_stop') {
    if (accumulated.currentToolName) {
      if (accumulated.toolCalls.length < DEFAULT_MAX_STREAM_CAPTURE_ITEMS) {
        accumulated.toolCalls.push({
          id: accumulated.currentToolId,
          name: accumulated.currentToolName,
          input: accumulated.currentToolInput.join(''),
          incomplete: accumulated.currentToolIncomplete,
        });
      } else {
        markStreamIncomplete(accumulated, 'item_limit_exceeded');
        accumulated.droppedItems += 1;
      }
      accumulated.currentToolId = '';
      accumulated.currentToolName = '';
      accumulated.currentToolInput = [];
      accumulated.currentToolIncomplete = false;
    }
  } else if (type === 'message_start') {
    const msg = event?.message;
    if (msg?.model) accumulated.model = msg.model;
    if (msg?.usage) accumulated.usage = msg.usage;
  } else if (type === 'message_delta') {
    const delta = event?.delta;
    if (delta?.stop_reason) accumulated.stopReason = delta.stop_reason;
    if (event?.usage) {
      accumulated.usage = { ...(accumulated.usage ?? {}), ...event.usage };
    }
  }
}

function finalizeStreamEvents(span: Span, accumulated: AnthropicStreamAccumulator): void {
  if (accumulated.currentToolName) {
    markStreamIncomplete(accumulated, 'unterminated_tool_call');
    if (accumulated.toolCalls.length < DEFAULT_MAX_STREAM_CAPTURE_ITEMS) {
      accumulated.toolCalls.push({
        id: accumulated.currentToolId,
        name: accumulated.currentToolName,
        input: accumulated.currentToolInput.join(''),
        incomplete: true,
      });
    } else {
      accumulated.droppedItems += 1;
    }
    accumulated.currentToolName = '';
  }
  const fullText = accumulated.textParts.join('');
  if (fullText) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', fullText);
  }

  const thinking = accumulated.thinkingParts.join('');
  if (thinking) {
    span.setAttribute('neatlogs.llm.output_messages.0.thinking', thinking);
  }

  for (let j = 0; j < accumulated.toolCalls.length; j++) {
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, accumulated.toolCalls[j].id);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, accumulated.toolCalls[j].name);
    span.setAttribute(
      `neatlogs.llm.tool_calls.${j}.arguments`,
      accumulated.toolCalls[j].incomplete
        ? '[incomplete: stream capture limit reached]'
        : sanitizeJsonToolArguments(
            span,
            `neatlogs.llm.tool_calls.${j}.arguments`,
            accumulated.toolCalls[j].input || '{}',
            accumulated,
          ),
    );
  }

  if (accumulated.model) span.setAttribute('neatlogs.llm.model_name', accumulated.model);
  if (accumulated.stopReason) span.setAttribute('neatlogs.llm.stop_reason', accumulated.stopReason);
  setUsageAttrs(span, accumulated.usage);
  applyStreamDiagnostics(span, accumulated);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Non-streaming response finalization
// ---------------------------------------------------------------------------

function finalizeMessageResponse(span: Span, response: any): void {
  const content: any[] = response?.content ?? [];
  const captured = captureMedia(
    span,
    'neatlogs.llm.output_messages.0',
    content,
    'output',
  );
  const capturedContent = Array.isArray(captured) ? captured : [];
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; input: string }> = [];

  for (const block of capturedContent) {
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

function markStreamIncomplete(
  accumulated: AnthropicStreamAccumulator,
  reason: string,
): void {
  accumulated.incompleteReasons.add(reason);
}

function retainStreamString(
  accumulated: AnthropicStreamAccumulator,
  value: string,
  retain: (value: string) => void,
): boolean {
  const remaining = Math.max(
    0,
    DEFAULT_MAX_STREAM_CAPTURE_BYTES - accumulated.capturedBytes,
  );
  const bytes = utf8ByteLength(value, remaining);
  if (accumulated.capturedItems >= DEFAULT_MAX_STREAM_CAPTURE_ITEMS) {
    accumulated.droppedItems += 1;
    accumulated.droppedBytes += bytes;
    markStreamIncomplete(accumulated, 'item_limit_exceeded');
    return false;
  }
  if (accumulated.capturedBytes + bytes > DEFAULT_MAX_STREAM_CAPTURE_BYTES) {
    accumulated.droppedItems += 1;
    accumulated.droppedBytes += bytes;
    markStreamIncomplete(accumulated, 'byte_limit_exceeded');
    return false;
  }
  retain(value);
  accumulated.capturedItems += 1;
  accumulated.capturedBytes += bytes;
  return true;
}

function sanitizeJsonToolArguments(
  span: Span,
  prefix: string,
  value: string,
  accumulated: AnthropicStreamAccumulator,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    markStreamIncomplete(accumulated, 'invalid_tool_arguments');
    return '[incomplete: invalid tool arguments omitted]';
  }
  const original = safeStringify(parsed);
  const sanitized = safeStringify(captureMedia(span, prefix, parsed, 'output'));
  return original === sanitized ? value : sanitized;
}

function applyStreamDiagnostics(
  span: Span,
  accumulated: AnthropicStreamAccumulator,
): void {
  span.setAttribute('neatlogs.stream.capture_bytes', accumulated.capturedBytes);
  span.setAttribute('neatlogs.stream.capture_items', accumulated.capturedItems);
  if (accumulated.incompleteReasons.size === 0) return;
  span.setAttribute('neatlogs.stream.incomplete', true);
  span.setAttribute(
    'neatlogs.stream.incomplete_reason',
    [...accumulated.incompleteReasons].sort().join(','),
  );
  if (accumulated.droppedBytes > 0) {
    span.setAttribute('neatlogs.stream.dropped_bytes', accumulated.droppedBytes);
    span.setAttribute('neatlogs.stream.dropped_bytes_is_lower_bound', true);
  }
  span.setAttribute('neatlogs.stream.dropped_items', accumulated.droppedItems);
  span.setAttribute('neatlogs.capture_fidelity', 'truncated');
}

function setInputMessages(span: Span, system: any, messages: any[]): void {
  let idx = 0;
  if (system) {
    const captured = captureMedia(
      span,
      `neatlogs.llm.input_messages.${idx}`,
      system,
      'input',
    );
    const content = typeof captured === 'string' ? captured : safeStringify(captured);
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'system');
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, content);
    idx++;
  }
  for (const msg of messages) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, msg.role ?? '');
    if (typeof msg.content === 'string') {
      span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, msg.content);
    } else if (msg.content) {
      const captured = captureMedia(
        span,
        `neatlogs.llm.input_messages.${idx}`,
        msg.content,
        'input',
      );
      span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, safeStringify(captured));
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
