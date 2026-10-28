# Agent connection (protocol v2)

`AgentClient` connects a stable agent key to the server's frozen Current/Candidate settings. It supports Customer ID (`end_user`) and Conversation ID (`session`) assignment. The server freezes the assignment unit and completion policy; this adapter does not make rollout decisions. Existing `AbTestClient` APIs keep protocol v1 unchanged; a v2-linked test must use this adapter.

```ts
import { AgentClient, trace, flush } from 'neatlogs';

const agents = new AgentClient({ baseUrl, apiKey, keys: ['support'] });
// Admit before creating the root trace. A missing/expired lease can perform HTTP.
const decision = await agents.chooseAgent('support', {
  unit: customerId,
  attributes: { environment: 'production' },
  fallback: { model: 'your-deployed-current-model' },
});
let traceId = '';
try {
  await trace({ name: 'reply', sessionId: conversationId, endUserId: customerId }, async span => {
    traceId = span.spanContext().traceId;
    const recorded = agents.recordAgentRun(decision); // Record every actual execution.
    if (decision.reason === 'assigned' && !recorded) {
      throw new Error('Unable to record assigned execution');
    }
    await runAgent(decision.params);
  });
} finally {
  await flush(); // Export telemetry before sending its exposure receipt.
  if (conversationFinished && traceId) agents.completeAgentDecision(decision, traceId);
  await agents.flush();
}
// Once, at process shutdown, after the final flush:
agents.close();
```

Reuse one client per application. Call `start()` if background config refresh and receipt retries are desired; `chooseAgent` also refreshes missing/expired config on demand. `refresh()` explicitly observes pause/revocation. Always pass a deployed fallback. `unavailable` uses that fallback and creates no experiment receipt; `current`, `paused`, `outside_audience` and `outside_share` create no experiment receipt. A negotiated `published` decision executes the server-selected publication and also creates no AB receipt.

The server freezes the first eligible attribute snapshot for the selected customer or conversation and returns its persistent assignment. Attributes accept up to20 string/boolean values; missing values do not match audience rules. Assignment is usable only until the earlier config/assignment expiry. Transient transport/408/429/5xx refresh failures retain the original valid lease; they never extend it. Invalid/revoked config clears it immediately. A known pause overrides cached candidate use. Remote pause observation is bounded by the60s config TTL.

Choosing does not claim execution. `recordAgentRun` requires a recording Neatlogs root, tags its assignment receipt and fingerprint, and queues one exposure. Replay execution cannot enter this live path. For Customer ID assignment, pass the customer ID as `unit` and the root's `endUserId`; keep `sessionId` equal to the actual conversation ID. For Conversation ID assignment, pass the conversation ID as `unit` and `sessionId`. Call `completeAgentDecision` after exporting the final trace of each conversation. It sends `conversationComplete: true`. A session/`explicit` decision also sends `unitComplete: true`; a customer/`fixed_horizon` decision leaves the customer unit open until the server cutoff and delivery grace. Later conversations from that customer remain eligible for the same frozen assignment while it is active. Carry the same decision through completion even after config changes. Incomplete/failed delivery remains visible in `getDiagnostics()`; flush returns false if pending or rejected. Queues and caches are bounded and process-local; flush before shutdown.

The client requests `serving-trace-v1` on the existing endpoints and requires acknowledgement on enhanced config, decisions and cache refreshes. Legacy servers and legacy policies retain their existing execution/receipt behavior; they do not gain enhanced historical coverage. Durable publications require a compatible deployed SDK/source build that executes the returned params. Publication decisions validate the advertised publication/fingerprint pair, serving revision and relevant audience attributes; unrelated attributes do not change the publication cache.

Call `recordAgentRun` for every actual execution inside the root trace, including fallback, Current and published decisions. It writes ordinary agent/unit/reason/actual-fingerprint metadata; its boolean continues to mean that a signed AB receipt was queued. Nonassigned choices normally return false. Optional `decision.cause` and root `decision_cause` distinguish `transport_unavailable`, `invalid_identity` and `unsupported_canonical_params`; an unknown cause is omitted. No raw exception or credential data is recorded. Mutating params before recording invalidates new-profile signed/publication attribution. Execute the exact snapshot recorded.

New-profile hashes use the existing backend canonical format, with UTF16 key order and NFC normalization of parameter string values only. Keys and audience strings retain their exact values. Lone surrogates, unknown Unicode normalization data and non-lossless native number representations fail closed for enhanced evidence; unsupported actual identity is left unknown rather than assigned a copied fingerprint. Legacy policy behavior remains unchanged. Missing entirely unexported executions remain an instrumentation assumption; known observed fallback runs cannot count as complete primary evidence.

Update every instance that serves this agent before starting a new test.

A true recorder result means a signed receipt was queued; it does not mean final telemetry was accepted or primary cohort coverage is complete. Signed identity keeps priority over ordinary tags near attribute limits; known missing signed tags are not queued.
