/**
 * Vercel AI SDK wrapper — inline implementation.
 *
 * Wraps `generateText`, `streamText`, `generateObject`, `streamObject` from
 * the `ai` package with OTel parent spans + forced telemetry. AI SDK v7's
 * optional OpenTelemetry adapter is loaded only when its integration runs.
 *
 * Usage:
 *   import { wrapAISDK } from 'neatlogs';
 *   import * as ai from 'ai';
 *   const { streamText, generateText, ToolLoopAgent } = wrapAISDK(ai);
 */

import {
  type AttributeValue,
  type Context,
  type Span,
  type SpanOptions,
  type Tracer,
} from '@opentelemetry/api';
import { DEFAULT_MAX_STREAM_CAPTURE_BYTES, utf8ByteLength } from './constants.js';
import {
  getNeatlogsTracer,
  getNeatlogsParentContext,
  getRoutingNeatlogsTracer,
  withNeatlogsSpan,
} from './core/provider.js';
import { markCancelled, recordFailure } from './core/span-outcome.js';

const TRACER_NAME = 'neatlogs.ai-sdk';

// -- Telemetry config --------------------------------------------------------

export interface CreateAITelemetryOptions {
  /** Identifier used by the AI SDK to group telemetry for this operation. */
  functionId?: string;
  metadata?: Record<string, AttributeValue>;
  /**
   * Existing telemetry tracer to preserve alongside Neatlogs (for example,
   * Laminar). Native AI SDK spans are mirrored to both isolated pipelines.
   */
  tracer?: Tracer;
}

export interface AITelemetryConfig {
  isEnabled: true;
  recordInputs: true;
  recordOutputs: true;
  tracer: Tracer;
  functionId?: string;
  metadata: Record<string, AttributeValue>;
  /** AI SDK v7 telemetry integrations. Ignored by AI SDK v6. */
  integrations: V7TelemetryIntegration[];
}

/**
 * Small structural surface shared by the AI SDK v6 and v7 telemetry integration types.
 * Keeping this local avoids making either AI SDK version part of Neatlogs' public type identity.
 */
interface V7TelemetryIntegration {
  onStart(event: unknown): Promise<void>;
}

const NEATLOGS_V7_INTEGRATION = Symbol('neatlogs.ai-sdk.v7-integration');
const AI_SDK_OTEL_MODULE = '@ai-sdk/otel';

/**
 * AI SDK v7 moved OpenTelemetry support into `@ai-sdk/otel` and now invokes a
 * telemetry integration instead of accepting a tracer directly. Keep the
 * package optional for AI SDK v6 users and load it only if v7 calls one of the
 * integration hooks.
 */
class LazyV7OpenTelemetryIntegration {
  readonly [NEATLOGS_V7_INTEGRATION] = true;
  private delegatePromise?: Promise<Record<string, any>>;

  constructor(
    private readonly tracer: Tracer,
    private readonly metadata: Record<string, AttributeValue>,
  ) {}

  private getDelegate(): Promise<Record<string, any>> {
    // Keep the v7-only adapter out of TypeScript's eager module resolution.
    // npm skips this optional dependency on Node 18/20 because AI SDK v7 and
    // @ai-sdk/otel require Node 22; v6 consumers must still be able to build.
    return (this.delegatePromise ??= import(AI_SDK_OTEL_MODULE)
      .then(({ OpenTelemetry }) =>
        new OpenTelemetry({
          tracer: this.tracer,
          enrichSpan: () => this.metadata,
        }) as unknown as Record<string, any>,
      )
      .catch((error: unknown) => {
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new Error(
          'Vercel AI SDK v7 telemetry requires the optional @ai-sdk/otel peer dependency' +
            detail,
        );
      }));
  }

  private async notify(method: string, event: unknown): Promise<void> {
    const delegate = await this.getDelegate();
    const fn = delegate[method];
    if (typeof fn === 'function') {
      await Reflect.apply(fn, delegate, [event]);
    }
  }

