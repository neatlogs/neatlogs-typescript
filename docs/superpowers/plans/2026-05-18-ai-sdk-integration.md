# Vercel AI SDK Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vercel AI SDK integration to the Neatlogs TypeScript SDK via a new `@neatlogs/instrumentation-ai-sdk` package and a small set of additive edits to the SDK's normalization pipeline.

**Architecture:** Ship a `wrapAISDK(ai)` function (no monkey-patching) that opens a parent neatlogs span and enables `experimental_telemetry` per call site. AI SDK's native OTel spans nest under our parent and flow through the existing `NeatlogsSpanProcessor` pipeline. New attribute extractor in `UnifiedAttributeProcessor.normalizeConventions` maps `ai.*` attributes to the canonical `llm.*` / `gen_ai.*` namespace. Mirrors the shape of the existing `@neatlogs/instrumentation-mastra` integration.

**Tech Stack:** TypeScript 5.7, OpenTelemetry JS API, Vitest, dual ESM/CJS build via `tsc -p tsconfig.{esm,cjs}.json`, peer dep `ai` (Vercel AI SDK).

**Spec:** [docs/superpowers/specs/2026-05-18-ai-sdk-integration-design.md](../specs/2026-05-18-ai-sdk-integration-design.md)

**Branches (already cut):**
- `neatlogs-typescript`: `vorflux/ai-sdk-instrumentation`
- `instrumentations`: `vorflux/ai-sdk-instrumentation`

**Repo paths used in this plan:**
- `TS_REPO = /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript`
- `INSTR_REPO = /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations`

**Reference files** (read before starting; do not modify unless the task says so):
- `INSTR_REPO/packages/js/neatlogs-instrumentation-mastra/` — package this plan mirrors
- `TS_REPO/src/mastra.ts` — shim pattern to mirror in `src/ai-sdk.ts`
- `TS_REPO/src/core/attribute-processor.ts:216` — `normalizeConventions` dispatch point
- `TS_REPO/src/core/instrumentation-scope-parser.ts:26` — `SCOPE_PATTERNS` table
- `TS_REPO/src/core/span-processor.ts:126` — LLM-name regex (verifies AI SDK spans match without changes)

**Important constraints:**
- Do NOT touch existing Mastra-related code, Mastra examples, or any other instrumentor.
- Do NOT modify the working tree files left over from `vorflux/typescript-sdk-v3` (`examples/sdk_examples/mastra_complex/main.ts`, `examples/sdk_examples/mastra_multiagent/main.ts`, `package.json`, `package-lock.json` in the TS repo; `packages/js/neatlogs-instrumentation-mastra/package.json`, `packages/js/pnpm-lock.yaml` in instrumentations). Leave them as-is. They are unrelated to this work.
- Every commit message ends with `\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- Use `git add <specific paths>`, never `git add .` or `git add -A`.

---

## File Structure

### Files created in `INSTR_REPO`

```
packages/js/neatlogs-instrumentation-ai-sdk/
├── package.json
├── tsconfig.esm.json
├── tsconfig.cjs.json
├── README.md
├── LICENSE
├── src/
│   ├── index.ts          # public exports
│   ├── wrap.ts           # wrapAISDK
│   ├── telemetry.ts      # createAITelemetry
│   └── span-attrs.ts     # parent-span attribute helpers
├── examples/
│   └── basic.ts
└── test/
    ├── wrap.test.ts
    └── telemetry.test.ts
```

### Files created in `TS_REPO`

```
src/ai-sdk.ts                                  # shim mirroring src/mastra.ts
examples/sdk_examples/ai_sdk_basic/main.ts     # runnable example
tests/integration/ai-sdk-attributes.test.ts    # attribute-mapping golden test
```

### Files modified in `TS_REPO`

| File | Section/lines | Change |
|------|---------------|--------|
| `src/index.ts` | after line 51 (`getMastraObservability` export) | Add `getAISDKWrapper` export |
| `src/core/instrumentation-scope-parser.ts` | `SCOPE_PATTERNS` constant | Add `'ai'` and `'@neatlogs/instrumentation-ai-sdk'` entries; add `vercel`/`ai-sdk` substring rules to fuzzy fallback |
| `src/core/attribute-processor.ts` | `normalizeConventions` (line 216) | Add `extractVercelAiSdkAttrs(attrs)` call after `extractLangchainMetadata`. New private method at end of class |
| `src/config/attribute-mapping.json` | token-count `sources` arrays | Add `ai.usage.promptTokens` / `ai.usage.completionTokens` / `ai.usage.totalTokens` |
| `src/instrumentation/registry.ts` | `tags.agent`, `tags.llm`, `libraries` | Add `ai_sdk` entry |

---

## Task 0: Verify branches and clean working tree intent

**Files:** None. This is a sanity check before any code work.

- [ ] **Step 1: Verify TS repo branch and working tree**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git branch --show-current && git status --short
```

Expected output:
```
vorflux/ai-sdk-instrumentation
 M examples/sdk_examples/mastra_complex/main.ts
 M examples/sdk_examples/mastra_multiagent/main.ts
 M package-lock.json
 M package.json
```

If the branch is wrong, abort and report. If extra modified files appear, abort and report — do not stash, the user wants those preserved.

- [ ] **Step 2: Verify instrumentations repo branch and working tree**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations && git branch --show-current && git status --short
```

Expected output:
```
vorflux/ai-sdk-instrumentation
 M packages/js/neatlogs-instrumentation-mastra/package.json
 M packages/js/pnpm-lock.yaml
```

Same abort rules apply.

- [ ] **Step 3: Confirm spec is committed**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git log --oneline -1 docs/superpowers/specs/2026-05-18-ai-sdk-integration-design.md
```

Expected: one line showing commit `7862dd3` (or later).

---

## Task 1: Scaffold the `@neatlogs/instrumentation-ai-sdk` package

**Files:**
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/package.json`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/tsconfig.esm.json`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/tsconfig.cjs.json`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/LICENSE`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/.gitignore`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts`

