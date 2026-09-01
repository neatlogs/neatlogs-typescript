/**
 * Neatlogs AWS Bedrock wrapper.
 *
 * The AWS SDK v3 `BedrockRuntimeClient` dispatches every API through
 * `client.send(new XCommand({...}))`. This wrapper intercepts `send`, inspects
 * the command, and traces the Converse and InvokeModel APIs. Token extraction
 * handles Claude, Titan, and Llama response formats.
 *
 * Usage:
 *   import { wrapBedrock } from 'neatlogs/bedrock';
 *   import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
 *   const client = wrapBedrock(new BedrockRuntimeClient({ region: 'us-east-1' }));
 *   await client.send(new ConverseCommand({ modelId, messages }));
 *
 * `neatlogs.llm.provider` is always `bedrock`; `neatlogs.llm.system` is the
 * underlying model vendor (anthropic / amazon / meta / ...), inferred from modelId.
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

const TRACER_NAME = 'neatlogs.bedrock';
const PROVIDER = 'bedrock';

interface StreamCaptureBudget {
  capturedBytes: number;
  capturedItems: number;
  droppedBytes: number;
  droppedItems: number;
  incompleteReasons: Set<string>;
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
        },
      },
      getNeatlogsParentContext(),
    );
    span.setAttribute(
      'input.value',
      safeStringify(captureMedia(span, 'neatlogs.tool.input', args, 'input')),
    );
    return withNeatlogsSpan(span, async () => {
      try {
        const result = await fn(args);
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

export function wrapBedrock<T extends object>(client: T): T {
  const c = client as any;
  if (c._neatlogsBedrockPatched) return client;
  if (typeof c.send !== 'function') return client;

  const originalSend = c.send.bind(c);

  c.send = function (command: any, ...rest: any[]): any {
    const name = command?.constructor?.name ?? '';
    const input = command?.input ?? {};

    if (name === 'ConverseCommand') {
      return tracedConverse(originalSend, command, input, rest, false);
    }
    if (name === 'ConverseStreamCommand') {
      return tracedConverse(originalSend, command, input, rest, true);
    }
    if (name === 'InvokeModelCommand') {
      return tracedInvokeModel(originalSend, command, input, rest, false);
    }
    if (name === 'InvokeModelWithResponseStreamCommand') {
      return tracedInvokeModel(originalSend, command, input, rest, true);
    }

    return originalSend(command, ...rest);
  };

  c._neatlogsBedrockPatched = true;
  return client;
}

// ---------------------------------------------------------------------------
// Vendor / span helpers
// ---------------------------------------------------------------------------

function vendorFromModel(modelId: any): string {
  let tail = String(modelId ?? '').split('/').pop() ?? '';
  for (const prefix of ['us.', 'eu.', 'apac.', 'us-gov.']) {
    if (tail.startsWith(prefix)) tail = tail.slice(prefix.length);
  }
  const vendor = tail.includes('.') ? tail.split('.')[0] : '';
  return vendor || 'bedrock';
}

function startSpan(name: string, modelId: any, isStream: boolean): Span {
  return getProviderTracer(TRACER_NAME).startSpan(name, {
    attributes: {
      'neatlogs.span.kind': 'LLM',
      'neatlogs.llm.provider': PROVIDER,
      'neatlogs.llm.system': vendorFromModel(modelId),
      'neatlogs.llm.model_name': String(modelId ?? ''),
      'neatlogs.llm.is_streaming': isStream,
    },
  }, getNeatlogsParentContext());
}

// ---------------------------------------------------------------------------
// Converse API
// ---------------------------------------------------------------------------

function tracedConverse(
  originalSend: (...a: any[]) => any,
  command: any,
  input: any,
  rest: any[],
  isStream: boolean,
): any {
  const span = startSpan(
    isStream ? 'bedrock.converse_stream' : 'bedrock.converse',
    input?.modelId,
    isStream,
  );
  setConverseInput(span, input);

  const promise = withNeatlogsSpan(span, () => originalSend(command, ...rest));

  return promise.then(
    (response: any) => {
      if (isStream) {
        return wrapConverseStream(response, span);
      }
      finalizeConverse(span, response);
      return response;
    },
    (err: any) => {
      recordError(span, err);
      throw err;
    },
  );
}

function setConverseInput(span: Span, input: any): void {
  let idx = 0;

  if (Array.isArray(input?.system)) {
    captureMedia(
      span,
      `neatlogs.llm.input_messages.${idx}`,
      input.system,
      'input',
    );
    const text = input.system.map((b: any) => b?.text ?? '').join(' ').trim();
    if (text) {
      span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'system');
      span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, text);
      idx++;
    }
  }

  for (const msg of input?.messages ?? []) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, msg?.role ?? 'user');
    const captured = captureMedia(
      span,
      `neatlogs.llm.input_messages.${idx}`,
      msg?.content,
      'input',
    );
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, converseBlocksToText(captured));
    idx++;
  }

  const cfg = input?.inferenceConfig ?? {};
  if (cfg.temperature != null) span.setAttribute('neatlogs.llm.temperature', cfg.temperature);
  if (cfg.topP != null) span.setAttribute('neatlogs.llm.top_p', cfg.topP);
  if (cfg.maxTokens != null) span.setAttribute('neatlogs.llm.max_tokens', cfg.maxTokens);

  const tools = input?.toolConfig?.tools ?? [];
  for (let i = 0; i < tools.length; i++) {
    const spec = tools[i]?.toolSpec ?? {};
    if (spec.name) span.setAttribute(`neatlogs.llm.tools.${i}.name`, spec.name);
    if (spec.description) span.setAttribute(`neatlogs.llm.tools.${i}.description`, spec.description);
    if (spec.inputSchema) span.setAttribute(`neatlogs.llm.tools.${i}.input_schema`, safeStringify(spec.inputSchema));
  }
}

function converseBlocksToText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return safeStringify(content);
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object') {
      if ('text' in block) parts.push(String(block.text));
      else if ('toolResult' in block) parts.push(safeStringify(block.toolResult));
      else if ('toolUse' in block) parts.push(safeStringify(block.toolUse));
      else parts.push(safeStringify(block));
    } else {
      parts.push(String(block));
    }
  }
  return parts.join('\n');
}

function finalizeConverse(span: Span, response: any): void {
  const content = response?.output?.message?.content ?? [];
  const captured = captureMedia(
    span,
    'neatlogs.llm.output_messages.0',
    content,
    'output',
  );
  const capturedContent = Array.isArray(captured) ? captured : [];
  const textParts: string[] = [];
  let toolIdx = 0;

  for (const block of capturedContent) {
    if (!block || typeof block !== 'object') continue;
    if ('text' in block) {
      textParts.push(String(block.text));
    } else if ('toolUse' in block) {
      const tu = block.toolUse;
      span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.id`, String(tu?.toolUseId ?? ''));
      span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.name`, String(tu?.name ?? ''));
      span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.arguments`, safeStringify(tu?.input ?? {}));
      toolIdx++;
    }
  }

  if (textParts.length) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', textParts.join(''));
  }
  if (response?.stopReason) span.setAttribute('neatlogs.llm.finish_reason', String(response.stopReason));
  setConverseUsage(span, response?.usage);

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

function setConverseUsage(span: Span, usage: any): void {
  if (!usage) return;
  if (usage.inputTokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', usage.inputTokens);
  if (usage.outputTokens != null) span.setAttribute('neatlogs.llm.token_count.completion', usage.outputTokens);
  if (usage.totalTokens != null) span.setAttribute('neatlogs.llm.token_count.total', usage.totalTokens);
  if (usage.cacheReadInputTokens != null) span.setAttribute('neatlogs.llm.token_count.cache_read', usage.cacheReadInputTokens);
  if (usage.cacheWriteInputTokens != null) span.setAttribute('neatlogs.llm.token_count.cache_write', usage.cacheWriteInputTokens);
}

function wrapConverseStream(response: any, span: Span): any {
  const stream = response?.stream;
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return response;
  }

  const originalIterator = stream[Symbol.asyncIterator].bind(stream);
  const textParts: string[] = [];
  const toolCalls: Record<number, { id: string; name: string; arguments: string[]; incomplete: boolean }> = {};
  let finishReason = '';
  let usage: any = null;
  let mediaCount = 0;
  const budget = newStreamCaptureBudget();

  const addEvent = (ev: any) => {
    const delta = ev?.contentBlockDelta?.delta;
    if (delta?.text) {
      retainStreamString(budget, String(delta.text), (value) => textParts.push(value));
    }
    if (delta?.toolUse?.input) {
      const idx = ev.contentBlockDelta.contentBlockIndex ?? 0;
      const tool = getBoundedToolCall(toolCalls, idx, budget);
      if (tool) {
        const retained = retainStreamString(budget, String(delta.toolUse.input), (value) => {
          tool.arguments.push(value);
        });
        if (!retained) tool.incomplete = true;
      }
    }
    const start = ev?.contentBlockStart?.start;
    const capturedStart = start
      ? captureMediaWithIndex(
          span,
          'neatlogs.llm.output_messages.0',
          start,
          'output',
          mediaCount,
        )
      : { value: start, count: 0 };
    mediaCount += capturedStart.count;
    const startBlk = (capturedStart.value as any)?.toolUse;
    if (startBlk) {
      const idx = ev.contentBlockStart.contentBlockIndex ?? 0;
      const tool = getBoundedToolCall(toolCalls, idx, budget);
      if (tool) {
        tool.name = startBlk.name ?? '';
        tool.id = startBlk.toolUseId ?? '';
      }
    }
    if (ev?.messageStop?.stopReason) finishReason = ev.messageStop.stopReason;
    if (ev?.metadata?.usage) usage = ev.metadata.usage;
  };

  const wrappedStream = {
    [Symbol.asyncIterator]() {
      const iterator = originalIterator();
      return {
        async next(): Promise<IteratorResult<any>> {
          try {
            const result = await iterator.next();
            if (result.done) {
              finalizeConverseStream(span, textParts, toolCalls, finishReason, usage, budget);
              return result;
            }
            addEvent(result.value);
            return result;
          } catch (err) {
            recordError(span, err);
            throw err;
          }
        },
        async return(value?: any): Promise<IteratorResult<any>> {
          markStreamIncomplete(budget, 'consumer_cancelled');
          span.setAttribute('neatlogs.stream.cancelled', true);
          const result = await (iterator.return?.(value) ?? { done: true, value: undefined });
          if (result.done) {
            finalizeConverseStream(span, textParts, toolCalls, finishReason, usage, budget);
          } else {
            addEvent(result.value);
          }
          return result;
        },
      };
    },
  };

  response.stream = wrappedStream;
  return response;
}

function finalizeConverseStream(
  span: Span,
  textParts: string[],
  toolCalls: Record<number, { id: string; name: string; arguments: string[]; incomplete: boolean }>,
  finishReason: string,
  usage: any,
  budget: StreamCaptureBudget,
): void {
  const full = textParts.join('');
  if (full) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', full);
  }
  let j = 0;
  for (const tc of Object.values(toolCalls)) {
    if (tc.id) span.setAttribute(`neatlogs.llm.tool_calls.${j}.id`, tc.id);
    span.setAttribute(`neatlogs.llm.tool_calls.${j}.name`, tc.name);
    span.setAttribute(
      `neatlogs.llm.tool_calls.${j}.arguments`,
      tc.incomplete
        ? '[incomplete: stream capture limit reached]'
        : sanitizeJsonToolArguments(
            span,
            `neatlogs.llm.tool_calls.${j}.arguments`,
            tc.arguments.join('') || '{}',
            budget,
          ),
    );
    j++;
  }
  if (finishReason) span.setAttribute('neatlogs.llm.finish_reason', String(finishReason));
  setConverseUsage(span, usage);
  applyStreamDiagnostics(span, budget);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ---------------------------------------------------------------------------
// InvokeModel API (vendor-specific body formats)
// ---------------------------------------------------------------------------

function isEmbeddingModel(modelId: any): boolean {
  return String(modelId ?? '').toLowerCase().includes('embed');
}

function tracedInvokeModel(
  originalSend: (...a: any[]) => any,
  command: any,
  input: any,
  rest: any[],
  isStream: boolean,
): any {
  const vendor = vendorFromModel(input?.modelId);
  const isEmbedding = !isStream && isEmbeddingModel(input?.modelId);
  const bodyIn = decodeBody(input?.body);

  let span: Span;
  if (isEmbedding) {
    span = getProviderTracer(TRACER_NAME).startSpan('bedrock.invoke_model', {
      attributes: {
        'neatlogs.span.kind': 'EMBEDDING',
        'neatlogs.llm.provider': PROVIDER,
        'neatlogs.embedding.model_name': String(input?.modelId ?? ''),
      },
    }, getNeatlogsParentContext());
    const text = bodyIn?.inputText ?? bodyIn?.texts ?? bodyIn?.input_text;
    if (text) {
      span.setAttribute('neatlogs.embedding.text', (typeof text === 'string' ? text : safeStringify(text)));
    }
  } else {
    span = startSpan(
      isStream ? 'bedrock.invoke_model_with_response_stream' : 'bedrock.invoke_model',
      input?.modelId,
      isStream,
    );
    setInvokeInput(span, vendor, bodyIn);
  }

  const promise = withNeatlogsSpan(span, () => originalSend(command, ...rest));

  return promise.then(
    (response: any) => {
      if (isStream) {
        return wrapInvokeStream(response, span, vendor);
      }
      try {
        if (isEmbedding) {
          finalizeInvokeEmbedding(span, decodeBody(response?.body));
        } else {
          finalizeInvoke(span, vendor, decodeBody(response?.body));
        }
      } catch {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }
      return response;
    },
    (err: any) => {
      recordError(span, err);
      throw err;
    },
  );
}

function finalizeInvokeEmbedding(span: Span, body: any): void {
  const emb = body?.embedding;
  const embs = body?.embeddings;
  if (Array.isArray(emb)) {
    span.setAttribute('neatlogs.embedding.count', 1);
    span.setAttribute('neatlogs.embedding.dimensions', emb.length);
  } else if (Array.isArray(embs) && embs.length) {
    span.setAttribute('neatlogs.embedding.count', embs.length);
    if (Array.isArray(embs[0])) span.setAttribute('neatlogs.embedding.dimensions', embs[0].length);
  }
  if (body?.inputTextTokenCount != null) {
    span.setAttribute('neatlogs.llm.token_count.prompt', body.inputTextTokenCount);
    span.setAttribute('neatlogs.embedding.token_count', body.inputTextTokenCount);
  }
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

function decodeBody(body: any): any {
  try {
    if (body == null) return {};
    if (typeof body === 'string') return JSON.parse(body);
    // Uint8Array (AWS SDK v3 returns the response body as bytes)
    if (body instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(body));
    if (typeof body === 'object' && typeof body.byteLength === 'number') {
      return JSON.parse(new TextDecoder().decode(body));
    }
    if (typeof body === 'object') return body;
  } catch {
    /* fall through */
  }
  return {};
}

