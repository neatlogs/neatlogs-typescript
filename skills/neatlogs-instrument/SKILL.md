---
name: neatlogs-instrument
description: Instrument an app with the Neatlogs SDK and verify traces arrive correctly, from the terminal, for any coding agent.
---

# Instrument with Neatlogs and verify the trace

Lines marked [PROPOSED] describe commands or endpoints that do not exist yet.

## 0. Signup comes first (browser only)
Check for an API key (NEATLOGS_API_KEY in env or .env). If there is none, the user has no account yet.
1. Tell the user: "Sign up at the Neatlogs website in your browser first. I can't do this step for you."
2. Stop and wait until the user says signup is done.
3. Then set up the CLI login. [PROPOSED] `neatlogs login` opens a browser for login-based auth, like the AWS, Notion or Linear CLIs, and stores the credential locally. Until that exists, ask the user to create a project key in the dashboard and put it in NEATLOGS_API_KEY. Never ask the user to paste a key into chat.

## 1. Install and init
- Python: `pip install neatlogs`, then `neatlogs.init(api_key=os.environ["NEATLOGS_API_KEY"])` before any LLM client is created.
- TypeScript: `npm i neatlogs`, then `await init({ apiKey: process.env.NEATLOGS_API_KEY })`.
- Go: `go get github.com/neatlogs/neatlogs-go`, then init at startup and call shutdown/flush before exit.
Always flush before the process exits, or short scripts lose their spans.

## 2. Verify locally with doctor (exists today)
- TypeScript: `npx neatlogs doctor --local --json`
- Python: `neatlogs-doctor`
Read the JSON. Fix every failed check before moving on.

## 3. Verify end to end (exists today)
`NEATLOGS_API_KEY=... NEATLOGS_ENDPOINT=https://ingest.neatlogs.com npx neatlogs doctor --probe --json`
The probe sends a trace to /v1/traces and reads it back from /api/traces/v3/<trace_id>, then checks span count and types.

## 4. Verify the user's real run
1. Run the app once so it makes one LLM call.
2. [PROPOSED] `neatlogs traces get <trace_id> --json` and `neatlogs spans get <span_id> --json`.
3. The command checks: spans exist, span count matches, every parent resolves, every span has a name, LLM spans report token usage, trace is finalized. Also look at the span list for the expected LLM and tool calls.
4. [PROPOSED] `neatlogs trace fingerprint <trace_id>` returns a stable hash of span names, kinds and nesting, so the agent can compare runs. `neatlogs trace consolidated <trace_id>` returns the whole tree in one call.
5. If something is wrong, change the code, rerun, and fetch again. Stop after the check passes. Do not open the UI.

## 5. Report
Tell the user: the trace id, span count, and what you verified. Do not print the API key.

## MCP
[PROPOSED] If a Neatlogs MCP server is available, register it in the agent's MCP config so the agent can call get-trace and get-span as tools instead of shelling out.
