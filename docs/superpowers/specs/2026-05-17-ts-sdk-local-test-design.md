# Local end-to-end test of the Neatlogs TypeScript SDK v3

## Goal

Bring up the full Neatlogs stack locally (frontend + backend + workers + Docker infra) on `feature/ts-sdk-changes`, then exercise the TypeScript SDK on `vorflux/typescript-sdk-v3` against it. The run validates two recent SDK fix commits (LangChain/Azure model-name resolution, Mastra single-trace context propagation) and the published `neatlogs@1.0.2` package, while documenting which examples remain blocked by known issues.

## Environment snapshot

Verified at design time:

- Docker desktop is running the infra stack: `neatlogs-postgres:5432`, `neatlogs-clickhouse:8123/9000`, `neatlogs-redis:6379`, `neatlogs-kafka:9092`. The `pii-redaction` service from `docker-compose.yml` is **not** running and is not required for trace flow.
- Postgres has ~37 tables from prior `ui/phase-1-foundation` work; schema may drift from `feature/ts-sdk-changes`.
- ClickHouse database is **empty** — span/trace tables must be created before ingestion will work.
- Kafka topic `ingest-events` already exists.
- Repos:
  - `~/Documents/Projects/Neatlogs/neatlogs-app/` — Next.js frontend (pnpm) + `backend/` Express API (npm)
  - `~/Documents/Projects/Neatlogs/neatlogs-typescript/` — SDK on `vorflux/typescript-sdk-v3`, version `1.0.2`
- Available API keys: Azure OpenAI, Google GenAI. **No** direct OpenAI or Anthropic keys.

## Scope and skipped items

In scope: `mastra_complex` (primary target) plus `example:google`, `example:langchain`, `example:langgraph`, `example:marketing` — all of which run on Azure + Google.

Skipped, with documented reason (no key): `example:openai`, `example:anthropic`, `example:reasoning_model_workflow`.

`mastra_complex` requires patching: it hard-throws on missing `OPENAI_API_KEY` for embeddings (`examples/sdk_examples/mastra_complex/main.ts:74`). We swap the OpenAI embeddings client for an Azure OpenAI embeddings deployment so the EMBEDDING/RETRIEVER/RERANKER spans still get generated.

Out of scope: fixing the OpenInference auto-instrumentation no-op documented in `HANDOFF_AND_KNOWN_ISSUES.md` Section 2. We expect `langchain` examples to log the `could not find instrumentor class` warning; that's a known unfixed bug, not a regression.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────┐       ┌──────────────┐
│ neatlogs-typescript │  HTTP │ neatlogs-app/backend │ Kafka │ kafka topic  │
│  example main.ts    ├──────►│      (port 4100)     ├──────►│ ingest-events│
│  + neatlogs SDK     │       │  /api/v1/ingest      │       └──────┬───────┘
└─────────────────────┘       └──────────────────────┘              │
                                                                     ▼
                              ┌──────────────────────┐       ┌──────────────┐
                              │ neatlogs-app (Next)  │       │ worker:kafka │
                              │      (port 3000)     │       │ (consumer)   │
                              │  dashboard / login   │       └──────┬───────┘
                              └──────────┬───────────┘              │
                                         │                          ▼
                                         │                  ┌───────────────┐
                                         │                  │  ClickHouse   │
                                         └─────────────────►│ + Postgres    │
                                            reads spans     └───────────────┘
                                                                    ▲
                                                            ┌───────┴────────┐
                                                            │ trace-finalizer│
                                                            │     worker     │
                                                            └────────────────┘
```

## Phases

### Phase 0 — Branch hygiene

In `neatlogs-app/`:
1. `git stash push -m "phase-1-foundation WIP — pre-ts-sdk-test"` (preserves the four modified UI files)
2. `git fetch origin`
3. `git checkout feature/ts-sdk-changes`

The TS SDK repo is already on the right branch (`vorflux/typescript-sdk-v3`).

### Phase 1 — Backend bring-up

1. `cd neatlogs-app/backend && npm install`
2. `npm run db:clickhouse:push` — creates the empty ClickHouse schema. Approved by user since target DB is empty.
3. From `neatlogs-app/`: `pnpm db:push` — applies drizzle Postgres migrations. User approved running unconditionally (in-progress UI work is already stashed; tolerable risk).
4. **Pre-flight port check**: `lsof -i :4100` and `lsof -i :3000`. If anything is bound, ask user before killing.
5. Start API in background: `npm run dev` from `neatlogs-app/backend/`. Watch for `🚀 Neatlogs Backend running on port 4100`.
6. Smoke: `curl -s http://localhost:4100/health` expects 200.

### Phase 2 — Workers

Both run in background, both from `neatlogs-app/backend/`:

