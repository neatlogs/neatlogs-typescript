# Google Gemini (AI Studio) basic example

Runs `generateContent`, `generateContentStream`, `embedContent`, and a multi-turn
chat session through `wrapGoogleGenAI` (a `@google/genai` client in AI-Studio
mode), producing a Neatlogs trace with a WORKFLOW parent plus LLM and EMBEDDING
child spans (`provider=google`, `system=google_genai`).

This mirrors Python's `neatlogs.wrap(genai.Client())`. For Vertex mode use
[`wrapVertexAI`](../vertex_ai_basic/); for zero-code tracing pass
`instrumentations: ['google_genai']` to `init()` instead of wrapping.

## Run

```bash
# Install the peer dep if not already present:
pnpm add @google/genai

# Gemini (AI Studio) API key — https://aistudio.google.com/apikey
export GOOGLE_API_KEY=...
export NEATLOGS_API_KEY=...   # or NEATLOGS_DISABLE_EXPORT=true

npx tsx examples/sdk_examples/google_genai_basic/main.ts
```

Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`), `GEMINI_EMBED_MODEL`
(default `text-embedding-004`). Set `NEATLOGS_DISABLE_EXPORT=true` to skip
sending spans to the backend; spans are still written to
`google_genai_basic_spans.log` and `google_genai_basic_raw_spans.log`.
