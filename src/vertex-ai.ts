/**
 * Neatlogs Vertex AI wrapper — ES6 Proxy-based.
 *
 * Vertex AI is accessed through the same `@google/genai` SDK as Gemini, but in
 * Vertex mode (`new GoogleGenAI({ vertexai: true, project, location })`). This
 * wrapper traces those clients with provider `vertex_ai` so Vertex traffic is
 * distinguished from Google AI Studio (Gemini) traffic.
 *
 * Usage:
 *   import { wrapVertexAI } from 'neatlogs/vertex-ai';
 *   import { GoogleGenAI } from '@google/genai';
 *   const client = wrapVertexAI(new GoogleGenAI({ vertexai: true, project: 'p', location: 'us-central1' }));
 *   const res = await client.models.generateContent({ model: 'gemini-2.0-flash', contents: 'Hello' });
 *
 * Intercepts:
 *   - client.models.generateContent()        — non-streaming
 *   - client.models.generateContentStream()  — streaming (async iterable)
 *   - client.models.embedContent()           — embeddings
 *   - client.models.countTokens()            — token counting
 *   - chat.sendMessage() / sendMessageStream() — chat sessions
 */

import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { getProviderTracer } from './core/auto-root.js';
import { captureMedia, captureMediaWithIndex } from './core/media.js';
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  withNeatlogsSpan,
} from './core/provider.js';

const TRACER_NAME = 'neatlogs.vertex_ai';
const PROVIDER = 'vertex_ai';
const SYSTEM = 'vertexai';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function wrapVertexAI<T extends object>(client: T): T {
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

      if (pathStr === 'models.generateContent' && typeof value === 'function') {
        return tracedGenerateContent(value.bind(obj), false);
      }
      if (pathStr === 'models.generateContentStream' && typeof value === 'function') {
        return tracedGenerateContent(value.bind(obj), true);
      }
      if (pathStr === 'models.embedContent' && typeof value === 'function') {
        return tracedEmbedContent(value.bind(obj));
      }
      if (pathStr === 'models.countTokens' && typeof value === 'function') {
        return tracedCountTokens(value.bind(obj));
      }

      if (value && typeof value === 'object' && !Array.isArray(value) && isNamespace(currentPath)) {
        return wrapNamespace(value, currentPath);
      }

      return value;
    },
  });
}

function isNamespace(path: string[]): boolean {
  if (path.length > 2) return false;
  return ['models', 'chats'].includes(path[path.length - 1]);
}

/**
 * Wrap a chat session returned by `client.chats.create(...)`. The `@google/genai`
 * Chat object exposes `sendMessage` / `sendMessageStream`; wrap them so each turn
 * emits an LLM span. Returns the same chat instance.
 */
export function wrapVertexAIChat<T extends object>(chat: T): T {
  const c = chat as any;
  if (!c || c._neatlogsVertexPatched) return chat;

  if (typeof c.sendMessage === 'function') {
    const orig = c.sendMessage.bind(c);
    c.sendMessage = (params: any, ...rest: any[]) => tracedChatSend(orig, c, params, rest, false);
  }
  if (typeof c.sendMessageStream === 'function') {
    const orig = c.sendMessageStream.bind(c);
    c.sendMessageStream = (params: any, ...rest: any[]) => tracedChatSend(orig, c, params, rest, true);
  }

  try {
    Object.defineProperty(c, '_neatlogsVertexPatched', { value: true, enumerable: false, configurable: true });
  } catch {
    c._neatlogsVertexPatched = true;
  }
  return chat;
}

function tracedChatSend(
  original: (...a: any[]) => any,
  chat: any,
  params: any,
  rest: any[],
  isStream: boolean,
): any {
  const tracer = getProviderTracer(TRACER_NAME);
  const model = chat?.model ?? chat?.modelVersion ?? '';
  const span = tracer.startSpan('vertex_ai.chat.send_message', {
    attributes: {
      'neatlogs.span.kind': 'LLM',
      'neatlogs.llm.provider': PROVIDER,
      'neatlogs.llm.system': SYSTEM,
      'neatlogs.llm.model_name': model,
      'neatlogs.llm.is_streaming': isStream,
    },
  }, getNeatlogsParentContext());

  // The chat sendMessage param shape is { message } (string or Part[]).
  const message = params?.message ?? params;
  span.setAttribute('neatlogs.llm.input_messages.0.role', 'user');
  const capturedMessage = captureMedia(
    span,
    'neatlogs.llm.input_messages.0',
    message,
    'input',
  );
  span.setAttribute(
    'neatlogs.llm.input_messages.0.content',
    (typeof capturedMessage === 'string' ? capturedMessage : safeStringify(capturedMessage)),
  );

  const result = withNeatlogsSpan(span, () => original(params, ...rest));

  return Promise.resolve(result).then(
    (response: any) => {
      if (isStream) return wrapStream(response, span);
      finalizeResponse(span, response);
      return response;
    },
    (err: any) => {
      recordError(span, err);
      throw err;
    },
  );
}

