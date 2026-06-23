# NeatLogs TypeScript SDK PR #1 handoff: completed work + remaining OpenInference no-LLM-span bug

**Audience:** engineer taking over `neatlogs-typescript` / `instrumentations` branch work
**Date:** 2026-05-05
**Primary PR:** https://github.com/neatlogs/neatlogs-typescript/pull/1
**Related PR:** https://github.com/neatlogs/instrumentations/pull/1

## Current branches and commits

| Repo | Branch | Commit | PR |
|---|---|---:|---|
| `neatlogs/neatlogs-typescript` | `vorflux/typescript-sdk-v3` | `b430ae5` | https://github.com/neatlogs/neatlogs-typescript/pull/1 |
| `neatlogs/instrumentations` | `vorflux/js-instrumentations` | `da50f3c` | https://github.com/neatlogs/instrumentations/pull/1 |

## Sanitization note

Do **not** put API keys in this doc, PR text, code, screenshots, or artifact paths. The staging runs referenced below used a valid staging NeatLogs API key, but the key value is intentionally omitted. Use `NEATLOGS_STAGING_API_KEY` or your own local `.env` when reproducing.

---

## 1. What was completed previously

### 1.1 TypeScript SDK examples and runner work

In `neatlogs-typescript` PR #1, the branch now contains runnable TypeScript examples for the original seven SDK flows:

- `examples/openai_multiagent/main.ts`
- `examples/anthropic_multiagent/main.ts`
- `examples/google_genai_multiagent/main.ts`
- `examples/langchain_react/main.ts`
- `examples/langgraph_multiagent/main.ts`
- `examples/marketing_strategy_demo/main.ts`
- `examples/reasoning_model_workflow/main.ts`

Supporting runner/verifier scripts:

- `scripts/run-original7-examples.mjs`
- `scripts/verify-original7-logs.mjs`

The examples call `init()` before dynamic importing provider clients, which is important for require/import patching once OpenInference instrumentation is fixed.

| Example | Requested instrumentation | Evidence |
|---|---|---|
| OpenAI multi-agent | `openai` | `examples/openai_multiagent/main.ts` contains `instrumentations: ['openai']` |
| Anthropic multi-agent | `anthropic` | `examples/anthropic_multiagent/main.ts` contains `instrumentations: ['anthropic']` |
| LangChain ReAct | `langchain` | `examples/langchain_react/main.ts` contains `instrumentations: ['langchain']` |
| LangGraph multi-agent | `langchain` | `examples/langgraph_multiagent/main.ts` contains `instrumentations: ['langchain']` |
| Reasoning workflow | `openai`, `anthropic`, `langchain`, `google_genai` | `examples/reasoning_model_workflow/main.ts` contains `instrumentations: ['openai', 'anthropic', 'langchain', 'google_genai']` |
| Google GenAI multi-agent | `google_genai` | `examples/google_genai_multiagent/main.ts` contains `instrumentations: ['google_genai']` |
| Marketing strategy demo | `openai` | `examples/marketing_strategy_demo/main.ts` contains `instrumentations: ['openai']` |

### 1.2 TypeScript SDK skill files

Added TypeScript-specific agent skill docs under:

- `skills/neatlogs/SKILL.md`
- `skills/neatlogs/references/decorators-and-traces.md`
- `skills/neatlogs/references/framework-integrations.md`
- `skills/neatlogs/references/prompt-templates.md`
- `skills/neatlogs/references/troubleshooting.md`

Important correction already made: the Mastra doc snippet now reuses the active tracer provider from `trace.getTracerProvider()` after `init()` instead of constructing a separate `NodeTracerProvider`. See `skills/neatlogs/references/framework-integrations.md:297-320`.

### 1.3 Existing SDK behavior changes beyond examples/skill files

| Area | What changed | Source |
|---|---|---|
| Span file logging | Raw/processed span log file paths now create parent directories, preserve absolute paths, log enabled paths, and close streams during shutdown. | `src/core/span-processor.ts:43-120`, `src/core/span-processor.ts:263-289`, `src/core/span-processor.ts:759-763` |
| Native `@Span(...)` decorator | TC39 class-method decorator now preserves `this` by binding the original method at call time. | `src/decorators/orchestration.ts:216-239` |
| Custom instrumentor import selection | Manager prefers a function export for `neatlogs` custom instrumentors instead of accidentally selecting a CJS namespace-like default object. | `src/instrumentation/manager.ts:117-146` |
| Example dependency/scripts | Added example scripts and provider/client dev dependencies. | `package.json:24-38`, `package.json:56-76` |
| Generated logs ignored | Local `logs/` output is ignored. | `.gitignore:1-8` |

