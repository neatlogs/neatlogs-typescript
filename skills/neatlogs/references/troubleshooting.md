# Troubleshooting — NeatLogs TypeScript SDK Reference

Common mistakes, anti-patterns, and diagnostic steps for the NeatLogs TypeScript SDK.

---

## 1. Import Order Issues (Most Common Mistake)

| Wrong | Right |
|-------|-------|
| `import { OpenAI } from 'openai'` then `init()` | `await init({ instrumentations: ['openai'] })` then `import('openai')` |

Auto-instrumentation works by patching library modules at import/require time. If the library is already imported, patching has no effect and LLM calls will not be traced.

```typescript
// ❌ WRONG — Already imported before init
import { OpenAI } from 'openai';
import { init } from 'neatlogs';
await init({ instrumentations: ['openai'] });

// ✅ RIGHT — Dynamic import after init
import { init } from 'neatlogs';
await init({ instrumentations: ['openai'] });
const { OpenAI } = await import('openai');
```

---

## 2. Forgetting to Await Lifecycle Functions

`init()`, `flush()`, and `shutdown()` are all async and MUST be awaited.

```typescript
// ❌ WRONG — not awaiting
init({ apiKey: '...' });  // Returns a Promise that's never awaited

// ✅ RIGHT
await init({ apiKey: '...' });
```

```typescript
// ❌ WRONG — not awaiting shutdown
flush();
shutdown();

// ✅ RIGHT
await flush();
await shutdown();
```

---

## 3. Missing Traces Diagnostic Flowchart

If traces are not appearing in the NeatLogs dashboard, check these in order:

1. **Is `await init()` called?** → No → Add `await init(...)` at the top of your entry file.
2. **Is it called BEFORE LLM library imports?** → No → Use dynamic `import()` after `init()`.
3. **Is the provider listed in `instrumentations`?** → No → Add it (e.g. `instrumentations: ['openai']`).
4. **Is `NEATLOGS_API_KEY` set?** → No → Set it via env var or `apiKey` param. Without it, export is **silently disabled**.
5. **Is the library actually instrumentable?** → Check the [Working Instrumentations table](../SKILL.md#working-instrumentations-ts-sdk-v1). `google_genai`, `litellm`, and `crewai` are NOT instrumentable in TS SDK v1.
6. **Still missing?** → Enable `debug: true` in `init()` and check console output for clues.

---

## 4. HTTP Auto-Instrumentation (Always On)

`init()` **always** instruments Node.js `fetch`/`undici` for trace context propagation, regardless of what you put in the `instrumentations` parameter.

---

## 5. Flush/Shutdown Gotcha

Scripts (not long-running servers) **MUST** call `await flush()` then `await shutdown()` before exit. Without them, the last batch of spans may not be exported.

```typescript
// At the end of your script
await flush();
await shutdown();
```

### Long-Running Servers

For servers, call `init()` **once at startup** and `flush()` / `shutdown()` **once at shutdown** — NOT on every request:

```typescript
// ❌ WRONG — flush on every request
app.get('/ask', async (req, res) => {
  const response = await client.chat.completions.create({ /* ... */ });
  await flush();    // ← Don't do this per request
  res.json({ answer: response.choices[0].message.content });
});

// ✅ RIGHT — flush only on shutdown
process.on('SIGTERM', async () => {
  await flush();
  await shutdown();
  process.exit(0);
});
```

**Why?** `flush()` on every request sends one HTTP batch per request instead of one every `flushInterval` seconds (default 5s) — this risks API throttling and adds latency.

---

## 6. Not Instrumentable in TS SDK v1

The following libraries are in the instrumentation registry but have `null` instrumentation fields. Passing them in `instrumentations` will NOT produce an error but they will NOT be instrumented:

- `litellm` — Python-only library
- `crewai` — Python-only library

Use the [Working Instrumentations table](../SKILL.md#working-instrumentations-ts-sdk-v1) as the source of truth.

---

## 7. Debug Mode

```typescript
await init({ debug: true });
```

- Enables verbose logging to console (instrumentation status, span creation, export status)
- Enables `log()` echo to console
- Shows auto-generated session IDs, endpoint configuration, etc.

---

## 8. Common Anti-Patterns Table

| Anti-Pattern | Why It's Wrong | Fix |
|-------------|----------------|-----|
| Wrapping `span({ kind: 'WORKFLOW' })` in `trace()` | Redundant — `span()` already creates a span | Just call the wrapped function directly |
| Using `trace()` for custom functions where `span()` would work | That's what `span()` is for | Use `span({ kind: 'CHAIN' })` or the appropriate kind |
| Calling `.compile()` outside `trace()` callback | Variable bindings won't be captured on the span | Move `.compile()` inside the `trace()` callback |
| Not listing all providers in `instrumentations` | Some LLM calls won't be traced | Add all providers your code uses |
| Using `span({ kind: 'RERANKER' })` or `span({ kind: 'VECTOR_STORE' })` | `span()` throws Error for invalid kinds | Use `trace({ name: '...', kind: 'RERANKER' })` instead |
| Not using dynamic import after `init()` | Auto-instrumentation won't work | Use `const { OpenAI } = await import('openai')` |
| Using `span({ kind: 'LLM' })` | `LLM` is not a valid kind for `span()` | Use `trace({ name: '...', kind: 'LLM' })` |

---

## 9. Manual `trace({ kind: 'LLM' })` Span Disappears From Dashboard

**Symptom**: A chat/agent step shows its parent AGENT span with no children in the UI.

**Root cause**: `trace()` stamps `neatlogs.internal = true` on every span by default. The backend drops internal LLM spans when it expects an auto-instrumented sibling.

**Fix**: Opt out of the internal flag inside the callback:

```typescript
await trace({ name: 'raw_api_llm_call', kind: 'LLM' }, async (span) => {
  span.setAttribute('neatlogs.internal', false);   // ← required
  // ... rest of span setup, API call, attribute writes ...
});
```

> Do NOT override `neatlogs.internal = false` on a `trace()` that wraps an already-auto-instrumented call. The OpenInference LLM span IS the canonical record — leaving the internal flag in place correctly removes the wrapper.

---

## 10. Data Masking

Per-span mask override:

```typescript
import { span } from 'neatlogs';
import type { MaskFunction } from 'neatlogs';

const redactPii: MaskFunction = (spanData) => {
  for (const key of Object.keys(spanData)) {
    if (key.includes('email') || key.includes('password')) {
      spanData[key] = '[REDACTED]';
    }
  }
  return spanData;
};

const lookupUser = span(
  { kind: 'TOOL', toolName: 'lookup_user', mask: redactPii },
  async (email: string) => {
    return await db.findUser(email);
  },
);
```

> **Note**: Per-span mask takes precedence — the global `init({ mask })` mask is skipped for that span.

---

## 11. NEATLOGS_TRACE_CONTENT Environment Variable

Set `NEATLOGS_TRACE_CONTENT=false` to globally disable input/output capture on all spans (overrides `captureInput`/`captureOutput` defaults). Useful for production environments with sensitive data.

```bash
export NEATLOGS_TRACE_CONTENT=false
```