1. `npm run worker:kafka` — drains `ingest-events` into ClickHouse + Postgres. Required.
2. `npm run worker:trace-finalizer` — finalizes traces and computes rollups. Required for cost to surface on dashboard.

Skipped (not needed for trace ingestion path): `worker:digest`, `worker:health`, `worker:suggestions`, `worker:notification-processor`.

### Phase 3 — Frontend bring-up

1. `cd neatlogs-app && pnpm install --force` (per repo README)
2. `pnpm dev` in background → `http://localhost:3000`
3. User logs in (next-auth local flow), creates an org/project, generates a `NEATLOGS_API_KEY` for use by the SDK.

### Phase 4 — TS SDK env setup

1. Create `neatlogs-typescript/.env` with:
   - `NEATLOGS_API_KEY=<from step 3>`
   - `NEATLOGS_ENDPOINT=http://localhost:4100`
   - `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` (chat completion deployment name, e.g. `gpt-4o-mini`)
   - `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` (an embeddings deployment, e.g. `text-embedding-3-small` deployed under that name in Azure)
   - `GOOGLE_API_KEY`
2. `npm install && npm run build && npm run lint`
3. `rm -rf logs/`

### Phase 5 — Run examples

#### Primary target: `mastra_complex`

1. Patch `examples/sdk_examples/mastra_complex/main.ts`:
   - Replace `const openaiClient = new OpenAI()` and the three `openaiClient.embeddings.create(...)` call sites (lines ~200, 211, 229) with an Azure OpenAI embedding client backed by `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`.
   - Drop the `if (!process.env.OPENAI_API_KEY) throw ...` precondition.
2. Run: `npx tsx examples/sdk_examples/mastra_complex/main.ts`
3. Outputs: `mastra_complex_spans.log`, `mastra_complex_raw_spans.log`, `mastra_complex_logs.log` in `logs/`.

#### Original examples

Run each with a distinct workflow prefix so they're easy to find on the dashboard:

```
NEATLOGS_WORKFLOW_PREFIX=local-2026-05-17-google-     npm run example:google
NEATLOGS_WORKFLOW_PREFIX=local-2026-05-17-langchain-  npm run example:langchain
NEATLOGS_WORKFLOW_PREFIX=local-2026-05-17-langgraph-  npm run example:langgraph
NEATLOGS_WORKFLOW_PREFIX=local-2026-05-17-marketing-  npm run example:marketing
```

### Phase 6 — Verification matrix

For each completed run, capture in a results table:

| Check | How to verify |
|---|---|
| Run completed without throwing | Process exit code 0, no unhandled rejection in stderr |
| LLM spans present | `grep '"openinference.span.kind":"LLM"' logs/<example>_processed_spans.jsonl \| wc -l` > 0 |
| Real model name (not deployment) on Azure spans | LLM span attribute `llm.model_name` matches the underlying model (e.g. `gpt-4o-mini`), not the Azure deployment alias. **Validates commits `dda1815` and `8255c1c`.** |
| Mastra spans share trace_id with parent | All `mastra_complex` spans grouped under the same `trace_id`. **Validates commit `3bf74dd`.** |
| Dashboard shows non-zero token + cost | Log into `:3000`, find the workflow, inspect the trace summary |
| OpenInference warning logged for `langchain` | Expected; document but do not fail |

### Open issues we expect to surface

- `langchain` and `langgraph` examples will likely show the `OpenInference package for 'langchain' loaded but could not find instrumentor class` warning (HANDOFF Section 2). Spans from explicit `trace()`/`span()` will land; provider-level `LLM` spans may not. This is the known bug; we record it but it does not block the test.
- `google_genai_multiagent` will not produce `LLM` spans either, because `registry.ts` has no instrumentation entry for `google_genai`. Direct Gemini calls show as raw HTTP/undici spans.
- `mastra_complex` is the example most likely to produce a clean LLM span chain, since the Mastra path bypasses the broken OpenInference branch.

## Risks

- **Drizzle `db:push` may rewrite schema in destructive ways.** User accepted this risk (UI work is stashed; not blocking).
- **Long-running Docker volumes (5+ weeks) may have stale data.** No cleanup planned; if ingestion fails, we drop volumes and restart.
- **Azure embedding deployment may not exist.** If `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` isn't provisioned, `mastra_complex` fails. Fallback: stub embeddings to fixed vectors (loses real EMBEDDING-span content but proves the pipeline).
- **`pnpm install --force` in `neatlogs-app` is heavy** (~1000+ deps); first run may take several minutes.

## Deliverables

1. Working local stack on `feature/ts-sdk-changes` reachable at `:3000` and `:4100`.
2. Five example runs (one patched `mastra_complex` + four originals), each with `logs/*_processed_spans.jsonl`.
3. A results table covering the verification matrix above.
4. A short writeup confirming which of the two recent SDK fixes are validated end-to-end and which known issues persist.
