# NeatLogs TypeScript SDK Examples

TypeScript ports of the NeatLogs Python SDK examples. All examples use the same
`src/neatlogs/index.ts` SDK wrapper and target Azure OpenAI.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your Azure OpenAI + NeatLogs credentials in .env
```

## Examples

### 1. OpenAI Multi-Agent Investment Research
TypeScript port of `openai_multiagent/`. 4-agent pipeline: planner → researcher → analyst → reporter.

```bash
npx tsx --env-file=.env examples/openai_multiagent/main.ts "NVIDIA"
```

### 2. Code Review Workflow (Anthropic-style)
TypeScript port of `anthropic_multiagent/`. Multi-agent code review: reviewer (with tool-calling) → fixer → tester → documenter.

```bash
npx tsx --env-file=.env examples/anthropic_multiagent/main.ts
```

### 3. All Span Kinds Demo
TypeScript port of `47_all_span_kinds.py`. Demonstrates all NeatLogs span types: WORKFLOW, CHAIN, AGENT, RETRIEVER, EMBEDDING, TOOL, LLM.

```bash
npx tsx --env-file=.env examples/all_span_kinds/main.ts
```

> **Note:** Set `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` to use real embeddings. Without it, mock embeddings are used so the span hierarchy is still demonstrated.

### 4. GobbleCube E-Commerce Copilot
TypeScript port of `gobblecube/`. Multi-agent CXO copilot with query routing: Analytics, Ads, Inventory, Market Intelligence.

```bash
# Run default scenario (Revenue Diagnostic)
npx tsx --env-file=.env examples/gobblecube/main.ts

# Run a specific scenario
npx tsx --env-file=.env examples/gobblecube/main.ts --scenario 2

# Run a custom query
npx tsx --env-file=.env examples/gobblecube/main.ts --query "Why did our ROAS drop?"
```

Scenarios: `1` = Revenue Diagnostic, `2` = Ad Campaign Optimisation, `3` = Stockout Emergency, `4` = Market Opportunity Discovery.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEATLOGS_API_KEY` | Yes | NeatLogs API key |
| `NEATLOGS_ENDPOINT` | Yes | NeatLogs endpoint (e.g. `https://staging-cloud.neatlogs.com`) |
| `AZURE_OPENAI_API_KEY` | Yes | Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | Yes | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Yes | Chat completion deployment name |
| `AZURE_OPENAI_API_VERSION` | No | API version (default: `2025-01-01-preview`) |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | No | Embedding deployment name (for `all_span_kinds` example) |

> **Important — shell env vars take precedence over `.env`:** `tsx --env-file=.env` loads
> values from the file but does **not** override variables that are already set in your shell.
> If `NEATLOGS_API_KEY` is exported in your shell, the `.env` value is silently ignored and
> spans will be sent to the project associated with the shell key. To guarantee `.env` is used,
> either `unset NEATLOGS_API_KEY` before running, or prefix the command:
> ```bash
> env -i HOME="$HOME" PATH="$PATH" npx tsx --env-file=.env examples/<example>/main.ts
> ```

## SDK

The NeatLogs TypeScript SDK wrapper lives in `src/neatlogs/index.ts`. It mirrors the Python SDK API:

| Python | TypeScript |
|---|---|
| `neatlogs.init(...)` | `neatlogs.init({...})` |
| `@neatlogs.span(kind="AGENT", ...)` | `spanWrap({ kind: "AGENT", ... }, fn)` |
| `with neatlogs.trace(...)` | `await withTrace({ name: ..., kind: ... }, fn)` |
| `neatlogs.flush()` | `await neatlogs.flush()` |
| `neatlogs.shutdown()` | `await neatlogs.shutdown()` |
| `PromptTemplate(...)` | `new PromptTemplate(...)` |
| `UserPromptTemplate(...)` | `new UserPromptTemplate(...)` |

### Critical attributes (backend requirements)

The SDK sets these automatically — do not override:

- `neatlogs.instrumentation.name` = `"neatlogs.decorators._base"`
- `neatlogs.internal` = `"True"` (string, not boolean)
- OTel tracer scope = `"neatlogs.decorators._base"` for all spans
- Completion marker tracer scope = `"neatlogs.core.context"`
