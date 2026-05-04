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
| `instrumentations` | `string[]` | — | Libraries to auto-instrument (e.g., `['openai']`). |
| `mask` | `MaskFunction` | — | Global mask function applied to all spans. |
| `sampleRate` | `number` | `1.0` | Sampling rate (0.0 to 1.0). |
| `captureLogs` | `boolean` | `false` | Capture log records via OTel LoggerProvider. |
| `traceContent` | `boolean` | `true` | Capture input/output content on spans. |
| `pii` | `'redact' &#124; 'hash' &#124; false` | — | PII detection mode. |
| `endpoint` | `string` | `'https://staging-cloud.neatlogs.com/api/data/v4/batch'` | Backend endpoint URL. |
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

Requires `captureLogs: true` in `init()`. Log records are emitted as OTel `LogRecord`s associated with the active span.

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

### Auto-Instrumented (via OpenInference)

These libraries are automatically instrumented when listed in `instrumentations`:

| Library | Package | Instrumentation |
|---------|---------|-----------------|
| `openai` | `openai` | `@arizeai/openinference-instrumentation-openai` |
| `anthropic` | `@anthropic-ai/sdk` | `@arizeai/openinference-instrumentation-anthropic` |
| `bedrock` | `@aws-sdk/client-bedrock-runtime` | `@arizeai/openinference-instrumentation-bedrock` |
| `langchain` | `@langchain/core` | `@arizeai/openinference-instrumentation-langchain` |
| `mcp` | `@modelcontextprotocol/sdk` | `@arizeai/openinference-instrumentation-mcp` |
| `beeai` | `beeai-framework` | `@arizeai/openinference-instrumentation-beeai` |
| `claude_agent_sdk` | `@anthropic-ai/claude-agent-sdk` | `@arizeai/openinference-instrumentation-claude-agent-sdk` |

### Custom Instrumentors (built into neatlogs)

| Library | Package | Notes |
|---------|---------|-------|
| `google_genai` | `@google/genai` | Custom neatlogs instrumentor |
| `crewai` | `crewai` | Custom neatlogs instrumentor; auto-loads `litellm` |

### Registry Entries (not yet instrumented in TypeScript)

The following libraries are registered in the instrumentation registry for future support. Passing them to `instrumentations` will log a debug message and skip gracefully:

`cohere`, `groq`, `together`, `vertexai`, `google_generativeai`, `mistralai`, `ollama`, `watsonx`, `alephalpha`, `replicate`, `sagemaker`, `huggingface_hub`, `litellm`, `langgraph`, `llamaindex`, `autogen`, `haystack`, `dspy`, `chromadb`, `pinecone`, `weaviate`, `qdrant`, `milvus`, `opensearch`, `elasticsearch`, `redis`, `marqo`, `instructor`, `guardrails`, `google_adk`, `agno`, `openai_agents`, `pydantic_ai`, `smolagents`, `strands`, `pipecat`, `portkey`, `promptflow`

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

See the [`examples/`](./examples/) directory for complete, runnable examples.

### Quick Examples

| File | Description |
|------|-------------|
| [`basic-openai.ts`](./examples/basic-openai.ts) | Basic OpenAI usage with auto-instrumentation |
| [`prompt-management.ts`](./examples/prompt-management.ts) | PromptTemplate + trace() for prompt versioning |
| [`multi-agent-workflow.ts`](./examples/multi-agent-workflow.ts) | Nested spans: WORKFLOW → AGENT → TOOL |
| [`custom-spans.ts`](./examples/custom-spans.ts) | All span kinds: WORKFLOW, CHAIN, AGENT, TOOL, RETRIEVER, EMBEDDING, GUARDRAIL |

Run any quick example with:

```bash
NEATLOGS_API_KEY=your-key npx tsx examples/basic-openai.ts
```

### Original 7 Examples (Multi-Provider Conversion Suite)

These seven examples are the required conversion scope for the TypeScript SDK. Each demonstrates a different provider, framework, or topology while producing deterministic JSONL span logs for automated verification.

| Example | Provider / Framework | Topology |
|---------|---------------------|----------|
| [`openai_multiagent`](./examples/openai_multiagent/) | Azure OpenAI | planner → researcher → analyst → reporter + web_search tool |
| [`anthropic_multiagent`](./examples/anthropic_multiagent/) | Anthropic Bedrock | reviewer → fixer → tester → documenter + check_syntax tool |
| [`google_genai_multiagent`](./examples/google_genai_multiagent/) | Google GenAI (Gemini) | ideation → writer → editor → finalizer + web_search tool |
| [`langchain_react`](./examples/langchain_react/) | LangChain + Azure OpenAI | ReAct agent loop + knowledge_base, web, arxiv, calculator tools |
| [`langgraph_multiagent`](./examples/langgraph_multiagent/) | LangGraph + Azure OpenAI | supervisor → researchers → synthesizer → report writer |
| [`marketing_strategy_demo`](./examples/marketing_strategy_demo/) | Azure OpenAI + Google GenAI | analyst → strategist → creator (sequential pipeline, CrewAI-style) |
| [`reasoning_model_workflow`](./examples/reasoning_model_workflow/) | Multi-provider | 5 reasoning agents: Azure o4-mini, GPT-4o, Anthropic thinking, LangChain, Gemini |

