# neatlogs

OpenTelemetry-native observability for LLM applications — TypeScript SDK.

Automatically trace LLM calls, agent workflows, tool invocations, and retrieval pipelines. Ship production-ready observability with a few lines of code.

## Quick Start

```typescript
import { init, span, shutdown } from 'neatlogs';
import OpenAI from 'openai';

async function main() {
  // 1. Initialize the SDK
  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    instrumentations: ['openai'],
  });

  // 2. Create your LLM client AFTER init()
  const client = new OpenAI();

  // 3. Wrap functions with span() for observability
  const myWorkflow = span({ kind: 'WORKFLOW', name: 'qa-bot' }, async (query: string) => {
    const res = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: query }],
    });
    return res.choices[0].message.content;
  });

  const answer = await myWorkflow('What is TypeScript?');
  console.log(answer);

  await shutdown();
}

main().catch(console.error);
```

## Installation

```bash
npm install neatlogs
```

For auto-instrumentation of specific LLM providers, install the corresponding peer dependency:

```bash
# OpenAI
npm install @arizeai/openinference-instrumentation-openai

# Anthropic
npm install @arizeai/openinference-instrumentation-anthropic

# AWS Bedrock
npm install @arizeai/openinference-instrumentation-bedrock

# LangChain
npm install @arizeai/openinference-instrumentation-langchain

# MCP (Model Context Protocol)
npm install @arizeai/openinference-instrumentation-mcp

# BeeAI
npm install @arizeai/openinference-instrumentation-beeai

# Claude Agent SDK
npm install @arizeai/openinference-instrumentation-claude-agent-sdk

# Google GenAI (@google/genai)
npm install @google/genai
```

## Core Concepts

| Function | Purpose |
|----------|---------|
| `init()` | Initialize the SDK — sets up OTel providers, exporters, and instrumentation |
| `span()` | Wrap a function with observability — captures inputs, outputs, timing, and errors |
| `trace()` | Create a manual span with prompt template tracking and multi-turn session support |
| `log()` | Capture timestamped log steps within the active trace |
| `shutdown()` | Flush all pending data and shut down the SDK gracefully |

### Important: Initialization Order

`init()` is **async** and must be called **before** creating any LLM client instances. This is because instrumentation works by monkey-patching libraries at init time.

```typescript
// ✅ Correct
await init({ instrumentations: ['openai'] });
const client = new OpenAI(); // patched

// ❌ Wrong — client created before patching
const client = new OpenAI(); // NOT patched
await init({ instrumentations: ['openai'] });
```

### Important: No Top-Level Await

Always wrap your code in an `async function main()` pattern:

```typescript
async function main() {
  await init({ ... });
  // ... your code
  await shutdown();
}

main().catch(console.error);
```

## API Reference

### `init(options?)`

Initialize the Neatlogs SDK. Returns `Promise<void>`.

```typescript
await init({
  apiKey: process.env.NEATLOGS_API_KEY,
  instrumentations: ['openai', 'anthropic'],
  debug: true,
});
```

