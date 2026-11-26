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

import { AsyncResource } from 'node:async_hooks';
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { observeRawResponse } from "./core/raw-response.js";
import { getProviderTracer } from "./core/auto-root.js";
import { ChoiceAccumulator } from "./core/choice-accumulator.js";
import { captureMedia } from "./core/media.js";
import {
  finalizeResponsesResponse,
  sanitizedJsonToolArguments,
  wrapResponsesAsyncIterableStream,
} from "./core/openai-responses.js";
import { recordFailure } from "./core/span-outcome.js";
import { cachedModelSpan, prepareProviderReplay } from './replay/provider.js';
import { prepareProviderCapture } from './replay/provider-capture.js';
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
        },
      },
      getNeatlogsParentContext(),
    );
    span.setAttribute(
      "input.value",
      safeStringify(captureMedia(span, "neatlogs.tool.input", args, "input")),
    );
    return withNeatlogsSpan(span, async () => {
      try {
        const result = await fn(args);
        span.setAttribute(
          "output.value",
          safeStringify(captureMedia(span, "neatlogs.tool.output", result, "output")),
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

    // Streams are captured too (F-040), assembled into one chat.completion when the stream completes.
    // The captured request keeps stream: true, so server replay refuses it; replay below stays non-streaming.
    const captureResponse = prepareProviderCapture(span, 'openai.chat.completions.create', opts, rest.length === 0, { stream: isStream });
    let result: any;
    let replayed = false;
    let resolveReplay: ((raw: boolean) => any) | undefined;
    try {
      const consumeReplay = withNeatlogsSpan(span, () => prepareProviderReplay('openai.chat.completions.create', opts, !isStream && rest.length === 0));
      const execute = (raw = false) => withNeatlogsSpan(span, () => {
        const saved = consumeReplay?.consume(!raw);
        replayed = saved !== undefined;
        return replayed ? saved : original(opts, ...rest);
      });
      resolveReplay = consumeReplay?.canRestore ? AsyncResource.bind(execute) : undefined;
      if (!resolveReplay) result = execute();
    } catch (err) {
      recordError(span, err);
      throw err;
    }

    return preserveResponseHelpers(result, span,
      (response: any) => {
        if (isStream) {
          // The server reads exactly one choice, so an n > 1 stream is never captured.
          return wrapAsyncIterableStream(response, span, replayed || (Number(opts?.n) || 1) > 1 ? undefined : captureResponse);
        }
        if (!replayed) captureResponse?.(response);
        finalizeChatResponse(replayed ? cachedModelSpan(span) : span, response);
        return response;
      },
      isStream,
      resolveReplay,
    );
  };
}

// ---------------------------------------------------------------------------
// responses.create
// ---------------------------------------------------------------------------


// Preserve the SDK's response helpers while sharing one traced parsed result.
function preserveResponseHelpers(result: any, span: Span, finalize: (value: any) => any, isStream = false, resolveReplay?: (raw: boolean) => any): any {
  let target = resolveReplay ? undefined : result && typeof result.then === 'function' ? result : Promise.resolve(result);
  let traced: Promise<any> | undefined;
  const resolve = (raw = false) => {
    if (!target) {
      try {
        const value = resolveReplay!(raw);
        target = value && typeof value.then === 'function' ? value : Promise.resolve(value);
      } catch (error) { recordError(span, error); throw error; }
    } else if (raw && resolveReplay && typeof target.asResponse !== 'function') {
      throw new Error('Request raw-response helpers before consuming a replayed response; HTTP metadata was not recorded.');
    }
    return target;
  };
  const consume = () => traced ??= Promise.resolve().then(() => resolve()).then(finalize, (err: any) => {
    recordError(span, err);
    throw err;
  });
  return new Proxy(result ?? Promise.resolve(), {
    get(_promise, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return (...args: any[]) => (consume() as any)[prop](...args);
      if (prop === 'withResponse' && (resolveReplay || typeof target.withResponse === 'function')) {
        return async () => {
          const promise = resolve(true);
          if (typeof promise.asResponse !== 'function') throw new Error('The provider does not expose HTTP response helpers.');
          const [data, response] = await Promise.all([consume(), promise.asResponse()]);
          return { data, response, request_id: response.headers.get('x-request-id') };
        };
      }
      if (prop === 'asResponse' && (resolveReplay || typeof target.asResponse === 'function')) {
        return async () => {
          try {
            const promise = resolve(true);
            if (typeof promise.asResponse !== 'function') throw new Error('The provider does not expose HTTP response helpers.');
            const response = await promise.asResponse();
            if (!traced && span.isRecording()) {
              if (response.ok) observeRawResponse(response, span, { isStream, isTraced: () => traced !== undefined, finalize });
              else { span.setStatus({ code: SpanStatusCode.ERROR }); span.end(); }
            }
            return response;
          } catch (err) {
            if (!traced) recordError(span, err);
            throw err;
          }
        };
      }
      const promise = resolve();
      const value = Reflect.get(promise, prop, promise);
      return typeof value === 'function' ? value.bind(promise) : value;
    },
  });
}

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

    const captureResponse = prepareProviderCapture(span, 'openai.responses.create', opts, !isStream && rest.length === 0);
    let result: any;
    let replayed = false;
    let resolveReplay: ((raw: boolean) => any) | undefined;
    try {
      const consumeReplay = withNeatlogsSpan(span, () => prepareProviderReplay('openai.responses.create', opts, !isStream && rest.length === 0));
      const execute = (raw = false) => withNeatlogsSpan(span, () => {
        const saved = consumeReplay?.consume(!raw);
        replayed = saved !== undefined;
        return replayed ? saved : original(opts, ...rest);
      });
      resolveReplay = consumeReplay?.canRestore ? AsyncResource.bind(execute) : undefined;
      if (!resolveReplay) result = execute();
    } catch (err) {
      recordError(span, err);
      throw err;
    }

    return preserveResponseHelpers(result, span,
      (response: any) => {
        if (isStream) {
          return wrapResponsesAsyncIterableStream(response, span);
        }
        if (!replayed) captureResponse?.(response);
        finalizeResponsesResponse(replayed ? cachedModelSpan(span) : span, response);
        return response;
      },
      isStream,
      resolveReplay,
    );
  };
}

