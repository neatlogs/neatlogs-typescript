# TypeScript SDK → local backend E2E test guide

This guide proves that a packed build of this SDK can export a deterministic trace through the public local Neatlogs ingest endpoint and retrieve the exact persisted trace through the public trace API.

```text
packed SDK → POST /v1/traces → Kafka → raw storage → finalizer
           → simplified spans → GET /api/traces/v3/:traceId
```

This does not test Doctor v2 backend receipts. `doctor --probe`, correlated diagnostic stages, diagnostic exclusion, and TTL cleanup require the Phase 9 backend implementation.

## Pass contract

| Alias | Name | Kind | Count | Parent | Required fields |
|---|---|---:|---:|---|---|
| `root` | `typescript-local-e2e` | `WORKFLOW` | 1 | none | input, output |
| `tool` | `diagnostic-tool` | `TOOL` | 1 | `root` | input, output |

PASS requires successful workflow execution, `flushAll()`, shutdown, ingestion, raw durability, finalization, non-zero simplified spans, exact-ID retrieval, and correct persisted hierarchy. HTTP `2xx`, Kafka enqueue, or a trace row alone is not PASS.

## 1. Check prerequisites

```bash
node --version
pnpm --version
docker --version
docker compose version
```

Expected output patterns:

```text
v18.x.x or newer
10.32.1
Docker version <version>, build <id>
Docker Compose version <version>
```

If pnpm is missing:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
```

## 2. Start local infrastructure

```bash
cd /Users/shyam-neatlogs/neatlogs-app
docker compose up -d postgres clickhouse redis kafka
docker compose ps
```

Expected services:

```text
neatlogs-postgres     running
neatlogs-clickhouse   running
neatlogs-redis        running
neatlogs-kafka        running
```

Do not run an unqualified `docker compose up`; optional workers require additional credentials and services.

## 3. Install and initialize the backend

```bash
cd /Users/shyam-neatlogs/neatlogs-app
pnpm install
cd backend
pnpm install
cd ..
pnpm db:push
pnpm db:clickhouse:push
```

All four commands must exit `0`. Migration counts can vary, but no migration may be reported failed.

## 4. Start backend processes

Use separate terminals.

Terminal A:

```bash
cd /Users/shyam-neatlogs/neatlogs-app/backend
pnpm dev
```

Required checkpoint:

```text
backend listening on port 4100
```

Terminal B:

```bash
cd /Users/shyam-neatlogs/neatlogs-app/backend
pnpm worker:kafka
```

Required checkpoint:

```text
Kafka consumer connected
```

Terminal C:

```bash
cd /Users/shyam-neatlogs/neatlogs-app/backend
pnpm worker:trace-finalizer
```

Required checkpoint:

```text
trace finalizer started
```

If asynchronous PII routing is enabled, start its dispatcher and redaction workers too. Stop if privacy processing cannot start; do not bypass it to force PASS.

Verify the backend:

```bash
curl --silent --show-error --output /dev/null \
  --write-out 'BACKEND_HTTP=%{http_code}\n' \
  http://localhost:4100/health
```

Exact expected output:

```text
BACKEND_HTTP=200
```

## 5. Create a local project key

Start the frontend:

```bash
cd /Users/shyam-neatlogs/neatlogs-app
pnpm dev
```

Open `http://localhost:3000`, sign in, create an organization and project, and copy that project's ingestion key. A production key does not authenticate against a new local database.

```bash
export NEATLOGS_API_KEY='<local-project-ingestion-key>'
export NEATLOGS_ENDPOINT='http://localhost:4100'

test -n "$NEATLOGS_API_KEY" && echo 'NEATLOGS_API_KEY=available'
test "$NEATLOGS_ENDPOINT" = 'http://localhost:4100' && echo 'NEATLOGS_ENDPOINT=valid'
```

Exact expected output:

```text
NEATLOGS_API_KEY=available
NEATLOGS_ENDPOINT=valid
```

Never put the key in source, command arguments, logs, generated artifacts, or chat.

## 6. Build and pack this branch

```bash
cd /Users/shyam-neatlogs/neatlogs-typescript
git switch feature/doctor-v2-local
git pull --ff-only
npm install
npm run build
SDK_TARBALL=$(npm pack --silent)
test -f "$SDK_TARBALL" && echo "SDK_PACKAGE=$SDK_TARBALL"
```

Expected final output pattern:

```text
SDK_PACKAGE=neatlogs-<version>.tgz
```

Use the tarball, not repository source, so missing package files and exports are detected.

## 7. Create a clean consumer

```bash
E2E_DIR=$(mktemp -d /tmp/neatlogs-ts-local-e2e.XXXXXX)
cd "$E2E_DIR"
npm init -y
npm install "/Users/shyam-neatlogs/neatlogs-typescript/$SDK_TARBALL"
```

Create `test.mjs`:

