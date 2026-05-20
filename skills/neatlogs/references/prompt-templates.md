# Prompt Templates — NeatLogs TypeScript SDK Reference

Prompt template tracking and management in the NeatLogs TypeScript SDK. Covers local template classes (`PromptTemplate`, `UserPromptTemplate`), integration with `trace()` and `bindTemplates()`, and the server-side Prompt Management API.

---

## 1. `PromptTemplate` Class

System/AI instruction prompt with `{{variable}}` placeholders.

- Constructor accepts a **string** OR an **array of `PromptMessage` objects**
- `.compile(variables)` renders the template, **sets prompt context in OTel for automatic span capture**, and returns:
  - A `string` if constructed with a string template
  - A `PromptMessage[]` if constructed with a message list
- `.variables` property lists extracted variable names
- `.template` property returns the raw template

```typescript
import { PromptTemplate } from 'neatlogs';

// String form
const sysTpl = new PromptTemplate('You are a {{role}} assistant specialized in {{domain}}.');

// Message list form (preferred for chat models)
const sysTpl2 = new PromptTemplate([{
  role: 'system',
  content: 'You are a {{role}} assistant specialized in {{domain}}.',
}]);

// Check variables
console.log(sysTpl.variables);  // ['role', 'domain']

// Compile (renders template + sets OTel context)
const rendered = sysTpl.compile({ role: 'research', domain: 'quantum physics' });
// rendered: 'You are a research assistant specialized in quantum physics.'
```

### Error Handling

`compile()` throws an `Error` if required variables are missing:

```typescript
const tpl = new PromptTemplate('Hello {{name}}, welcome to {{place}}.');
tpl.compile({ name: 'Alice' });
// throws: Error: Missing required variables: place. Template requires: name, place
```

---

## 2. `UserPromptTemplate` Class

Same API as `PromptTemplate` but for the user/human turn. Stores context in a separate `UserPromptContext` for independent tracking.

```typescript
import { UserPromptTemplate } from 'neatlogs';

const userTpl = new UserPromptTemplate([{
  role: 'user',
  content: 'Research topic: {{topic}}\nFocus areas: {{focus}}',
}]);

const userMsgs = userTpl.compile({ topic: 'quantum entanglement', focus: 'recent experiments' });
// userMsgs: [{ role: 'user', content: 'Research topic: quantum entanglement\nFocus areas: recent experiments' }]
```

---

## 3. Using Templates with `trace()`

Pass `promptTemplate` and `userPromptTemplate` to `trace()` for automatic capture on LLM spans. **IMPORTANT**: Call `.compile()` **INSIDE** the `trace()` callback for variable bindings to be captured.

```typescript
import { init, span, trace, flush, shutdown, PromptTemplate, UserPromptTemplate } from 'neatlogs';

await init({
  apiKey: '...',
  workflowName: 'research',
  instrumentations: ['openai'],
});

const { OpenAI } = await import('openai');
const client = new OpenAI();

const sysTpl = new PromptTemplate([{
  role: 'system',
  content: 'You are a {{role}} assistant. Always be thorough.',
}]);

const userTpl = new UserPromptTemplate([{
  role: 'user',
  content: 'Research: {{query}}',
}]);

const researcherAgent = span(
  { kind: 'AGENT', name: 'researcher' },
  async (query: string) => {
    return await trace(
      { name: 'research_llm', kind: 'LLM', promptTemplate: sysTpl, userPromptTemplate: userTpl },
      async () => {
        const sysMsgs = sysTpl.compile({ role: 'research' }) as Array<{ role: string; content: string }>;
        const userMsgs = userTpl.compile({ query }) as Array<{ role: string; content: string }>;
        const messages = [...sysMsgs, ...userMsgs];
        const response = await client.chat.completions.create({ model: 'gpt-4o', messages });
        return response.choices[0].message.content;
      },
    );
  },
);
```

### Anti-Pattern

```typescript
// ❌ WRONG — compile() outside trace() callback, variable bindings not captured
const msgs = sysTpl.compile({ role: 'research' });
await trace({ name: 'llm_call', kind: 'LLM', promptTemplate: sysTpl }, async () => {
  const response = await client.chat.completions.create({ model: 'gpt-4o', messages: [/* ... */] });
});

// ✅ RIGHT — compile() inside trace() callback
await trace({ name: 'llm_call', kind: 'LLM', promptTemplate: sysTpl }, async () => {
  const msgs = sysTpl.compile({ role: 'research' });
  const response = await client.chat.completions.create({ model: 'gpt-4o', messages: [/* ... */] });
});
```

---

## 4. `bindTemplates()` for Framework-Managed LLMs

When a framework owns the LLM calls and you can't wrap them in `trace()`, use `bindTemplates()` to attach prompt context that gets injected automatically.

```typescript
import { bindTemplates, PromptTemplate } from 'neatlogs';

const sysTpl = new PromptTemplate('You are a senior market analyst.');
const boundLlm = bindTemplates(llm, sysTpl);
```

---

## 5. Prompt Management API (Server-Side)

The Prompt Management API stores and retrieves prompt templates from the NeatLogs backend. Requires a valid `NEATLOGS_API_KEY` and `init()` to have been called.

### Retrieving Prompts

```typescript
import { getPrompt, fetchPrompt } from 'neatlogs';

// Get a prompt by name (returns PromptHandle)
const prompt = await getPrompt('research-agent', { label: 'production' });

// Access properties
console.log(prompt.name);       // 'research-agent'
console.log(prompt.version);    // 3
console.log(prompt.content);    // Raw template string
console.log(prompt.labels);     // ['production']
console.log(prompt.config);     // Config object

// Fetch prompt (returns PromptHandle)
const cached = await fetchPrompt('research-agent', { label: 'production' });
```

### Creating and Managing Prompts

```typescript
import { createPrompt, updatePrompt, saveAsVersion, listPrompts, deletePrompt, removeTag } from 'neatlogs';

// Create a prompt
const newPrompt = await createPrompt({
  name: 'research-agent',
  content: 'You are a research assistant for {{topic}}.',
  labels: ['staging'],
});

// Update a prompt (content, messages, config, or labels)
await updatePrompt('research-agent', { labels: ['production'] });

// Save current version with a label
await saveAsVersion('research-agent', { label: 'staging' });

// List all prompts
const allPrompts = await listPrompts();

// Delete a prompt by name
await deletePrompt('research-agent');

// Remove a label from a prompt
await removeTag('research-agent', 'staging');
```

### Error Handling

```typescript
import { PromptNotFoundError, PromptApiError, PromptClientError } from 'neatlogs';

try {
  const prompt = await getPrompt('nonexistent');
} catch (error) {
  if (error instanceof PromptNotFoundError) {
    console.log('Prompt not found');
  } else if (error instanceof PromptApiError) {
    console.log(`API error: ${error.message}`);
  } else if (error instanceof PromptClientError) {
    console.log(`Client error: ${error.message}`);
  }
}
```

### When to Use

- Managing prompts centrally across environments (dev, staging, production)
- A/B testing prompt versions via labels
- Sharing prompts between team members
- Version-controlling prompts server-side

> **Note**: The Prompt Management API requires a NeatLogs backend connection with a valid API key. Without one, these functions will throw `PromptApiError`.