function setInvokeInput(span: Span, vendor: string, body: any): void {
  let idx = 0;
  if (body?.system) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'system');
    span.setAttribute(
      `neatlogs.llm.input_messages.${idx}.content`,
      typeof body.system === 'string'
        ? body.system
        : safeStringify(
            captureMedia(
              span,
              `neatlogs.llm.input_messages.${idx}`,
              body.system,
              'input',
            ),
          ),
    );
    idx++;
  }
  if (Array.isArray(body?.messages)) {
    for (const msg of body.messages) {
      span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, msg?.role ?? 'user');
      const captured = captureMedia(
        span,
        `neatlogs.llm.input_messages.${idx}`,
        msg?.content,
        'input',
      );
      span.setAttribute(
        `neatlogs.llm.input_messages.${idx}.content`,
        typeof captured === 'string' ? captured : safeStringify(captured),
      );
      idx++;
    }
  } else if (body?.prompt) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'user');
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, String(body.prompt));
  } else if (body?.inputText) {
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, 'user');
    span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, String(body.inputText));
  }

  if (body?.temperature != null) span.setAttribute('neatlogs.llm.temperature', body.temperature);
  if (body?.top_p != null) span.setAttribute('neatlogs.llm.top_p', body.top_p);
  const maxTokens = body?.max_tokens ?? body?.maxTokens ?? body?.max_tokens_to_sample;
  if (maxTokens != null) span.setAttribute('neatlogs.llm.max_tokens', maxTokens);
  const cfg = body?.textGenerationConfig;
  if (cfg) {
    if (cfg.temperature != null) span.setAttribute('neatlogs.llm.temperature', cfg.temperature);
    if (cfg.topP != null) span.setAttribute('neatlogs.llm.top_p', cfg.topP);
    if (cfg.maxTokenCount != null) span.setAttribute('neatlogs.llm.max_tokens', cfg.maxTokenCount);
  }
}