```js
import { flushAll, init, shutdown, span, trace } from "neatlogs";

async function main() {
  if (!process.env.NEATLOGS_API_KEY?.trim()) {
    throw new Error("NEATLOGS_API_KEY is required");
  }

  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    endpoint: process.env.NEATLOGS_ENDPOINT,
    workflowName: "typescript-local-e2e",
    registerShutdownHandlers: false,
  });

  let traceId = "";
  const diagnosticTool = span(
    { kind: "TOOL", name: "diagnostic-tool", toolName: "diagnostic-tool" },
    async (input) => ({ value: input.value * 2 }),
  );

  const result = await trace(
    {
      name: "typescript-local-e2e",
      kind: "WORKFLOW",
      input: { prompt: "generated local diagnostic input" },
    },
    async (root) => {
      traceId = root.spanContext().traceId;
      return diagnosticTool({ value: 21 });
    },
  );

  const flushed = await flushAll(10_000);
  const stopped = await shutdown();
  console.log(`TRACE_ID=${traceId}`);
  console.log(`RESULT=${JSON.stringify(result)}`);
  console.log(`FLUSH=${flushed}`);
  console.log(`SHUTDOWN=${stopped}`);

  if (!/^[0-9a-f]{32}$/.test(traceId) || !flushed || !stopped) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`E2E_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
```

## 8. Execute and validate local output

```bash
node test.mjs | tee e2e-output.log
```

Exact successful output shape:

```text
TRACE_ID=<32 lowercase hexadecimal characters>
RESULT={"value":42}
FLUSH=true
SHUTDOWN=true
```

Validate mechanically:

```bash
TRACE_ID=$(sed -n 's/^TRACE_ID=//p' e2e-output.log | tail -1)
test "${#TRACE_ID}" -eq 32
printf '%s' "$TRACE_ID" | grep -Eq '^[0-9a-f]{32}$'
grep -Fx 'RESULT={"value":42}' e2e-output.log
grep -Fx 'FLUSH=true' e2e-output.log
grep -Fx 'SHUTDOWN=true' e2e-output.log
echo 'LOCAL_WORKFLOW=PASS'
```

Exact final line:

```text
LOCAL_WORKFLOW=PASS
```

Stop immediately if the process exits non-zero, prints `E2E_ERROR`, or reports a false flush/shutdown result.

## 9. Retrieve the exact persisted trace

```bash
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl --silent --show-error \
    --output trace-response.json \
    --write-out '%{http_code}' \
    --header "x-api-key: $NEATLOGS_API_KEY" \
    "http://localhost:4100/api/traces/v3/$TRACE_ID")
  printf 'POLL=%s HTTP=%s\n' "$attempt" "$code"
  [ "$code" = 200 ] && break
  case "$code" in
    202|404|500|502|503|504) sleep 2 ;;
    *) echo 'PERSISTENCE=FAIL'; exit 1 ;;
  esac
done
test "$code" = 200
```

Successful output ends with:

```text
POLL=<1-10> HTTP=200
```

- Retry bounded `202`, `404`, and transient `5xx`.
- Stop immediately on `401`, `403`, or `409`.
- Never select the newest trace or search by name alone.
- A timeout is persistence failure; do not print a dashboard URL.

## 10. Validate persisted content

Verify:

```text
trace ID                    exact $TRACE_ID
WORKFLOW roots              exactly 1
root name                   typescript-local-e2e
TOOL spans                  exactly 1
tool name                   diagnostic-tool
tool parent                 root span ID
root input/output           present
tool input/output           present
simplified visible spans    greater than 0
terminal state              success/complete
```

Only after exact-ID retrieval succeeds, open `http://localhost:3000/traces`, select the same project, and inspect that trace ID. Automated success does not prove UI correctness.

## Failure classification

| Evidence | Classification |
|---|---|
| Credential/dependency check fails | Diagnostic failure; nothing ran |
| Workflow throws | Workflow failure |
| Local IDs/hierarchy invalid | Local telemetry failure |
| `flushAll()` is false | Export failure |
| `/v1/traces` rejects | Transport/authentication failure |
| Kafka succeeds but raw data is absent | Raw durability failure |
| Raw data exists but finalization stalls | Root/finalizer failure |
| Trace exists with zero simplified spans | Simplified durability failure |
| Exact trace API never returns it | Visibility failure |
| Persisted fields or hierarchy differ | Verification failure |

## Cleanup

Stop foreground processes with one `Ctrl-C` each, then preserve volumes while stopping infrastructure:

```bash
cd /Users/shyam-neatlogs/neatlogs-app
docker compose stop postgres clickhouse redis kafka
```

Do not use `docker compose down -v` unless local database and queue data should be deleted. Confirm `$E2E_DIR` before deleting the temporary consumer. Do not commit `.env`, tarballs, response artifacts, or local project keys.
