# Azure OpenAI basic example

Runs a non-streaming chat completion (with a tool call) and a streaming chat
completion through `wrapAzureOpenAI`, producing a Neatlogs trace with a
WORKFLOW parent plus LLM and TOOL child spans (`provider=azure`).

## Run

```bash
# Install the peer dep if not already present:
pnpm add openai

# Then:
npx tsx examples/sdk_examples/azure_openai_basic/main.ts
```

Requires `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, and a deployment name
via `AZURE_OPENAI_DEPLOYMENT` (default `gpt-4o-mini`). `AZURE_OPENAI_API_VERSION`
defaults to `2024-10-21`. Set `NEATLOGS_DISABLE_EXPORT=true` to skip sending
spans to the backend; spans are still written to `azure_openai_basic_spans.log`
and `azure_openai_basic_raw_spans.log`.
