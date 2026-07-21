/**
 * Context wrapper for manual span creation.
 *
 * Provides the `trace()` function — the TypeScript equivalent of the Python
 * `trace()` context manager. Creates an OTel span, sets prompt template/variable
 * context, and executes the user callback within the span.
 *
 * @example
 * ```typescript
 * await trace({ name: 'my-trace' }, async (span) => {
 *   // user code runs here with the span active
 * });
 * ```
 */

import {
  trace as otelTrace,
  context as otelContext,
  createContextKey,
  ROOT_CONTEXT,
  SpanStatusCode,
  type Span,
} from '@opentelemetry/api';
import { PromptContext, UserPromptContext, PromptTemplate, UserPromptTemplate } from '../prompt/template.js';
import { registerMask } from './mask.js';
import { applyEndUserAttributes } from './end-user.js';
import { applySessionAttributes } from './session.js';
import { currentSessionId } from './identity.js';

import { getLogger } from './logger.js';
import { safeJsonDumps, serializeObj } from '../decorators/base.js';
import type { TraceOptions, MaskFunction } from '../types.js';
import {
  getActiveNeatlogsSpan,
  getNeatlogsActiveContext,
  getNeatlogsParentContext,
  getNeatlogsRootSpan,
  getNeatlogsTracer,
  withNeatlogsSpan,
} from './provider.js';

const logger = getLogger();

// ---------------------------------------------------------------------------
// Module-level session config (set by init.ts via _setSessionConfig)
// ---------------------------------------------------------------------------

let _sessionConfig: Record<string, any> = {};

/**
 * Set the session configuration. Called by init() during SDK setup.
 * @internal
 */
export function _setSessionConfig(config: Record<string, any>): void {
  _sessionConfig = config;
}

/**
 * Get a copy of the current session configuration.
 */
export function getSessionConfig(): Record<string, any> {
  return { ..._sessionConfig };
}

// ---------------------------------------------------------------------------
// OTel context keys for prompt data propagation
// ---------------------------------------------------------------------------

export const PROMPT_VARIABLES_KEY = createContextKey('neatlogs.prompt_variables');
export const PROMPT_TEMPLATE_KEY = createContextKey('neatlogs.prompt_template');
export const PROMPT_VERSION_KEY = createContextKey('neatlogs.prompt_version');
export const USER_PROMPT_TEMPLATE_KEY = createContextKey('neatlogs.user_prompt_template');
export const USER_PROMPT_VARIABLES_KEY = createContextKey('neatlogs.user_prompt_variables');

// ---------------------------------------------------------------------------
// Known TraceOptions keys (not forwarded as extra span attributes)
// ---------------------------------------------------------------------------

