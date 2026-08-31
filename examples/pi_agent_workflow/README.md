# Pi Agent × Neatlogs

These examples use the maintained `@earendil-works/pi-agent-core` and
`@earendil-works/pi-ai` 0.83 releases (Node.js 22.19 or newer).

## Setup

```bash
npm install
npm run build
```

Put the credentials in the repo-root `.env` (gitignored):

```dotenv
NEATLOGS_API_KEY=<project key>
OPENAI_API_KEY=<OpenAI key>
```

## Real multi-turn workflow

```bash
npm run example:pi-agent
```

`main.mts` is one coherent incident-response conversation backed by an
`AgentHarness`, real model calls, tools, a skill, a prompt template, steering,
follow-up work, branching with `navigateTree()`, and compaction. It also exercises
session persistence, labels, bookmarks, branching, and repository methods.

The traceable model/tool operations produce this hierarchy:

```text
AGENT pi_agent.run
└─ CHAIN pi_agent.turn.N
   ├─ LLM pi_agent.llm.<model>
   └─ TOOL pi_agent.tool.<name>
```

`AgentHarness.compact()` and summarizing `navigateTree()` call models outside the
ordinary Agent event loop, so `piAgentHooks()` wraps those operations explicitly as
WORKFLOW → CHAIN → LLM traces. Non-summarizing navigation and pure configuration,
queue, session, and repository state operations do not invent LLM spans.

## API surface probe

```bash
npm run example:pi-agent:surface
```

`surface.mts` is intentionally separate from the conversation. It exercises the
remaining `Agent` state/configuration methods and prompt overloads, all four
functional loop APIs, async `StreamFn` support, and standalone `tracePiStream()`.
This makes compatibility coverage explicit without pretending independent API calls
are turns in one user workflow.

Both examples assign distinct workflow names directly. The wrapper remains duck-typed
and compatible with legacy `@mariozechner/pi-agent-core` projects, which the test suite
keeps installed.
