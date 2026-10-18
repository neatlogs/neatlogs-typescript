# Real release briefs from SDK to simulations

ReleaseDesk researches the latest stable releases of FastAPI, Flask, Starlette and HTTPX. It calls a real model to select a GitHub tool, fetches the official release notes, then calls the model again to write an engineering brief. No answers or tool results are fabricated.

Build this SDK with `pnpm build`. Supply these variables through your local secret manager or shell environment:

| Variable | Purpose |
| --- | --- |
| `NEATLOGS_BASE_URL` | Explicit backend origin, such as `http://localhost:3181` |
| `NEATLOGS_PROJECT_ID` | Destination project UUID |
| `NEATLOGS_API_KEY` | That project's trace ingestion key |
| `NEATLOGS_SERVICE_TOKEN` | Service-account token bound to that project with dataset read/write and capture permissions |
| `OPENAI_BASE_URL` | HTTPS OpenAI-compatible provider endpoint |
| `OPENAI_API_KEY` | Existing provider credential |
| `OPENAI_MODEL` | Configured model or deployment name |
| `RELEASEDESK_MODEL_PROVIDER` | Recorded provider identity, such as `azure_openai` |
| `RELEASEDESK_RECEIPT` | Local output path for the dataset/version IDs and actual answers |

Run `node examples/releasedesk-dataset.mjs`. Each invocation creates one dataset and performs real provider calls, which may incur charges. It waits for successful publication of all four captured root traces before reporting success. If a run fails, inspect its capture status before starting again.

The example deliberately records the complete request actually sent: provider, model, message history, tool definitions and generation settings. Recording only `{ model, messages }` loses provider identity and can make an otherwise readable case unsuitable for simulation.

Open the published dataset and choose **Simulate → Select answers on this page**. Use the second recorded call, **Write upgrade brief**, to compare final answers. The earlier call selects a tool and will produce a tool request rather than a final brief.

A simulation repeats the selected model call using the frozen tool response. It does not fetch a newer release or execute the entire agent again. To refresh source facts, run the real agent and capture new evidence.

For offline A/B, run the same selected calls twice with the same dataset version and evaluation setup. Keep the original system prompt for A and try a shorter prompt for B. Open either run's **Compare runs** tab and choose the other run. Check accuracy, source URLs and useful smoke-test recommendations before judging whether brevity helped.