- [ ] **Step 1: Create package.json**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/package.json`

```json
{
  "name": "@neatlogs/instrumentation-ai-sdk",
  "version": "0.1.0",
  "description": "Neatlogs instrumentation for the Vercel AI SDK (ai package)",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/esm/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/esm/index.d.ts",
        "default": "./dist/esm/index.js"
      },
      "require": {
        "types": "./dist/cjs/index.d.ts",
        "default": "./dist/cjs/index.js"
      }
    }
  },
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "npm run build:esm && npm run build:cjs",
    "build:esm": "tsc -p tsconfig.esm.json && echo '{\"type\":\"module\"}' > dist/esm/package.json",
    "build:cjs": "tsc -p tsconfig.cjs.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit"
  },
  "keywords": [
    "opentelemetry",
    "instrumentation",
    "vercel-ai-sdk",
    "ai-sdk",
    "ai",
    "neatlogs",
    "tracing"
  ],
  "license": "MIT",
  "dependencies": {
    "@opentelemetry/api": "^1.9.0"
  },
  "peerDependencies": {
    "ai": ">=3 <7"
  },
  "peerDependenciesMeta": {
    "ai": {
      "optional": true
    }
  },
  "devDependencies": {
    "@opentelemetry/sdk-trace-base": "^1.30.0",
    "@opentelemetry/sdk-trace-node": "^1.30.0",
    "@types/node": "^25.8.0",
    "tsx": "^4.21.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.esm.json**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/tsconfig.esm.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist/esm",
    "module": "ES2022",
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create tsconfig.cjs.json**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/tsconfig.cjs.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist/cjs",
    "module": "CommonJS",
    "moduleResolution": "Node"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 4: Create LICENSE**

Copy from the Mastra package:
```bash
cp /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-mastra/LICENSE /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk/LICENSE
```

- [ ] **Step 5: Create .gitignore**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/.gitignore`

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 6: Create placeholder src/index.ts so build passes**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts`

```typescript
// Public API exports — implementations land in subsequent tasks.
export const __scaffolded = true;
```

- [ ] **Step 7: Install deps and verify build**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js && pnpm install --filter @neatlogs/instrumentation-ai-sdk
```

Expected: install succeeds, no errors. (The pnpm workspace is set up at `INSTR_REPO/packages/js/pnpm-workspace.yaml`.)

Then:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm run build
```

Expected: `dist/esm/index.js`, `dist/cjs/index.js`, `dist/esm/index.d.ts`, `dist/cjs/index.d.ts` exist.

- [ ] **Step 8: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations && git add packages/js/neatlogs-instrumentation-ai-sdk/package.json packages/js/neatlogs-instrumentation-ai-sdk/tsconfig.esm.json packages/js/neatlogs-instrumentation-ai-sdk/tsconfig.cjs.json packages/js/neatlogs-instrumentation-ai-sdk/LICENSE packages/js/neatlogs-instrumentation-ai-sdk/.gitignore packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts && git commit -m "$(cat <<'EOF'
feat(ai-sdk): scaffold @neatlogs/instrumentation-ai-sdk package

Mirrors the structure of @neatlogs/instrumentation-mastra: dual
ESM/CJS build via tsc, optional peer dep on ai >=3 <7, vitest for
tests. No runtime exports yet — wrapAISDK and createAITelemetry
land in subsequent commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `createAITelemetry` — the lower-level escape hatch (TDD)

This is built before `wrapAISDK` because it's smaller, has no dependency on `wrapAISDK`, and `wrapAISDK` will use it internally.

**Files:**
- Test: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/test/telemetry.test.ts`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/telemetry.ts`
- Modify: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts`

- [ ] **Step 1: Write failing tests**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/test/telemetry.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { trace, NoopTracerProvider } from '@opentelemetry/api';
import { createAITelemetry } from '../src/telemetry.js';

describe('createAITelemetry', () => {
  it('returns an object with isEnabled, recordInputs, recordOutputs and a tracer', () => {
    const telemetry = createAITelemetry();
    expect(telemetry.isEnabled).toBe(true);
    expect(telemetry.recordInputs).toBe(true);
    expect(telemetry.recordOutputs).toBe(true);
    expect(typeof telemetry.tracer).toBe('object');
    expect(telemetry.tracer).not.toBeNull();
  });

  it('uses the global tracer provider', () => {
    const tracer = trace.getTracer('neatlogs.ai-sdk');
    const telemetry = createAITelemetry();
    // both should be tracers from the same provider — startSpan should exist
    expect(typeof telemetry.tracer.startSpan).toBe('function');
  });

  it('attaches metadata when provided', () => {
    const telemetry = createAITelemetry({ metadata: { userId: 'u-123' } });
    expect(telemetry.metadata).toEqual({ userId: 'u-123', neatlogsWrapped: true });
  });

  it('always sets neatlogsWrapped: true even without user metadata', () => {
    const telemetry = createAITelemetry();
    expect(telemetry.metadata).toEqual({ neatlogsWrapped: true });
  });

  it('user metadata cannot override neatlogsWrapped flag', () => {
    const telemetry = createAITelemetry({ metadata: { neatlogsWrapped: false as any } });
    expect(telemetry.metadata?.neatlogsWrapped).toBe(true);
  });

  it('does not include metadata field as undefined when no metadata given', () => {
    const telemetry = createAITelemetry();
    // metadata always exists (because of neatlogsWrapped flag), so it must be an object
    expect(telemetry.metadata).toBeDefined();
    expect(typeof telemetry.metadata).toBe('object');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm test
```

Expected: All 6 tests fail with "Cannot find module '../src/telemetry.js'" or similar.

- [ ] **Step 3: Implement createAITelemetry**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/telemetry.ts`

```typescript
import { trace, type Tracer } from '@opentelemetry/api';

/**
 * Options for {@link createAITelemetry}.
 */
export interface CreateAITelemetryOptions {
  /** Custom metadata to attach to every span emitted from this telemetry config. */
  metadata?: Record<string, unknown>;
}

/**
 * Telemetry config object compatible with the Vercel AI SDK's
 * `experimental_telemetry` option. Spread it onto any `generateText` /
 * `streamText` / `generateObject` / `streamObject` call to enable Neatlogs
 * tracing for that call:
 *
 *   await generateText({
 *     model: openai('gpt-4o'),
 *     prompt: 'Hello',
 *     experimental_telemetry: createAITelemetry(),
 *   });
 *
 * Requires `neatlogs.init()` to have been called first so that a global
 * TracerProvider is registered.
 */
export interface AITelemetryConfig {
  isEnabled: true;
  recordInputs: true;
  recordOutputs: true;
  tracer: Tracer;
  metadata: Record<string, unknown>;
}

const TRACER_NAME = 'neatlogs.ai-sdk';

export function createAITelemetry(
  opts: CreateAITelemetryOptions = {},
): AITelemetryConfig {
  const userMeta = opts.metadata ?? {};
  const metadata: Record<string, unknown> = {
    ...userMeta,
    neatlogsWrapped: true,
  };

  return {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    tracer: trace.getTracer(TRACER_NAME),
    metadata,
  };
}
```

- [ ] **Step 4: Re-export from index.ts**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts`

```typescript
export { createAITelemetry } from './telemetry.js';
export type { AITelemetryConfig, CreateAITelemetryOptions } from './telemetry.js';
```

- [ ] **Step 5: Run tests — verify they pass**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm test
```

Expected: All 6 tests pass.

- [ ] **Step 6: Verify build**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm run build
```

Expected: build succeeds, no TS errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations && git add packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts packages/js/neatlogs-instrumentation-ai-sdk/src/telemetry.ts packages/js/neatlogs-instrumentation-ai-sdk/test/telemetry.test.ts && git commit -m "$(cat <<'EOF'
feat(ai-sdk): add createAITelemetry escape hatch

Returns a ready-to-spread experimental_telemetry config compatible
with the Vercel AI SDK. Always sets neatlogsWrapped: true on metadata
so downstream span processors can identify Neatlogs-managed spans.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `wrapAISDK` — function wrapping for `generateText` family (TDD)

Wrap the four core functions only in this task: `generateText`, `streamText`, `generateObject`, `streamObject`. `Experimental_Agent` and `Agent` are deferred to Task 4.

**Files:**
- Test: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/test/wrap.test.ts`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/span-attrs.ts`
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/wrap.ts`
- Modify: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts`

- [ ] **Step 1: Write failing tests**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/test/wrap.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { wrapAISDK } from '../src/wrap.js';

describe('wrapAISDK', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
  });

  it('returns the same shape as input ai module', () => {
    const fakeAi = {
      generateText: async (_o: any) => ({ text: 'ok' }),
      streamText: (_o: any) => ({ textStream: [] }),
      generateObject: async (_o: any) => ({ object: {} }),
      streamObject: (_o: any) => ({ partialObjectStream: [] }),
      someUnknownExport: 'passthrough',
    };
    const wrapped = wrapAISDK(fakeAi as any);
    expect(typeof wrapped.generateText).toBe('function');
    expect(typeof wrapped.streamText).toBe('function');
    expect(typeof wrapped.generateObject).toBe('function');
    expect(typeof wrapped.streamObject).toBe('function');
    expect((wrapped as any).someUnknownExport).toBe('passthrough');
  });

  it('opens a parent span around generateText', async () => {
    const fakeAi = {
      generateText: async (opts: any) => {
        // assert that experimental_telemetry was injected
        expect(opts.experimental_telemetry?.isEnabled).toBe(true);
        return { text: 'hello' };
      },
    };
    const wrapped = wrapAISDK(fakeAi as any);
    const result = await wrapped.generateText({ model: 'fake', prompt: 'hi' });
    expect(result.text).toBe('hello');

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].name).toBe('ai.generateText');
    expect(spans[0].attributes['openinference.span.kind']).toBe('LLM');
    expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);
  });

  it('preserves user-supplied metadata while forcing neatlogsWrapped: true', async () => {
    let capturedTelemetry: any = null;
    const fakeAi = {
      generateText: async (opts: any) => {
        capturedTelemetry = opts.experimental_telemetry;
        return { text: 'hello' };
      },
    };
    const wrapped = wrapAISDK(fakeAi as any);
    await wrapped.generateText({
      model: 'fake',
      prompt: 'hi',
      experimental_telemetry: {
        metadata: { userId: 'u-7', neatlogsWrapped: false },
      },
    } as any);
    expect(capturedTelemetry.metadata.userId).toBe('u-7');
    expect(capturedTelemetry.metadata.neatlogsWrapped).toBe(true);
    expect(capturedTelemetry.isEnabled).toBe(true);
  });

  it('records exceptions and rethrows', async () => {
    const fakeAi = {
      generateText: async (_opts: any) => {
        throw new Error('boom');
      },
    };
    const wrapped = wrapAISDK(fakeAi as any);
    await expect(wrapped.generateText({ model: 'fake', prompt: 'hi' })).rejects.toThrow('boom');

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe('boom');
  });

  it('captures input.value and output.value on the parent span', async () => {
    const fakeAi = {
      generateText: async (_opts: any) => ({ text: 'response-text' }),
    };
    const wrapped = wrapAISDK(fakeAi as any);
    await wrapped.generateText({ model: 'fake', prompt: 'question?' });

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    const inputJson = spans[0].attributes['input.value'] as string;
    const outputJson = spans[0].attributes['output.value'] as string;
    expect(JSON.parse(inputJson).prompt).toBe('question?');
    expect(JSON.parse(outputJson).text).toBe('response-text');
  });

  it('streamText returns the underlying object synchronously', () => {
    const fakeStream = { textStream: ['a', 'b', 'c'] };
    const fakeAi = {
      streamText: (opts: any) => {
        expect(opts.experimental_telemetry?.isEnabled).toBe(true);
        return fakeStream;
      },
    };
    const wrapped = wrapAISDK(fakeAi as any);
    const result = wrapped.streamText({ model: 'fake', prompt: 'hi' });
    // streamText is sync — the wrapper still must return synchronously
    expect(result).toBe(fakeStream);

    // span ends immediately for streamText (best-effort — full stream lifecycle is out of scope)
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].name).toBe('ai.streamText');
  });

  it('does nothing when called on an ai module missing all known functions', () => {
    const fakeAi = { irrelevant: 'noop' };
    const wrapped = wrapAISDK(fakeAi as any);
    expect((wrapped as any).irrelevant).toBe('noop');
    // no spans because nothing was called
    expect(exporter.getFinishedSpans().length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm test
```

Expected: 8 new tests fail with "Cannot find module '../src/wrap.js'".

- [ ] **Step 3: Implement span-attrs helper**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/span-attrs.ts`

```typescript
import type { Span } from '@opentelemetry/api';

/**
 * Safely JSON.stringify an arbitrary value. Returns the empty string on failure.
 */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Set input.value on the parent span, redacting only if the value cannot be
 * serialized. Mirrors how the Mastra exporter records input/output snapshots.
 */
export function setInputValue(span: Span, opts: Record<string, unknown>): void {
  const stringified = safeStringify(opts);
  if (stringified) {
    span.setAttribute('input.value', stringified);
  }
}

/**
 * Set output.value on the parent span. Skips when the result cannot be
 * serialized (e.g., an AsyncIterable from streamText).
 */
export function setOutputValue(span: Span, result: unknown): void {
  const stringified = safeStringify(result);
  if (stringified) {
    span.setAttribute('output.value', stringified);
  }
}
```

- [ ] **Step 4: Implement wrap.ts**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/wrap.ts`

```typescript
import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import { createAITelemetry, type AITelemetryConfig } from './telemetry.js';
import { setInputValue, setOutputValue } from './span-attrs.js';

const TRACER_NAME = 'neatlogs.ai-sdk';

/**
 * Names of AI SDK exports we wrap with neatlogs parent spans. Anything not in
 * this list is passed through unchanged.
 */
type WrappedFunctionName = 'generateText' | 'streamText' | 'generateObject' | 'streamObject';

const WRAPPED_FUNCTIONS: readonly WrappedFunctionName[] = [
  'generateText',
  'streamText',
  'generateObject',
  'streamObject',
] as const;

/**
 * Wrap the user's `import * as ai from 'ai'` namespace so that every
 * `generateText` / `streamText` / `generateObject` / `streamObject` call:
 *
 *   1. Opens a parent OTel span on the active TracerProvider.
 *   2. Forces `experimental_telemetry: { isEnabled: true, ... }` for the call,
 *      merging user-supplied metadata.
 *   3. Records input/output on the parent span and propagates errors.
 *
 * Other exports (Agent, Experimental_Agent, helpers, types) are passed through
 * unchanged in this version. Agent wrapping lands in a follow-up.
 */
export function wrapAISDK<T extends Record<string, unknown>>(aiModule: T): T {
  const wrapped: Record<string, unknown> = { ...aiModule };

  for (const name of WRAPPED_FUNCTIONS) {
    const original = aiModule[name];
    if (typeof original !== 'function') continue;

    if (name === 'streamText' || name === 'streamObject') {
      wrapped[name] = createSyncWrapper(name, original as (opts: any) => unknown);
    } else {
      wrapped[name] = createAsyncWrapper(name, original as (opts: any) => Promise<unknown>);
    }
  }

  return wrapped as T;
}

/**
 * Create an async wrapper for generateText/generateObject. Opens a parent span,
 * awaits the original, records output, and ends the span.
 */
function createAsyncWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => Promise<unknown>,
): (opts: any) => Promise<unknown> {
  return async function wrappedAsyncFn(opts: any): Promise<unknown> {
    const tracer = trace.getTracer(TRACER_NAME);
    return tracer.startActiveSpan(`ai.${name}`, { attributes: { 'openinference.span.kind': 'LLM' } }, async (span) => {
      try {
        setInputValue(span, opts);
        const merged = mergeTelemetry(opts);
        const result = await original(merged);
        setOutputValue(span, result);
        return result;
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    });
  };
}

/**
 * Create a sync wrapper for streamText/streamObject. Opens a parent span,
 * calls the original synchronously, records the returned object, and ends the
 * span. Best-effort: the stream's full lifecycle is not awaited (the AI SDK
 * emits per-stream child spans on the same context, so the parent is short
 * but child spans correctly reference it).
 */
function createSyncWrapper(
  name: WrappedFunctionName,
  original: (opts: any) => unknown,
): (opts: any) => unknown {
  return function wrappedSyncFn(opts: any): unknown {
    const tracer = trace.getTracer(TRACER_NAME);
    return tracer.startActiveSpan(`ai.${name}`, { attributes: { 'openinference.span.kind': 'LLM' } }, (span) => {
      try {
        setInputValue(span, opts);
        const merged = mergeTelemetry(opts);
        const result = original(merged);
        // Don't try to JSON.stringify a stream — leave output.value unset
        return result;
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    });
  };
}

/**
 * Merge the user's experimental_telemetry config (if any) with our defaults,
 * forcing isEnabled: true and neatlogsWrapped: true.
 */
function mergeTelemetry(opts: any): any {
  const baseTelemetry: AITelemetryConfig = createAITelemetry({
    metadata: opts?.experimental_telemetry?.metadata,
  });
  return {
    ...opts,
    experimental_telemetry: {
      ...opts?.experimental_telemetry,
      ...baseTelemetry,
      // mergeTelemetry must always end with our base values — spread again to win
      metadata: baseTelemetry.metadata,
    },
  };
}

/**
 * Set ERROR status on the span and record the exception.
 */
function recordSpanError(span: Span, err: unknown): void {
  if (err instanceof Error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.recordException(err);
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  }
}
```

- [ ] **Step 5: Re-export wrapAISDK from index.ts**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts`

```typescript
export { createAITelemetry } from './telemetry.js';
export type { AITelemetryConfig, CreateAITelemetryOptions } from './telemetry.js';
export { wrapAISDK } from './wrap.js';
```

- [ ] **Step 6: Run tests — verify they pass**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm test
```

Expected: All 14 tests pass (6 telemetry + 8 wrap).

- [ ] **Step 7: Verify build**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations && git add packages/js/neatlogs-instrumentation-ai-sdk/src/wrap.ts packages/js/neatlogs-instrumentation-ai-sdk/src/span-attrs.ts packages/js/neatlogs-instrumentation-ai-sdk/src/index.ts packages/js/neatlogs-instrumentation-ai-sdk/test/wrap.test.ts && git commit -m "$(cat <<'EOF'
feat(ai-sdk): add wrapAISDK for generateText/streamText/generateObject/streamObject

Each wrapped function opens a neatlogs parent span (kind=LLM), forces
experimental_telemetry on, captures input/output on the parent, and
propagates errors. Async functions await; stream functions wrap synchronously.
Other ai exports pass through unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `@neatlogs/instrumentation-ai-sdk` README

**Files:**
- Create: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/README.md`

- [ ] **Step 1: Write the README**

Path: `INSTR_REPO/packages/js/neatlogs-instrumentation-ai-sdk/README.md`

````markdown
# @neatlogs/instrumentation-ai-sdk

Neatlogs instrumentation for the [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` package).

Wraps `generateText`, `streamText`, `generateObject`, and `streamObject` so that every call produces a Neatlogs trace with full input/output capture, token counts, model name, and tool-call attribution — without monkey-patching the `ai` package.

## How It Works

The `ai` package emits OpenTelemetry spans natively when `experimental_telemetry` is enabled. This package's `wrapAISDK(ai)` helper:

1. Opens a parent OTel span on the active `TracerProvider` (set by `neatlogs.init()`).
2. Forces `experimental_telemetry: { isEnabled: true, ... }` for the call.
3. Captures the call's input options and result on the parent span.
4. Propagates errors with `SpanStatusCode.ERROR`.

Native AI SDK child spans (`ai.doGenerate`, `ai.toolCall`) nest under the parent automatically. The Neatlogs SDK's normalization pipeline maps `ai.*` attributes to the canonical `neatlogs.*` namespace.

## Installation

```bash
npm install @neatlogs/instrumentation-ai-sdk ai
# or
pnpm add @neatlogs/instrumentation-ai-sdk ai
```

`ai` is an optional peer dependency; install it only if you use `wrapAISDK`.

## Usage

### Recommended: `wrapAISDK`

```typescript
import { init, flush, shutdown } from 'neatlogs';
import { wrapAISDK } from '@neatlogs/instrumentation-ai-sdk';
import * as ai from 'ai';
import { openai } from '@ai-sdk/openai';

await init({
  apiKey: process.env.NEATLOGS_API_KEY,
  workflowName: 'ai-sdk-demo',
});

const { generateText, streamText } = wrapAISDK(ai);

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'What is the capital of France?',
});

console.log(text);

await flush();
await shutdown();
```

### Lower-level: `createAITelemetry`

When you want to set telemetry per call without wrapping the whole module:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createAITelemetry } from '@neatlogs/instrumentation-ai-sdk';

await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Hello',
  experimental_telemetry: createAITelemetry({ metadata: { userId: 'u-123' } }),
});
```

## Captured Attributes

The Vercel AI SDK emits attributes under the `ai.*` namespace; the Neatlogs SDK's `UnifiedAttributeProcessor` maps these to `neatlogs.*`:

| AI SDK attribute | Neatlogs attribute |
|------------------|-------------------|
| `ai.model.id` | `neatlogs.llm.model_name` |
| `ai.usage.promptTokens` | `neatlogs.llm.token_count.prompt` |
| `ai.usage.completionTokens` | `neatlogs.llm.token_count.completion` |
| `ai.prompt.messages` | `neatlogs.llm.input_messages.{i}.{role,content}` |
| `ai.response.text` | `neatlogs.llm.output_messages.0.content` |
| `ai.response.toolCalls` | `neatlogs.llm.output_messages.0.tool_calls.{i}.*` |
| `ai.toolCall.name` / `args` / `result` | `tool.name` / `input.value` / `output.value` |

## Compatibility

- AI SDK v3, v4, v5, v6 (peer dependency: `"ai": ">=3 <7"`)
- Node.js 18+
- ESM and CJS

## License

MIT
````

- [ ] **Step 2: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations && git add packages/js/neatlogs-instrumentation-ai-sdk/README.md && git commit -m "$(cat <<'EOF'
docs(ai-sdk): add README for @neatlogs/instrumentation-ai-sdk

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TS SDK — scope-parser entry for AI SDK (TDD)

**Files:**
- Test: `TS_REPO/tests/unit/instrumentation-scope-parser.test.ts` (modify; create only if absent)
- Modify: `TS_REPO/src/core/instrumentation-scope-parser.ts`

- [ ] **Step 1: Check if scope-parser test exists**

Run:
```bash
ls /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript/tests/unit/instrumentation-scope-parser.test.ts 2>&1 || echo "absent"
```

If the file exists, append the new tests below; if it prints `absent`, create the full file.

- [ ] **Step 2: Write failing test**

If the file exists, add this `describe` block to it. If not, create the file with this content:

Path: `TS_REPO/tests/unit/instrumentation-scope-parser.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseInstrumentationScope,
  enrichWithScopeDetection,
} from '../../src/core/instrumentation-scope-parser.js';

describe('parseInstrumentationScope — Vercel AI SDK', () => {
  it('recognizes the bare "ai" scope name', () => {
    const info = parseInstrumentationScope('ai');
    expect(info.framework).toBe('ai_sdk');
  });

  it('recognizes @neatlogs/instrumentation-ai-sdk scope', () => {
    const info = parseInstrumentationScope('@neatlogs/instrumentation-ai-sdk');
    expect(info.framework).toBe('ai_sdk');
  });

  it('catches versioned ai scope via prefix match', () => {
    const info = parseInstrumentationScope('ai.v3');
    expect(info.framework).toBe('ai_sdk');
  });

  it('catches "vercel-ai" via fuzzy fallback', () => {
    const info = parseInstrumentationScope('vercel-ai-tracer');
    expect(info.framework).toBe('ai_sdk');
  });
});

describe('enrichWithScopeDetection — Vercel AI SDK', () => {
  it('sets neatlogs.framework=ai_sdk for "ai" scope', () => {
    const attrs: Record<string, any> = {};
    enrichWithScopeDetection(attrs, 'ai');
    expect(attrs['neatlogs.framework']).toBe('ai_sdk');
    expect(attrs['neatlogs.instrumentation.name']).toBe('ai');
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run tests/unit/instrumentation-scope-parser.test.ts
```

Expected: 5 failures saying `framework` is `undefined`.

- [ ] **Step 4: Add scope entries**

Edit `TS_REPO/src/core/instrumentation-scope-parser.ts`. Locate the `SCOPE_PATTERNS` declaration (line 26) and add the two new entries inside the "Neatlogs custom instrumentations" group, immediately after the `'@neatlogs/instrumentation-mastra'` entry:

Old text in `SCOPE_PATTERNS` (the Neatlogs section, lines 27-29):
```typescript
  // Neatlogs custom instrumentations
  '@neatlogs/instrumentation-google-genai': { provider: 'google', framework: 'google_genai' },
  '@neatlogs/instrumentation-mastra': { framework: 'mastra' },
```

Replace with:
```typescript
  // Neatlogs custom instrumentations
  '@neatlogs/instrumentation-google-genai': { provider: 'google', framework: 'google_genai' },
  '@neatlogs/instrumentation-mastra': { framework: 'mastra' },
  '@neatlogs/instrumentation-ai-sdk': { framework: 'ai_sdk' },

  // Vercel AI SDK native scope (the `ai` package emits this directly)
  ai: { framework: 'ai_sdk' },
```

Then locate the fuzzy-extraction block (around line 144, starts with `// Check for framework indicators`). Add a clause for ai-sdk **before** the existing checks, since "ai" would match other patterns. Specifically, find this block:

Old text:
```typescript
  // Check for framework indicators
  if (scopeLower.includes('langchain')) {
    result.framework = 'langchain';
  } else if (scopeLower.includes('llama') || scopeLower.includes('llamaindex')) {
    result.framework = 'llamaindex';
  } else if (scopeLower.includes('crewai') || scopeLower.includes('crew')) {
    result.framework = 'crewai';
  } else if (scopeLower.includes('haystack')) {
    result.framework = 'haystack';
  } else if (scopeLower.includes('dspy')) {
    result.framework = 'dspy';
  }
```

Replace with:
```typescript
  // Check for framework indicators
  if (scopeLower.includes('langchain')) {
    result.framework = 'langchain';
  } else if (scopeLower.includes('llama') || scopeLower.includes('llamaindex')) {
    result.framework = 'llamaindex';
  } else if (scopeLower.includes('crewai') || scopeLower.includes('crew')) {
    result.framework = 'crewai';
  } else if (scopeLower.includes('haystack')) {
    result.framework = 'haystack';
  } else if (scopeLower.includes('dspy')) {
    result.framework = 'dspy';
  } else if (scopeLower.includes('vercel-ai') || scopeLower.includes('ai-sdk')) {
    result.framework = 'ai_sdk';
  }
```

- [ ] **Step 5: Run tests — verify they pass**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run tests/unit/instrumentation-scope-parser.test.ts
```

Expected: All 5 new tests pass. Existing tests in the file (if any) still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git add src/core/instrumentation-scope-parser.ts tests/unit/instrumentation-scope-parser.test.ts && git commit -m "$(cat <<'EOF'
feat(ai-sdk): add Vercel AI SDK scope detection

Adds 'ai' (the AI SDK's native tracer name) and
'@neatlogs/instrumentation-ai-sdk' to SCOPE_PATTERNS so
neatlogs.framework=ai_sdk is set on incoming spans. Adds
'vercel-ai'/'ai-sdk' substring rules to the fuzzy fallback for
versioned scope names.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: TS SDK — `extractVercelAiSdkAttrs` in attribute processor (TDD)

This is the heaviest task. It maps `ai.*` attributes to canonical `llm.*` / `gen_ai.*` keys in `UnifiedAttributeProcessor`. Existing pipeline does the rest.

**Files:**
- Test: `TS_REPO/tests/integration/ai-sdk-attributes.test.ts` (new)
- Modify: `TS_REPO/src/core/attribute-processor.ts`

- [ ] **Step 1: Write failing tests**

Path: `TS_REPO/tests/integration/ai-sdk-attributes.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { UnifiedAttributeProcessor, type SpanDict } from '../../src/core/attribute-processor.js';
import { AttributeMapper } from '../../src/config/attribute-mapper.js';

const mapper = new AttributeMapper();

function processSpan(spanDict: SpanDict): Record<string, any> {
  return new UnifiedAttributeProcessor(mapper, false).normalize(spanDict);
}

function makeAiSdkSpan(name: string, attrs: Record<string, any>): SpanDict {
  return {
    name,
    kind: 1,
    trace_id: '0'.repeat(32),
    span_id: '0'.repeat(16),
    start_time: 0,
    end_time: 1_000_000_000,
    status: { code: 0, message: '' },
    attributes: attrs,
    resource: {},
    instrumentation_scope: { name: 'ai' },
    events: [],
  };
}

describe('Vercel AI SDK attribute extraction', () => {
  it('maps ai.model.id to llm.model_name and neatlogs.llm.model_name', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.model.provider': 'openai.chat',
      }),
    );
    expect(out['neatlogs.llm.model_name']).toBe('gpt-4o-mini');
    expect(out['neatlogs.llm.provider']).toBe('openai');
  });

  it('maps ai.usage.* tokens', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.usage.promptTokens': 42,
        'ai.usage.completionTokens': 17,
        'ai.usage.totalTokens': 59,
      }),
    );
    expect(out['neatlogs.llm.token_count.prompt']).toBe(42);
    expect(out['neatlogs.llm.token_count.completion']).toBe(17);
    expect(out['neatlogs.llm.token_count.total']).toBe(59);
  });

  it('explodes ai.prompt.messages into indexed input messages', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.prompt.messages': JSON.stringify([
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ]),
      }),
    );
    expect(out['neatlogs.llm.input_messages.0.role']).toBe('system');
    expect(out['neatlogs.llm.input_messages.0.content']).toBe('You are helpful.');
    expect(out['neatlogs.llm.input_messages.1.role']).toBe('user');
    expect(out['neatlogs.llm.input_messages.1.content']).toBe('Hello');
  });

  it('captures ai.response.text as output message 0 with assistant role', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.response.text': 'Hi there!',
      }),
    );
    expect(out['neatlogs.llm.output_messages.0.role']).toBe('assistant');
    expect(out['neatlogs.llm.output_messages.0.content']).toBe('Hi there!');
  });

  it('infers LLM kind for ai.generateText spans without explicit openinference.span.kind', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
      }),
    );
    expect(out['neatlogs.span.kind']).toBe('llm');
  });

  it('infers TOOL kind for ai.toolCall spans', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.toolCall', {
        'ai.toolCall.name': 'getWeather',
        'ai.toolCall.args': JSON.stringify({ location: 'SF' }),
        'ai.toolCall.result': JSON.stringify({ temperature: 72 }),
      }),
    );
    expect(out['neatlogs.span.kind']).toBe('tool');
  });

  it('maps ai.toolCall.{name,args,result} to neatlogs tool span attrs', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.toolCall', {
        'ai.toolCall.name': 'getWeather',
        'ai.toolCall.args': JSON.stringify({ location: 'SF' }),
        'ai.toolCall.result': JSON.stringify({ temperature: 72 }),
      }),
    );
    expect(out['neatlogs.tool.name']).toBe('getWeather');
    expect(out['neatlogs.input.value']).toContain('SF');
    expect(out['neatlogs.output.value']).toContain('72');
  });

  it('maps ai.settings.* to gen_ai.request.*', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.generateText.doGenerate', {
        'ai.model.id': 'gpt-4o-mini',
        'ai.settings.temperature': 0.7,
        'ai.settings.maxTokens': 256,
        'ai.settings.topP': 0.95,
      }),
    );
    expect(out['neatlogs.llm.temperature']).toBe(0.7);
    expect(out['neatlogs.llm.max_tokens']).toBe(256);
    expect(out['neatlogs.llm.top_p']).toBe(0.95);
  });

  it('infers EMBEDDING kind for ai.embed spans', () => {
    const out = processSpan(
      makeAiSdkSpan('ai.embed', {
        'ai.model.id': 'text-embedding-3-small',
      }),
    );
    expect(out['neatlogs.span.kind']).toBe('embedding');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run tests/integration/ai-sdk-attributes.test.ts
```

Expected: 9 failures (assertions about missing keys / unset span kinds).

- [ ] **Step 3: Add `extractVercelAiSdkAttrs` to attribute-processor.ts**

Edit `TS_REPO/src/core/attribute-processor.ts`.

First, add a new dispatch call in `normalizeConventions`. Find the existing call (the last line of that method, around line 277):

Old text in `normalizeConventions`:
```typescript
    // Extract LangChain metadata (ls_*) into standard positions
    this.extractLangchainMetadata(attrs);
  }
```

Replace with:
```typescript
    // Extract LangChain metadata (ls_*) into standard positions
    this.extractLangchainMetadata(attrs);

    // Extract Vercel AI SDK ai.* attributes into canonical llm.* / gen_ai.* / tool.*
    this.extractVercelAiSdkAttrs(attrs);
  }
