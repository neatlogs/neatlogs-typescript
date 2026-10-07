---
name: neatlogs-instrument
description: Add Neatlogs tracing to an app and check from the terminal that the trace arrived.
---

# Instrument with Neatlogs and check the trace

Lines marked (not built yet) describe commands that do not exist today.

## 1. Sign up first
Look for NEATLOGS_API_KEY in the environment or .env. If there is none, the user probably has no account yet.

1. Tell the user to sign up in the browser. This step cannot be done from the terminal.
2. Wait until they say it is done.
3. Then log in from the CLI (not built yet: `neatlogs login`, browser-based like the AWS or Linear CLIs). For now the user creates a project key in the dashboard and puts it in NEATLOGS_API_KEY. Never ask them to paste the key into the chat.

## 2. Install and init
- Python: `pip install neatlogs`, then `neatlogs.init(api_key=os.environ["NEATLOGS_API_KEY"])` before any LLM client is created.
- TypeScript: `npm i neatlogs`, then `await init({ apiKey: process.env.NEATLOGS_API_KEY })`.
- Go: see the neatlogs-go README for the init call.

Flush before the process exits or short scripts lose their spans.

## 3. Check the setup
- TypeScript: `npx neatlogs doctor --local --json`
- Python: `neatlogs-doctor --local`

To send a test trace to the backend and read it back:
`NEATLOGS_API_KEY=... npx neatlogs doctor --probe --json`

## 4. Check the real trace
1. Run the app once so it makes an LLM call. Note the trace id.
2. Run `neatlogs trace get <trace_id> --json` (needs NEATLOGS_API_KEY).
3. It checks that spans exist, the count matches, every parent is present, every span has a name, LLM spans report tokens, and the trace is finalized.
4. Exit codes: 0 pass, 1 a check failed, 2 not ready yet (wait a few seconds and retry), 3 key problem.
5. If a check fails, fix the code, rerun, and fetch again. No need to open the UI.

Not built yet: fetching a single span, a trace fingerprint, a consolidated trace view, and an MCP server for these calls.

## 5. Report back
Give the user the trace id, the span count, and what you checked. Don't print the API key.
