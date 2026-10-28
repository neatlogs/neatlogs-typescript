# A/B testing

These APIs require a backend with the version 1 A/B endpoints. The source implementation is not a published SDK release.

Create a live test in Neatlogs with an original version, a new version, a session or user assignment unit, and an end date. Then connect your application's model choice to the returned parameters:

```typescript
import { init, trace, abTest, flush } from 'neatlogs';

await init({
  apiKey: process.env.NEATLOGS_API_KEY,
  experiments: { keys: ['cheap-model'] },
});

await trace({ name: 'support-answer', endUserId: userId }, async () => {
  const version = abTest('cheap-model', {
    unit: userId,
    fallback: { model: originalModel },
  });
  // Pass version.params.model to your existing model request.
});
await flush();
```

For a session test, use `sessionId` on the trace and the same session ID as `unit`. For a user test, use `endUserId` and the same user ID. Call `abTest` inside the trace that actually uses the selected version. Calling it outside a trace returns an assignment but cannot automatically record exposure.

Settings load during `init()` and refresh every 60 seconds. Assignment uses a stable SHA-256 hash locally and makes no HTTP request. Missing, invalid or expired settings use your `fallback` control parameters. Temporary network failures, HTTP 408/429 and server errors keep previously validated settings only until their original expiry; failures never extend that expiry. Revoked access and other invalid responses discard cached settings immediately. Returned parameters are copies. Paused tests serve the original version. Active rollouts serve the new version to 50% or 100% of assignment units until their monitoring deadline; a disabled or ended rollout returns to the original version. Legacy shipped tests without rollout settings retain their existing new-version default. Selecting parameters does not make a model request for you.

`experiments.baseUrl` optionally selects the API origin. It must be HTTPS, or HTTP on localhost for development. The project SDK API key authorizes only config reads and exposure writes, not experiment management.

The SDK stamps `neatlogs.ab.<key>` on the current trace and queues an exposure. `flush()` exports traces first, then sends exposures. A trace still being finalized stays queued with the same event ID. Background retries run every 60 seconds. Queues are bounded to 1,000 pending events, expire after 24 hours, and are in memory. A process crash can lose pending events. `flush()` returns false while delivery remains incomplete or an event was rejected. A standalone `AbTestClient` also exposes `getDiagnostics()`.

## Complete a session or user

Analysis uses completed assignment units. After the final trace of the whole session or user observation period has been exported, call:

```typescript
import { completeAbTestUnit, flush } from 'neatlogs';

completeAbTestUnit('cheap-model', {
  unitId: userId,
  arm: version.arm,
  allocationVersion: version.allocationVersion!,
  traceId: finalTraceId,
});
await flush();
```

Only report a completion for an assigned version with a non-null allocation version. Do not close the unit after each request in a multi-request session. Any new trace after closure or conflicting arm invalidates that unit. Keep the returned arm, allocation version and trace ID with your session state. The SDK does not guess when a user has finished.

An allocation version identifies the original test or a later rollout stage. Queued events keep that version across settings refreshes. A completion without an explicit version can reuse the remembered original trace assignment; missing or ambiguous assignment history returns `false`. This history is bounded and process-local, so persist the returned version when completion can happen later or in another process. New rollout traffic is monitored separately from the sealed A/B analysis.

## Existing feature flags

Use `logExposure('cheap-model', { unitId, arm: 'a' | 'b', traceId, allocationVersion })` to record the version selected by an external flag system. Omit `traceId` when called inside the relevant trace. An omitted allocation version uses the current cached settings when recording a new exposure. Close such units with `completeAbTestUnit(..., { ..., source: 'external', allocationVersion })`. Neatlogs does not change your external feature flag.

## Assignment protocol

Protocol 1 hashes UTF-8 `salt + ':' + unitId`, reads the first four SHA-256 bytes as an unsigned big-endian integer, and takes modulo 10,000. A bucket below the original arm's weight selects `a`; the rest select `b`. Salt `0123456789abcdef` repeated four times produces buckets 2509 for `user-1`, 2445 for `用户-α`, and 4105 for `session:42`.

For stable agent keys and session-only audience enrollment, see [protocol-v2 agent connection](agent-connection.md). Existing methods on this page remain protocol v1.
