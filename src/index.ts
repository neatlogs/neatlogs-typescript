/**
 * Neatlogs TypeScript SDK
 *
 * OpenTelemetry-native observability for LLM applications.
 *
 * @example
 * ```typescript
 * import { init, span, shutdown } from 'neatlogs';
 *
 * async function main() {
 *   await init({ apiKey: process.env.NEATLOGS_API_KEY, instrumentations: ['openai'] });
 *
 *   const myWorkflow = span({ kind: 'WORKFLOW' }, async (query: string) => {
 *     // your LLM code here
 *   });
 *
 *   await myWorkflow('Hello!');
 *   await shutdown();
 * }
 * main().catch(console.error);
 * ```
 */

// Lifecycle
export { init, flush, shutdown, isDebugEnabled, getSessionConfig } from './init.js';

// Instrumentation
export { span, Span } from './decorators/index.js';
export { trace } from './core/context.js';
export { log } from './core/log.js';

// Prompt management
export { SystemPromptTemplate, PromptTemplate, UserPromptTemplate } from './prompt/template.js';
export {
  PromptClient,
  PromptHandle,
  PromptClientError,
  PromptApiError,
  PromptNotFoundError,
  getPrompt,
  fetchPrompt,
  listPrompts,
  createPrompt,
  updatePrompt,
  saveAsVersion,
  deletePrompt,
  removeTag,
} from './prompt/client.js';

// Utilities
export { bindTemplates } from './core/llm-binder.js';
export { registerCrewaiTask } from './core/crewai-task-registry.js';

// Types
export type {
  InitOptions,
  SpanOptions,
  TraceOptions,
  SpanKind,
  MaskFunction,
  CachedPrompt,
  PromptMessage,
} from './types.js';

// Version
export { __version__ } from './version.js';
