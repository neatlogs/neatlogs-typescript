# AWS Bedrock basic example

Runs the Converse and ConverseStream APIs through `wrapBedrock` (an
`@aws-sdk/client-bedrock-runtime` client), producing a Neatlogs trace with a
WORKFLOW parent plus LLM and TOOL child spans. `provider=bedrock`;
`system` is the underlying model vendor (e.g. `anthropic` for Claude),
inferred from the model id.

## Run

```bash
# Install the peer dep if not already present:
pnpm add @aws-sdk/client-bedrock-runtime

# Authenticate via the standard AWS credential chain, e.g.:
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# Then:
npx tsx examples/sdk_examples/bedrock_basic/main.ts
```

Optional: `BEDROCK_MODEL_ID` (default
`anthropic.claude-3-5-sonnet-20240620-v1:0`). Set `NEATLOGS_DISABLE_EXPORT=true`
to skip sending spans to the backend; spans are still written to
`bedrock_basic_spans.log` and `bedrock_basic_raw_spans.log`.
