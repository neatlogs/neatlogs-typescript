# Framework Integrations — NeatLogs TypeScript SDK Reference

Framework-specific integration patterns for the NeatLogs TypeScript SDK. Covers auto-instrumentation setup, init ordering, and representative code examples for each supported LLM provider and agent framework.

---

## 1. Integration Approaches (Decision Tree)

### 1a. Pure Auto-Instrumentation

For applications that call LLM providers directly. Add the provider to `instrumentations`. No manual wrapping needed for LLM calls.

```typescript
import { init } from 'neatlogs';
await init({ instrumentations: ['openai'] });
```

### 1b. Auto-Instrumentation + `span()` Wrappers

For custom multi-agent orchestration. Add providers to `instrumentations` for LLM call tracing, then use `span()` on your orchestration functions.

```typescript
import { init, span } from 'neatlogs';

await init({ instrumentations: ['openai', 'anthropic'] });

const pipeline = span({ kind: 'WORKFLOW' }, async (query: string) => {
  const resultA = await agentA(query);
  const resultB = await agentB(resultA);
  return resultB;
});
```

### 1c. Auto-Instrumentation + `trace()` + `PromptTemplate`

For tracking prompt templates and variables in the dashboard. Wrap LLM calls in `trace()` and pass `PromptTemplate` instances.

```typescript
import { init, trace, PromptTemplate, UserPromptTemplate } from 'neatlogs';

await init({ instrumentations: ['openai'] });

const sysTpl = new PromptTemplate('You are a {{role}} assistant.');
const userTpl = new UserPromptTemplate('{{query}}');

await trace(
  { name: 'llm_call', kind: 'LLM', promptTemplate: sysTpl, userPromptTemplate: userTpl },
  async () => {
    const sysMsg = sysTpl.compile({ role: 'research' }) as string;
    const userMsg = userTpl.compile({ query }) as string;
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: sysMsg },
        { role: 'user', content: userMsg },
      ],
    });
    return response.choices[0].message.content;
  },
);
```

---

## 2. OpenAI

- **Instrumentation key**: `instrumentations: ['openai']`
- **Package**: `@arizeai/openinference-instrumentation-openai`
- **Import order critical**: `await init()` BEFORE `import('openai')`
- **Supports**: Sync, async, streaming

```typescript
import { init, span, trace, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'my-app',
  instrumentations: ['openai'],
});

const { OpenAI } = await import('openai');
const client = new OpenAI();

const sysTpl = new PromptTemplate('You are a helpful assistant specializing in {{domain}}.');
const userTpl = new UserPromptTemplate('Question: {{query}}');

const run = span({ kind: 'WORKFLOW' }, async (query: string) => {
  return await trace(
    { name: 'llm_call', kind: 'LLM', promptTemplate: sysTpl, userPromptTemplate: userTpl },
    async () => {
      const sysMsg = sysTpl.compile({ domain: 'science' }) as string;
      const userMsg = userTpl.compile({ query }) as string;
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: sysMsg },
          { role: 'user', content: userMsg },
        ],
      });
      return response.choices[0].message.content;
    },
  );
});

await run('Explain quantum computing');
await flush();
await shutdown();
```

---

## 3. Anthropic

- **Instrumentation key**: `instrumentations: ['anthropic']`
- **Package**: `@arizeai/openinference-instrumentation-anthropic`
- **Supports**: Extended thinking, streaming, tool use

```typescript
import { init, span, trace, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'anthropic-app',
  instrumentations: ['anthropic'],
});

const { Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic();

const sysTpl = new PromptTemplate('You are a market analysis expert for {{industry}}.');
const userTpl = new UserPromptTemplate('Analyze: {{query}}');

const analyst = span(
  { kind: 'AGENT', name: 'analyst' },
  async (query: string) => {
    return await trace(
      { name: 'llm_call', kind: 'LLM', promptTemplate: sysTpl, userPromptTemplate: userTpl },
      async () => {
        const sysStr = sysTpl.compile({ industry: 'technology' }) as string;
        const userStr = userTpl.compile({ query }) as string;
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: sysStr,
          messages: [{ role: 'user', content: userStr }],
        });
        return response.content[0].text;
      },
    );
  },
);

await analyst('Analyze market trends');
await flush();
await shutdown();
```

---

## 4. LangChain

