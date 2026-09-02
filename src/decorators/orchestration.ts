/**
 * High-level span() function wrapper and Span() class-method decorator.
 *
 * Primary public API for instrumenting user code.
 */

import { type Span as OtelSpan } from '@opentelemetry/api';
import { VALID_SPAN_KINDS } from '../span-kinds/mapping.js';
import { decorateSpan, safeJsonDumps, serializeObj, type DecorateSpanOptions } from './base.js';
import { getLogger } from '../core/logger.js';
import type { SpanOptions, SpanKind } from '../types.js';

const logger = getLogger();

/**
 * Wrap a function with OpenTelemetry span instrumentation.
 *
 * @example
 * ```typescript
 * const myWorkflow = span({ kind: 'WORKFLOW' }, async (query: string) => {
 *   return await process(query);
 * });
 * await myWorkflow('What is TypeScript?');
 * ```
 */
export function span<TArgs extends any[], TReturn>(
  options: SpanOptions,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn extends Promise<any> ? TReturn : Promise<Awaited<TReturn>> {
  // Validate kind
  if (!VALID_SPAN_KINDS.has(options.kind)) {
    throw new Error(
      `Invalid span kind: '${options.kind}'. Must be one of: ${[...VALID_SPAN_KINDS].join(', ')}`,
    );
  }

  const decorateOpts: DecorateSpanOptions = { ...options };

  // Kind-specific attribute setup
  switch (options.kind) {
    case 'AGENT':
      decorateOpts.postprocessResult = _agentPostprocessor(options);
      break;
    case 'TOOL':
      decorateOpts.postprocessResult = _toolPostprocessor(options);
      break;
    case 'EMBEDDING':
      decorateOpts.postprocessResult = _embeddingPostprocessor(options);
      break;
    case 'RETRIEVER':
      decorateOpts.postprocessResult = retrieverPostprocessor;
      break;
    case 'MCP_TOOL':
      return _createMcpToolWrapper(options, fn);
    default:
      break;
  }

  return decorateSpan(decorateOpts, fn);
}

/** Agent-specific: set role and goal attributes. */
function _agentPostprocessor(options: SpanOptions) {
  return (span: OtelSpan, _result: any, _boundInputs: Record<string, any>) => {
    if (options.role) {
      span.setAttribute('neatlogs.agent.role', options.role);
    }
    if (options.goal) {
      span.setAttribute('neatlogs.agent.goal', options.goal);
    }
  };
}

/** Tool-specific: set tool_name and parameters attributes. */
function _toolPostprocessor(options: SpanOptions) {
  return (span: OtelSpan, _result: any, _boundInputs: Record<string, any>) => {
    if (options.toolName) {
      span.setAttribute('tool.name', options.toolName);
    }
    if (options.parameters) {
      span.setAttribute('tool.parameters', safeJsonDumps(options.parameters));
    }
  };
}

/** Embedding-specific: set model and dimension attributes. */
function _embeddingPostprocessor(options: SpanOptions) {
  return (span: OtelSpan, _result: any, _boundInputs: Record<string, any>) => {
    if (options.model) {
      span.setAttribute('embedding.model_name', options.model);
    }
    if (options.dimension) {
      span.setAttribute('embedding.dimension', options.dimension);
    }
  };
}

/**
 * RETRIEVER postprocessor: extract documents from result.
 * Looks for query in 'query', 'question', 'text' keys.
 * Extracts documents from list results or dict with 'documents'/'docs'/'results' keys.
 * Sets retrieval.documents.N.document.* attributes (up to 20 docs).
 */
export function retrieverPostprocessor(
  span: OtelSpan,
  result: any,
  boundInputs: Record<string, any>,
): void {
  // Extract query
  for (const key of ['query', 'question', 'text']) {
    if (key in boundInputs && typeof boundInputs[key] === 'string') {
      span.setAttribute('retrieval.query', boundInputs[key]);
      break;
    }
  }

  // Extract documents
  let docs: any[] | null = null;

  if (Array.isArray(result)) {
    docs = result;
  } else if (result && typeof result === 'object') {
    for (const key of ['documents', 'docs', 'results']) {
      if (Array.isArray(result[key])) {
        docs = result[key];
        break;
      }
    }
  }

  if (!docs) return;

  // Set document attributes (up to 20)
  const maxDocs = Math.min(docs.length, 20);
  for (let i = 0; i < maxDocs; i++) {
    const doc = docs[i];
    const prefix = `retrieval.documents.${i}.document`;

    if (typeof doc === 'string') {
      span.setAttribute(`${prefix}.content`, doc);
    } else if (doc && typeof doc === 'object') {
      if (doc.content || doc.page_content || doc.text) {
        span.setAttribute(`${prefix}.content`, doc.content ?? doc.page_content ?? doc.text);
      }
      if (doc.id) {
        span.setAttribute(`${prefix}.id`, String(doc.id));
      }
      if (doc.score !== undefined) {
        span.setAttribute(`${prefix}.score`, doc.score);
      }
      if (doc.metadata) {
        span.setAttribute(`${prefix}.metadata`, safeJsonDumps(doc.metadata));
      }
    }
  }
}

/**
 * MCP_TOOL special handling.
 * Checks first arg for .toJSON() / plain object.
 * Wraps string results as { result: "..." }.
 * Sets both mcp.* and standard attributes.
 */
function _createMcpToolWrapper<TArgs extends any[], TReturn>(
  options: SpanOptions,
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => any {
  const decorateOpts: DecorateSpanOptions = {
    ...options,
    postprocessResult: (span: OtelSpan, result: any, boundInputs: Record<string, any>) => {
      // Set MCP-specific attributes
      if (options.toolName) {
        span.setAttribute('mcp.tool.name', options.toolName);
        span.setAttribute('tool.name', options.toolName);
      }
      if (options.parameters) {
        span.setAttribute('mcp.tool.parameters', safeJsonDumps(options.parameters));
        span.setAttribute('tool.parameters', safeJsonDumps(options.parameters));
      }
      if (options.toolJsonSchema) {
        span.setAttribute('tool.json_schema', safeJsonDumps(options.toolJsonSchema));
      }

      // Wrap string results
      if (typeof result === 'string') {
        span.setAttribute('output.value', safeJsonDumps({ result }));
      }

      // Extract input from first arg if it has toJSON or is a plain object
      if (boundInputs && Object.keys(boundInputs).length > 0) {
        const firstArg = Object.values(boundInputs)[0];
        if (firstArg && typeof firstArg === 'object') {
          const serialized = typeof firstArg.toJSON === 'function'
            ? firstArg.toJSON()
            : serializeObj(firstArg);
          span.setAttribute('mcp.tool.input', safeJsonDumps(serialized));
        }
      }
    },
  };

  return decorateSpan(decorateOpts, fn);
}

/**
 * TC39 Stage 3 class-method decorator variant.
 *
 * @example
 * ```typescript
 * class MyAgent {
 *   @Span({ kind: 'AGENT', role: 'researcher' })
 *   async run(query: string) { ... }
 * }
 * ```
 */
export function Span(options: SpanOptions) {
  return function <T extends (...args: any[]) => any>(
    target: T,
    context: ClassMethodDecoratorContext,
  ): T {
    // Validate eagerly at decoration-time (same behaviour as before this fix)
    // by building a temporary wrapper with a no-op target. span() will throw
    // here for invalid kinds before the class is instantiated.
    span(options, target);

    // TC39 stage-3 decorators replace the method on the prototype, so `this`
    // is the instance when the method is called normally (e.g. agent.run()).
    // `decorateSpan`'s closure calls `fn(...args)` without a receiver, which
    // loses `this` for instance methods that call other instance methods.
    // Wrap at the call site: bind `target` to the live `this` on every call
    // so that `fn(…args)` inside `decorateSpan` retains the correct receiver.
    function decoratorWrapper(this: unknown, ...args: Parameters<T>): ReturnType<T> {
      const boundTarget = target.bind(this) as T;
      const wrapped = span(options, boundTarget);
      return wrapped(...args) as ReturnType<T>;
    }
    Object.defineProperty(decoratorWrapper, 'name', { value: context.name, configurable: true });
    return decoratorWrapper as unknown as T;
  };
}
