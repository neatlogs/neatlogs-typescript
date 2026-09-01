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

import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { getProviderTracer } from "./core/auto-root.js";
import { ChoiceAccumulator } from "./core/choice-accumulator.js";
import { captureMedia } from "./core/media.js";
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  withNeatlogsSpan,
} from "./core/provider.js";

const TRACER_NAME = "neatlogs.openai";

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
          "neatlogs.span.kind": "TOOL",
          "neatlogs.tool.name": name,
          "input.value": safeStringify(args),
        },
      },
      getNeatlogsParentContext(),
    );
    return withNeatlogsSpan(span, async () => {
      try {
        const result = await fn(args);
        span.setAttribute("output.value", safeStringify(result));
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
      if (typeof prop === "symbol" || String(prop).startsWith("_"))
        return value;

      const currentPath = [...path, String(prop)];
      const pathStr = currentPath.join(".");

      if (
        pathStr === "chat.completions.create" &&
        typeof value === "function"
      ) {
        return tracedChatCompletionsCreate(value.bind(obj));
      }
      if (pathStr === "responses.create" && typeof value === "function") {
        return tracedResponsesCreate(value.bind(obj));
      }

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        isNamespace(currentPath)
      ) {
        return wrapNamespace(value, currentPath);
      }

      return value;
    },
  });
}

function isNamespace(path: string[]): boolean {
  if (path.length > 3) return false;
  const key = path[path.length - 1];
  return ["chat", "completions", "responses", "beta"].includes(key);
}

// ---------------------------------------------------------------------------
// chat.completions.create — non-streaming + streaming
// ---------------------------------------------------------------------------