#### `InitOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `process.env.NEATLOGS_API_KEY` | Neatlogs API key. Export disabled if not set. |
| `baseUrl` | `string` | `'https://app.neatlogs.com'` | Base URL for the Neatlogs API. |
| `workflowName` | `string` | Derived from `process.argv[1]` | Name of the workflow being traced. |
| `sessionId` | `string` | — | Explicit session ID for grouping traces. |
| `autoSession` | `boolean` | `false` | Auto-generate a session ID if none provided. |
| `userId` | `string` | — | User identifier for the session. |
| `tags` | `string[]` | — | Tags attached to all spans. |
| `metadata` | `Record<string, any>` | — | Custom metadata attached to all spans. |
| `debug` | `boolean` | `false` | Enable debug logging. |
| `disableExport` | `boolean` | `false` | Disable export to Neatlogs backend. |
| `instrumentations` | `string[]` | — | Legacy manager path. Instrumentors that depend on global OTel context are rejected; use explicit wrappers below. |
| `tracerProvider` | `BasicTracerProvider` | Private SDK provider | Optional caller-owned private provider. It is never registered globally or shut down by Neatlogs. |
| `registerShutdownHandlers` | `boolean` | `true` for SDK-owned provider | Register process exit/signal handlers. Set `false` when the host application owns shutdown. |
| `mask` | `MaskFunction` | — | Global mask function applied to all spans. |
| `sampleRate` | `number` | `1.0` | Sampling rate (0.0 to 1.0). |
| `captureLogs` | `boolean` | `false` | Capture log records via OTel LoggerProvider. |
| `traceContent` | `boolean` | `true` | Capture input/output content on spans. |
| `pii` | `'redact' &#124; 'hash' &#124; false` | — | PII detection mode. |
| `endpoint` | `string` | `'https://ingest.neatlogs.com'` | Base ingest endpoint. The SDK sends traces to `/v1/traces` and logs to `/v1/logs`. |
| `batchSize` | `number` | `100` | Maximum spans per export batch. |
| `flushInterval` | `number` | `5` | Seconds between batch flushes. |
| `piiEnabled` | `boolean` | — | Override team-level PII redaction toggle. |
| `piiSpanTypes` | `string[]` | — | Override which span types have server-side PII redaction. |

---

### `span(options, fn)`

Wrap a function with OpenTelemetry span instrumentation. Returns a new function with the same signature that automatically creates a span when called.

```typescript
const myFn = span({ kind: 'WORKFLOW', name: 'my-workflow' }, async (input: string) => {
  return await process(input);
});

const result = await myFn('hello');
```

The `span()` function is a **higher-order function**: it takes your function and returns a new, instrumented version. The returned function has the same arguments and return type as the original.

#### `SpanOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kind` | `SpanKind` | — | **Required.** The kind of span. |
| `name` | `string` | Function name | Custom name for the span. |
| `captureInput` | `boolean` | `true` | Capture function input. |
| `captureOutput` | `boolean` | `true` | Capture function output. |
| `captureStdout` | `boolean` | `false` | Capture stdout during execution. |
| `tags` | `string[]` | — | Tags for this span. |
| `metadata` | `Record<string, any>` | — | Custom metadata for this span. |
| `mask` | `MaskFunction` | — | Per-span mask function. |
| `internal` | `boolean` | — | Mark span as internal (not user-facing). |
| `role` | `string` | — | Agent role (for `kind: 'AGENT'`). |
| `goal` | `string` | — | Agent goal (for `kind: 'AGENT'`). |
| `toolName` | `string` | — | Tool name (for `kind: 'TOOL'`). |
| `parameters` | `Record<string, any>` | — | Tool parameters schema (for `kind: 'TOOL'`). |
| `model` | `string` | — | Embedding model name (for `kind: 'EMBEDDING'`). |
| `dimension` | `number` | — | Embedding dimension (for `kind: 'EMBEDDING'`). |

#### `SpanKind` Values

| Kind | Use For |
|------|---------|
| `WORKFLOW` | Top-level orchestration / pipelines |
| `AGENT` | Autonomous agents with roles and goals |
| `CHAIN` | Sequential processing steps |
| `TOOL` | External tool calls (APIs, databases, etc.) |
| `RETRIEVER` | Document / vector retrieval |
| `EMBEDDING` | Vector embedding operations |
| `MCP_TOOL` | Model Context Protocol tool calls |
| `GUARDRAIL` | Safety checks and content filters |

---

### `Span()` Decorator

TC39 Stage 3 class-method decorator for instrumenting class methods.

```typescript
class MyAgent {
  @Span({ kind: 'AGENT', role: 'researcher' })
  async run(query: string) {
    // automatically traced
    return await this.search(query);
  }

  @Span({ kind: 'TOOL', name: 'web-search' })
  async search(query: string) {
    return { results: ['...'] };
  }
}
```

> **Note:** Requires TypeScript 5.0+ with `"experimentalDecorators": false` (the new TC39 Stage 3 decorators, not legacy decorators).

---

### `trace(options, fn)`