- **Instrumentation key**: `instrumentations: ['langchain']`
- **Package**: `@arizeai/openinference-instrumentation-langchain`
- **Auto-instruments**: LLM calls, chains, agents, tools, retrievers

```typescript
import { init, span, flush, shutdown } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'langchain-app',
  instrumentations: ['langchain'],
});

const { ChatOpenAI } = await import('@langchain/openai');
const llm = new ChatOpenAI({ model: 'gpt-4o' });

const runAgent = span({ kind: 'WORKFLOW' }, async (query: string) => {
  const response = await llm.invoke(query);
  return response.content;
});

await runAgent('Explain black holes');
await flush();
await shutdown();
```

---

## 5. AWS Bedrock

- **Instrumentation key**: `instrumentations: ['bedrock']`
- **Package**: `@arizeai/openinference-instrumentation-bedrock`

```typescript
import { init, span, flush, shutdown } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'bedrock-app',
  instrumentations: ['bedrock'],
});

const run = span({ kind: 'WORKFLOW' }, async (prompt: string) => {
  // Bedrock calls are auto-instrumented
  const response = await bedrockClient.invokeModel({ /* ... */ });
  return response;
});

await run('Hello');
await flush();
await shutdown();
```

---

## 6. MCP (Model Context Protocol)

- **Instrumentation key**: `instrumentations: ['mcp']`
- **Package**: `@arizeai/openinference-instrumentation-mcp`

```typescript
import { init, span, flush, shutdown } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'mcp-app',
  instrumentations: ['mcp'],
});

// MCP tool spans are auto-instrumented
// For custom MCP tools, use span() with kind: 'MCP_TOOL':
const getWeather = span(
  { kind: 'MCP_TOOL', toolName: 'get_weather', toolJsonSchema: { type: 'object', properties: { location: { type: 'string' } } } },
  async (location: string) => {
    return `Weather in ${location}: Sunny, 72°F`;
  },
);
```

---

## 7. Claude Agent SDK

- **Instrumentation key**: `instrumentations: ['claude_agent_sdk']`
- **Package**: `@arizeai/openinference-instrumentation-claude-agent-sdk`

```typescript
import { init, flush, shutdown } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'claude-agent-app',
  instrumentations: ['claude_agent_sdk'],
});

// Claude Agent SDK calls are auto-instrumented
// ... your Claude Agent SDK code ...

await flush();
await shutdown();
```

---

## 8. BeeAI

- **Instrumentation key**: `instrumentations: ['beeai']`
- **Package**: `@arizeai/openinference-instrumentation-beeai`

```typescript
import { init, flush, shutdown } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'beeai-app',
  instrumentations: ['beeai'],
});

// BeeAI agent calls are auto-instrumented
// ... your BeeAI code ...

await flush();
await shutdown();
```

---

## 9. Mastra

- **Instrumentation key**: `instrumentations: ['mastra']`
- **Package**: `@neatlogs/instrumentation-mastra`

Pass `instrumentations: ['mastra']` to `init()`, then use `getMastraObservability()` to get the observability config for the Mastra constructor:

```typescript
import { init, getMastraObservability } from 'neatlogs';
import { Mastra } from '@mastra/core/mastra';

await init({
  apiKey: '...',
  endpoint: 'https://staging-cloud.neatlogs.com',
  workflowName: 'mastra-app',
  instrumentations: ['mastra'],
});

export const mastra = new Mastra({
  agents: { /* ... */ },
  observability: await getMastraObservability(),
});
```

Mastra agent, workflow, tool, and LLM step spans are automatically captured.

---

## 10. Vercel AI SDK (`ai` package)

- **Import**: `import { wrapAISDK } from 'neatlogs/ai'` (built into the SDK, no separate package)
- **Compatibility**: `ai >=3 <7` (v3, v4, v5, v6)
- **No monkey-patching**: the AI SDK supports OpenTelemetry natively via `experimental_telemetry`. The wrapper opts in per call site, so there's no fragile module patching.

> **Two APIs**: use `wrapAISDK(ai)` for the ergonomic wrapper (recommended), or `createAITelemetry()` for direct `experimental_telemetry` injection on individual calls.

### Recommended: `wrapAISDK`