  onStart(event: unknown) { return this.notify('onStart', event); }
  onStepStart(event: unknown) { return this.notify('onStepStart', event); }
  onLanguageModelCallStart(event: unknown) {
    return this.notify('onLanguageModelCallStart', event);
  }
  onLanguageModelCallEnd(event: unknown) {
    return this.notify('onLanguageModelCallEnd', event);
  }
  onToolExecutionStart(event: unknown) {
    return this.notify('onToolExecutionStart', event);
  }
  onToolExecutionEnd(event: unknown) {
    return this.notify('onToolExecutionEnd', event);
  }
  onStepEnd(event: unknown) { return this.notify('onStepEnd', event); }
  onStepFinish(event: unknown) { return this.notify('onStepFinish', event); }
  onObjectStepStart(event: unknown) {
    return this.notify('onObjectStepStart', event);
  }
  onObjectStepEnd(event: unknown) {
    return this.notify('onObjectStepEnd', event);
  }
  onEmbedStart(event: unknown) { return this.notify('onEmbedStart', event); }
  onEmbedEnd(event: unknown) { return this.notify('onEmbedEnd', event); }
  onRerankStart(event: unknown) { return this.notify('onRerankStart', event); }
  onRerankEnd(event: unknown) { return this.notify('onRerankEnd', event); }
  onEnd(event: unknown) { return this.notify('onEnd', event); }
  onAbort(event: unknown) { return this.notify('onAbort', event); }
  onError(event: unknown) { return this.notify('onError', event); }

  async executeLanguageModelCall<T>(options: {
    execute: () => PromiseLike<T>;
  } & Record<string, unknown>): Promise<T> {
    const delegate = await this.getDelegate();
    const fn = delegate.executeLanguageModelCall;
    return typeof fn === 'function'
      ? Reflect.apply(fn, delegate, [options])
      : options.execute();
  }

  async executeTool<T>(options: {
    execute: () => PromiseLike<T>;
  } & Record<string, unknown>): Promise<T> {
    const delegate = await this.getDelegate();
    const fn = delegate.executeTool;
    return typeof fn === 'function'
      ? Reflect.apply(fn, delegate, [options])
      : options.execute();
  }
}

export function createAITelemetry(
  opts: CreateAITelemetryOptions = {},
): AITelemetryConfig {
  const userMeta = opts.metadata ?? {};
  const neatlogsTracer = getRoutingNeatlogsTracer(TRACER_NAME);
  const callerTracer = opts.tracer;
  const tracer = callerTracer
    ? createMirroredTracer(callerTracer, neatlogsTracer)
    : neatlogsTracer;
  const metadata = callerTracer
    ? { ...userMeta }
    : { ...userMeta, neatlogsWrapped: true };
  return {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    // Hand the AI SDK an isolation-aware tracer: it calls startActiveSpan()
    // internally, which would otherwise parent its native spans from the foreign
    // global context AND push them onto it (so a co-tenant's next span inherits
    // ours). The facade routes both through the private Neatlogs context.
    tracer,
    ...(opts.functionId !== undefined ? { functionId: opts.functionId } : {}),
    // The marker is an implementation detail used only when Neatlogs owns the
    // telemetry stream. Do not leak it into caller-owned providers.
    metadata,
    integrations: [new LazyV7OpenTelemetryIntegration(tracer, metadata)],
  };
}

// -- Span attributes ---------------------------------------------------------

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function setInputValue(span: Span, opts: Record<string, unknown>): void {
  // For generateText/streamText — only capture prompt or messages, not full model config
  if (opts && ('prompt' in opts || 'messages' in opts)) {
    const input = opts.messages ?? opts.prompt;
    const stringified = safeStringify(input);
    if (stringified) {
      span.setAttribute('input.value', stringified);
    }
    return;
  }
  const stringified = safeStringify(opts);
  if (stringified) {
    span.setAttribute('input.value', stringified);
  }
}

