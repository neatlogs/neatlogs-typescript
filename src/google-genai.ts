/**
 * Neatlogs Google Gemini wrapper — ES6 Proxy-based.
 *
 * Gemini (Google AI Studio) is accessed through the `@google/genai` SDK
 * (`new GoogleGenAI({ apiKey })`). This wrapper traces those clients with
 * provider `google` so Gemini traffic is distinguished from Vertex AI traffic
 * (see `wrapVertexAI`, which is the same SDK in `vertexai: true` mode).
 *
 * Mirrors Python's `neatlogs.wrap(genai.Client())`. If you prefer zero-code
 * integration; initialize Neatlogs and wrap the Google client explicitly.
 *
 * Usage:
 *   import { wrapGoogleGenAI } from 'neatlogs/google-genai';
 *   import { GoogleGenAI } from '@google/genai';
 *   const client = wrapGoogleGenAI(new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }));
 *   const res = await client.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Hello' });
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
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  withNeatlogsSpan,
} from './core/provider.js';

const TRACER_NAME = 'neatlogs.google_genai';
const PROVIDER = 'google';
const SYSTEM = 'google_genai';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function wrapGoogleGenAI<T extends object>(client: T): T {
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
export function wrapGoogleGenAIChat<T extends object>(chat: T): T {
  const c = chat as any;
  if (!c || c._neatlogsGoogleGenAIPatched) return chat;

  if (typeof c.sendMessage === 'function') {
    const orig = c.sendMessage.bind(c);
    c.sendMessage = (params: any, ...rest: any[]) => tracedChatSend(orig, c, params, rest, false);
  }
  if (typeof c.sendMessageStream === 'function') {
    const orig = c.sendMessageStream.bind(c);
    c.sendMessageStream = (params: any, ...rest: any[]) => tracedChatSend(orig, c, params, rest, true);
  }

  try {
    Object.defineProperty(c, '_neatlogsGoogleGenAIPatched', { value: true, enumerable: false, configurable: true });
  } catch {
    c._neatlogsGoogleGenAIPatched = true;
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
  const span = tracer.startSpan('google_genai.chat.send_message', {
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
  span.setAttribute(
    'neatlogs.llm.input_messages.0.content',
    (typeof message === 'string' ? message : safeStringify(message)),
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
    const span = tracer.startSpan('google_genai.models.embed_content', {
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
    const span = tracer.startSpan('google_genai.models.count_tokens', {
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

    const span = tracer.startSpan('google_genai.models.generate_content', {
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
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'system');
    span.setAttribute(
      `neatlogs.llm.input_messages.${idx}.content`,
      typeof systemInstruction === 'string' ? systemInstruction : safeStringify(systemInstruction),
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
        const textParts: string[] = [];
        for (const part of parts) {
          if (typeof part === 'string') textParts.push(part);
          else if (part?.text) textParts.push(part.text);
        }
        span.setAttribute(
          `neatlogs.llm.input_messages.${idx}.content`,
          textParts.length ? textParts.join('\n') : safeStringify(parts),
        );
        idx++;
      }
    }
  } else if (contents) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'user');
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, safeStringify(contents));
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
  const chunks: any[] = [];
  const originalAsyncIterator = stream?.[Symbol.asyncIterator]?.bind(stream);

  if (!originalAsyncIterator) {
    finalizeStreamChunks(span, chunks);
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
  let finishReason = '';
  let usage: any = null;

  for (const chunk of chunks) {
    for (const candidate of chunk?.candidates ?? []) {
      for (const part of candidate?.content?.parts ?? []) {
        if (part?.text && !part?.thought) textParts.push(part.text);
      }
      if (candidate?.finishReason) finishReason = candidate.finishReason;
    }
    if (chunk?.usageMetadata) usage = chunk.usageMetadata;
  }

  const fullText = textParts.join('');
  if (fullText) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', fullText);
  }
  if (finishReason) span.setAttribute('neatlogs.llm.finish_reason', String(finishReason));
  setUsage(span, usage);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// Non-streaming response finalization
// ---------------------------------------------------------------------------

function finalizeResponse(span: Span, response: any): void {
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