```

Second, add the implementation as a new private method. Locate the end of `extractLangchainMetadata` (the closing brace before `// ── CrewAI-specific ─────────────────────────────────`). Insert the new method **immediately before** that section delimiter:

Find:
```typescript
      attrs['llm.invocation_parameters'] = JSON.stringify(existing);
    }
  }

  // ── CrewAI-specific ─────────────────────────────────
```

Replace with:
```typescript
      attrs['llm.invocation_parameters'] = JSON.stringify(existing);
    }
  }

  // ── Vercel AI SDK extraction ───────────────────────

  /**
   * The Vercel AI SDK emits its own `ai.*` namespace alongside `gen_ai.*`. Map
   * the AI-SDK-specific keys onto the canonical `llm.*` / `gen_ai.*` / `tool.*`
   * keys that the existing pipeline already understands. Span-kind inference
   * runs first so downstream `applyNamespaceMapping` resolves it correctly.
   */
  private extractVercelAiSdkAttrs(attrs: Record<string, any>): void {
    const spanName: string = attrs['_span_name'] ?? '';
    const isAiSdkSpan =
      spanName.startsWith('ai.') ||
      'ai.model.id' in attrs ||
      'ai.toolCall.name' in attrs;

    if (!isAiSdkSpan) return;

    // Span-kind inference (only when not already set)
    if (!('openinference.span.kind' in attrs)) {
      if (spanName === 'ai.toolCall') {
        attrs['openinference.span.kind'] = 'TOOL';
      } else if (spanName === 'ai.embed' || spanName === 'ai.embedMany') {
        attrs['openinference.span.kind'] = 'EMBEDDING';
      } else if (spanName.startsWith('ai.generate') || spanName.startsWith('ai.stream')) {
        attrs['openinference.span.kind'] = 'LLM';
      }
    }

    // Model id / provider
    if ('ai.model.id' in attrs && !('llm.model_name' in attrs)) {
      attrs['llm.model_name'] = attrs['ai.model.id'];
    }
    if ('ai.model.provider' in attrs && !('llm.provider' in attrs)) {
      // ai.model.provider is e.g. "openai.chat" — take the leading segment
      const raw = String(attrs['ai.model.provider']);
      attrs['llm.provider'] = raw.split('.')[0];
    }

    // Token usage
    if ('ai.usage.promptTokens' in attrs && !('llm.token_count.prompt' in attrs)) {
      attrs['llm.token_count.prompt'] = attrs['ai.usage.promptTokens'];
    }
    if ('ai.usage.completionTokens' in attrs && !('llm.token_count.completion' in attrs)) {
      attrs['llm.token_count.completion'] = attrs['ai.usage.completionTokens'];
    }
    if ('ai.usage.totalTokens' in attrs && !('llm.token_count.total' in attrs)) {
      attrs['llm.token_count.total'] = attrs['ai.usage.totalTokens'];
    }

    // Settings → gen_ai.request.*
    const settingMap: Record<string, string> = {
      'ai.settings.temperature': 'gen_ai.request.temperature',
      'ai.settings.maxTokens': 'gen_ai.request.max_tokens',
      'ai.settings.topP': 'gen_ai.request.top_p',
      'ai.settings.topK': 'gen_ai.request.top_k',
      'ai.settings.frequencyPenalty': 'gen_ai.request.frequency_penalty',
      'ai.settings.presencePenalty': 'gen_ai.request.presence_penalty',
      'ai.settings.stopSequences': 'gen_ai.request.stop_sequences',
    };
    for (const [src, tgt] of Object.entries(settingMap)) {
      if (src in attrs && !(tgt in attrs)) {
        attrs[tgt] = attrs[src];
      }
    }

    // Operation id → gen_ai.operation.name (helps RERANKER detection)
    if ('ai.operationId' in attrs && !('gen_ai.operation.name' in attrs)) {
      attrs['gen_ai.operation.name'] = attrs['ai.operationId'];
    }

    // Response text → output message 0
    if (
      'ai.response.text' in attrs &&
      !('llm.output_messages.0.message.content' in attrs)
    ) {
      attrs['llm.output_messages.0.message.role'] = 'assistant';
      attrs['llm.output_messages.0.message.content'] = attrs['ai.response.text'];
    }

    // Response finish reason / id
    if ('ai.response.finishReason' in attrs && !('llm.response.finish_reason' in attrs)) {
      attrs['llm.response.finish_reason'] = attrs['ai.response.finishReason'];
    }
    if ('ai.response.id' in attrs && !('gen_ai.response.id' in attrs)) {
      attrs['gen_ai.response.id'] = attrs['ai.response.id'];
    }

    // Prompt messages → exploded indexed keys
    const rawMessages = attrs['ai.prompt.messages'];
    if (typeof rawMessages === 'string') {
      try {
        const parsed = JSON.parse(rawMessages);
        if (Array.isArray(parsed)) {
          parsed.forEach((msg, i) => {
            if (msg && typeof msg === 'object') {
              if (typeof msg.role === 'string') {
                attrs[`llm.input_messages.${i}.message.role`] = msg.role;
              }
              if (typeof msg.content === 'string') {
                attrs[`llm.input_messages.${i}.message.content`] = msg.content;
              } else if (msg.content !== undefined) {
                attrs[`llm.input_messages.${i}.message.content`] = JSON.stringify(msg.content);
              }
            }
          });
        }
      } catch {
        // Leave the raw string in place if parse fails
      }
    }

    // Response toolCalls → exploded under output message 0
    const rawToolCalls = attrs['ai.response.toolCalls'];
    if (typeof rawToolCalls === 'string') {
      try {
        const parsed = JSON.parse(rawToolCalls);
        if (Array.isArray(parsed)) {
          parsed.forEach((tc, i) => {
            if (tc && typeof tc === 'object') {
              if (tc.toolName !== undefined) {
                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.function.name`] = tc.toolName;
              }
              if (tc.args !== undefined) {
                const argStr =
                  typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.function.arguments`] = argStr;
              }
              if (tc.toolCallId !== undefined) {
                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.id`] = tc.toolCallId;
              }
            }
          });
        }
      } catch {
        // Ignore parse failure
      }
    }

    // Tool span attributes
    if (spanName === 'ai.toolCall') {
      if ('ai.toolCall.name' in attrs && !('tool.name' in attrs)) {
        attrs['tool.name'] = attrs['ai.toolCall.name'];
      }
      if ('ai.toolCall.args' in attrs && !('input.value' in attrs)) {
        attrs['input.value'] = attrs['ai.toolCall.args'];
      }
      if ('ai.toolCall.result' in attrs && !('output.value' in attrs)) {
        attrs['output.value'] = attrs['ai.toolCall.result'];
      }
    }
  }

  // ── CrewAI-specific ─────────────────────────────────