Create a manual span that runs a callback. Unlike `span()`, which wraps a reusable function, `trace()` executes inline and is ideal for:

- **Prompt template tracking** — associate `PromptTemplate` instances with spans
- **Multi-turn sessions** — automatically creates root traces when `sessionId` is set
- **Grouping operations** — wrap a block of code in an ad-hoc span

```typescript
const result = await trace({
  name: 'llm-call',
  promptTemplate: myTemplate,
}, async (activeSpan) => {
  const rendered = myTemplate.compile({ name: 'world' });
  return await callLLM(rendered);
});
```

#### `TraceOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | — | **Required.** Name for the trace span. |
| `kind` | `SpanKind` | `'CHAIN'` | Span kind. |
| `sessionId` | `string` | — | Session ID for grouping this root trace. |
| `parentSessionId` | `string` | — | Immediate parent session ID. |
| `sessionFeatureName` | `string` | — | Product feature that initiated the session request. |
| `sessionEntryPoint` | `string` | — | Application entry point that initiated the session request. |
| `promptTemplate` | `string &#124; PromptTemplate` | — | Prompt template to track. |
| `promptVariables` | `Record<string, any>` | — | Prompt variables for the template. |
| `userPromptTemplate` | `string &#124; UserPromptTemplate` | — | User prompt template. |
| `userPromptVariables` | `Record<string, any>` | — | User prompt variables. |
| `version` | `string` | — | Prompt version identifier. |
| `captureStdout` | `boolean` | `false` | Capture stdout during execution. |
| `mask` | `MaskFunction` | — | Per-trace mask function. |
| `attributes` | `Record<string, any>` | — | Custom attributes on the span. |
| `tags` | `string[]` | — | Tags for this trace. |
| `metadata` | `Record<string, any>` | — | Custom metadata. |

#### `span()` vs `trace()`

| | `span()` | `trace()` |
|---|----------|-----------|
| Pattern | Higher-order function wrapper | Inline callback |
| Reuse | Returns a reusable function | Executes immediately |
| Prompt tracking | No | Yes — `promptTemplate`, `promptVariables` |
| Session-aware | No | Yes — creates root traces for multi-turn sessions |
| Best for | Wrapping functions/methods | Ad-hoc tracing blocks, prompt versioning |

---

### `log(template, options?)`

Capture a timestamped log step within the current trace. Uses `{key}` placeholders for template variables.

```typescript
log('Processing query: {query}', { query: 'What is TypeScript?' });
log('Retrieved {count} documents in {ms}ms', { count: 5, ms: 120 });
log('Classification result', { category: 'technical', level: 'debug' });
```

Requires `captureLogs: true` in `init()`. Log records are emitted as OTel `LogRecord`s associated with the active span and exported to the OTLP logs endpoint at `/v1/logs`.

The special `level` key sets the log severity (`'info'`, `'debug'`, `'warn'`, `'error'`). All other keys are template variables and are also recorded as `log.{key}` attributes.

---

### `PromptTemplate` / `UserPromptTemplate`

Template classes for prompt versioning with `{{variable}}` placeholders. When used with `trace()`, variables are automatically captured on the span for prompt tracking.

```typescript
// String template
const systemPrompt = new PromptTemplate(
  'You are a {{role}} assistant specializing in {{topic}}.'
);

// Message array template
const chatPrompt = new PromptTemplate([
  { role: 'system', content: 'You are a {{role}} assistant.' },
  { role: 'user', content: '{{question}}' },
]);

// Compile with variables
const rendered = systemPrompt.compile({ role: 'helpful', topic: 'TypeScript' });
// => 'You are a helpful assistant specializing in TypeScript.'

// Access template metadata
systemPrompt.variables;  // ['role', 'topic']
systemPrompt.template;   // raw template string
```

`UserPromptTemplate` is identical but stores context separately — use it for the user/human turn in multi-template setups:

