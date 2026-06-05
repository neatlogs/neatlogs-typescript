# OpenRouter Agent basic example

Runs `callModel(...)` through `wrapOpenRouterAgent` and consumes the result with
`getText()`, producing a Neatlogs trace with a WORKFLOW parent and an LLM child
span (`provider=openrouter`). The LLM span is finalized when the `ModelResult`
is consumed — an unconsumed result ships no span (matching SDK semantics).

## Run

```bash
# Install the peer dep if not already present:
pnpm add @openrouter/agent

export OPENROUTER_API_KEY=...

# Then:
npx tsx examples/sdk_examples/openrouter_agent_basic/main.ts
```

Optional: `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`). Set
`NEATLOGS_DISABLE_EXPORT=true` to skip sending spans to the backend; spans are
still written to `openrouter_agent_basic_spans.log` and
`openrouter_agent_basic_raw_spans.log`.