```

- [ ] **Step 4: Run tests — verify they pass**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run tests/integration/ai-sdk-attributes.test.ts
```

Expected: All 9 tests pass.

- [ ] **Step 5: Run full test suite — verify no regressions**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run
```

Expected: full suite passes (or fails only on tests that were already failing on `vorflux/typescript-sdk-v3` before this branch — note any pre-existing failures and confirm they're unchanged).

- [ ] **Step 6: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git add src/core/attribute-processor.ts tests/integration/ai-sdk-attributes.test.ts && git commit -m "$(cat <<'EOF'
feat(ai-sdk): map Vercel AI SDK ai.* attrs to canonical llm.*/gen_ai.*/tool.*

Adds extractVercelAiSdkAttrs() to UnifiedAttributeProcessor.normalizeConventions.
Maps model id, provider, token usage, request settings, prompt messages
(JSON-string explosion), response text/finishReason/toolCalls, and ai.toolCall
span attributes. Infers openinference.span.kind from span name when unset
(LLM for generate/stream, TOOL for ai.toolCall, EMBEDDING for ai.embed*).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: TS SDK — attribute-mapping JSON additions for users without the wrapper

This is defense in depth — it ensures that even users who set `experimental_telemetry: { isEnabled: true }` themselves (no wrapper, no `createAITelemetry`) get token-count mapping. Span-kind inference and message explosion still require the wrapper or the extractor from Task 6.

**Files:**
- Modify: `TS_REPO/src/config/attribute-mapping.json`

- [ ] **Step 1: Find the existing token-count entries**

The token-count mappings are around lines 73-119. Find the `"prompt"` block (currently lines 82-88):

```json
            "prompt": {
              "sources": [
                "llm.token_count.prompt",
                "gen_ai.usage.input_tokens"
              ],
              "target": "neatlogs.llm.token_count.prompt"
            },