function setOutputValue(span: Span, result: unknown): void {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    // GenerateTextResult / StreamTextResult — extract meaningful fields
    if ('text' in r && 'finishReason' in r) {
      const text = String(r.text ?? '');
      if (text) {
        span.setAttribute('output.value', text);
      }
      if (r.finishReason) {
        span.setAttribute('neatlogs.llm.finish_reason', String(r.finishReason));
      }
      return;
    }
    // GenerateObjectResult — the structured object is the output, not `text`.
    // Without this the envelope (object+usage+response+…) gets stringified whole.
    if ('object' in r && 'finishReason' in r) {
      if (r.object !== undefined) {
        span.setAttribute('output.value', safeStringify(r.object));
      }
      if (r.finishReason) {
        span.setAttribute('neatlogs.llm.finish_reason', String(r.finishReason));
      }
      return;
    }
  }
  const stringified = safeStringify(result);
  if (stringified) {
    span.setAttribute('output.value', stringified);
  }
}

// Extract output from a streamText/streamObject `onFinish` event. The event
// extends StepResult, so `text` (streamText) / `object` (streamObject) sit at
// the top level alongside `finishReason` — but the event also carries `steps`,
// `usage`, etc., so we pull only the meaningful fields instead of stringifying
// the whole envelope.
function setStreamOutputValue(span: Span, event: unknown): void {
  if (!event || typeof event !== 'object') return;
  const e = event as Record<string, unknown>;
  if (typeof e.text === 'string' && e.text) {
    span.setAttribute('output.value', e.text);
  } else if ('object' in e && e.object !== undefined) {
    const stringified = safeStringify(e.object);
    if (stringified) span.setAttribute('output.value', stringified);
  }
  if (e.finishReason) {
    span.setAttribute('neatlogs.llm.finish_reason', String(e.finishReason));
  }
}

// -- Wrapping ----------------------------------------------------------------

type WrappedFunctionName =
  | 'generateText'
  | 'streamText'
  | 'generateObject'
  | 'streamObject'
  | 'embed'
  | 'embedMany'
  | 'rerank';

const WRAPPED_FUNCTIONS: readonly WrappedFunctionName[] = [
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
  'embed',
  'embedMany',
  'rerank',
] as const;

type WrappedAgentConstructorName = 'ToolLoopAgent' | 'Experimental_Agent';

type CompatibleAITelemetryConfig = CreateAITelemetryOptions & {
  isEnabled?: boolean;
  recordInputs?: boolean;
  recordOutputs?: boolean;
  integrations?: V7TelemetryIntegration[];
};

type TelemetryField<Options, Key extends PropertyKey> = Key extends keyof Options
  ? Options[Key]
  : never;

type CompatibleWrappedFunction<Fn> = Fn extends (...args: any[]) => any
  ? Fn &
      ((options: Omit<
        Parameters<Fn>[0],
        'experimental_telemetry' | 'telemetry'
      > & {
        experimental_telemetry?:
          | TelemetryField<Parameters<Fn>[0], 'experimental_telemetry'>
          | CompatibleAITelemetryConfig;
        telemetry?:
          | TelemetryField<Parameters<Fn>[0], 'telemetry'>
          | CompatibleAITelemetryConfig;
      }) => ReturnType<Fn>)
  : Fn;

export type WrappedAISDK<T extends Record<string, unknown>> = T & {
  [Name in Extract<keyof T, WrappedFunctionName>]: CompatibleWrappedFunction<T[Name]>;
};

const WRAPPED_AGENT_CONSTRUCTORS: readonly WrappedAgentConstructorName[] = [
  'ToolLoopAgent',
  'Experimental_Agent',
] as const;

type AgentConstructor = new (...args: any[]) => unknown;

const wrappedExports = new WeakSet<Function>();
const wrapperByOriginal = new WeakMap<Function, Function>();

/**
 * Wrap the `ai` module namespace so that every supported generation, embedding,
 * and reranking call:
 *
 *   1. Opens a parent OTel span on the active TracerProvider.
 *   2. Forces the version-appropriate telemetry option, merging user metadata.
 *   3. Records input/output on the parent span and propagates errors.
 *
 * `ToolLoopAgent` (and AI SDK v6's `Experimental_Agent` alias) is wrapped at
 * construction time so its internal model and tool calls receive the same native
 * telemetry configuration. Other exports pass through unchanged.
 */