function finalizeInvoke(span: Span, vendor: string, body: any): void {
  const capturedBody = captureMedia(
    span,
    'neatlogs.llm.output_messages.0',
    body,
    'output',
  ) as any;
  let text: string | undefined;
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let finishReason: string | undefined;

  if (vendor === 'anthropic') {
    if (Array.isArray(capturedBody?.content)) {
      text = capturedBody.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
      let toolIdx = 0;
      for (const b of capturedBody.content) {
        if (b?.type === 'tool_use') {
          span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.id`, String(b.id ?? ''));
          span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.name`, String(b.name ?? ''));
          span.setAttribute(`neatlogs.llm.tool_calls.${toolIdx}.arguments`, safeStringify(b.input ?? {}));
          toolIdx++;
        }
      }
    } else if (body?.completion != null) {
      text = body.completion;
    }
    promptTokens = body?.usage?.input_tokens;
    completionTokens = body?.usage?.output_tokens;
    finishReason = body?.stop_reason;
  } else if (vendor === 'amazon') {
    const r = Array.isArray(body?.results) ? body.results[0] : undefined;
    if (r) {
      text = r.outputText;
      completionTokens = r.tokenCount;
      finishReason = r.completionReason;
    }
    promptTokens = body?.inputTextTokenCount;
  } else if (vendor === 'meta') {
    text = body?.generation;
    promptTokens = body?.prompt_token_count;
    completionTokens = body?.generation_token_count;
    finishReason = body?.stop_reason;
  } else if (vendor === 'cohere') {
    const g = Array.isArray(body?.generations) ? body.generations[0] : undefined;
    if (g) {
      text = g.text;
      finishReason = g.finish_reason;
    }
  } else {
    text = body?.generation ?? body?.completion ?? body?.outputText;
  }

  if (text) {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', String(text));
  }
  if (promptTokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', promptTokens);
  if (completionTokens != null) span.setAttribute('neatlogs.llm.token_count.completion', completionTokens);
  if (promptTokens != null && completionTokens != null) {
    span.setAttribute('neatlogs.llm.token_count.total', promptTokens + completionTokens);
  }
  if (finishReason) span.setAttribute('neatlogs.llm.finish_reason', String(finishReason));

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

function wrapInvokeStream(response: any, span: Span, vendor: string): any {
  const body = response?.body;
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return response;
  }

  const originalIterator = body[Symbol.asyncIterator].bind(body);
  const textParts: string[] = [];
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let finishReason: string | undefined;
  let mediaCount = 0;
  const budget = newStreamCaptureBudget();

  const addChunk = (chunk: any) => {
    const data = decodeBody(chunk?.bytes);
    const mediaBlock = data?.content_block ?? data?.contentBlockStart?.start;
    if (mediaBlock) {
      const captured = captureMediaWithIndex(
        span,
        'neatlogs.llm.output_messages.0',
        mediaBlock,
        'output',
        mediaCount,
      );
      mediaCount += captured.count;
    }
    if (data?.type === 'content_block_delta') {
      if (data?.delta?.text) {
        retainStreamString(budget, String(data.delta.text), (value) => textParts.push(value));
      }
    } else if (data?.type === 'message_delta') {
      if (data?.delta?.stop_reason) finishReason = data.delta.stop_reason;
      if (data?.usage?.output_tokens != null) completionTokens = data.usage.output_tokens;
    }
    if (data?.outputText) {
      retainStreamString(budget, String(data.outputText), (value) => textParts.push(value));
    }
    if (data?.generation) {
      retainStreamString(budget, String(data.generation), (value) => textParts.push(value));
    }
    const metrics = data?.['amazon-bedrock-invocationMetrics'];
    if (metrics) {
      promptTokens = metrics.inputTokenCount ?? promptTokens;
      completionTokens = metrics.outputTokenCount ?? completionTokens;
    }
  };

  const finalize = () => {
    const full = textParts.join('');
    if (full) {
      span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
      span.setAttribute('neatlogs.llm.output_messages.0.content', full);
    }
    if (promptTokens != null) span.setAttribute('neatlogs.llm.token_count.prompt', promptTokens);
    if (completionTokens != null) span.setAttribute('neatlogs.llm.token_count.completion', completionTokens);
    if (finishReason) span.setAttribute('neatlogs.llm.finish_reason', String(finishReason));
    applyStreamDiagnostics(span, budget);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  };

  const wrappedBody = {
    [Symbol.asyncIterator]() {
      const iterator = originalIterator();
      return {
        async next(): Promise<IteratorResult<any>> {
          try {
            const result = await iterator.next();
            if (result.done) {
              finalize();
              return result;
            }
            addChunk(result.value?.chunk);
            return result;
          } catch (err) {
            recordError(span, err);
            throw err;
          }
        },
        async return(value?: any): Promise<IteratorResult<any>> {
          markStreamIncomplete(budget, 'consumer_cancelled');
          span.setAttribute('neatlogs.stream.cancelled', true);
          const result = await (iterator.return?.(value) ?? { done: true, value: undefined });
          if (result.done) finalize();
          else addChunk(result.value?.chunk);
          return result;
        },
      };
    },
  };

  response.body = wrappedBody;
  return response;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function newStreamCaptureBudget(): StreamCaptureBudget {
  return {
    capturedBytes: 0,
    capturedItems: 0,
    droppedBytes: 0,
    droppedItems: 0,
    incompleteReasons: new Set(),
  };
}

function markStreamIncomplete(budget: StreamCaptureBudget, reason: string): void {
  budget.incompleteReasons.add(reason);
}

function retainStreamString(
  budget: StreamCaptureBudget,
  value: string,
  retain: (value: string) => void,
): boolean {
  const remaining = Math.max(0, DEFAULT_MAX_STREAM_CAPTURE_BYTES - budget.capturedBytes);
  const bytes = utf8ByteLength(value, remaining);
  if (budget.capturedItems >= DEFAULT_MAX_STREAM_CAPTURE_ITEMS) {
    budget.droppedItems += 1;
    budget.droppedBytes += bytes;
    markStreamIncomplete(budget, 'item_limit_exceeded');
    return false;
  }
  if (budget.capturedBytes + bytes > DEFAULT_MAX_STREAM_CAPTURE_BYTES) {
    budget.droppedItems += 1;
    budget.droppedBytes += bytes;
    markStreamIncomplete(budget, 'byte_limit_exceeded');
    return false;
  }
  retain(value);
  budget.capturedItems += 1;
  budget.capturedBytes += bytes;
  return true;
}

function getBoundedToolCall(
  toolCalls: Record<number, { id: string; name: string; arguments: string[]; incomplete: boolean }>,
  index: number,
  budget: StreamCaptureBudget,
): { id: string; name: string; arguments: string[]; incomplete: boolean } | undefined {
  if (toolCalls[index]) return toolCalls[index];
  if (Object.keys(toolCalls).length >= DEFAULT_MAX_STREAM_CAPTURE_ITEMS) {
    budget.droppedItems += 1;
    markStreamIncomplete(budget, 'item_limit_exceeded');
    return undefined;
  }
  const tool = { id: '', name: '', arguments: [], incomplete: false };
  toolCalls[index] = tool;
  return tool;
}

function sanitizeJsonToolArguments(
  span: Span,
  prefix: string,
  value: string,
  budget: StreamCaptureBudget,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    markStreamIncomplete(budget, 'invalid_tool_arguments');
    return '[incomplete: invalid tool arguments omitted]';
  }
  const original = safeStringify(parsed);
  const sanitized = safeStringify(captureMedia(span, prefix, parsed, 'output'));
  return original === sanitized ? value : sanitized;
}

function applyStreamDiagnostics(span: Span, budget: StreamCaptureBudget): void {
  span.setAttribute('neatlogs.stream.capture_bytes', budget.capturedBytes);
  span.setAttribute('neatlogs.stream.capture_items', budget.capturedItems);
  if (budget.incompleteReasons.size === 0) return;
  span.setAttribute('neatlogs.stream.incomplete', true);
  span.setAttribute(
    'neatlogs.stream.incomplete_reason',
    [...budget.incompleteReasons].sort().join(','),
  );
  if (budget.droppedBytes > 0) {
    span.setAttribute('neatlogs.stream.dropped_bytes', budget.droppedBytes);
    span.setAttribute('neatlogs.stream.dropped_bytes_is_lower_bound', true);
  }
  span.setAttribute('neatlogs.stream.dropped_items', budget.droppedItems);
  span.setAttribute('neatlogs.capture_fidelity', 'truncated');
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
