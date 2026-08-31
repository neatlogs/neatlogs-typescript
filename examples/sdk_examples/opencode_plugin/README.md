# opencode plugin example

opencode is a standalone CLI coding agent. Unlike the provider wrappers (which
you call from your own code), opencode is instrumented via its **plugin system** —
opencode loads the Neatlogs plugin itself and the plugin bootstraps tracing from
the environment. No `init()` call or code changes in your app are required.

Every opencode session then produces a Neatlogs trace with:

- **LLM** spans — one per assistant turn (model, provider, tokens, cost)
- **TOOL** spans — one per tool execution (read, edit, bash, …) with input/output

All spans are keyed by the opencode session id as `neatlogs.conversation.id`.

## Two ways to register the plugin

### 1. Local plugin file (this example)

`.opencode/plugin/neatlogs.ts` re-exports the plugin:

```ts
export { NeatlogsOpencodePlugin as default } from 'neatlogs/opencode';
```

opencode auto-loads any `*.ts` under `.opencode/plugin/` (project) or
`~/.config/opencode/plugin/` (global). Add a `package.json` with `neatlogs` as a
dependency next to the plugin dir so opencode can resolve the import.

### 2. npm package via `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["neatlogs"]
}
```

## Run

```bash
export NEATLOGS_API_KEY=...                 # required to export

# From this directory, launch opencode as usual:
opencode
```

Then drive a session (ask it to read/edit files, run commands). Each session
shows up in Neatlogs with turn-by-turn LLM spans and tool spans.
