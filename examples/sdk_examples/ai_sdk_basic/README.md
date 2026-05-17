# Vercel AI SDK basic example

Runs `generateText` and `streamText` (with a tool) through `wrapAISDK`,
producing a Neatlogs trace with parent + child spans and full attribute
coverage.

## Run

```bash
# Install peer deps if not already present:
pnpm add ai @ai-sdk/azure zod

# Then:
npx tsx examples/sdk_examples/ai_sdk_basic/main.ts
```

Requires `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, and optionally
`AZURE_OPENAI_DEPLOYMENT`. Set `NEATLOGS_DISABLE_EXPORT=true` to skip
sending spans to the backend; spans are still written to
`ai_sdk_basic_spans.log` and `ai_sdk_basic_raw_spans.log`.