```typescript
import { init, flush, shutdown } from 'neatlogs';
import { wrapAISDK } from 'neatlogs/ai';
import * as ai from 'ai';
import { openai } from '@ai-sdk/openai';

// 1. Initialize neatlogs first so a TracerProvider is registered globally
await init({ apiKey: '...', workflowName: 'ai-sdk-app' });

// 2. Wrap the ai module — wraps generateText, streamText, generateObject, streamObject, embed, embedMany, rerank
const { generateText, streamText, generateObject, streamObject, embed, embedMany, rerank } = wrapAISDK(ai);

// 3. Use the wrapped functions exactly like the originals
const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'What is the capital of France?',
});

await flush();
await shutdown();
```

Each wrapped call:
1. Opens a parent OTel span on the active `TracerProvider` with `openinference.span.kind = 'WORKFLOW'` (for generateText/streamText/generateObject/streamObject) or `'CHAIN'` (for embed/embedMany/rerank). The AI SDK's native `ai.doGenerate` / `ai.doStream` child spans remain `LLM`; tool-call children remain `TOOL`.
2. Forces `experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true, tracer, metadata: { neatlogsWrapped: true } }` for that call. **`isEnabled: false` is overridden** — to skip telemetry for a specific call, use the unwrapped `ai` import directly.
3. Captures `input.value` (always) and `output.value` (async functions only — streams cannot be JSON-serialized, so `output.value` is unset on streaming parents; native AI SDK child spans still share the trace).
4. Sets `SpanStatusCode.ERROR` on rethrown exceptions.

### Lower-level: `createAITelemetry`

When you want telemetry on a single call without wrapping the whole module:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createAITelemetry } from 'neatlogs/ai';

await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Hello',
  experimental_telemetry: createAITelemetry({ metadata: { userId: 'u-123' } }),
});
```

### Captured attributes (after pipeline normalization)

The Vercel AI SDK emits its own `ai.*` namespace; the SDK's `UnifiedAttributeProcessor` maps these to `neatlogs.*`:

| AI SDK attribute | Neatlogs attribute |
|------------------|--------------------|
| `ai.model.id` | `neatlogs.llm.model_name` |
| `ai.model.provider` | `neatlogs.llm.provider` |
| `ai.usage.promptTokens` | `neatlogs.llm.token_count.prompt` |
| `ai.usage.completionTokens` | `neatlogs.llm.token_count.completion` |
| `ai.usage.totalTokens` | `neatlogs.llm.token_count.total` |
| `ai.prompt.messages` (JSON array) | `neatlogs.llm.input_messages.{i}.{role,content}` |
| `ai.response.text` | `neatlogs.llm.output_messages.0.content` |
| `ai.response.toolCalls` (JSON array) | `neatlogs.llm.tool_calls.{i}.{name,arguments,id}` |
| `ai.toolCall.name` / `args` / `result` | `tool.name` / `input.value` / `output.value` (on `ai.toolCall` spans) |
| `ai.settings.{temperature,maxTokens,topP,…}` | `neatlogs.llm.{temperature,max_tokens,top_p,…}` |

### Note on `init({ instrumentations: ['ai_sdk'] })`

`ai_sdk` exists in the instrumentation registry for scope-detection consistency, but passing it to `init()` is a **no-op**. The wrapper is always opt-in per call site via `wrapAISDK(ai)` — listing it in `instrumentations` does nothing useful and is not required.

---

## 11. Long-Running Servers (Express, Fastify, etc.)

For server applications, `init()` is called **once at startup**. Do NOT call `flush()` or `shutdown()` on every request.

```typescript
import { init, span, flush, shutdown } from 'neatlogs';
import express from 'express';

await init({
  apiKey: '...',
  workflowName: 'my-api',
  instrumentations: ['openai'],
});

const { OpenAI } = await import('openai');
const client = new OpenAI();

const app = express();

app.get('/ask', async (req, res) => {
  const askWorkflow = span({ kind: 'WORKFLOW', name: 'ask_workflow' }, async (q: string) => {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: q }],
    });
    return response.choices[0].message.content;
  });

  const answer = await askWorkflow(req.query.q as string);
  res.json({ answer });
  // DO NOT call flush() here
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await flush();
  await shutdown();
  process.exit(0);
});

app.listen(3000);
```

> **Key difference from Python**: In TypeScript, `flush()` and `shutdown()` are already async — just `await` them directly. No need for thread delegation.
