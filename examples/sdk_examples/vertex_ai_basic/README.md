# Vertex AI basic example

Runs `generateContent`, `generateContentStream`, and `embedContent` through
`wrapVertexAI` (a `@google/genai` client in Vertex mode), producing a Neatlogs
trace with a WORKFLOW parent plus LLM and EMBEDDING child spans
(`provider=vertex_ai`, `system=vertexai`).

## Run

```bash
# Install the peer dep if not already present:
pnpm add @google/genai

# Authenticate (Application Default Credentials):
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export GOOGLE_CLOUD_PROJECT=my-gcp-project
export GOOGLE_CLOUD_LOCATION=us-central1

# Then:
npx tsx examples/sdk_examples/vertex_ai_basic/main.ts
```

Optional: `VERTEX_MODEL` (default `gemini-2.0-flash`), `VERTEX_EMBED_MODEL`
(default `text-embedding-004`). Set `NEATLOGS_DISABLE_EXPORT=true` to skip
sending spans to the backend; spans are still written to
`vertex_ai_basic_spans.log` and `vertex_ai_basic_raw_spans.log`.
