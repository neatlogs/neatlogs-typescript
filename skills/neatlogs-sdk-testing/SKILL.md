---
name: neatlogs-sdk-testing
description: Plan and execute contract-driven testing of the published and local Neatlogs TypeScript SDK across package managers, module systems, runtimes, and lifecycle cases without editing SDK source during execution.
---

# Neatlogs TypeScript SDK testing

Use this skill for TypeScript SDK release validation, wrapper testing, lifecycle characterization, packaging checks, and live telemetry E2E.

## Execution boundaries

- Confirm a clean worktree, branch, and commit before testing.
- Put consumer projects and generated artifacts in a temporary directory. Do not alter SDK source, tests, manifests, or lockfiles during an execution pass.
- Do not push, publish, or create external changes without separate authorization.
- Keep credentials in an ignored file or process environment; never print them or place them in source/arguments.
- Use the exact provider, model, endpoint, package version, Node version, and package manager requested.
- Predeclare telemetry expectations and never weaken them after a failure.
- Stop live execution when diagnostics fail.

## PASS gates

Require correct application behavior, exact local span contract, successful expected flush/shutdown behavior, exact trace-ID persistence, and local-to-persisted hierarchy agreement. A successful promise or provider response is not an E2E pass.

## Clean-package experience

- Build and inspect the npm tarball.
- Install it into empty npm, pnpm, and Yarn consumers.
- Test Node 18, 20, 22, and 24 where available.
- Import every `package.json` export through both ESM and CommonJS when promised.
- Detect undeclared runtime dependencies; do not rely on repository hoisting or pre-existing `node_modules`.
- Compile TypeScript declarations and smoke-test Vite/esbuild plus browser/edge entry points where supported.
- Execute the smallest README Gemini example unchanged apart from credentials and deterministic prompt.

## Initialization and lifecycle matrix

Run global-state cases in separate Node processes:

- Default/explicit initialization and omitted `await init()`.
- Missing, empty, whitespace, and invalid ingestion credentials.
- Environment-only/explicit endpoints and malformed endpoints.
- Initialization twice, concurrently, and after shutdown.
- Flush before initialization, twice, and after shutdown.
- Shutdown before initialization and twice.
- Span start during/after shutdown and active-child shutdown.
- Cached wrapper after shutdown.
- Exit without explicit flush.
- SIGINT/SIGTERM subprocess behavior.
- Export disabled.
- Sampling at `0`, `1`, interior boundaries, negative, greater than one, `NaN`, and nonnumeric values accepted by the public type boundary.

Record API results, emitted diagnostics, exporter result, exact persistence, duplicate spans, and process exit behavior independently.

## TypeScript-specific coverage

- AsyncLocalStorage isolation across promises, timers, concurrent roots, and worker boundaries where supported.
- Promise rejection, synchronous throw, and context restoration after errors.
- Provider clients created before and after initialization.
- Reusable wrappers routed to the correct active Client/project.
- Full, empty, failed, never-consumed, and early-return streams.
- Tool calls, structured output, usage variants, retries, and provider errors.
- Browser CORS/unload/flush behavior and absence of Node-only imports in browser/edge bundles.
- OpenAI, Anthropic, Google GenAI, Azure, Bedrock, Vertex, LangChain, AI SDK, OpenAI Agents, Mastra, OpenRouter, Claude Agent SDK, Pi, Strands, and other documented exports.

## Report format

For every case include versions, clean-install command category, expected contract, application outcome, flush/shutdown result, exporter evidence, persistence response, trace ID, valid project-scoped dashboard link, classification, and defect. Report audit or peer-dependency findings separately from functional results.