const KNOWN_OPTION_KEYS = new Set([
  'name',
  'kind',
  'input',
  'promptTemplate',
  'promptVariables',
  'userPromptTemplate',
  'userPromptVariables',
  'version',
  'mask',
  'attributes',
  'sessionId',
  'endUserId',
  'endUserMetadata',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set standard and extra attributes on a span.
 * @internal
 */
export function _setSpanAttributes(
  span: Span,
  kind: string | undefined,
  attributes: Record<string, any>,
): void {
  span.setAttribute('neatlogs.internal', true);
  span.setAttribute('openinference.span.kind', kind ?? 'CHAIN');

  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute(key, value);
  }
}

/**
 * After the user callback completes, capture prompt variables that were
 * set by PromptTemplate.compile() / UserPromptTemplate.compile() and
 * record them as span attributes.
 * @internal
 */
export function _finalizePromptCapture(
  span: Span,
  isPromptTemplateObj: boolean,
  isUserPromptTemplateObj: boolean,
): void {
  if (isPromptTemplateObj) {
    const capturedVars = PromptContext.getVariables();
    if (capturedVars) {
      span.setAttribute(
        'llm.prompt_template_variables',
        JSON.stringify(capturedVars),
      );
      logger.debug(
        `[trace] Auto-captured variables from PromptContext: ${Object.keys(capturedVars).join(', ')}`,
      );
    }
  }

  if (isUserPromptTemplateObj) {
    const capturedUserVars = UserPromptContext.getVariables();
    if (capturedUserVars) {
      span.setAttribute(
        'llm.user_prompt_template_variables',
        JSON.stringify(capturedUserVars),
      );
      logger.debug(
        `[trace] Auto-captured variables from UserPromptContext: ${Object.keys(capturedUserVars).join(', ')}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Explicit trace-level output
// ---------------------------------------------------------------------------

/**
 * Explicitly set the trace-level "final output" shown for the current trace.
 *
 * By default the trace's displayed output is derived from the root span's
 * captured output. Call this to declare it instead — useful when the turn's
 * meaningful result lives in a tool call or is a status object you don't want
 * shown (e.g. an agent that suspends awaiting user input). The value is stamped
 * as `neatlogs.trace.output` on the trace ROOT span, which the backend prefers
 * over the derived output.
 *
 * No-op when called outside an active trace. Never throws.
 *
 * @param value - The value to show as the trace's final output.
 *
 * @example
 * ```typescript
 * await trace({ name: 'turn', sessionId }, async () => {
 *   const plan = await proposePlan();
 *   setTraceOutput(plan.title); // show the plan, not the raw status object
 * });
 * ```
 */
export function setTraceOutput(value: unknown): void {
  try {
    const span = getNeatlogsRootSpan() ?? getActiveNeatlogsSpan();
    if (!span) return;
    span.setAttribute('neatlogs.trace.output', safeJsonDumps(serializeObj(value)));
  } catch (err) {
    logger.warn(`[setTraceOutput] failed to set trace output: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Main trace() function
// ---------------------------------------------------------------------------

/**
 * Async callback wrapper for manual span creation with prompt tracking.
 *
 * Creates an OTel span, optionally sets prompt template/variable context,
 * and executes the provided callback within the span.
 *
 * **Session-Aware Trace Creation:**
 * - If a session id is resolved (per-call `sessionId` or the request-scoped
 *   `identify()` context) AND no active parent span exists, this creates a NEW
 *   root trace (for multi-turn conversations).
 * - Otherwise, creates a normal child span within the existing trace.
 *
 * @param options - Trace configuration options
 * @param fn - Callback that receives the active span
 * @returns The return value of the callback
 *
 * @example
 * ```typescript
 * // Basic usage
 * await trace({ name: 'my-pipeline' }, async (span) => {
 *   await step1();
 *   await step2();
 * });
 *
 * // With prompt template
 * const template = new PromptTemplate('Hello {{name}}');
 * await trace({ name: 'prompt', promptTemplate: template }, async (span) => {
 *   const rendered = template.compile({ name: 'world' });
 *   // ...
 * });
 * ```
 */
export async function trace<T>(
  options: TraceOptions,
  fn: (span: Span) => T | Promise<T>,
): Promise<T> {
  const {
    name,
    kind,
    input,
    promptTemplate,
    promptVariables,
    userPromptTemplate,
    userPromptVariables,
    version,
    mask,
    sessionId: sessionIdOption,
    endUserId,
    endUserMetadata,
    attributes: explicitAttributes,
    ...extraOptions
  } = options;

  // Per-call sessionId wins, else the request-scoped identify() context.
  // Session identity is NOT process-global — init() never sets it.
  const sessionId = sessionIdOption ?? currentSessionId();

  // Determine whether we are inside an existing active trace
  const currentSpan = getActiveNeatlogsSpan();
  const isInActiveTrace = currentSpan !== undefined && currentSpan.isRecording();
  const shouldCreateRootTrace = !!sessionId && !isInActiveTrace;

  // ---------------------------------------------------------------------------
  // Process prompt templates
  // ---------------------------------------------------------------------------

  let templateString: string | undefined;
  let isPromptTemplateObj = false;

  if (promptTemplate !== undefined) {
    if (promptTemplate instanceof PromptTemplate) {
      isPromptTemplateObj = true;
      const t = promptTemplate.template;
      templateString = typeof t === 'string' ? t : JSON.stringify(t);
      logger.debug(
        `[trace] Using PromptTemplate object with variables: ${promptTemplate.variables.join(', ')}`,
      );
    } else if (typeof promptTemplate === 'string') {
      templateString = promptTemplate;
    } else {
      const t = promptTemplate.template;
      templateString = typeof t === 'string' ? t : JSON.stringify(t);
    }
  }

  let userTemplateString: string | undefined;
  let isUserPromptTemplateObj = false;

  if (userPromptTemplate !== undefined) {
    if (userPromptTemplate instanceof UserPromptTemplate) {
      isUserPromptTemplateObj = true;
      const t = userPromptTemplate.template;
      userTemplateString = typeof t === 'string' ? t : JSON.stringify(t);
      logger.debug(
        `[trace] Using UserPromptTemplate object with variables: ${userPromptTemplate.variables.join(', ')}`,
      );
    } else if (typeof userPromptTemplate === 'string') {
      userTemplateString = userPromptTemplate;
    } else {
      const t = userPromptTemplate.template;
      userTemplateString = typeof t === 'string' ? t : JSON.stringify(t);
    }
  }

  // ---------------------------------------------------------------------------
  // Build OTel context with prompt values
  // ---------------------------------------------------------------------------

  // Start from the Neatlogs active context (private store in isolated mode), NOT
  // otelContext.active() — the latter is the foreign co-tenant's context, whose
  // active span must never become our parent. Prompt values threaded here then
  // propagate to descendant LLM spans through the private store.
  let ctx = getNeatlogsActiveContext();

  const variablesJson = promptVariables ? JSON.stringify(promptVariables) : undefined;
  const userVariablesJson = userPromptVariables ? JSON.stringify(userPromptVariables) : undefined;

  if (variablesJson) {
    ctx = ctx.setValue(PROMPT_VARIABLES_KEY, variablesJson);
    logger.debug(`[trace] Set neatlogs.prompt_variables in context: ${variablesJson}`);
  }
  if (templateString) {
    ctx = ctx.setValue(PROMPT_TEMPLATE_KEY, templateString);
    logger.debug(`[trace] Set neatlogs.prompt_template in context: ${templateString}`);
  }
  if (userVariablesJson) {
    ctx = ctx.setValue(USER_PROMPT_VARIABLES_KEY, userVariablesJson);
    logger.debug(`[trace] Set neatlogs.user_prompt_variables in context: ${userVariablesJson}`);
  }
  if (userTemplateString) {
    ctx = ctx.setValue(USER_PROMPT_TEMPLATE_KEY, userTemplateString);
    logger.debug(`[trace] Set neatlogs.user_prompt_template in context: ${userTemplateString}`);
  }
  if (version) {
    ctx = ctx.setValue(PROMPT_VERSION_KEY, version);
    logger.debug(`[trace] Set neatlogs.prompt_version in context: ${version}`);
  }

  // ---------------------------------------------------------------------------
  // Collect extra attributes (non-standard option keys)
  // ---------------------------------------------------------------------------

  const extraAttributes: Record<string, any> = { ...(explicitAttributes ?? {}) };
  for (const [key, value] of Object.entries(extraOptions)) {
    if (!KNOWN_OPTION_KEYS.has(key)) {
      extraAttributes[key] = value;
    }
  }

  // End-user belongs to the trace root only. This trace() call is a root when it
  // creates a new root trace, or when it isn't nested in an already-active trace.
  const isRootTrace = shouldCreateRootTrace || !isInActiveTrace;

  // ---------------------------------------------------------------------------
  // Create span and execute callback
  // ---------------------------------------------------------------------------

  const tracer = getNeatlogsTracer('neatlogs.trace');

  const spanCallback = async (span: Span): Promise<T> => {
    _setSpanAttributes(span, kind, extraAttributes);

    // Session/end-user belong to the trace root only; skipped on a non-root span.
    applySessionAttributes(span, sessionId, isRootTrace);
    applyEndUserAttributes(span, endUserId, endUserMetadata, isRootTrace);

    if (input !== undefined && input !== null) {
      span.setAttribute('input.value', safeJsonDumps(serializeObj(input)));
    }

    if (mask) {
      const maskId = registerMask(mask);
      span.setAttribute('neatlogs.mask_id', maskId);
    }

    try {
      const result: T = await fn(span);

      _finalizePromptCapture(span, isPromptTemplateObj, isUserPromptTemplateObj);

      if (result !== undefined && result !== null) {
        const spanAttrs = (span as any).attributes ?? (span as any)._attributes;
        const hasOutput = spanAttrs && (
          'output.value' in spanAttrs || 'neatlogs.output.value' in spanAttrs
        );
        if (!hasOutput) {
          span.setAttribute('output.value', safeJsonDumps(serializeObj(result)));
        }
      }

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      if (isPromptTemplateObj) {
        PromptContext.clear();
      }
      if (isUserPromptTemplateObj) {
        UserPromptContext.clear();
      }
      span.end();
    }
  };

  const parentContext = shouldCreateRootTrace
    ? ROOT_CONTEXT
    : getNeatlogsParentContext(ctx);
  // Seed the span kind at CREATION, not just in the callback: the span processor
  // classifies LLM spans in onStart() (which fires from startSpan, before the
  // callback runs). Without this, a trace({ kind: 'LLM', promptTemplate }) span
  // isn't recognized as LLM in time and its prompt-template attributes are dropped.
  const startAttributes = kind ? { 'openinference.span.kind': kind } : undefined;
  const span = tracer.startSpan(name, startAttributes ? { attributes: startAttributes } : {}, parentContext);

  if (shouldCreateRootTrace) {
    logger.debug(`[trace] Creating NEW root trace '${name}' (sessionId=${sessionId})`);
  } else {
    logger.debug(`[trace] Creating child span '${name}'`);
  }

  return withNeatlogsSpan(span, () => spanCallback(span), ctx);
}