function tracedChatCompletionsCreate(original: (...args: any[]) => any) {
  return function (opts: any, ...rest: any[]): any {
    const tracer = getProviderTracer(TRACER_NAME);
    const model = opts?.model ?? "";
    const messages: any[] = opts?.messages ?? [];
    const isStream = opts?.stream === true;

    const span = tracer.startSpan(
      "openai.chat.completions.create",
      {
        attributes: {
          "neatlogs.span.kind": "LLM",
          "neatlogs.llm.provider": "openai",
          "neatlogs.llm.system": "openai",
          "neatlogs.llm.model_name": model,
          "neatlogs.llm.is_streaming": isStream,
        },
      },
      getNeatlogsParentContext(),
    );

    // Input messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      span.setAttribute(
        `neatlogs.llm.input_messages.${i}.role`,
        msg.role ?? "",
      );
      if (typeof msg.content === "string") {
        span.setAttribute(
          `neatlogs.llm.input_messages.${i}.content`,
          msg.content,
        );
      } else if (msg.content) {
        const capturedContent = captureMedia(
          span,
          `neatlogs.llm.input_messages.${i}`,
          msg.content,
          "input",
        );
        span.setAttribute(
          `neatlogs.llm.input_messages.${i}.content`,
          safeStringify(capturedContent),
        );
      }
      if (msg.tool_call_id) {
        span.setAttribute(
          `neatlogs.llm.input_messages.${i}.tool_call_id`,
          msg.tool_call_id,
        );
      }
    }

    // Tools
    if (opts?.tools) {
      for (let i = 0; i < opts.tools.length; i++) {
        const tool = opts.tools[i] ?? {};
        const fn = tool.function ?? {};
        span.setAttribute(
          `neatlogs.llm.tools.${i}.type`,
          tool.type ?? "function",
        );
        span.setAttribute(
          `neatlogs.llm.tools.${i}.definition`,
          safeStringify(tool),
        );
        span.setAttribute(`neatlogs.llm.tools.${i}.name`, fn.name ?? "");
        if (fn.description)
          span.setAttribute(
            `neatlogs.llm.tools.${i}.description`,
            fn.description,
          );
        if (fn.parameters)
          span.setAttribute(
            `neatlogs.llm.tools.${i}.input_schema`,
            safeStringify(fn.parameters),
          );
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

    let result: any;
    try {
      result = withNeatlogsSpan(span, () => original(opts, ...rest));
    } catch (err) {
      recordError(span, err);
      throw err;
    }

    return Promise.resolve(result).then(
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
    const model = opts?.model ?? "";
    const isStream = opts?.stream === true;

    const span = tracer.startSpan(
      "openai.responses.create",
      {
        attributes: {
          "neatlogs.span.kind": "LLM",
          "neatlogs.llm.provider": "openai",
          "neatlogs.llm.system": "openai",
          "neatlogs.llm.model_name": model,
          "neatlogs.llm.is_streaming": isStream,
          "input.value": "",
        },
      },
      getNeatlogsParentContext(),
    );

    const capturedInput = captureMedia(
      span,
      "neatlogs.llm.input_messages.0",
      opts?.input,
      "input",
    );
    span.setAttribute("input.value", safeStringify(capturedInput ?? ""));
    setInvocationParams(span, opts);

    let result: any;
    try {
      result = withNeatlogsSpan(span, () => original(opts, ...rest));
    } catch (err) {
      recordError(span, err);
      throw err;
    }

    return Promise.resolve(result).then(
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
  let eventCount = 0;

  const setEventCounts = () => {
    span.setAttribute("neatlogs.stream.chunk_count", eventCount);
    if (eventCount > 128) {
      span.setAttribute("neatlogs.stream.events_dropped", eventCount - 128);
    }
  };

  const finalize = (interrupted = false) => {
    if (finalized) return;
    finalized = true;
    setEventCounts();
    finalizeResponsesResponse(
      span,
      completedResponse,
      textParts.join(""),
      interrupted,
    );
  };

  const fail = (error: unknown) => {
    if (finalized) return;
    finalized = true;
    setEventCounts();
    applyResponsesResponseAttributes(
      span,
      completedResponse,
      textParts.join(""),
    );
    if ((error as any)?.name === "AbortError") {
      span.setAttribute("neatlogs.stream.cancelled", true);
      span.setStatus({ code: SpanStatusCode.UNSET });
      span.end();
      return;
    }
    recordError(span, error);
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
                const index = eventCount++;
                if (index < 128) {
                  const delta =
                    typeof event?.delta === "string" ? event.delta : "";
                  span.addEvent("neatlogs.stream.chunk", {
                    "neatlogs.stream.chunk.index": index,
                    "neatlogs.stream.chunk.summary": safeStringify({
                      type: event?.type ?? "unknown",
                      delta_bytes: new TextEncoder().encode(delta).byteLength,
                      has_response: event?.response != null,
                    }),
                  });
                }
                if (
                  event?.type === "response.output_text.delta" &&
                  typeof event.delta === "string"
                ) {
                  textParts.push(event.delta);
                } else if (event?.type === "response.completed") {
                  completedResponse = event.response;
                }
                return result;
              } catch (err) {
                fail(err);
                throw err;
              }
            },
            async return(value?: any): Promise<IteratorResult<any>> {
              try {
                return await (iterator.return?.(value) ?? {
                  done: true,
                  value,
                });
              } finally {
                finalize(true);
              }
            },
            async throw(err?: any): Promise<IteratorResult<any>> {
              fail(err);
              if (iterator.throw) return iterator.throw(err);
              throw err;
            },
          };
        };
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function finalizeResponsesResponse(
  span: Span,
  response: any,
  streamedText = "",
  interrupted = false,
): void {
  applyResponsesResponseAttributes(span, response, streamedText);
  if (interrupted) {
    span.setAttribute("neatlogs.stream.cancelled", true);
    span.setStatus({ code: SpanStatusCode.UNSET });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

function applyResponsesResponseAttributes(
  span: Span,
  response: any,
  streamedText = "",
): void {
  const capturedOutput = response?.output
    ? captureMedia(
        span,
        "neatlogs.llm.output_messages.0",
        response.output,
        "output",
      )
    : response?.output;
  const text =
    response?.output_text ||
    streamedText ||
    extractResponsesOutputText(response?.output);
  if (text) {
    span.setAttribute("neatlogs.llm.output_messages.0.role", "assistant");
    span.setAttribute("neatlogs.llm.output_messages.0.content", text);
    span.setAttribute("output.value", text);
  } else if (response?.output) {
    // Tool-call-only responses still have a meaningful structured output.
    span.setAttribute("output.value", safeStringify(capturedOutput));
  }

  if (response?.model)
    span.setAttribute("neatlogs.llm.model_name", response.model);
  if (response?.status)
    span.setAttribute("neatlogs.llm.finish_reason", response.status);

  const usage = response?.usage;
  if (usage) {
    if (usage.input_tokens != null)
      span.setAttribute("neatlogs.llm.token_count.prompt", usage.input_tokens);
    if (usage.output_tokens != null)
      span.setAttribute(
        "neatlogs.llm.token_count.completion",
        usage.output_tokens,
      );
    if (usage.total_tokens != null)
      span.setAttribute("neatlogs.llm.token_count.total", usage.total_tokens);
    if (usage.input_tokens_details?.cached_tokens != null) {
      span.setAttribute(
        "neatlogs.llm.token_count.cache_read",
        usage.input_tokens_details.cached_tokens,
      );
    }
    if (usage.output_tokens_details?.reasoning_tokens != null) {
      span.setAttribute(
        "neatlogs.llm.token_count.reasoning",
        usage.output_tokens_details.reasoning_tokens,
      );
    }
  }
}

function extractResponsesOutputText(output: any): string {
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Streaming support
// ---------------------------------------------------------------------------

function wrapAsyncIterableStream(stream: any, span: Span): any {
  const accumulator = new ChoiceAccumulator();
  const originalAsyncIterator = stream[Symbol.asyncIterator]?.bind(stream);

  if (!originalAsyncIterator) {
    accumulator.addResponse(stream, span);
    accumulator.finish(span);
    return stream;
  }

  return new Proxy(stream, {
    get(target, property) {
      if (property === Symbol.asyncIterator) {
        return () => {
          const iterator = originalAsyncIterator();
          return {
            async next(): Promise<IteratorResult<any>> {
              try {
                const result = await iterator.next();
                if (result.done) {
                  accumulator.finish(span);
                  return result;
                }
                accumulator.addChunk(span, result.value);
                return result;
              } catch (err) {
                accumulator.fail(span, err);
                throw err;
              }
            },
            async return(value?: any): Promise<IteratorResult<any>> {
              try {
                return await (iterator.return?.(value) ?? {
                  done: true,
                  value: undefined,
                });
              } finally {
                accumulator.finish(span, true);
              }
            },
            async throw(err?: any): Promise<IteratorResult<any>> {
              accumulator.fail(span, err);
              if (iterator.throw) return iterator.throw(err);
              throw err;
            },
          };
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// ---------------------------------------------------------------------------
// Non-streaming response finalization
// ---------------------------------------------------------------------------

function finalizeChatResponse(span: Span, response: any): void {
  const accumulator = new ChoiceAccumulator();
  accumulator.addResponse(response, span);
  accumulator.finish(span);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function setInvocationParams(span: Span, opts: any): void {
  if (opts?.temperature != null)
    span.setAttribute("neatlogs.llm.temperature", opts.temperature);
  if (opts?.top_p != null) span.setAttribute("neatlogs.llm.top_p", opts.top_p);
  if (opts?.max_tokens != null)
    span.setAttribute("neatlogs.llm.max_tokens", opts.max_tokens);
  if (opts?.frequency_penalty != null)
    span.setAttribute("neatlogs.llm.frequency_penalty", opts.frequency_penalty);
  if (opts?.presence_penalty != null)
    span.setAttribute("neatlogs.llm.presence_penalty", opts.presence_penalty);
  if (opts?.stop)
    span.setAttribute("neatlogs.llm.stop_sequences", safeStringify(opts.stop));
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "";
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