```

- [ ] **Step 2: Add `ai.usage.promptTokens` to the prompt sources**

Replace with:

```json
            "prompt": {
              "sources": [
                "llm.token_count.prompt",
                "gen_ai.usage.input_tokens",
                "ai.usage.promptTokens"
              ],
              "target": "neatlogs.llm.token_count.prompt"
            },
```

- [ ] **Step 3: Add `ai.usage.completionTokens` to the completion sources**

Find:
```json
            "completion": {
              "sources": [
                "llm.token_count.completion",
                "gen_ai.usage.output_tokens"
              ],
              "target": "neatlogs.llm.token_count.completion"
            },
```

Replace with:
```json
            "completion": {
              "sources": [
                "llm.token_count.completion",
                "gen_ai.usage.output_tokens",
                "ai.usage.completionTokens"
              ],
              "target": "neatlogs.llm.token_count.completion"
            },
```

- [ ] **Step 4: Add `ai.usage.totalTokens` to the total sources**

Find:
```json
            "total": {
              "sources": [
                "llm.token_count.total",
                "llm.usage.total_tokens"
              ],
              "target": "neatlogs.llm.token_count.total"
            },
```

Replace with:
```json
            "total": {
              "sources": [
                "llm.token_count.total",
                "llm.usage.total_tokens",
                "ai.usage.totalTokens"
              ],
              "target": "neatlogs.llm.token_count.total"
            },