function tracedEmbedContent(original: (...a: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const span = tracer.startSpan('vertex_ai.models.embed_content', {
      attributes: {
        'neatlogs.span.kind': 'EMBEDDING',
        'neatlogs.llm.provider': PROVIDER,
        'neatlogs.embedding.model_name': opts?.model ?? '',
        'neatlogs.embedding.text': safeStringify(opts?.contents ?? ''),
      },
    }, getNeatlogsParentContext());

    const result = withNeatlogsSpan(span, () => original(opts, ...rest));

    return Promise.resolve(result).then(
      (response: any) => {
        const embeddings = response?.embeddings;
        if (Array.isArray(embeddings)) {
          span.setAttribute('neatlogs.embedding.count', embeddings.length);
          const vals = embeddings[0]?.values;
          if (Array.isArray(vals)) span.setAttribute('neatlogs.embedding.dimensions', vals.length);
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

function tracedCountTokens(original: (...a: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const span = tracer.startSpan('vertex_ai.models.count_tokens', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': PROVIDER,
        'neatlogs.llm.task': 'count_tokens',
        'neatlogs.llm.model_name': opts?.model ?? '',
      },
    }, getNeatlogsParentContext());

    const result = withNeatlogsSpan(span, () => original(opts, ...rest));

    return Promise.resolve(result).then(
      (response: any) => {
        if (response?.totalTokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', response.totalTokens);
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
// generateContent / generateContentStream
// ---------------------------------------------------------------------------

function tracedGenerateContent(original: (...args: any[]) => any, isStream: boolean) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const model = opts?.model ?? '';

    const span = tracer.startSpan('vertex_ai.models.generate_content', {
      attributes: {
        'neatlogs.span.kind': 'LLM',
        'neatlogs.llm.provider': PROVIDER,
        'neatlogs.llm.system': SYSTEM,
        'neatlogs.llm.model_name': model,
        'neatlogs.llm.is_streaming': isStream,
      },
    }, getNeatlogsParentContext());

    setInputAttributes(span, opts);

    const result = withNeatlogsSpan(span, () => original(opts, ...rest));

    return Promise.resolve(result).then(
      (response: any) => {
        if (isStream) {
          return wrapStream(response, span);
        }
        finalizeResponse(span, response);
        return response;
      },
      (err: any) => {
        recordError(span, err);
        throw err;
      },
    );
  };
}

function setInputAttributes(span: Span, opts: any): void {
  let idx = 0;

  const config = opts?.config;
  const systemInstruction = config?.systemInstruction ?? config?.system_instruction;
  if (systemInstruction) {
    const captured = captureMedia(
      span,
      `neatlogs.llm.input_messages.${idx}`,
      systemInstruction,
      'input',
    );
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'system');
    span.setAttribute(
      `neatlogs.llm.input_messages.${idx}.content`,
      typeof captured === 'string' ? captured : safeStringify(captured),
    );
    idx++;
  }

  const contents = opts?.contents;
  if (typeof contents === 'string') {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'user');
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, contents);
  } else if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === 'string') {
        span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'user');
        span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, item);
        idx++;
      } else if (item && typeof item === 'object') {
        const role = item.role ?? 'user';
        span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, role);
        const parts = item.parts ?? [];
        const capturedParts = captureMedia(
          span,
          `neatlogs.llm.input_messages.${idx}`,
          parts,
          'input',
        );
        const textParts: string[] = [];
        for (const part of parts) {
          if (typeof part === 'string') textParts.push(part);
          else if (part?.text) textParts.push(part.text);
        }
        span.setAttribute(
          `neatlogs.llm.input_messages.${idx}.content`,
          textParts.length ? textParts.join('\n') : safeStringify(capturedParts),
        );
        idx++;
      }
    }
  } else if (contents) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'user');
    const captured = captureMedia(
      span,
      `neatlogs.llm.input_messages.${idx}`,
      contents,
      'input',
    );
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, safeStringify(captured));
  }

  // Tools (function declarations)
  const tools = config?.tools;
  if (Array.isArray(tools)) {
    let t = 0;
    for (const tool of tools) {
      const decls = tool?.functionDeclarations ?? tool?.function_declarations ?? [];
      for (const fn of decls) {
        span.setAttribute(`neatlogs.llm.tools.${t}.name`, fn?.name ?? '');
        if (fn?.description) span.setAttribute(`neatlogs.llm.tools.${t}.description`, fn.description);
        if (fn?.parameters) span.setAttribute(`neatlogs.llm.tools.${t}.input_schema`, safeStringify(fn.parameters));
        t++;
      }
    }
  }

  // Invocation params
  if (config) {
    if (config.temperature != null) span.setAttribute('neatlogs.llm.temperature', config.temperature);
    if (config.topP != null) span.setAttribute('neatlogs.llm.top_p', config.topP);
    if (config.topK != null) span.setAttribute('neatlogs.llm.top_k', config.topK);
    const maxTokens = config.maxOutputTokens ?? config.max_output_tokens;
    if (maxTokens != null) span.setAttribute('neatlogs.llm.max_tokens', maxTokens);

    // Blob the backend reads for metadata.model_settings (the UI source).
    const params: Record<string, any> = {};
    if (config.temperature != null) params.temperature = config.temperature;
    if (config.topP != null) params.top_p = config.topP;
    if (config.topK != null) params.top_k = config.topK;
    if (maxTokens != null) params.max_tokens = maxTokens;
    if (config.frequencyPenalty != null) params.frequency_penalty = config.frequencyPenalty;
    if (config.presencePenalty != null) params.presence_penalty = config.presencePenalty;
    if (Object.keys(params).length > 0) {
      span.setAttribute('neatlogs.llm.invocation_parameters', JSON.stringify(params));
    }
  }
}