```typescript
const systemTpl = new PromptTemplate('You are a {{role}} assistant.');
const userTpl = new UserPromptTemplate('{{question}}');

await trace({
  name: 'qa',
  promptTemplate: systemTpl,
  userPromptTemplate: userTpl,
}, async () => {
  const system = systemTpl.compile({ role: 'helpful' });
  const user = userTpl.compile({ question: 'What is TypeScript?' });
  // Variables from both templates are captured on the span
});
```

---

### `PromptClient`

Server-side prompt management for storing, versioning, and retrieving prompts from the Neatlogs backend.

```typescript
import { PromptClient } from 'neatlogs';

const client = new PromptClient({
  baseUrl: 'https://app.neatlogs.com',
  apiKey: process.env.NEATLOGS_API_KEY!,
});

// Create a prompt
const prompt = await client.createPrompt({
  name: 'qa-system',
  content: 'You are a {{role}} assistant for {{company}}.',
  labels: ['production'],
});

// Fetch by name (returns latest version)
const handle = await client.getPrompt('qa-system');

// Fetch by label or version
const prod = await client.getPrompt('qa-system', { label: 'production' });
const v2 = await client.getPrompt('qa-system', { version: 2 });

// Compile with variables
const rendered = handle.compile({ role: 'helpful', company: 'Acme' });

// Compile as message array
const messages = handle.compileMessages({ role: 'helpful', company: 'Acme' });

// List all prompts
const all = await client.listPrompts();

// Update prompt content
await client.updatePrompt('qa-system', { content: 'Updated: {{role}} for {{company}}.' });

// Save a new version
await client.saveAsVersion('qa-system', { label: 'v2' });

// Delete a prompt
await client.deletePrompt('qa-system');
```

Module-level convenience functions are also available after `init()`:

```typescript
import { init, getPrompt, fetchPrompt, listPrompts, createPrompt, updatePrompt, saveAsVersion, deletePrompt, removeTag } from 'neatlogs';

await init({ apiKey: process.env.NEATLOGS_API_KEY });

const handle = await getPrompt('my-prompt');
const rendered = handle.compile({ name: 'world' });
```

---

### `flush()` / `shutdown()`

```typescript
// Flush pending spans without shutting down
await flush();

// Flush and shut down — call before process exit
await shutdown();
```

`shutdown()` resets all SDK state so `init()` can be called again if needed.

---

### `bindTemplates(llm, systemTpl, userTpl?, compiledVars?)`

Bind prompt templates to a LangChain-compatible LLM so templates are automatically captured on LLM spans managed by frameworks like CrewAI.

```typescript
import { bindTemplates, PromptTemplate, UserPromptTemplate } from 'neatlogs';

const systemTpl = new PromptTemplate('You are a {{role}} assistant.');
const userTpl = new UserPromptTemplate('Research: {{topic}}');

const boundLlm = bindTemplates(llm, systemTpl, userTpl, { topic: 'AI safety' });
// Pass boundLlm to your framework — template context is injected on every invoke()
```

---

### `registerCrewaiTask(taskId, taskDescription)`

Register a CrewAI task for automatic span annotation.

```typescript
import { registerCrewaiTask } from 'neatlogs';

registerCrewaiTask('research-task', 'Research the latest AI developments');
```

## Supported Instrumentations

### Isolation policy

Neatlogs always runs on a private provider and private async context. Third-party
auto-instrumentors that call the global OpenTelemetry context API cannot provide
bidirectional isolation, so the manager rejects them at initialization before
creating any provider state. Use the explicit provider/framework wrappers
instead.

### Registry Entries (not yet instrumented in TypeScript)

The following libraries are registered in the instrumentation registry for future support. Passing them to `instrumentations` will log a debug message and skip gracefully:

`cohere`, `groq`, `together`, `vertexai`, `google_generativeai`, `mistralai`, `ollama`, `watsonx`, `alephalpha`, `replicate`, `sagemaker`, `huggingface_hub`, `litellm`, `langgraph`, `llamaindex`, `autogen`, `haystack`, `dspy`, `chromadb`, `pinecone`, `weaviate`, `qdrant`, `milvus`, `opensearch`, `elasticsearch`, `redis`, `marqo`, `instructor`, `guardrails`, `google_adk`, `agno`, `openai_agents`, `pydantic_ai`, `smolagents`, `strands`, `pipecat`, `portkey`, `promptflow`