// ---------------------------------------------------------------------------
// Streaming support
// ---------------------------------------------------------------------------

function wrapAsyncIterableStream(stream: any, span: Span, captureResponse?: (response: unknown) => void): any {
  let assembled = captureResponse ? new ChatStreamResponse() : undefined;
  const accumulator = new ChoiceAccumulator();
  const safeSpan = mediaSafeAccumulatorSpan(span);
  let cancellationRequested = false;
  const originalAsyncIterator = stream[Symbol.asyncIterator]?.bind(stream);

  if (!originalAsyncIterator) {
    accumulator.addResponse(stream, span);
    accumulator.finish(safeSpan);
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
                  // The SDK ends the iterator quietly on an abort; a chunk with
                  // a finish_reason means the reply did complete first.
                  const aborted = stream.controller?.signal?.aborted === true;
                  const interrupted = cancellationRequested || (aborted && !accumulator.hasFinishReason());
                  // An aborted stream is never captured: its trailing chunks (usage) never arrived.
                  // Return and failure already released `assembled`; an aborted stream is never captured.
                  if (assembled && !aborted) assembled.capture(captureResponse!);
                  assembled = undefined; // release the kept content
                  accumulator.finish(safeSpan, interrupted);
                  return result;
                }
                accumulator.addChunk(span, result.value);
                assembled?.add(result.value);
                return result;
              } catch (err) {
                assembled = undefined; // a failed stream is never captured; release the kept content
                accumulator.fail(safeSpan, err);
                throw err;
              }
            },
            async return(value?: any): Promise<IteratorResult<any>> {
              cancellationRequested = true;
              assembled = undefined; // a stream the caller left is never captured; release the kept content
              try {
                const result = await (iterator.return?.(value) ?? {
                  done: true,
                  value: undefined,
                });
                if (result.done) accumulator.finish(safeSpan, true);
                else accumulator.addChunk(span, result.value);
                return result;
              } catch (err) {
                accumulator.fail(safeSpan, err);
                throw err;
              }
            },
            async throw(err?: any): Promise<IteratorResult<any>> {
              accumulator.fail(safeSpan, err);
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

/** Kept stream data is copied so later changes to a chunk (by the caller) never reach the capture. */
function copyKept<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Memory bound for the kept content; the provider capture applies the real 1 MB limit to the result. */
const MAX_STREAM_RESPONSE_BYTES = 1024 * 1024;
/** Delta fields the chat rebuild understands; any other non-null field makes the stream uncapturable. */
const REBUILT_DELTA_FIELDS = new Set(['role', 'content', 'refusal', 'tool_calls']);

/**
 * Rebuild the chat.completion a non-streamed call returns from its chunks (F-040): content and refusal
 * deltas are joined, logprobs appended, function tool-call deltas merged by index, and response metadata
 * takes its last non-null value; per-chunk stream padding is dropped. A delta this cannot rebuild exactly
 * (legacy function_call, audio, annotations, non-function tool calls…) leaves the stream uncaptured.
 * Capture is best effort: any failure drops it and never reaches the caller's stream.
 */
class ChatStreamResponse {
  private readonly choices = new Map<number, {
    role?: string; content?: string; refusal?: string; toolCalls: Map<number, any>; fields: Record<string, unknown>;
    logprobs?: { content: unknown[] | null; refusal: unknown[] | null };
  }>();
  private readonly fields: Record<string, unknown> = {};
  private bytes = 0;
  private capturable = true;

  add(chunk: any): void {
    this.guard(() => this.addChunk(chunk));
  }

  /** Capture the rebuilt response unless it is incomplete or capture failed. */
  capture(captureResponse: (response: unknown) => void): void {
    this.guard(() => {
      const response = this.finish();
      if (response) captureResponse(response);
    });
  }

  private guard(step: () => void): void {
    if (!this.capturable) return;
    try {
      step();
    } catch {
      this.capturable = false;
      this.choices.clear();
    }
  }

  private keep(value: string): void {
    this.bytes += value.length;
    if (this.bytes > MAX_STREAM_RESPONSE_BYTES) throw new Error('Streamed response exceeds the capture limit.');
  }

  private addChunk(chunk: any): void {
    const { choices, object: _object, obfuscation: _obfuscation, ...fields } = chunk ?? {};
    for (const [key, value] of Object.entries(fields)) if (value !== null && value !== undefined) this.fields[key] = copyKept(value);
    for (const choice of Array.isArray(choices) ? choices : []) {
      const { index, delta, logprobs, ...choiceFields } = choice ?? {};
      if (typeof index !== 'number') throw new Error('Streamed choice has no index.');
      for (const [key, value] of Object.entries(delta ?? {}))
        if (value !== null && value !== undefined && !REBUILT_DELTA_FIELDS.has(key)) throw new Error(`Cannot rebuild delta field ${key}.`);
      let state = this.choices.get(index);
      if (!state) { state = { toolCalls: new Map(), fields: {} }; this.choices.set(index, state); }
      const hasContent = Object.values(delta ?? {}).some((value) => value !== null && value !== undefined && value !== '');
      if (typeof state.fields.finish_reason === 'string' && hasContent) throw new Error('Content arrived after the choice finished.');
      for (const [key, value] of Object.entries(choiceFields)) if (value !== null && value !== undefined) state.fields[key] = copyKept(value);
      if (logprobs && typeof logprobs === 'object') {
        // Each chunk carries the logprobs of its own tokens; the full response lists them all.
        const saved = (state.logprobs ??= { content: null, refusal: null });
        for (const key of ['content', 'refusal'] as const)
          if (Array.isArray(logprobs[key])) { const kept = JSON.stringify(logprobs[key]); this.keep(kept); (saved[key] ??= []).push(...JSON.parse(kept)); }
      }
      if (typeof delta?.role === 'string') state.role = delta.role;
      if (typeof delta?.content === 'string') { this.keep(delta.content); state.content = (state.content ?? '') + delta.content; }
      if (typeof delta?.refusal === 'string') { this.keep(delta.refusal); state.refusal = (state.refusal ?? '') + delta.refusal; }
      for (const call of Array.isArray(delta?.tool_calls) ? delta.tool_calls : []) {
        if (typeof call?.index !== 'number' || (call.type !== undefined && call.type !== 'function'))
          throw new Error('Only function tool calls can be rebuilt.');
        for (const key of Object.keys(call)) if (!['index', 'id', 'type', 'function'].includes(key) && call[key] != null) throw new Error(`Cannot rebuild tool-call field ${key}.`);
        const saved = state.toolCalls.get(call.index) ?? { function: { name: '', arguments: '' } };
        if (typeof call.id === 'string') saved.id = call.id;
        if (typeof call.type === 'string') saved.type = call.type;
        // The name is sent whole (some compatible servers repeat it on every delta); arguments stream in pieces.
        if (typeof call.function?.name === 'string' && call.function.name) saved.function.name = call.function.name;
        if (typeof call.function?.arguments === 'string') { this.keep(call.function.arguments); saved.function.arguments += call.function.arguments; }
        state.toolCalls.set(call.index, saved);
      }
    }
  }

  private finish(): Record<string, unknown> | undefined {
    // The server reads exactly one choice; any other count is not a readable response.
    if (!this.capturable || this.choices.size !== 1) return undefined;
    const choices = [];
    for (const [index, state] of [...this.choices.entries()].sort(([a], [b]) => a - b)) {
      if (typeof state.fields.finish_reason !== 'string' || !state.fields.finish_reason) return undefined;
      // A tool call whose name never arrived is not a complete call.
      if ([...state.toolCalls.values()].some((call) => !call.function.name)) return undefined;
      const toolCalls = [...state.toolCalls.entries()].sort(([a], [b]) => a - b)
        .map(([, call]) => ({ ...(call.id === undefined ? {} : { id: call.id }), type: call.type ?? 'function', function: call.function }));
      const message: Record<string, unknown> = { role: state.role ?? 'assistant', content: state.content ?? null };
      if (state.refusal !== undefined) message.refusal = state.refusal;
      if (toolCalls.length) message.tool_calls = toolCalls;
      choices.push({ index, message, ...state.fields, ...(state.logprobs ? { logprobs: state.logprobs } : {}) });
    }
    return { ...this.fields, object: 'chat.completion', choices };
  }
}

// ---------------------------------------------------------------------------
// Non-streaming response finalization
// ---------------------------------------------------------------------------

function finalizeChatResponse(span: Span, response: any): void {
  const accumulator = new ChoiceAccumulator();
  accumulator.addResponse(response, span);
  accumulator.finish(mediaSafeAccumulatorSpan(span));
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function mediaSafeAccumulatorSpan(span: Span): Span {
  return new Proxy(span, {
    get(target, property) {
      if (property === "setAttribute") {
        return (name: string, value: unknown) =>
          target.setAttribute(
            name,
            /^neatlogs\.llm\.tool_calls\.\d+\.arguments$/.test(name)
              ? sanitizedJsonToolArguments(target, name, value)
              : (value as any),
          );
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

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
  recordFailure(span, err);
  span.end();
}