export function wrapAISDK<T extends Record<string, unknown>>(
  aiModule: T,
): WrappedAISDK<T> {
  const wrapped: Record<string, unknown> = { ...aiModule };
  // Vitest and some bundlers expose module namespaces through proxies which
  // throw when a missing export is read. Check membership before accessing the
  // v7-only registerTelemetry export so v6 and partial module mocks stay safe.
  const hasRegisterTelemetry =
    'registerTelemetry' in aiModule &&
    typeof Reflect.get(aiModule, 'registerTelemetry') === 'function';
  const telemetryKey: TelemetryKey =
    hasRegisterTelemetry ? 'telemetry' : 'experimental_telemetry';

  for (const name of WRAPPED_FUNCTIONS) {
    const original = aiModule[name];
    if (typeof original !== 'function') continue;

    const existing = getExistingWrapper(original);
    if (existing) {
      wrapped[name] = existing;
      continue;
    }

    if (name === 'streamText' || name === 'streamObject') {
      wrapped[name] = cacheWrapper(
        original,
        createStreamWrapper(name, original as (opts: any) => unknown, telemetryKey),
      );
    } else {
      wrapped[name] = cacheWrapper(
        original,
        createAsyncWrapper(
          name,
          original as (opts: any) => Promise<unknown>,
          telemetryKey,
        ),
      );
    }
  }

  for (const name of WRAPPED_AGENT_CONSTRUCTORS) {
    const original = aiModule[name];
    if (typeof original !== 'function') continue;

    const existing = getExistingWrapper(original);
    wrapped[name] =
      existing ??
      cacheWrapper(
        original,
        createAgentConstructorWrapper(original as AgentConstructor, telemetryKey),
      );
  }

  return wrapped as WrappedAISDK<T>;
}

function getExistingWrapper(original: Function): Function | undefined {
  if (wrappedExports.has(original)) return original;
  return wrapperByOriginal.get(original);
}

function cacheWrapper(original: Function, wrapped: Function): Function {
  wrapperByOriginal.set(original, wrapped);
  wrappedExports.add(wrapped);
  return wrapped;
}

function createAgentConstructorWrapper(
  original: AgentConstructor,
  telemetryKey: TelemetryKey,
): AgentConstructor {
  return new Proxy(original, {
    construct(target, args, newTarget) {
      if (
        args.length === 0 ||
        typeof args[0] !== 'object' ||
        args[0] === null
      ) {
        return Reflect.construct(target, args, newTarget);
      }

      const settings = mergeAgentSettings(args[0], telemetryKey);
      return Reflect.construct(target, [settings, ...args.slice(1)], newTarget);
    },
  });
}

function mergeAgentSettings(settings: any, telemetryKey: TelemetryKey): any {
  const merged = mergeTelemetry(settings, telemetryKey);
  const userPrepareCall = settings.prepareCall;
  if (typeof userPrepareCall !== 'function') return merged;

  return {
    ...merged,
    prepareCall: async function wrappedPrepareCall(
      this: unknown,
      ...args: any[]
    ) {
      const prepared = await Reflect.apply(userPrepareCall, this, args);
      return prepared == null
        ? prepared
        : mergeTelemetry(
            prepared,
            telemetryKey,
            settings.telemetry ?? settings.experimental_telemetry,
          );
    },
  };
}

function rootSpanKind(name: WrappedFunctionName): string {
  if (name === 'embed' || name === 'embedMany' || name === 'rerank')
    return 'CHAIN';
  return 'WORKFLOW';
}

function getParentContext() {
  // Our parent comes solely from the private span store; a
  // foreign provider's active span must never become our ancestor.
  return getNeatlogsParentContext();
}

function createAsyncWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => Promise<unknown>,
  telemetryKey: TelemetryKey,
): (opts: any) => Promise<unknown> {
  return async function wrappedAsyncFn(opts: any): Promise<unknown> {
    const tracer = getNeatlogsTracer(TRACER_NAME);
    // startSpan (NOT startActiveSpan) + withNeatlogsSpan: startActiveSpan would
    // push our span onto the GLOBAL OTel context, so a foreign tracer's
    // startSpan() inside generateText() would read it as parent and inherit our
    // trace id. withNeatlogsSpan carries the parent in the private store in
    // the private context, leaving the global context untouched.
    const parentContext = getParentContext();
    const span = tracer.startSpan(
      `ai.${name}`,
      { attributes: { 'openinference.span.kind': rootSpanKind(name) } },
      parentContext,
    );
    return withNeatlogsSpan(
      span,
      async () => {
        try {
          const isEmbedOrRerank =
            name === 'embed' || name === 'embedMany' || name === 'rerank';
          if (!isEmbedOrRerank) {
            setInputValue(span, opts);
          }
          if (name === 'rerank' && opts?.query) {
            span.setAttribute('ai.rerank.query', String(opts.query));
          }
          const merged = mergeTelemetry(opts, telemetryKey);
          const result = await original(merged);
          if (!isEmbedOrRerank) {
            setOutputValue(span, result);
          }
          return result;
        } catch (err) {
          recordSpanError(span, err);
          throw err;
        } finally {
          span.end();
        }
      },
      parentContext,
    );
  };
}

// streamText/streamObject return synchronously while the model keeps producing
// tokens for seconds afterwards. Ending the span in a `finally` (as a plain sync
// wrapper would) closes it in ~2ms with no output — the output only exists once
// the stream finishes. Instead we keep the span open and end it from whichever
// signal says the stream is over.
//
// The AI SDK's end callback alone is not enough: it is skipped when the caller
// aborts (`onAbort` fires instead), when the consumer stops reading, and when
// the provider stream breaks mid-way (no callback at all). The returned
// result's streams are therefore observed too. User callbacks are preserved.
function createStreamWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => unknown,
  telemetryKey: TelemetryKey,
): (opts: any) => unknown {
  return function wrappedStreamFn(opts: any): unknown {
    const tracer = getNeatlogsTracer(TRACER_NAME);
    // startSpan + withNeatlogsSpan (see createAsyncWrapper) so streamText's
    // internals never see our span on the global OTel context. The span stays
    // open past the run scope.
    const parentContext = getParentContext();
    const span = tracer.startSpan(
      `ai.${name}`,
      { attributes: { 'openinference.span.kind': rootSpanKind(name) } },
      parentContext,
    );
    return withNeatlogsSpan(
      span,
      () => {
        let spanEnded = false;
        const endOnce = () => {
          if (spanEnded) return;
          spanEnded = true;
          span.end();
        };
        // Text seen so far, for a stream that ends without its end event.
        const partialText: string[] = [];
        let partialBytes = 0;
        const applyPartialOutput = () => {
          const text = partialText.join('');
          if (text) span.setAttribute('output.value', text);
        };
        // A provider error that the SDK may still retry (v7 `streamRetries`).
        let pendingError: { error: unknown } | undefined;
        const finish = (event: any) => {
          if (spanEnded) return;
          try {
            setStreamOutputValue(span, event);
            if (pendingError && event?.finishReason === 'error') {
              recordSpanError(span, pendingError.error);
            }
          } finally {
            endOnce();
          }
        };
        const fail = (error: unknown) => {
          if (spanEnded) return;
          applyPartialOutput();
          recordSpanError(span, error);
          endOnce();
        };
        const cancel = () => {
          if (spanEnded) return;
          applyPartialOutput();
          markCancelled(span);
          endOnce();
        };
        // The stream closed with no end event: an error that was held back
        // for a retry is the outcome; otherwise nothing more is known.
        const close = () => {
          if (spanEnded) return;
          if (pendingError) return fail(pendingError.error);
          applyPartialOutput();
          endOnce();
        };
        try {
          setInputValue(span, opts);
          const merged = mergeTelemetry(opts, telemetryKey);
          // v7 streamText renamed `onFinish` to `onEnd` and ignores `onFinish`
          // once `onEnd` is set, so hook the name this call actually uses.
          const endKey =
            name === 'streamText' && telemetryKey === 'telemetry'
              ? 'onEnd'
              : 'onFinish';
          const userOnEnd =
            (endKey === 'onEnd' ? opts?.onEnd : undefined) ?? opts?.onFinish;
          const userOnError = opts?.onError;
          const userOnAbort = opts?.onAbort;
          const userOnChunk = opts?.onChunk;
          const retriesStream = Number(opts?.streamRetries) > 0;
          const wrappedOpts: Record<string, unknown> = {
            ...merged,
            [endKey]: async (event: any) => {
              finish(event);
              if (typeof userOnEnd === 'function') {
                return userOnEnd(event);
              }
            },
            onError: (event: any) => {
              const error = (event && event.error) ?? event;
              const settle = (result: any) => {
                if (retriesStream || result?.retry === true) pendingError = { error };
                else fail(error);
                return result;
              };
              const result =
                typeof userOnError === 'function' ? userOnError(event) : undefined;
              return typeof result?.then === 'function'
                ? result.then(settle, (err: unknown) => {
                    settle(undefined);
                    throw err;
                  })
                : settle(result);
            },
          };
          if (endKey === 'onEnd') delete wrappedOpts.onFinish;
          if (name === 'streamText') {
            wrappedOpts.onAbort = (event: any) => {
              cancel();
              if (typeof userOnAbort === 'function') {
                return userOnAbort(event);
              }
            };
            wrappedOpts.onChunk = (event: any) => {
              const chunk = event?.chunk;
              const text =
                chunk?.type === 'text-delta'
                  ? (chunk.text ?? chunk.textDelta ?? chunk.delta)
                  : undefined;
              if (typeof text === 'string' && text) {
                const remaining = DEFAULT_MAX_STREAM_CAPTURE_BYTES - partialBytes;
                const bytes = utf8ByteLength(text, remaining);
                if (bytes <= remaining) {
                  partialText.push(text);
                  partialBytes += bytes;
                }
              }
              if (typeof userOnChunk === 'function') {
                return userOnChunk(event);
              }
            };
          }
          return observeResultStreams(original(wrappedOpts), { fail, cancel, close });
        } catch (err) {
          // Synchronous throw (e.g. bad arguments) — the stream never started.
          recordSpanError(span, err);
          endOnce();
          throw err;
        }
      },
      parentContext,
    );
  };
}