```

- [ ] **Step 5: Verify JSON is still valid**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && node -e "JSON.parse(require('fs').readFileSync('src/config/attribute-mapping.json'))" && echo OK
```

Expected output: `OK`

- [ ] **Step 6: Run full test suite to verify no regressions**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run
```

Expected: same pass/fail count as before this task. The Task 6 tests already cover token-count behavior via `extractVercelAiSdkAttrs`; the JSON change is redundant for wrapper users but kicks in for unwrapped users.

- [ ] **Step 7: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git add src/config/attribute-mapping.json && git commit -m "$(cat <<'EOF'
feat(ai-sdk): add ai.usage.* to attribute-mapping token-count sources

Defense in depth: users who enable experimental_telemetry directly
(without wrapAISDK or createAITelemetry) still get neatlogs.llm.token_count.*
populated from ai.usage.{promptTokens,completionTokens,totalTokens}.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: TS SDK — registry entry for ai_sdk

**Files:**
- Modify: `TS_REPO/src/instrumentation/registry.ts`

- [ ] **Step 1: Add to tags.llm and tags.agent**

Edit `TS_REPO/src/instrumentation/registry.ts`. Find the `tags.llm` array (lines 36-56):

```typescript
    llm: [
      'azure_ai_inference',
      'openai',
      'anthropic',
      'cohere',
      'bedrock',
      'groq',
      'together',
      'vertexai',
      'google_generativeai',
      'mistralai',
      'ollama',
      'watsonx',
      'alephalpha',
      'replicate',
      'sagemaker',
      'huggingface_hub',
      'litellm',
      'google_genai',
      'portkey',
    ],