## Framework Integrations

For frameworks that don't fit the auto-instrument-on-init pattern, use the SDK's explicit wrappers. These wrappers use Neatlogs' private context and remain isolated from other tracing SDKs:

| Framework | Helper |
|-----------|--------|
| Mastra (`@mastra/core`) | `wrapMastra()` from `neatlogs/mastra` |
| Vercel AI SDK (`ai`) | `wrapAISDK()` from `neatlogs/ai` |

```typescript
// Vercel AI SDK
import { init, shutdown } from 'neatlogs';
import { wrapAISDK } from 'neatlogs/ai';
import * as ai from 'ai';
import { openai } from '@ai-sdk/openai';

await init({ apiKey: process.env.NEATLOGS_API_KEY });
const { generateText } = wrapAISDK(ai);

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'What is TypeScript?',
});

await shutdown();
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEATLOGS_API_KEY` | API key (fallback when `apiKey` option is not provided) |
| `NEATLOGS_DISABLE_EXPORT` | Set to `true`, `1`, or `yes` to disable export |

### Programmatic Configuration

All configuration is passed via `init()` options. See the [InitOptions table](#initoptions) above.

```typescript
await init({
  apiKey: process.env.NEATLOGS_API_KEY,
  workflowName: 'my-pipeline',
  sessionId: 'session-123',
  userId: 'user-456',
  tags: ['production', 'v2'],
  metadata: { environment: 'prod' },
  instrumentations: ['openai', 'anthropic'],
  sampleRate: 0.5,
  captureLogs: true,
  debug: true,
});
```

## PII Masking

### Global Mask

Apply a mask function to all spans:

```typescript
await init({
  apiKey: process.env.NEATLOGS_API_KEY,
  mask: (spanData) => {
    // Redact email addresses
    for (const [key, value] of Object.entries(spanData)) {
      if (typeof value === 'string') {
        spanData[key] = value.replace(/[\w.-]+@[\w.-]+/g, '[REDACTED]');
      }
    }
    return spanData;
  },
});
```

### Per-Span Mask

Apply a mask to a specific span:

```typescript
const sensitive = span({
  kind: 'TOOL',
  name: 'user-lookup',
  mask: (spanData) => {
    delete spanData['input.value'];
    return spanData;
  },
}, async (userId: string) => {
  return await lookupUser(userId);
});
```

### Per-Trace Mask

```typescript
await trace({
  name: 'sensitive-operation',
  mask: (spanData) => {
    // Return null to drop the span entirely
    return null;
  },
}, async () => {
  // This span will not be exported
});
```

### Server-Side PII Redaction

```typescript
await init({
  apiKey: process.env.NEATLOGS_API_KEY,
  pii: 'redact',          // or 'hash' or false
  piiEnabled: true,        // override team-level toggle
  piiSpanTypes: ['LLM'],   // only redact LLM spans
});
```

## Examples

See the [`examples/`](./examples/) directory for complete, runnable examples:

| File | Description |
|------|-------------|
| [`basic-openai.ts`](./examples/basic-openai.ts) | Basic OpenAI usage with auto-instrumentation |
| [`prompt-management.ts`](./examples/prompt-management.ts) | PromptTemplate + trace() for prompt versioning |
| [`multi-agent-workflow.ts`](./examples/multi-agent-workflow.ts) | Nested spans: WORKFLOW → AGENT → TOOL |
| [`custom-spans.ts`](./examples/custom-spans.ts) | All span kinds: WORKFLOW, CHAIN, AGENT, TOOL, RETRIEVER, EMBEDDING, GUARDRAIL |
| [`sdk_examples/ai_sdk_basic/`](./examples/sdk_examples/ai_sdk_basic/) | Vercel AI SDK via `wrapAISDK` — generateText + streamText + tools |

Run any example with:

```bash
NEATLOGS_API_KEY=your-key npx tsx examples/basic-openai.ts
```

## License

MIT
