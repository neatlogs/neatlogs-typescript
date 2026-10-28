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
    if (decision.reason === 'assigned' && !agents.recordAgentRun(decision)) {
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

Reuse one client per application. Call `start()` if background config refresh and receipt retries are desired; `chooseAgent` also refreshes missing/expired config on demand. `refresh()` explicitly observes pause/revocation. Always pass a deployed fallback. `unavailable` uses that fallback and creates no experiment receipt; `current`, `paused`, `outside_audience` and `outside_share` use the server Current version and likewise do not count as tested units.

The server freezes the first eligible attribute snapshot for the selected customer or conversation and returns its persistent assignment. Attributes accept up to20 string/boolean values; missing values do not match audience rules. Assignment is usable only until the earlier config/assignment expiry. Transient transport/408/429/5xx refresh failures retain the original valid lease; they never extend it. Invalid/revoked config clears it immediately. A known pause overrides cached candidate use. Remote pause observation is bounded by the60s config TTL.

Choosing does not claim execution. `recordAgentRun` requires a recording Neatlogs root, tags its assignment receipt and fingerprint, and queues one exposure. Replay execution cannot enter this live path. For Customer ID assignment, pass the customer ID as `unit` and the root's `endUserId`; keep `sessionId` equal to the actual conversation ID. For Conversation ID assignment, pass the conversation ID as `unit` and `sessionId`. Call `completeAgentDecision` after exporting the final trace of each conversation. It sends `conversationComplete: true`. A session/`explicit` decision also sends `unitComplete: true`; a customer/`fixed_horizon` decision leaves the customer unit open until the server cutoff and delivery grace. Later conversations from that customer remain eligible for the same frozen assignment while it is active. Carry the same decision through completion even after config changes. Incomplete/failed delivery remains visible in `getDiagnostics()`; flush returns false if pending or rejected. Queues and caches are bounded and process-local; flush before shutdown.