### 1.4 Mastra instrumentation work in related PR

The related `neatlogs/instrumentations` PR added/fixed Mastra support:

- `NeatlogsMastraExporter` now handles `span_started` and `span_ended` lifecycle events, stores active span contexts, and creates parent-child relationships. See `packages/js/neatlogs-instrumentation-mastra/src/instrumentation.ts:173-205` and `packages/js/neatlogs-instrumentation-mastra/src/instrumentation.ts:224-253`.
- Added a real `@mastra/core` grouped workflow example using deterministic mock LLM output. See `packages/js/neatlogs-instrumentation-mastra/examples/grouped-workflow.ts:1-27` and the mock model setup at `packages/js/neatlogs-instrumentation-mastra/examples/grouped-workflow.ts:71-78`.
- Added verifier that requires a non-stale trace with a `WORKFLOW` root and child spans in the same trace. See `packages/js/neatlogs-instrumentation-mastra/scripts/verify-grouped-example.mjs:87-135`.

Important caveat: the grouped Mastra example uses `createMockModel()` for deterministic local validation, so it proves Mastra span grouping and parent-child trace structure, but it does **not** prove real provider LLM spans/cost for the TypeScript SDK OpenInference path.

### 1.5 Final tests already run before handoff

#### TypeScript SDK PR #1

- `npm run lint` → PASS.
- `npm run build` → PASS.
- `npx tsc --noEmit --skipLibCheck --project examples/tsconfig.json` → PASS.
- `npm test` → PASS, 36 test files, 789/789 tests.
- `rm -rf logs && NEATLOGS_API_KEY="" NEATLOGS_DISABLE_EXPORT=true npx tsx examples/span_decorator_smoke.ts` → PASS; creates `logs/` from scratch and logs 3 spans under one trace.
- `NEATLOGS_API_KEY="" NEATLOGS_DISABLE_EXPORT=true npx tsx examples/span_decorator_native_probe.ts` → PASS; logs 2 spans under one trace.
- `node scripts/run-original7-examples.mjs --help` → PASS.
- `node scripts/verify-original7-logs.mjs --help` → PASS.
- Skill-doc validator: 54 TS blocks OK, 0 failed, 2 skipped.

#### Instrumentations PR #1

- `pnpm run test` in `packages/js/neatlogs-instrumentation-mastra` → PASS, 45/45.
- `pnpm run build` → PASS.
- `rm -rf logs && pnpm run example:grouped` → PASS, 8 processed spans logged.
- `pnpm run verify:grouped` → PASS; workflow root trace contained 4 grouped spans and 3 valid child references.

### 1.6 Additional real-LLM Mastra example added during handoff validation

While validating the handoff, a new real-LLM Mastra example was added alongside the existing mock one:

- `packages/js/neatlogs-instrumentation-mastra/examples/grouped-workflow-azure.ts`

It uses `@ai-sdk/azure` (deployment `gpt-5-nano`) instead of `createMockModel`. When run against staging, it produced:

- 9 processed spans under grouped parent-child structure.
- Real agent output (non-deterministic LLM response, not the mock string).
- Non-zero dashboard cost (`$0.00046` observed on `gpt-5-nano`).
- Detection chip `Slow LLM Response` attached to the LLM span.

This confirms the Mastra exporter path in `packages/js/neatlogs-instrumentation-mastra/` emits proper `LLM` spans with tokens and cost when wired to a real provider. The remaining bug (Section 2 below) is **isolated to the TypeScript SDK OpenInference path**, not the Mastra path.

To run this example, the reviewer must add `@ai-sdk/azure@^3.0.61` and `ai@^6.0.175` to `devDependencies` (not committed here because they depend on the `neatlogs` local path reference in `package.json`, which is a separate upstream hygiene issue). The example's header comment documents the extra install step.

---

## 2. Remaining high-severity bug: TypeScript SDK OpenInference auto-instrumentations no-op

### Verdict

The original seven TypeScript examples can emit workflow/agent/tool/chain spans from explicit `span()` / `Span()` / `trace()` wrappers, but provider auto-instrumentation is currently broken for OpenInference-backed libraries. Result: examples that call real LLM providers may show raw HTTP spans and manual NeatLogs spans, but **no `LLM` spans, no model name, no token counts, and no cost**.

### Severity

High. Dashboard traces look structurally present but cost remains `$0`, because model/token attributes never arrive on `LLM` spans.

### Affected path

`src/instrumentation/manager.ts:154-189`.

The manager tries to load OpenInference instrumentors, but detects/calls the wrong API:

- It searches exported classes whose prototype has `.instrument` at `src/instrumentation/manager.ts:159-166`.
- It instantiates and calls `instrumentor.instrument({ tracerProvider })` at `src/instrumentation/manager.ts:167-174`.
- If that fails, it warns: `OpenInference package for '${lib}' loaded but could not find instrumentor class` at `src/instrumentation/manager.ts:187-189`.

### Source-confirmed registry impact

The registry maps these libraries to OpenInference packages:

| Library | Package mapping | Source |
|---|---|---|
| `openai` | `@arizeai/openinference-instrumentation-openai` | `src/instrumentation/registry.ts:95-100` |
| `anthropic` | `@arizeai/openinference-instrumentation-anthropic` | `src/instrumentation/registry.ts:101-106` |
| `bedrock` | `@arizeai/openinference-instrumentation-bedrock` | `src/instrumentation/registry.ts:113-118` |
| `langchain` | `@arizeai/openinference-instrumentation-langchain` | `src/instrumentation/registry.ts:191-196` |
| `beeai` | `@arizeai/openinference-instrumentation-beeai` | `src/instrumentation/registry.ts:348-352` |

Therefore the wrong OpenInference activation path affects at least `openai`, `anthropic`, `bedrock`, `langchain`, and `beeai` instrumentations.

### Verified local probe

Run from `/code/neatlogs/neatlogs-typescript` on branch `vorflux/typescript-sdk-v3`:

```bash
node - <<'NODE'
(async () => {
  const packages = [
    '@arizeai/openinference-instrumentation-openai',
    '@arizeai/openinference-instrumentation-anthropic',
    '@arizeai/openinference-instrumentation-langchain',
  ];
  for (const pkg of packages) {
    const mod = await import(pkg);
    const cls = Object.values(mod).find((v) => typeof v === 'function');
    const inst = new cls();
    console.log(pkg);
    console.log('  exports:', Object.keys(mod).join(', '));
    console.log('  class:', cls?.name);
    console.log('  prototype.instrument:', typeof cls.prototype.instrument);
    console.log('  prototype.enable:', typeof cls.prototype.enable);
    console.log('  instance.instrument:', typeof inst.instrument);
    console.log('  instance.enable:', typeof inst.enable);
    console.log('  instance.setTracerProvider:', typeof inst.setTracerProvider);
  }
})();
NODE
```

Observed output:

```text
@arizeai/openinference-instrumentation-openai
  exports: HOST_SUFFIX_TO_PROVIDER, OpenAIInstrumentation, getProviderFromHost, isPatched
  class: OpenAIInstrumentation
  prototype.instrument: undefined
  prototype.enable: function
  instance.instrument: undefined
  instance.enable: function
  instance.setTracerProvider: function
@arizeai/openinference-instrumentation-anthropic
  exports: AnthropicInstrumentation, isPatched
  class: AnthropicInstrumentation
  prototype.instrument: undefined
  prototype.enable: function
  instance.instrument: undefined
  instance.enable: function
  instance.setTracerProvider: function
@arizeai/openinference-instrumentation-langchain
  exports: LangChainInstrumentation, isPatched
  class: LangChainInstrumentation
  prototype.instrument: undefined
  prototype.enable: function
  instance.instrument: undefined
  instance.enable: function
  instance.setTracerProvider: function
```

Conclusion: OpenInference v2+/current JS instrumentors implement the standard OTel instrumentation interface (`enable()`, `disable()`, `setTracerProvider()`), not a `.instrument()` method. The current manager's OpenInference branch cannot activate these classes.

### User-observed symptom from staged runs

Observed terminal warning:

```text
[neatlogs] OpenInference package for 'openai' loaded but could not find instrumentor class
```

Observed trace symptoms from staging runs:

| Workflow / example | Symptom |
|---|---|
| `openai_multiagent` | workflow/agent/chain/tool spans present; `LLM=0`; terminal warns OpenInference class not found. |
| `google_genai_multiagent` | workflow/agent/chain/tool spans present; `LLM=0`; dashboard cost `$0`. |
| `reasoning_model_workflow` | multiple providers called; `LLM=0`; dashboard cost `$0`. |

Do not assume these examples are fully validated just because the local runner exits 0. The current known gap is provider-level `LLM` spans.

### Contrast: Mastra + real Azure OpenAI path works

The real-LLM Mastra example described in Section 1.6 (`grouped-workflow-azure.ts`) produced a proper `LLM` span with non-zero cost on the same staging environment. That path uses the dedicated Mastra observability exporter (`@neatlogs/instrumentation-mastra`) and does **not** go through `src/instrumentation/manager.ts:154-189`. This narrows the remaining bug conclusively to the TypeScript SDK OpenInference branch.