interface StreamOutcome {
  fail(error: unknown): void;
  cancel(): void;
  close(): void;
}

// Every way of consuming a stream result (iteration, `consumeStream()`,
// `toUIMessageStream*`, awaiting `text`) reads through one of these getters.
const RESULT_STREAM_GETTERS = [
  'textStream',
  'fullStream',
  'stream',
  'partialOutputStream',
  'experimental_partialOutputStream',
  'partialObjectStream',
  'elementStream',
] as const;

/**
 * Shadow the result's stream getters so a read that rejects, or a consumer
 * that stops reading, ends the span. The getters are redefined on the instance
 * (not through a Proxy) so the SDK's own methods keep their `this`.
 */
function observeResultStreams(result: any, outcome: StreamOutcome): any {
  if (!result || typeof result !== 'object') return result;
  let reading = 0;
  // v7's `textStream` reads `this.stream`; observe only the outermost getter.
  let insideGetter = false;
  const observer: StreamObserver = {
    opened: () => {
      reading += 1;
    },
    closed: () => {
      reading -= 1;
      outcome.close();
    },
    failed: (error) => {
      reading -= 1;
      outcome.fail(error);
    },
    // Another branch of the same stream may still be read to its end.
    cancelled: () => {
      reading -= 1;
      if (reading <= 0) outcome.cancel();
    },
  };
  for (const key of RESULT_STREAM_GETTERS) {
    const getter = findGetter(result, key);
    if (!getter) continue;
    try {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: false,
        get() {
          if (insideGetter) return getter.call(result);
          insideGetter = true;
          try {
            return observeStream(getter.call(result), observer);
          } finally {
            insideGetter = false;
          }
        },
      });
    } catch {
      /* frozen result: the SDK callbacks still end the span */
    }
  }
  return result;
}

function findGetter(target: object, key: string): (() => unknown) | undefined {
  for (
    let proto = Object.getPrototypeOf(target);
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor) return descriptor.get;
  }
  return undefined;
}

interface StreamObserver {
  opened(): void;
  closed(): void;
  failed(error: unknown): void;
  cancelled(): void;
}

