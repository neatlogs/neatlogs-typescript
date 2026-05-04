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

import { getLogger } from './logger.js';
import type { TraceOptions, MaskFunction } from '../types.js';

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

/**
 * Serialize a template (string or message array) to a meaningful string
 * representation for OTel context and span attributes.
 *
 * For message arrays, produces a JSON string of the role/content pairs
 * instead of the useless `[object Object]` that `String()` would produce.
 */
function _serializeTemplate(template: string | { role: string; content: string }[]): string {
  if (typeof template === 'string') return template;
  if (Array.isArray(template)) {
    return JSON.stringify(template.map((m) => ({ role: m.role, content: m.content })));
  }
  return String(template);
}

const KNOWN_OPTION_KEYS = new Set([
  'name',
  'kind',
  'promptTemplate',
  'promptVariables',
  'userPromptTemplate',
  'userPromptVariables',
  'version',
  'mask',
  'attributes',
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
// Main trace() function
// ---------------------------------------------------------------------------

/**
 * Async callback wrapper for manual span creation with prompt tracking.
 *
 * Creates an OTel span, optionally sets prompt template/variable context,
 * and executes the provided callback within the span.
 *
 * **Session-Aware Trace Creation:**
 * - If `session_id` is set in init() AND no active parent span exists,
 *   this creates a NEW root trace (for multi-turn conversations).
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
    promptTemplate,
    promptVariables,
    userPromptTemplate,
    userPromptVariables,
    version,
    mask,
    attributes: explicitAttributes,
    ...extraOptions
  } = options;

  const sessionConfig = getSessionConfig();
  const sessionId = sessionConfig.sessionId;

  // Determine whether we are inside an existing active trace
  const currentSpan = otelTrace.getSpan(otelContext.active());
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
      templateString = _serializeTemplate(promptTemplate.template);
      logger.debug(
        `[trace] Using PromptTemplate object with variables: ${promptTemplate.variables.join(', ')}`,
      );
    } else if (typeof promptTemplate === 'string') {
      templateString = promptTemplate;
    } else {
      // Object matching the structural type (duck typing)
      templateString = _serializeTemplate(promptTemplate.template);
    }
  }

  let userTemplateString: string | undefined;
  let isUserPromptTemplateObj = false;

  if (userPromptTemplate !== undefined) {
    if (userPromptTemplate instanceof UserPromptTemplate) {
      isUserPromptTemplateObj = true;
      userTemplateString = _serializeTemplate(userPromptTemplate.template);
      logger.debug(
        `[trace] Using UserPromptTemplate object with variables: ${userPromptTemplate.variables.join(', ')}`,
      );
    } else if (typeof userPromptTemplate === 'string') {
      userTemplateString = userPromptTemplate;
    } else {
      userTemplateString = _serializeTemplate(userPromptTemplate.template);
    }
  }

  // ---------------------------------------------------------------------------
  // Build OTel context with prompt values
  // ---------------------------------------------------------------------------

  let ctx = otelContext.active();

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

  // ---------------------------------------------------------------------------
  // Create span and execute callback
  // ---------------------------------------------------------------------------

  const tracer = otelTrace.getTracer('neatlogs.trace');

  const spanCallback = async (span: Span): Promise<T> => {
    _setSpanAttributes(span, kind, extraAttributes);

    if (mask) {
      const maskId = registerMask(mask);
      span.setAttribute('neatlogs.mask_id', maskId);
    }

    try {
      const result: T = await fn(span);

      _finalizePromptCapture(span, isPromptTemplateObj, isUserPromptTemplateObj);

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

  if (shouldCreateRootTrace) {
    // Apply prompt context values onto ROOT_CONTEXT so they are not lost
    // when creating a new root trace in session-aware mode.
    let rootCtx = ROOT_CONTEXT as import('@opentelemetry/api').Context;
    if (variablesJson) rootCtx = rootCtx.setValue(PROMPT_VARIABLES_KEY, variablesJson);
    if (templateString) rootCtx = rootCtx.setValue(PROMPT_TEMPLATE_KEY, templateString);
    if (userVariablesJson) rootCtx = rootCtx.setValue(USER_PROMPT_VARIABLES_KEY, userVariablesJson);
    if (userTemplateString) rootCtx = rootCtx.setValue(USER_PROMPT_TEMPLATE_KEY, userTemplateString);
    if (version) rootCtx = rootCtx.setValue(PROMPT_VERSION_KEY, version);

    logger.debug(`[trace] Creating NEW root trace '${name}' (sessionId=${sessionId})`);
    return tracer.startActiveSpan(name, {}, rootCtx, spanCallback);
  } else {
    logger.debug(`[trace] Creating child span '${name}'`);
    return tracer.startActiveSpan(name, {}, ctx, spanCallback);
  }
}
