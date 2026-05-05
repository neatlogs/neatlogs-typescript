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

- **Package**: `@neatlogs/instrumentation-mastra`

> **⚠️ @mastra/core@1.x compatibility note:** `@mastra/core@1.x` ships a sealed CJS bundle where `Mastra` property is `configurable: false`. Constructor-level patching via `instrumentations: ['mastra']` is **not possible** — a `[neatlogs]` warning is emitted to stderr and no spans are collected.
>
> **Use the direct `observability` injection approach instead:**

```typescript
import { Mastra } from '@mastra/core';
import { createNeatlogsMastraObservability } from '@neatlogs/instrumentation-mastra';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { init, flush, shutdown } from 'neatlogs';

// 1. Initialize neatlogs telemetry first
await init({ apiKey: '...', workflowName: 'mastra-app' });

// 2. Create Mastra observability instance using the neatlogs exporter
const provider = new NodeTracerProvider();
provider.register();
const { observability } = createNeatlogsMastraObservability(provider);

// 3. Pass observability directly to Mastra constructor
const mastra = new Mastra({
  observability,
  // ... other Mastra config
});

// Mastra agent, workflow, and tool calls now emit spans to Neatlogs
// ... your Mastra code ...

await flush();
await shutdown();
```

---

## 10. Long-Running Servers (Express, Fastify, etc.)

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