/** Forward `source` unchanged through a real ReadableStream that reports how it ended. */
function observeStream(source: any, observer: StreamObserver): any {
  if (
    !source ||
    typeof source.getReader !== 'function' ||
    typeof ReadableStream !== 'function'
  ) {
    return source;
  }
  let reader: any;
  let settled = false;
  const settle = (report: () => void) => {
    if (settled) return;
    settled = true;
    report();
  };
  const observed: any = new ReadableStream(
    {
      async pull(controller) {
        if (!reader) {
          reader = source.getReader();
          observer.opened();
        }
        try {
          const { done, value } = await reader.read();
          if (done) {
            settle(observer.closed);
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          settle(() => observer.failed(error));
          controller.error(error);
        }
      },
      async cancel(reason) {
        if (!reader) {
          reader = source.getReader();
          observer.opened();
        }
        settle(observer.cancelled);
        await reader.cancel(reason);
      },
    },
    // No read-ahead: the source is pulled only when the consumer reads.
    { highWaterMark: 0 },
  );
  // AI SDK streams are async iterables through their own iterator; keep it.
  if (Object.prototype.hasOwnProperty.call(source, Symbol.asyncIterator)) {
    observed[Symbol.asyncIterator] = source[Symbol.asyncIterator];
  }
  return observed;
}

function createMirroredSpan(primary: Span, secondary: Span): Span {
  const mirrored: Span = {
    spanContext() {
      // The caller-owned tracer remains the process-global context owner. Its
      // context is therefore the one external instrumentation must observe.
      return primary.spanContext();
    },
    setAttribute(key, value) {
      primary.setAttribute(key, value);
      secondary.setAttribute(key, value);
      return mirrored;
    },
    setAttributes(attributes) {
      primary.setAttributes(attributes);
      secondary.setAttributes(attributes);
      return mirrored;
    },
    addEvent(name, attributesOrStartTime, startTime) {
      primary.addEvent(name, attributesOrStartTime, startTime);
      secondary.addEvent(name, attributesOrStartTime, startTime);
      return mirrored;
    },
    addLink(link) {
      primary.addLink(link);
      secondary.addLink(link);
      return mirrored;
    },
    addLinks(links) {
      primary.addLinks(links);
      secondary.addLinks(links);
      return mirrored;
    },
    setStatus(status) {
      primary.setStatus(status);
      secondary.setStatus(status);
      return mirrored;
    },
    updateName(name) {
      primary.updateName(name);
      secondary.updateName(name);
      return mirrored;
    },
    end(endTime) {
      primary.end(endTime);
      secondary.end(endTime);
    },
    isRecording() {
      return primary.isRecording() || secondary.isRecording();
    },
    recordException(exception, time) {
      primary.recordException(exception, time);
      secondary.recordException(exception, time);
    },
  };
  return mirrored;
}

/**
 * Mirror one AI SDK telemetry stream to two isolated tracer pipelines.
 *
 * The caller-owned tracer is deliberately outermost so its normal global OTel
 * activation and parentage stay unchanged. The Neatlogs routing tracer keeps
 * its span active only in Neatlogs' private AsyncLocalStorage context.
 */
function createMirroredTracer(primary: Tracer, secondary: Tracer): Tracer {
  return {
    startSpan(name: string, options?: SpanOptions, context?: Context): Span {
      const primarySpan = primary.startSpan(name, options, context);
      const secondarySpan = secondary.startSpan(name, options);
      return createMirroredSpan(primarySpan, secondarySpan);
    },
    startActiveSpan: (<F extends (span: Span) => unknown>(
      name: string,
      arg2?: SpanOptions | F,
      arg3?: Context | F,
      arg4?: F,
    ): ReturnType<F> => {
      let options: SpanOptions | undefined;
      let context: Context | undefined;
      let fn: F;

      if (typeof arg2 === 'function') {
        fn = arg2;
      } else if (typeof arg3 === 'function') {
        options = arg2;
        fn = arg3;
      } else {
        options = arg2;
        context = arg3 as Context;
        fn = arg4!;
      }

      const runSecondary = (primarySpan: Span): ReturnType<F> => {
        const onSecondarySpan = (secondarySpan: Span) =>
          fn(createMirroredSpan(primarySpan, secondarySpan)) as ReturnType<F>;
        return options === undefined
          ? secondary.startActiveSpan(name, onSecondarySpan)
          : secondary.startActiveSpan(name, options, onSecondarySpan);
      };

      if (context !== undefined) {
        return primary.startActiveSpan(
          name,
          options ?? {},
          context,
          runSecondary,
        ) as ReturnType<F>;
      }
      return options === undefined
        ? (primary.startActiveSpan(name, runSecondary) as ReturnType<F>)
        : (primary.startActiveSpan(name, options, runSecondary) as ReturnType<F>);
    }) as Tracer['startActiveSpan'],
  };
}

type TelemetryKey = 'telemetry' | 'experimental_telemetry';

function isNeatlogsV7Integration(
  integration: unknown,
): integration is LazyV7OpenTelemetryIntegration {
  return (
    typeof integration === 'object' &&
    integration !== null &&
    NEATLOGS_V7_INTEGRATION in integration
  );
}

function mergeTelemetry(
  opts: any,
  telemetryKey: TelemetryKey,
  fallbackTelemetry?: any,
): any {
  const legacyTelemetry = opts?.experimental_telemetry ?? {};
  const v7Telemetry = opts?.telemetry ?? {};
  const preferredTelemetry =
    telemetryKey === 'telemetry'
      ? { ...legacyTelemetry, ...v7Telemetry }
      : { ...v7Telemetry, ...legacyTelemetry };
  const requestedTelemetry = {
    ...fallbackTelemetry,
    ...preferredTelemetry,
    metadata: {
      ...fallbackTelemetry?.metadata,
      ...legacyTelemetry.metadata,
      ...v7Telemetry.metadata,
    },
  };
  const existingNeatlogsIntegration = Array.isArray(
    requestedTelemetry.integrations,
  )
    ? requestedTelemetry.integrations.find(isNeatlogsV7Integration)
    : undefined;
  const baseTelemetry: AITelemetryConfig = existingNeatlogsIntegration
    ? {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        tracer: requestedTelemetry.tracer as Tracer,
        ...(requestedTelemetry.functionId !== undefined
          ? { functionId: requestedTelemetry.functionId }
          : {}),
        metadata: requestedTelemetry.metadata,
        integrations: [existingNeatlogsIntegration],
      }
    : createAITelemetry({
        functionId: requestedTelemetry.functionId,
        metadata: requestedTelemetry.metadata,
        tracer: requestedTelemetry.tracer as Tracer | undefined,
      });
  const callerTracer = requestedTelemetry.tracer as Tracer | undefined;
  const hasCallerTracer = callerTracer !== undefined;
  const rawRequestedIntegrations = requestedTelemetry.integrations;
  const requestedIntegrations = (
    Array.isArray(rawRequestedIntegrations)
      ? rawRequestedIntegrations
      : rawRequestedIntegrations == null
        ? []
        : [rawRequestedIntegrations]
  ).filter((integration: unknown) => !isNeatlogsV7Integration(integration));
  const { telemetry: _telemetry, experimental_telemetry: _legacy, ...rest } =
    opts ?? {};

  return {
    ...rest,
    [telemetryKey]: {
      ...baseTelemetry,
      ...requestedTelemetry,
      isEnabled: true,
      recordInputs: requestedTelemetry.recordInputs ?? true,
      recordOutputs: requestedTelemetry.recordOutputs ?? true,
      tracer: baseTelemetry.tracer,
      // Do not add Neatlogs-only marker metadata to a caller-owned telemetry
      // pipeline such as Laminar. Both providers receive the same AI SDK span
      // data, while their providers, parent contexts, and exporters stay separate.
      metadata: hasCallerTracer
        ? requestedTelemetry.metadata
        : baseTelemetry.metadata,
      integrations: [...baseTelemetry.integrations, ...requestedIntegrations],
    },
  };
}

function recordSpanError(span: Span, err: unknown): void {
  recordFailure(span, err);
}
