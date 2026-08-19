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
export { Client, type ClientOptions } from './core/client.js';

// Instrumentation
export { span, Span } from './decorators/index.js';
export { trace, setTraceOutput } from './core/context.js';
export { log } from './core/log.js';

// Request-scoped session & end-user identity (per-request, not process-global).
export { identify, type IdentifyOptions } from './core/identity.js';
export {
  extractTraceContext,
  injectTraceContext,
  type TraceContextCarrier,
} from './core/propagation.js';

// Prompt management
export { PromptTemplate, UserPromptTemplate } from './prompt/template.js';
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

// Mastra integration
export { getMastraObservability } from './mastra.js';

// Vercel AI SDK integration
export { wrapAISDK, createAITelemetry } from './ai-sdk.js';

// Provider wrappers
export { wrapOpenAI, traceTool as traceToolOpenAI } from './openai.js';
export { wrapAnthropic, traceTool as traceToolAnthropic } from './anthropic.js';
export { wrapAzureOpenAI, traceTool as traceToolAzureOpenAI } from './azure-openai.js';
export { wrapVertexAI, wrapVertexAIChat, traceTool as traceToolVertexAI } from './vertex-ai.js';
export { wrapGoogleGenAI, wrapGoogleGenAIChat, traceTool as traceToolGoogleGenAI } from './google-genai.js';
export { wrapBedrock, traceTool as traceToolBedrock } from './bedrock.js';

// Agent framework integrations
export { langchainHandler } from './langchain.js';
export { strandsHooks } from './strands.js';
export { openaiAgentsProcessor } from './openai-agents.js';
export { wrapMastra } from './mastra-wrap.js';
export { piAgentHooks, tracePiAgentEvents, tracePiStream } from './pi-agent.js';
export { wrapClaudeAgentSDK } from './claude-agent-sdk.js';
export { wrapOpenRouterAgent, wrapCallModel } from './openrouter-agent.js';
export { NeatlogsOpencodePlugin } from './opencode-plugin.js';

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