```

Add `'ai_sdk'` at the end before the closing bracket:

```typescript
    llm: [
      'azure_ai_inference',
      'openai',
      'anthropic',
      'cohere',
      'bedrock',
      'groq',
      'together',
      'vertexai',
      'google_generativeai',
      'mistralai',
      'ollama',
      'watsonx',
      'alephalpha',
      'replicate',
      'sagemaker',
      'huggingface_hub',
      'litellm',
      'google_genai',
      'portkey',
      'ai_sdk',
    ],
```

Find the `tags.agent` array (lines 69-85):
```typescript
    agent: [
      'langchain',
      'langgraph',
      'llamaindex',
      'crewai',
      'mastra',
      'autogen',
      'haystack',
      'dspy',
      'agno',
      'beeai',
      'openai_agents',
      'pydantic_ai',
      'smolagents',
      'strands',
      'pipecat',
    ],
```

Add `'ai_sdk'`:
```typescript
    agent: [
      'langchain',
      'langgraph',
      'llamaindex',
      'crewai',
      'mastra',
      'autogen',
      'haystack',
      'dspy',
      'agno',
      'beeai',
      'openai_agents',
      'pydantic_ai',
      'smolagents',
      'strands',
      'pipecat',
      'ai_sdk',
    ],
```

- [ ] **Step 2: Add the libraries entry**

Locate the `libraries:` block. Add the `ai_sdk` entry after the `azure_ai_inference` entry (lines 91-96 in the current file). Find:

```typescript
  libraries: {
    azure_ai_inference: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    openai: {
```

Replace with:

```typescript
  libraries: {
    azure_ai_inference: {
      openinference: null,
      openllmetry: null,
      neatlogs: null,
      default_span_kind: 'LLM',
    },
    ai_sdk: {
      openinference: null,
      openllmetry: null,
      // The wrapper is opt-in per call site; init({ instrumentations: ['ai_sdk'] })
      // is a no-op. This registry entry exists so scope detection and tagging stay
      // consistent with other LLM/agent libraries.
      neatlogs: '@neatlogs/instrumentation-ai-sdk',
      default_span_kind: 'LLM',
    },
    openai: {
```

- [ ] **Step 3: Build to verify TypeScript compiles**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run
```

Expected: same pass/fail count as before this task.

- [ ] **Step 5: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git add src/instrumentation/registry.ts && git commit -m "$(cat <<'EOF'
feat(ai-sdk): add ai_sdk registry entry

Registers ai_sdk under tags.llm and tags.agent and points the
neatlogs field at @neatlogs/instrumentation-ai-sdk. Note: the
wrapper is opt-in per call site, so init({ instrumentations: ['ai_sdk'] })
is a no-op; this entry exists for scope-detection consistency.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: TS SDK — `src/ai-sdk.ts` shim and index.ts re-export (TDD)

**Files:**
- Test: `TS_REPO/tests/unit/ai-sdk.test.ts` (new)
- Create: `TS_REPO/src/ai-sdk.ts`
- Modify: `TS_REPO/src/index.ts`

- [ ] **Step 1: Write failing test**

Path: `TS_REPO/tests/unit/ai-sdk.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('getAISDKWrapper', () => {
  it('throws a friendly error when @neatlogs/instrumentation-ai-sdk is not installed', async () => {
    // Force-fail the dynamic import by mocking the module loader
    vi.resetModules();
    vi.doMock('@neatlogs/instrumentation-ai-sdk', () => {
      throw new Error('not installed');
    });

    const { getAISDKWrapper } = await import('../../src/ai-sdk.js');
    await expect(getAISDKWrapper()).rejects.toThrow(/instrumentation-ai-sdk/);

    vi.doUnmock('@neatlogs/instrumentation-ai-sdk');
  });

  it('returns the wrapAISDK function when the package is available', async () => {
    vi.resetModules();
    const fakeWrap = (m: any) => m;
    vi.doMock('@neatlogs/instrumentation-ai-sdk', () => ({
      wrapAISDK: fakeWrap,
    }));

    const { getAISDKWrapper } = await import('../../src/ai-sdk.js');
    const wrap = await getAISDKWrapper();
    expect(wrap).toBe(fakeWrap);

    vi.doUnmock('@neatlogs/instrumentation-ai-sdk');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run tests/unit/ai-sdk.test.ts
```

Expected: 2 failures with "Cannot find module '../../src/ai-sdk.js'".

- [ ] **Step 3: Create src/ai-sdk.ts**

Path: `TS_REPO/src/ai-sdk.ts`

```typescript
/**
 * Shim that re-exports `wrapAISDK` from the optional
 * `@neatlogs/instrumentation-ai-sdk` package, mirroring the pattern in
 * src/mastra.ts.
 */

let _cached: ((aiModule: any) => any) | null = null;

export async function getAISDKWrapper(): Promise<(aiModule: any) => any> {
  if (_cached) return _cached;

  let wrap: ((aiModule: any) => any) | undefined;
  try {
    const mod = await import('@neatlogs/instrumentation-ai-sdk');
    wrap = (mod as any).wrapAISDK;
  } catch {
    throw new Error(
      '@neatlogs/instrumentation-ai-sdk is required for getAISDKWrapper(). ' +
        'Install it with: npm install @neatlogs/instrumentation-ai-sdk',
    );
  }

  if (typeof wrap !== 'function') {
    throw new Error(
      '@neatlogs/instrumentation-ai-sdk loaded but does not export wrapAISDK. ' +
        'Upgrade the package to a version that exports it.',
    );
  }

  _cached = wrap;
  return wrap;
}
```

- [ ] **Step 4: Add export to index.ts**

Edit `TS_REPO/src/index.ts`. Find the existing Mastra export block (lines 50-51):

```typescript
// Mastra integration
export { getMastraObservability } from './mastra.js';
```

Replace with:

```typescript
// Mastra integration
export { getMastraObservability } from './mastra.js';

// Vercel AI SDK integration
export { getAISDKWrapper } from './ai-sdk.js';
```

- [ ] **Step 5: Run tests — verify they pass**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run tests/unit/ai-sdk.test.ts
```

Expected: both tests pass.

- [ ] **Step 6: Verify TypeScript build**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm tsc --noEmit
```

Expected: no errors. (The `@neatlogs/instrumentation-ai-sdk` import inside `ai-sdk.ts` may be flagged "cannot be found" because the package isn't resolvable from the SDK's `node_modules`. If so, mark the import as a side-effect import or expand the test to use a relative file path. See Step 7 fallback.)

- [ ] **Step 7: Fallback if TS complains about missing module**

If `pnpm tsc --noEmit` reports `Cannot find module '@neatlogs/instrumentation-ai-sdk'`:

Edit `TS_REPO/src/ai-sdk.ts` and replace:

```typescript
    const mod = await import('@neatlogs/instrumentation-ai-sdk');
    wrap = (mod as any).wrapAISDK;
```

with:

```typescript
    // Cast through unknown because the package is an optional peer dep that may
    // not be installed in the consuming project. Module resolution is checked
    // at runtime, not compile time.
    const mod = (await import(
      '@neatlogs/instrumentation-ai-sdk' as string
    )) as { wrapAISDK?: (aiModule: any) => any };
    wrap = mod.wrapAISDK;
```

This trick (`as string` cast) bypasses module resolution at compile time without requiring `@types` or a local link. Re-run `pnpm tsc --noEmit` — should be clean.

- [ ] **Step 8: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git add src/ai-sdk.ts src/index.ts tests/unit/ai-sdk.test.ts && git commit -m "$(cat <<'EOF'
feat(ai-sdk): add getAISDKWrapper shim and re-export from public API

Mirrors the getMastraObservability pattern in src/mastra.ts. Dynamic
imports the optional @neatlogs/instrumentation-ai-sdk package and
returns its wrapAISDK function, throwing a friendly install message
when the package is missing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: TS SDK — runnable example

**Files:**
- Create: `TS_REPO/examples/sdk_examples/ai_sdk_basic/main.ts`
- Create: `TS_REPO/examples/sdk_examples/ai_sdk_basic/README.md`

- [ ] **Step 1: Create the example**

Path: `TS_REPO/examples/sdk_examples/ai_sdk_basic/main.ts`

```typescript
/**
 * Vercel AI SDK basic example with Neatlogs.
 *
 * Demonstrates:
 *   - wrapAISDK around the `ai` module
 *   - generateText with Azure OpenAI
 *   - streamText with a tool call
 *   - input/output capture, token counts, model name in Neatlogs
 *
 * Span kinds produced: WORKFLOW (parent), LLM (ai.generateText, ai.streamText,
 * doGenerate, doStream), TOOL (ai.toolCall).
 *
 * Usage:
 *     npx tsx examples/sdk_examples/ai_sdk_basic/main.ts
 *
 * Required env vars (mirrors mastra_complex):
 *     AZURE_OPENAI_API_KEY
 *     AZURE_OPENAI_ENDPOINT
 *     AZURE_OPENAI_DEPLOYMENT (e.g. gpt-4o-mini)
 *     NEATLOGS_API_KEY (or set NEATLOGS_DISABLE_EXPORT=true to skip export)
 */

import 'dotenv/config';

process.env.NEATLOGS_LOG_SPANS ??= 'true';
process.env.NEATLOGS_LOG_SPANS_FILE ??= 'ai_sdk_basic_spans.log';
process.env.NEATLOGS_LOG_RAW_SPANS ??= 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE ??= 'ai_sdk_basic_raw_spans.log';

import { init, flush, shutdown, getAISDKWrapper } from 'neatlogs';

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'http://localhost:4100',
    workflowName: 'ai-sdk-basic',
    tags: ['ai-sdk', 'basic'],
    captureLogs: false,
    disableExport: false,
    debug: true,
  });

  if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error('Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
  }
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';

  const ai = await import('ai');
  const { createAzure } = await import('@ai-sdk/azure');
  const { z } = await import('zod');

  const wrapAISDK = await getAISDKWrapper();
  const { generateText, streamText } = wrapAISDK(ai);

  const azureResourceName = process.env.AZURE_OPENAI_ENDPOINT!
    .replace(/^https?:\/\//, '')
    .replace(/\.(openai|cognitiveservices)\.azure\.com\/?$/, '');
  const azure = createAzure({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    resourceName: azureResourceName,
  });

  // 1. Plain generateText
  console.log('--- generateText ---');
  const { text } = await generateText({
    model: azure(azureDeployment),
    prompt: 'In one sentence, what is TypeScript?',
  });
  console.log(text);

  // 2. streamText with a tool
  console.log('\n--- streamText with tool ---');
  const stream = streamText({
    model: azure(azureDeployment),
    prompt: 'What is the weather in San Francisco? Use the getWeather tool.',
    tools: {
      getWeather: {
        description: 'Get the current weather for a location',
        parameters: z.object({ location: z.string() }),
        execute: async ({ location }: { location: string }) => ({
          location,
          temperature: 72,
          conditions: 'sunny',
        }),
      },
    },
    maxToolRoundtrips: 2,
  });

  for await (const delta of stream.textStream) {
    process.stdout.write(delta);
  }
  console.log();

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Create the example README**

Path: `TS_REPO/examples/sdk_examples/ai_sdk_basic/README.md`

```markdown
# Vercel AI SDK basic example

Runs `generateText` and `streamText` (with a tool) through `wrapAISDK`,
producing a Neatlogs trace with parent + child spans and full attribute
coverage.

## Run

```bash
# Install peer deps if not already present:
pnpm add ai @ai-sdk/azure zod

# Then:
npx tsx examples/sdk_examples/ai_sdk_basic/main.ts
```

Requires `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, and optionally
`AZURE_OPENAI_DEPLOYMENT`. Set `NEATLOGS_DISABLE_EXPORT=true` to skip
sending spans to the backend; spans are still written to
`ai_sdk_basic_spans.log` and `ai_sdk_basic_raw_spans.log`.
```

- [ ] **Step 3: Type-check the example**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm tsc --noEmit -p examples/tsconfig.json 2>&1 | head -40
```

Expected: example compiles cleanly. If `ai`, `@ai-sdk/azure`, or `zod` aren't installed, the type checker will warn — that's acceptable for now (the example is documented as requiring user install). If errors are unrelated and pre-existing, leave them.

- [ ] **Step 4: Commit**

```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git add examples/sdk_examples/ai_sdk_basic/main.ts examples/sdk_examples/ai_sdk_basic/README.md && git commit -m "$(cat <<'EOF'
docs(ai-sdk): add ai_sdk_basic runnable example

Demonstrates wrapAISDK with generateText and streamText (including a
zod tool definition) against Azure OpenAI. Mirrors the structure and
env-var conventions of examples/sdk_examples/mastra_complex.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Top-level README mention (optional, low risk)

**Files:**
- Modify: `TS_REPO/README.md`

- [ ] **Step 1: Read the current README and look for an integrations section**

Run:
```bash
grep -n -i "mastra\|integration" /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript/README.md | head -20
```

If there's a Mastra mention, add an AI SDK mention next to it. If there's no integrations section, skip this task.

- [ ] **Step 2: Add the AI SDK mention**

Find a line like:
```markdown
- Mastra: see `@neatlogs/instrumentation-mastra`
```

Add immediately after:
```markdown
- Vercel AI SDK: see `@neatlogs/instrumentation-ai-sdk`
```

If the README has no such section, skip to Step 4.

- [ ] **Step 3: Verify markdown still renders**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && head -100 README.md
```

Expected: human-readable markdown, no breakage near the edit.

- [ ] **Step 4: Commit (or skip)**

If the README was edited:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git add README.md && git commit -m "$(cat <<'EOF'
docs: mention @neatlogs/instrumentation-ai-sdk in top-level README

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If skipped, log "Task 11 skipped — README has no integrations section" and proceed.

---

## Task 12: Final verification

**Files:** None — verification only.

- [ ] **Step 1: Verify all unit & integration tests pass in TS repo**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && pnpm vitest run
```

Expected: all newly added tests pass. Pre-existing failures (if any) are unchanged.

- [ ] **Step 2: Verify package builds and tests in instrumentations repo**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-ai-sdk && pnpm test && pnpm run build
```

Expected: all 14 tests pass, build produces `dist/esm/` and `dist/cjs/`.

- [ ] **Step 3: Confirm Mastra package still builds (no regressions)**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations/packages/js/neatlogs-instrumentation-mastra && pnpm run build && pnpm test 2>&1 | tail -20
```

Expected: Mastra package builds and its tests pass — confirming our new package didn't disturb workspace state.

- [ ] **Step 4: Print git log on both branches**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git log --oneline vorflux/typescript-sdk-v3..HEAD
echo "---"
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations && git log --oneline vorflux/js-instrumentations..HEAD
```

Expected:
- TS repo: ~7 commits (spec + tasks 5-11 worth)
- Instrumentations repo: ~4 commits (tasks 1-4 worth)

- [ ] **Step 5: Confirm working tree carry-overs are still untouched**

Run:
```bash
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/neatlogs-typescript && git status --short
echo "---"
cd /Users/akshayhangloo/Documents/Projects/Neatlogs/instrumentations && git status --short
```

Expected:
- TS repo: only the original 4 modified files (`mastra_complex/main.ts`, `mastra_multiagent/main.ts`, `package-lock.json`, `package.json`).
- Instrumentations repo: only the original 2 modified files (`neatlogs-instrumentation-mastra/package.json`, `pnpm-lock.yaml`).

If extra files appear, investigate and report.

- [ ] **Step 6: Report completion**

Print a summary: branches updated, tests passing, files created/modified count, and any deferred items (Agent wrapping, streaming TTFT extraction, multi-version AI SDK testing — all noted as out of scope in the spec).

---

## Notes for the executor

- **Don't push to remote** unless the user explicitly asks.
- **Don't create a PR** at any point — finish on local commits only.
- If a step fails (test still fails after implementation, build error, etc.), stop and report. Do not attempt creative rewrites of the implementation; consult the spec or ask.
- If a fix requires an additional commit beyond what's listed (e.g., a typo correction), make it a separate clearly-named commit, do not amend.
- The Mastra package's existing tests in `instrumentations/packages/js/neatlogs-instrumentation-mastra/test/instrumentation.test.ts` use `vi.mock` and a custom `createMockTracerProvider`. Our new tests use `BasicTracerProvider` + `InMemorySpanExporter` which is more idiomatic — both styles are acceptable, prefer the new style.