---

## 3. Secondary known gap: direct `@google/genai` has no OpenInference package

Independently of the OpenInference activation issue above, the registry entry for `google_genai` is intentionally empty:

```ts
// src/instrumentation/registry.ts:330-335
google_genai: {
  openinference: null,
  openllmetry: null,
  neatlogs: null,
  default_span_kind: 'LLM',
}
```

Source: `src/instrumentation/registry.ts:330-335`.

Observed effect: `instrumentations: ['google_genai']` currently logs a skip path. Gemini calls made through the direct `@google/genai` SDK appear only as raw HTTP/undici `POST` spans; no provider-level `LLM` span is produced. This is consistent with the `$0` cost observed on `google_genai_multiagent` even before Section 2's bug is considered.

---

## 4. Important caveat about Mastra validation

The Mastra grouped workflow validation in `instrumentations` PR #1 used deterministic mock output:

- `packages/js/neatlogs-instrumentation-mastra/examples/grouped-workflow.ts:19` imports `createMockModel`.
- `packages/js/neatlogs-instrumentation-mastra/examples/grouped-workflow.ts:71-78` configures that mock model.

So that specific grouped validation proves:

- direct Mastra observability injection works;
- lifecycle-aware exporter groups parent-child spans;
- verifier catches stale/single-span traces.

It does **not**, on its own, prove the Mastra exporter produces real provider `LLM` spans/tokens/cost. The separate `grouped-workflow-azure.ts` example added during handoff (Section 1.6) covers that case.

---

## 5. Reproduction commands

### Verify current broken OpenInference shape

```bash
cd /code/neatlogs/neatlogs-typescript
git checkout vorflux/typescript-sdk-v3
npm install
npm run build

node - <<'NODE'
(async () => {
  for (const pkg of [
    '@arizeai/openinference-instrumentation-openai',
    '@arizeai/openinference-instrumentation-anthropic',
    '@arizeai/openinference-instrumentation-langchain',
  ]) {
    const mod = await import(pkg);
    const cls = Object.values(mod).find((v) => typeof v === 'function');
    const inst = new cls();
    console.log(pkg);
    console.log('  class:', cls?.name);
    console.log('  prototype.instrument:', typeof cls.prototype.instrument);
    console.log('  instance.instrument:', typeof inst.instrument);
    console.log('  instance.enable:', typeof inst.enable);
    console.log('  instance.setTracerProvider:', typeof inst.setTracerProvider);
  }
})();
NODE
```

### Reproduce the `LLM=0` / `$0` symptom end-to-end

```bash
cd /code/neatlogs/neatlogs-typescript
git checkout vorflux/typescript-sdk-v3
npm install
npm run build
npx tsc --noEmit --skipLibCheck --project examples/tsconfig.json

export NEATLOGS_ENDPOINT="https://ingest.neatlogs.com"
export NEATLOGS_WORKFLOW_PREFIX="local-oi-repro-$(date +%Y%m%d%H%M%S)-"
# Set NEATLOGS_API_KEY and provider keys via local env/secrets; do not commit them.
node scripts/run-original7-examples.mjs --timeout 300000
node scripts/verify-original7-logs.mjs
```

Then inspect `logs/<example>_processed_spans.jsonl` for `openinference.span.kind` values — the bug is observed as zero `LLM` entries for provider-backed examples, and the terminal log contains the `OpenInference package for '...' loaded but could not find instrumentor class` warning.

---

## 6. Staging run artifacts

Workflow names exported to `https://ingest.neatlogs.com` during handoff validation (useful for screenshots and UI inspection):

| Workflow name | Example / source | Observation |
|---|---|---|
| `local-ts-20260505173608-*` (7 entries) | original 7 TS examples, first batch | all passed runner; `LLM=0` across the board |
| `local-20260505180742-blog_creation_workflow` | `google_genai_multiagent` rerun | 11 spans, 50.1s, `$0` cost |
| `local-20260505180742-reasoning_verification_workflow` | `reasoning_model_workflow` rerun | 16 spans across 4 providers, `$0` cost |
| `local-20260505181437-*` | `openai_multiagent` rerun | 137 spans, `LLM=0`, OpenInference warning in terminal log |
| `local-mastra-grouped-20260505175451` | Mastra grouped (mock model) | 8 spans, grouped parent-child, verifier PASS |
| `local-mastra-azure-20260505180150` | Mastra grouped + real Azure OpenAI (`gpt-5-nano`) | 9 spans, `$0.00046` cost, `Slow LLM Response` detection — confirms Mastra path healthy |

These workflow names can be searched on the staging dashboard for the reviewer to confirm the symptoms independently.
