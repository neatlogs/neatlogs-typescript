# Vercel AI SDK integration for the Neatlogs TypeScript SDK

## Goal

Add first-class support for the [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` package) to the Neatlogs TypeScript SDK, so that `generateText`, `streamText`, `generateObject`, `streamObject`, tool calls, and `Experimental_Agent` calls produce normalized neatlogs traces with the same shape and attribute coverage that exists today for Mastra, OpenAI, and LangChain.

The integration must work without monkey-patching the `ai` package (the same sealed-CJS issue documented for `@mastra/core@1.x` applies to `ai`'s dual CJS/ESM build). Span ingestion still flows through the existing `NeatlogsSpanProcessor` pipeline — no parallel data path.

## Background — what the SDK does today

The TypeScript SDK is OTel-native. `init()` ([src/init.ts:100](../../../src/init.ts#L100)) installs a `NodeTracerProvider` globally; any code that emits OTel spans into that provider — including the AI SDK's own `experimental_telemetry` — is captured automatically.

Three relevant pieces exist:

1. **`NeatlogsSpanProcessor.onStart`** ([src/core/span-processor.ts:295](../../../src/core/span-processor.ts#L295)) — sniffs LLM-like spans by `openinference.span.kind === 'LLM'` OR span-name regex `/chat|completion|generate|embedding/i`, and injects active prompt-template attributes from `PromptContext` / `UserPromptContext`. AI SDK span names (`ai.generateText`, `ai.streamText.doStream`) match the `/generate|stream/`-ish portion of this regex via `generate`, so prompt-template injection works for AI SDK spans **with no changes**.

2. **`UnifiedAttributeProcessor.normalizeConventions`** ([src/core/attribute-processor.ts:216](../../../src/core/attribute-processor.ts#L216)) — the single dispatch point for vendor-specific attribute massaging. It currently has branches for OpenInference (`llm.*`, `openinference.*`), OpenLLMetry/Traceloop (`gen_ai.*`, `traceloop.*`), MCP, vector DBs, and LangChain `ls_*` metadata. It has **no Vercel AI SDK branch**. AI SDK uses an `ai.*` namespace (`ai.prompt.messages`, `ai.response.text`, `ai.toolCall.args`, `ai.usage.promptTokens`, `ai.model.id`) that the pipeline does not understand today.

3. **`parseInstrumentationScope`** ([src/core/instrumentation-scope-parser.ts:123](../../../src/core/instrumentation-scope-parser.ts#L123)) — known scopes table at [src/core/instrumentation-scope-parser.ts:26](../../../src/core/instrumentation-scope-parser.ts#L26) does not list the `ai` scope name (the AI SDK's own tracer name). The fuzzy fallback at lines 144-185 uses substring matches that won't catch `ai` either.

The Mastra integration ([src/mastra.ts](../../../src/mastra.ts), [`@neatlogs/instrumentation-mastra`](../../../../instrumentations/packages/js/neatlogs-instrumentation-mastra/)) plugs into Mastra's own `Observability` hook because Mastra exposes one. AI SDK does not. So the Mastra hook-injection model does not transfer; we need a different shape.

## Approach — `wrapAISDK` wrapper, not monkey-patching

We ship `wrapAISDK(ai)` as a function that takes the user's `import * as ai from 'ai'` namespace and returns wrapped versions of `generateText`, `streamText`, `generateObject`, `streamObject`, `Experimental_Agent`, and `Agent` (when present in the loaded version of `ai`).

Each wrapped function:

1. Opens a parent OTel span on the active `TracerProvider` (set by `neatlogs.init()`), with `openinference.span.kind` set to `LLM` for the `*Text`/`*Object` family and `WORKFLOW` for `Agent`. The span name follows AI SDK convention (`ai.generateText`, etc.) so the existing `onStart` LLM-detection regex still fires.
2. Merges the user-supplied `experimental_telemetry` (if any) with `{ isEnabled: true, recordInputs: true, recordOutputs: true, tracer: <neatlogs tracer>, metadata: { ...userMeta, neatlogsWrapped: true } }`. User values win over defaults except `isEnabled`, which is forced on.
3. Awaits the underlying call. The AI SDK's native `ai.*` child spans nest under our parent span automatically because `startActiveSpan` puts the parent in OTel context.
4. On completion, mirrors `input.value` / `output.value` onto the parent span when AI SDK didn't surface them at the parent level (it usually only sets them on the inner `doGenerate` span).
5. On error, sets `SpanStatusCode.ERROR` and rethrows.

We also export `createAITelemetry(opts?)` — an escape hatch parallel to `createNeatlogsMastraObservability(provider)` — that returns a ready-to-spread `experimental_telemetry` object for users who prefer to set telemetry per call themselves rather than using `wrapAISDK`. This satisfies users who want neatlogs to capture spans without opting into the wrapper.

### Why not monkey-patching

The `InstrumentationManager` in [src/instrumentation/manager.ts](../../../src/instrumentation/manager.ts) already supports OTel `Instrumentation` classes via `instrument({ tracerProvider })` ([manager.ts:135](../../../src/instrumentation/manager.ts#L135)) and the `setTracerProvider`+`enable`+`patchEager` pattern ([manager.ts:143](../../../src/instrumentation/manager.ts#L143)). The plumbing is there — the obstacle is the target. The `ai` package is a dual CJS/ESM build whose CJS exports are likely sealed (configurable: false on the property descriptors), the same condition that breaks `MastraInstrumentor` against `@mastra/core@1.x`. The Mastra package's `instrumentation.ts` documents this with an explicit stderr warning when patching fails. Repeating that pattern for AI SDK delivers worse DX than `wrapAISDK` while inheriting the same fragility.

## Architecture

```
user code
  └─ wrapAISDK(ai).generateText(...)
       └─ tracer.startActiveSpan('ai.generateText', { kind: WORKFLOW })  ← neatlogs parent
            └─ ai.generateText(..., experimental_telemetry: { tracer })
                 ├─ ai.doGenerate                     ← AI SDK child (LLM)
                 ├─ ai.toolCall                       ← AI SDK child (TOOL)
                 └─ ai.doGenerate                     ← AI SDK child (LLM)

all spans → NodeTracerProvider (registered by neatlogs.init())
         → NeatlogsSpanProcessor.onStart    (prompt-template injection)
         → NeatlogsSpanProcessor.onEnd
              └─ UnifiedAttributeProcessor.normalize
                   ├─ enrichWithScopeDetection            (NEW: knows 'ai' scope)
                   ├─ normalizeConventions
                   │    └─ extractVercelAiSdk            (NEW: maps ai.* → llm.*)
                   └─ existing mapping pipeline (unchanged)
         → BatchSpanProcessor → OTLPTraceExporter        (unchanged transport)
```

Two clean integration points: a new attribute-extractor in `normalizeConventions`, and a new entry in the scope table. Everything downstream — defaults enrichment, span-kind dispatch, file logging, mask, OTLP export — remains untouched.

## Project structure

### New package — `instrumentations/packages/js/neatlogs-instrumentation-ai-sdk/`

Mirrors `instrumentations/packages/js/neatlogs-instrumentation-mastra/`:

```
neatlogs-instrumentation-ai-sdk/
├── package.json                # peerDeps: ai >=3, optional
├── tsconfig.esm.json
├── tsconfig.cjs.json
├── README.md
├── LICENSE
├── src/
│   ├── index.ts                # exports wrapAISDK, createAITelemetry
│   ├── wrap.ts                 # wrapAISDK implementation
│   ├── telemetry.ts            # createAITelemetry implementation
│   └── span-attrs.ts           # parent-span attribute helpers
├── examples/
│   ├── basic.ts                # generateText
│   ├── streaming.ts            # streamText with tools
│   └── agent.ts                # Experimental_Agent
└── test/
    ├── wrap.test.ts            # in-memory exporter, assert span shape
    └── telemetry.test.ts
```

`package.json` peerDependencies: `"ai": ">=3 <7"` (covers v3, v4, v5, v6 — Braintrust supports the same range), all marked `optional`. Dev dep `"neatlogs": "file:../../../neatlogs-typescript"` matches the Mastra package convention.

### Edits to `neatlogs-typescript/`

| File | Change |
|------|--------|
| `src/ai-sdk.ts` (NEW) | Mirrors [src/mastra.ts](../../../src/mastra.ts). Exports `getAISDKWrapper()`: dynamic-imports `@neatlogs/instrumentation-ai-sdk`, returns its `wrapAISDK`. Throws a friendly error if the optional package isn't installed. |
| `src/index.ts` | Add `export { getAISDKWrapper } from './ai-sdk.js';` next to the existing Mastra export. |
| `src/core/instrumentation-scope-parser.ts` | Add `'ai': { framework: 'ai_sdk' }` and `'@neatlogs/instrumentation-ai-sdk': { framework: 'ai_sdk' }` to `SCOPE_PATTERNS`. Add `vercel`/`ai-sdk` substring rules to the fuzzy fallback. |
| `src/core/attribute-processor.ts` | New private method `extractVercelAiSdkAttrs(attrs)` invoked from `normalizeConventions` ([attribute-processor.ts:216](../../../src/core/attribute-processor.ts#L216)). Maps `ai.*` keys to canonical `llm.*` / `openinference.span.kind` / `gen_ai.*` keys (table below). |
| `src/config/attribute-mapping.json` | Add `ai.usage.promptTokens` / `ai.usage.completionTokens` to existing token-count `sources` arrays as a fallback for users who set `experimental_telemetry` without the wrapper. |
| `src/instrumentation/registry.ts` | Add `ai_sdk` library entry under `tags.agent` and `tags.llm`, with `neatlogs: '@neatlogs/instrumentation-ai-sdk'`, `default_span_kind: 'LLM'`. (Note: this entry is informational — `init({ instrumentations: ['ai_sdk'] })` is a no-op because the wrapper is opt-in per call site. The `default_span_kind` is a fallback only consumed when a span has no `openinference.span.kind` set; `wrapAISDK` always sets the kind explicitly, so this default is unreachable through the wrapper. It exists for users who set `experimental_telemetry` manually without `createAITelemetry`.) |
| `examples/sdk_examples/ai_sdk_basic/` (NEW) | Modeled on `examples/sdk_examples/mastra_complex/`. Single-file `main.ts` exercising `generateText` + `streamText` + tools against Azure OpenAI (matches existing example credentials). |
| `tests/integration/ai-sdk.test.ts` (NEW) | Synthetic AI-SDK-shaped span fed through `UnifiedAttributeProcessor` to lock attribute mapping output. |

## Attribute mapping — Vercel AI SDK → neatlogs canonical

Authoritative source: AI SDK [telemetry data documentation](https://sdk.vercel.ai/docs/ai-sdk-core/telemetry) (v3-v6). The mapping below handles the union of attributes across versions; missing keys are skipped.

| AI SDK attribute | Type | Mapped to | Notes |
|---|---|---|---|
| `ai.model.id` | string | `llm.model_name` | Then existing pipeline maps to `neatlogs.llm.model_name`. |
| `ai.model.provider` | string | `llm.provider`, `gen_ai.system` | E.g. `"openai.chat"` → split → `"openai"`. |
| `ai.usage.promptTokens` | number | `llm.token_count.prompt` | Also added to `attribute-mapping.json` sources for defense-in-depth. |
| `ai.usage.completionTokens` | number | `llm.token_count.completion` | Same. |
| `ai.usage.totalTokens` (v5+) | number | `llm.token_count.total` | |
| `ai.prompt.messages` | JSON string | Exploded into `llm.input_messages.{i}.message.{role,content}` | JSON.parse, iterate, set indexed keys. |
| `ai.prompt` (v3 fallback) | string | `input.value` | When `messages` not present. |
| `ai.response.text` | string | `llm.output_messages.0.message.content` + `.role=assistant` | |
| `ai.response.toolCalls` | JSON string | Exploded into `llm.output_messages.0.message.tool_calls.{i}.tool_call.function.{name,arguments}` | The existing `extractToolCalls` ([attribute-processor.ts:279](../../../src/core/attribute-processor.ts#L279)) then handles dedup/normalization. |
| `ai.response.finishReason` | string | `llm.response.finish_reason` | |
| `ai.response.id` | string | `gen_ai.response.id` | |
| `ai.toolCall.name` | string | `tool.name` + `openinference.span.kind=TOOL` | Only on `ai.toolCall` spans. |
| `ai.toolCall.args` | JSON string | `input.value` | |
| `ai.toolCall.result` | JSON string | `output.value` | |
| `ai.operationId` | string | `gen_ai.operation.name` | Helps the existing `RERANKER` detection at [attribute-processor.ts:937](../../../src/core/attribute-processor.ts#L937). |
| `ai.settings.maxTokens` | number | `gen_ai.request.max_tokens` | |
| `ai.settings.temperature` | number | `gen_ai.request.temperature` | |
| `ai.settings.topP` | number | `gen_ai.request.top_p` | |
| `ai.settings.topK` | number | `gen_ai.request.top_k` | |
| `ai.settings.frequencyPenalty` | number | `gen_ai.request.frequency_penalty` | |
| `ai.settings.presencePenalty` | number | `gen_ai.request.presence_penalty` | |
| `ai.settings.stopSequences` | string[] | `gen_ai.request.stop_sequences` | |
| `ai.settings.maxRetries` | number | `neatlogs.llm.max_retries` | New leaf attribute; not a standard mapping. |

### Span-kind inference for AI SDK span names

When `openinference.span.kind` is absent and the span scope is `ai`, infer from the span name:

| Span name | Inferred `openinference.span.kind` |
|---|---|
| `ai.generateText`, `ai.streamText`, `ai.generateObject`, `ai.streamObject` | `LLM` (parent of `doGenerate`/`doStream`) |
| `ai.generateText.doGenerate`, `ai.streamText.doStream`, `ai.generateObject.doGenerate`, `ai.streamObject.doStream` | `LLM` |
| `ai.toolCall` | `TOOL` |
| `ai.embed`, `ai.embedMany` | `EMBEDDING` |

This is set in `extractVercelAiSdkAttrs` so that the existing `applyNamespaceMapping` ([attribute-processor.ts:919](../../../src/core/attribute-processor.ts#L919)) derives `neatlogs.span.kind` correctly.

## `wrapAISDK` API surface

```typescript
import { wrapAISDK } from '@neatlogs/instrumentation-ai-sdk';
import * as ai from 'ai';

const { generateText, streamText, generateObject, streamObject, Experimental_Agent } = wrapAISDK(ai);
```

`wrapAISDK<T extends typeof import('ai')>(aiModule: T): T` — returns the same shape as the input, with the listed functions wrapped. Untyped fields are passed through unchanged so the user's destructuring still works for AI SDK exports we don't recognize.

`createAITelemetry(opts?: { metadata?: Record<string, any> }): { isEnabled: true; recordInputs: true; recordOutputs: true; tracer: Tracer; metadata?: Record<string, any> }` — used like:

```typescript
import { createAITelemetry } from '@neatlogs/instrumentation-ai-sdk';
import { generateText } from 'ai';

await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello',
  experimental_telemetry: createAITelemetry({ metadata: { userId: 'u-123' } }),
});
```

Both APIs require `neatlogs.init()` to have run first (so a `TracerProvider` is registered globally). If not, OTel's default `TracerProvider` produces non-recording spans, the wrapped functions still work, and `wrapAISDK` emits a one-time `console.warn` (parallel to how `getMastraObservability` throws when its package is missing — but here we degrade gracefully because the wrapper is meant to be transparent).

## Testing strategy

- **Package-level unit tests** (`neatlogs-instrumentation-ai-sdk/test/`):
  - Stub a fake `ai` module exposing a fake `generateText`. Verify `wrapAISDK(fakeAi).generateText(opts)` injects `experimental_telemetry`, opens a parent span, propagates errors, sets input/output on the parent span.
  - Mirror the `BasicTracerProvider` + `InMemorySpanExporter` pattern from the Mastra package's existing tests.
- **SDK integration test** (`neatlogs-typescript/tests/integration/ai-sdk.test.ts`):
  - Construct a synthetic AI-SDK-shaped span dict (matching `ai.generateText` parent + `ai.doGenerate` child + `ai.toolCall` child). Run it through `UnifiedAttributeProcessor.normalize`. Assert the output has `neatlogs.span.kind`, `neatlogs.llm.model_name`, `neatlogs.llm.token_count.{prompt,completion}`, `neatlogs.llm.input_messages.0.role`, `neatlogs.llm.output_messages.0.tool_calls.0.name`, etc.
  - Doesn't require network, doesn't require the `ai` package to be installed.
- **End-to-end example** (`examples/sdk_examples/ai_sdk_basic/`): runs against Azure OpenAI with `NEATLOGS_DISABLE_EXPORT=true` so spans are written to the JSONL file logger; mirrors how Mastra examples are validated.

## Out of scope

- Auto-instrumentation via `init({ instrumentations: ['ai_sdk'] })`. Wrapper is opt-in; the registry entry is only there for scope detection consistency.
- AI SDK provider-specific quirks (Bedrock signing, Vertex AI auth) — handled by AI SDK itself, our wrapper is provider-agnostic.
- Streaming-specific attribute extraction (TTFT, per-chunk latency). Achievable via wrapping the returned `AsyncIterable`, deferred to a follow-up. The basic span shape (`ai.streamText.doStream` as LLM) works without it.
- Multi-modal input handling (images, audio in `ai.prompt.messages`). The basic mapping captures the JSON; richer extraction is deferred.
- LangChain / Mastra interop. Out of scope here, separate code paths.

## Branch & commit plan

Branch: `vorflux/ai-sdk-instrumentation` (already cut from `vorflux/typescript-sdk-v3`).

| # | Commit | Files |
|---|---|---|
| 1 | scaffold `@neatlogs/instrumentation-ai-sdk` package + tests | `instrumentations/packages/js/neatlogs-instrumentation-ai-sdk/**` |
| 2 | SDK plumbing — scope parser, attribute-processor branch, registry, mapping JSON | `src/core/instrumentation-scope-parser.ts`, `src/core/attribute-processor.ts`, `src/config/attribute-mapping.json`, `src/instrumentation/registry.ts` |
| 3 | shim `src/ai-sdk.ts` + index.ts re-export | `src/ai-sdk.ts`, `src/index.ts` |
| 4 | example + integration test | `examples/sdk_examples/ai_sdk_basic/main.ts`, `tests/integration/ai-sdk.test.ts` |
| 5 | README updates (top-level + package) | `README.md`, `instrumentations/packages/js/neatlogs-instrumentation-ai-sdk/README.md` |

Each commit lands independently buildable. Commits 1-2 can land before any user-visible change; the wrapper is wired in commit 3.

## Risks

1. **AI SDK version drift.** `ai`'s OTel attribute names changed across v3 → v5 → v6 (e.g., `ai.usage.promptTokens` v3 vs `ai.usage.inputTokens` rumored v6). Mitigation: implement the union mapping; add a TODO and a per-version test fixture in a follow-up. Lock initial work to whichever AI SDK version the existing `mastra_complex` example uses (`@ai-sdk/azure` is already imported there).
2. **`ai.prompt.messages` JSON explosion.** AI SDK encodes the full message array as one JSON-string attribute. We need to JSON.parse it and explode into `llm.input_messages.{i}.message.*` indexed keys for the existing pipeline to work. The existing `extractToolCalls` regex pattern at [attribute-processor.ts:32](../../../src/core/attribute-processor.ts#L32) shows the indexed-key shape we need to produce. Bounded scope, just careful work.
3. **Sealed CJS exports if we ever wanted to add monkey-patching later.** Not blocking now since `wrapAISDK` doesn't patch — but if a future need arises, expect the same workaround Mastra documented (warn, no-op).
4. **Optional peer dep mechanics.** Marking `ai` optional in `peerDependenciesMeta` is critical so the Mastra-style installation pattern works. Verify with a fresh `npm install` of the SDK without `ai` present and confirm no warnings.

## Success criteria

- A user runs `neatlogs.init(...)`, calls `wrapAISDK(ai).generateText({...})`, and sees a single grouped trace in the Neatlogs dashboard with: parent `ai.generateText` span (kind=WORKFLOW — required for the trace-finalizer to accept it as a valid root), child `ai.doGenerate` span (kind=LLM, model name + token counts), and any `ai.toolCall` spans (kind=TOOL, input/output captured).
- Without the wrapper, a user who manually sets `experimental_telemetry: createAITelemetry()` (or even just `{ isEnabled: true }`) gets the same span shape — wrapper-vs-manual produces equivalent traces, the wrapper just removes boilerplate.
- The integration test in `tests/integration/ai-sdk.test.ts` passes with locked-in attribute names.
- The new package builds and tests pass via `pnpm -C instrumentations/packages/js/neatlogs-instrumentation-ai-sdk test`.
- No regression on existing examples (`mastra_complex`, `mastra_multiagent`, `langchain`, `langgraph`, etc.).
