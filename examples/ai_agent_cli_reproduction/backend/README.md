# ai-agent-cli

This example is a snapshot of
[`DevDesignAmitesh/ai-agent-cli`](https://github.com/DevDesignAmitesh/ai-agent-cli)
used to reproduce Neatlogs tracing for a streamed OpenAI Responses API agent
loop. Its application structure is intentionally preserved.

The tracing-specific changes are limited to:

- using this repository's local Neatlogs SDK build;
- reusing one `wrapOpenAI()` client;
- attaching `sessionId` to the WORKFLOW root;
- returning the accumulated assistant response from `agentLoop()` so it is the
  WORKFLOW output.

`setTraceOutput()` is intentionally not used in the first experiment. If the
returned `response` does not appear as the workflow output, it can be added
inside the active workflow as the explicit fallback.

Run one repeatable turn without changing the original interactive default:

```bash
NEATLOGS_API_KEY=... OPENAI_API_KEY=... npm run dev -- "Reply with one short greeting"
```

Optional environment variables are `OPENAI_MODEL`, `NEATLOGS_SESSION_ID`, and
`NEATLOGS_WORKFLOW_NAME`.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