// ---------------------------------------------------------------------------
// Streaming support — @google/genai stream is an async iterable of chunks
// ---------------------------------------------------------------------------

function wrapStream(stream: any, span: Span): any {
  const accumulated: StreamAccumulator = {
    textParts: [],
    finishReason: '',
    usage: null,
    mediaCount: 0,
  };
  const originalAsyncIterator = stream?.[Symbol.asyncIterator]?.bind(stream);

  if (!originalAsyncIterator) {
    finalizeStreamChunks(span, accumulated);
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
            finalizeStreamChunks(span, accumulated);
            return result;
          }
          addStreamChunk(span, accumulated, result.value);
          return result;
        } catch (err) {
          recordError(span, err);
          throw err;
        }
      },
      async return(value?: any): Promise<IteratorResult<any>> {
        finalizeStreamChunks(span, accumulated);
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

interface StreamAccumulator {
  textParts: string[];
  finishReason: string;
  usage: any;
  mediaCount: number;
}

function addStreamChunk(span: Span, accumulated: StreamAccumulator, chunk: any): void {
  const captured = captureMediaWithIndex(
    span,
    'neatlogs.llm.output_messages.0',
    chunk?.candidates,
    'output',
    accumulated.mediaCount,
  );
  accumulated.mediaCount += captured.count;
  for (const candidate of chunk?.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      if (part?.text && !part?.thought) accumulated.textParts.push(part.text);
    }
    if (candidate?.finishReason) {
      accumulated.finishReason = candidate.finishReason;
    }
  }
  if (chunk?.usageMetadata) accumulated.usage = chunk.usageMetadata;
}

function finalizeStreamChunks(span: Span, accumulated: StreamAccumulator): void {
  const fullText = accumulated.textParts.join('');
  if (fullText) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', fullText);
  }
  if (accumulated.finishReason) {
    span.setAttribute('neatlogs.llm.finish_reason', String(accumulated.finishReason));
  }
  setUsage(span, accumulated.usage);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Non-streaming response finalization
// ---------------------------------------------------------------------------

function finalizeResponse(span: Span, response: any): void {
  captureMedia(
    span,
    'neatlogs.llm.output_messages.0',
    response?.candidates,
    'output',
  );
  const textParts: string[] = [];
  let toolIdx = 0;

  for (const candidate of response?.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      if (part?.text && !part?.thought) {
        textParts.push(part.text);
      } else if (part?.thought && part?.text) {
        span.setAttribute('neatlogs.llm.output_messages.0.thinking', part.text);
      } else if (part?.functionCall) {
        const fc = part.functionCall;
        span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.name`, fc?.name ?? '');
        span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.arguments`, safeStringify(fc?.args ?? {}));
        toolIdx++;
      }
    }
    if (candidate?.finishReason) span.setAttribute('neatlogs.llm.finish_reason', String(candidate.finishReason));
  }

  if (textParts.length) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', textParts.join(''));
  }

  setUsage(span, response?.usageMetadata);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

function setUsage(span: Span, usage: any): void {
  if (!usage) return;
  if (usage.promptTokenCount != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.promptTokenCount);
  if (usage.candidatesTokenCount != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.candidatesTokenCount);
  if (usage.totalTokenCount != null) span.setAttribute('neatlogs.llm.token_count.total', usage.totalTokenCount);
  if (usage.cachedContentTokenCount != null) span.setAttribute('neatlogs.llm.token_count.cache_read', usage.cachedContentTokenCount);
  if (usage.thoughtsTokenCount != null) span.setAttribute('neatlogs.llm.token_count.reasoning', usage.thoughtsTokenCount);
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

function recordError(span: Span, err: unknown): void {
  if (err instanceof Error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.recordException(err);
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  }
  span.end();
}
