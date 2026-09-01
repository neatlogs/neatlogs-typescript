# Phase 4 TypeScript launch-readiness workflows

These workflows validate SDK output and the complete hosted persistence path. They intentionally use deterministic fake LLM responses so the telemetry contract can be tested without provider cost or provider variability.

## Scenarios

| Scenario | Primary failure boundary | Expected result |
|---|---|---|
| `numeric-pii` | PII masking and ClickHouse numeric columns | Email and credentials are masked; token counts remain numbers `120/50/170`; 2 spans persist. |
| `multi-batch-12` | Batch ordering, completion-marker race, Kafka/finalizer merge | Exactly 12 spans persist: 1 WORKFLOW, 5 AGENT, 5 LLM, 1 TOOL. Earlier batches must not disappear. |
| `lifecycle` | Success/error closure and repeated flush | 3 spans persist, exactly one is errored, and every span ends once. |
| `batch-pressure` | Batching, exporter queue and Kafka throughput | Exactly 241 spans persist with zero drops and a completed trace. |
| `large-safe-payload` | Serialization, masking and large ClickHouse-safe values | The payload persists or is rejected/quarantined explicitly; numeric fields never become `[REDACTED]`. |

## Run locally without network export

```bash
NEATLOGS_LOCAL_ONLY=true npm run test:e2e:phase4 -- all
```

## Run against local/staging/production ingestion

```bash
NEATLOGS_API_KEY=... \
NEATLOGS_ENDPOINT=https://ingest.neatlogs.com \
PHASE4_RUN_ID=release-candidate-001 \
npm run test:e2e:phase4 -- all
```

Use a unique `PHASE4_RUN_ID` for every run. The emitted workflow and session names make each trace discoverable without logging credentials.

## Required read-back verification

For every emitted trace compare SDK/debug evidence with the hosted record:

- trace ID and terminal processing state;
- exact span count, span IDs, parent IDs and kinds;
- token values and their numeric types;
- masked input/output/tool/error fields;
- error status and exactly-once span completion;
- no malformed-message quarantine, repeated storage retries, or stuck Kafka offsets;
- ClickHouse row visibility and finalizer completion.

Do not run destructive malformed-type or unbounded queue tests against shared production ingestion. Inject invalid numeric values, forced Kafka failures, missing S3 objects, or ClickHouse rejection only in an isolated local/staging stack. Production tests in this suite remain schema-valid and bounded.

## Release gate

Phase 4 is not complete merely because each script exits successfully. It passes only when hosted read-back matches every scenario expectation and backend health shows no poisoned batch, stuck partition, retry loop, or trace finalization loss.