#### Environment Setup

1. Copy `.env.example` to `.env` and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

2. Required environment variables (do **not** commit secrets):

   | Variable | Used By |
   |----------|---------|
   | `NEATLOGS_API_KEY` | All examples |
   | `NEATLOGS_ENDPOINT` | All examples (default: `http://localhost:4100`) |
   | `AZURE_OPENAI_API_KEY` | OpenAI, LangChain, LangGraph, Marketing, Reasoning |
   | `AZURE_OPENAI_ENDPOINT` | OpenAI, LangChain, LangGraph, Marketing, Reasoning |
   | `AZURE_LLM_DEPLOYMENT` | OpenAI, LangChain, LangGraph, Marketing |
   | `AZURE_REASONING_DEPLOYMENT` | Reasoning |
   | `AZURE_OPENAI_DEPLOYMENT_NAME` | Fallback for `AZURE_LLM_DEPLOYMENT` |
   | `AZURE_OPENAI_API_VERSION` | Azure OpenAI examples (default: `2025-04-01-preview`) |
   | `GOOGLE_API_KEY` | Google GenAI, Marketing (research tools), Reasoning |
   | `AWS_ACCESS_KEY_ID` | Anthropic Bedrock, Reasoning |
   | `AWS_SECRET_ACCESS_KEY` | Anthropic Bedrock, Reasoning |
   | `AWS_REGION` | Anthropic Bedrock (default: `us-west-1`) |

> **Shell env overrides `.env`:** Variables set in your shell always take
> precedence over values in `.env` (standard `dotenv` behavior). For a
> fully deterministic run with no inherited shell state, use:
>
> ```bash
> env -i HOME="$HOME" PATH="$PATH" \
>   NEATLOGS_API_KEY=... AZURE_OPENAI_API_KEY=... \
>   npx tsx examples/openai_multiagent/main.ts "Tesla"
> ```

#### Running Individual Examples

```bash
# Each example has an npm script alias:
npm run example:openai -- "Tesla"
npm run example:anthropic
npm run example:google
npm run example:langchain
npm run example:langgraph
npm run example:marketing
npm run example:reasoning

# Or run directly with tsx:
npx tsx examples/openai_multiagent/main.ts "Tesla"

# Marketing demo has a mock mode for fast runs without API calls:
MARKETING_MOCK_MODE=true npm run example:marketing
```

#### Running All 7 Examples (Harness)

The run harness executes all seven examples sequentially, captures terminal logs, and prints a pass/fail summary:

```bash
npm run test:examples:original7

# Or directly:
node scripts/run-original7-examples.mjs

# Run only specific examples:
node scripts/run-original7-examples.mjs --only openai_multiagent --only anthropic_multiagent

# Custom timeout (default: 120s per example):
node scripts/run-original7-examples.mjs --timeout 180000
```

To make a run easy to identify in the NeatLogs UI, set `NEATLOGS_WORKFLOW_PREFIX`. The original-seven examples prepend this value to both the SDK `workflowName` and the root WORKFLOW span name:

```bash
NEATLOGS_WORKFLOW_PREFIX="typescript-original7-$(date +%Y%m%d)-" node scripts/run-original7-examples.mjs --timeout 300000
```

Use the same prefix when verifying that run's logs:

```bash
NEATLOGS_WORKFLOW_PREFIX="typescript-original7-$(date +%Y%m%d)-" node scripts/verify-original7-logs.mjs
```

Terminal logs are saved to `logs/<example>_terminal.log`. Raw and processed JSONL span logs are saved by each example to:

```
logs/<example>_raw_spans.jsonl
logs/<example>_processed_spans.jsonl
```

#### Verifying Logs

After running examples, verify the JSONL span logs:

```bash
node scripts/verify-original7-logs.mjs

# Verify specific examples:
node scripts/verify-original7-logs.mjs --only openai_multiagent

# Show help:
node scripts/verify-original7-logs.mjs --help
```

The verifier checks:
- Root WORKFLOW span exists with the expected name
- Expected agent/tool/chain span names are present
- Trace IDs are present and consistent
- Minimum span counts are met
- Critical neatlogs attributes (`neatlogs.span.kind`, etc.) are present

## License

MIT
