Neatlogs TypeScript SDK — Implementation Plan
Summary
Port the Neatlogs Python SDK v3 (sdk-v3 branch) to TypeScript as an npm package in the neatlogs/neatlogs-typescript repository. The TypeScript SDK mirrors the Python SDK's OpenTelemetry-native architecture, unified span() wrapper, prompt management system, and attribute processing pipeline — adapted to idiomatic TypeScript patterns (AsyncLocalStorage for context, function wrappers instead of decorators, dual CJS/ESM output). The SDK will ship as neatlogs on npm with the same 6 core exports: init(), flush(), shutdown(), span(), trace(), and PromptTemplate.

Python → TypeScript Module Map
Every Python SDK module is listed below with its TypeScript counterpart. Nothing is skipped.

Python Module	Lines	TypeScript Equivalent	Notes
neatlogs/__init__.py	80	src/index.ts	Re-exports public API
neatlogs/init.py	496	src/init.ts	init(), flush(), shutdown()
neatlogs/version.py	29	src/version.ts	Read from package.json
neatlogs/core/span_processor.py	466	src/core/span-processor.ts	NeatlogsSpanProcessor implements OTel SpanProcessor
neatlogs/core/attribute_processor.py	1215	src/core/attribute-processor.ts	UnifiedAttributeProcessor — normalize raw OTel attrs
neatlogs/core/context.py	247	src/core/context.ts	trace() context manager → async wrapper function
neatlogs/core/exporter.py	404	src/core/exporter.ts	NeatlogsExporter for log spans (batch HTTP)
neatlogs/core/log.py	220	src/core/log.ts	log() function + stdout capture
neatlogs/core/log_exporter.py	153	src/core/log-exporter.ts	Bridges OTel LogRecords → NeatlogsExporter
neatlogs/core/logger.py	83	src/core/logger.ts	Internal SDK debug logger
neatlogs/core/mask.py	68	src/core/mask.ts	PII mask registry + applyMask()
neatlogs/core/llm_binder.py	128	src/core/llm-binder.ts	bindTemplates()
neatlogs/core/metrics_correlation.py	180	src/core/metrics-correlation.ts	Token usage + cost tracking
neatlogs/core/instrumentation_scope_parser.py	267	src/core/instrumentation-scope-parser.ts	Framework detection from scope
neatlogs/core/crewai_task_registry.py	39	src/core/crewai-task-registry.ts	registerCrewaiTask()
neatlogs/decorators/__init__.py	—	src/decorators/index.ts	Re-export span
neatlogs/decorators/_base.py	269	src/decorators/base.ts	decorateSpan(), serialization, input binding
neatlogs/decorators/orchestration.py	412	src/decorators/orchestration.ts	span() wrapper function + MCP_TOOL + RETRIEVER postprocessor
neatlogs/instrumentation/__init__.py	—	src/instrumentation/index.ts	Re-export
neatlogs/instrumentation/manager.py	1372	src/instrumentation/manager.ts	InstrumentationManager — auto-discover + instrument
neatlogs/instrumentation/registry.py	345	src/instrumentation/registry.ts	INSTRUMENTATION_REGISTRY constant
neatlogs/instrumentation/http_context_propagation.py	207	src/instrumentation/http-context-propagation.ts	Patch fetch/undici for context propagation
neatlogs/prompt/__init__.py	—	src/prompt/index.ts	Re-export
neatlogs/prompt/template.py	212	src/prompt/template.ts	PromptTemplate, UserPromptTemplate, PromptContext
neatlogs/prompt/client.py	592	src/prompt/client.ts	PromptClient, PromptHandle, CachedPrompt, module-level API
neatlogs/config/__init__.py	—	src/config/index.ts	Re-export
neatlogs/config/attribute_mapper.py	330	src/config/attribute-mapper.ts	JSON config loader + wildcard matcher
neatlogs/config/defaults_enricher.py	148	src/config/defaults-enricher.ts	Model defaults enrichment
neatlogs/config/attribute-mapping.json	1064	src/config/attribute-mapping.json	Copied verbatim
neatlogs/config/model_defaults.json	675	src/config/model_defaults.json	Copied verbatim
neatlogs/span_kinds/__init__.py	—	src/span-kinds/index.ts	Re-export
neatlogs/span_kinds/mapping.py	60	src/span-kinds/mapping.ts	Span kind constants + mapping
(no Python equivalent — uses OpenInference)	—	src/instrumentation/custom/google-genai.ts	Custom instrumentor for @google/generative-ai
(no Python equivalent — uses OpenInference)	—	src/instrumentation/custom/crewai.ts	Custom instrumentor for CrewAI TS
Design Decisions
1. span() — How to Expose the Decorator in TypeScript
Python's @span(kind="WORKFLOW") works seamlessly on both sync and async functions. TypeScript has no direct equivalent — there are three viable approaches, each with real trade-offs:

Approach	Syntax	Pros	Cons
A. Higher-order function wrapper	const myFn = span({ kind: "WORKFLOW" }, async (q) => { ... })	Works everywhere (Node 18+, Bun, Deno, browsers). Full type inference on inputs + return type. No build flags. Composable.	Slightly more nesting than Python. Named functions require const fn = span(...) pattern.
B. Closure / callback wrapper	await withSpan({ kind: "WORKFLOW" }, async (span) => { ... })	Familiar withX() pattern. Span object available in scope. No wrapping of existing functions.	Cannot wrap an existing function — must inline the body. Not reusable as a named function.
C. TC39 Stage 3 class-method decorator	@Span({ kind: "AGENT" }) async run(q) { ... }	Closest to Python DX. Clean syntax on class methods.	Class methods only — most LLM app code is functional. Requires TS 5.0+ or experimentalDecorators. Cannot decorate standalone functions.
Recommendation: Ship A as the primary API, with C as an optional export.

Option A is the most versatile — it works on standalone functions (the dominant pattern in LLM apps), preserves types, and requires no build configuration. Option C is a nice-to-have for users who structure their agents as classes. Option B is subsumed by trace() which already provides the callback-with-span pattern for grouping operations.

The documented default would be:

typescript
import { span } from 'neatlogs';

const myWorkflow = span({ kind: 'WORKFLOW' }, async (query: string) => {
  return await process(query);
});

await myWorkflow('What is TypeScript?');

2. Context Propagation — AsyncLocalStorage
Python uses contextvars.ContextVar for context-local state. The TypeScript equivalent is AsyncLocalStorage from node:async_hooks (stable since Node.js 16.4+).

This is a non-trivial architectural decision because it:

Sets the minimum Node.js version to 16.4+ (we target 18+ anyway, so this is fine)
Is the mechanism that makes trace() and PromptContext work across async boundaries
Is how OTel JS itself propagates context — so we align with the ecosystem
Used for:

PromptContext / UserPromptContext — store template + variables during trace() so they're available when compile() is called inside the callback
Per-span mask propagation — trace(..., { mask: fn }) registers the mask in context
Session-aware root trace creation — trace() checks if there's an active parent span in context
OTel's own context.with() uses AsyncLocalStorage under the hood, so our context propagation is compatible
3. Module Format — Dual CJS/ESM
Ship both CommonJS and ESM via tsup (or unbuild). The package.json uses conditional exports:

json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }
}

4. Instrumentation Strategy — The Biggest Difference from Python
This is the most critical architectural difference between the Python and TypeScript SDKs. The Python SDK v3 relies on 30+ OpenInference instrumentor packages. The TypeScript/JavaScript ecosystem has far fewer — only ~9 exist today. This gap directly affects what the SDK can auto-instrument out of the box.

Coverage Matrix: Python OpenInference vs. TypeScript OpenInference
LLM Providers (19 in Python)

Library	Python OpenInference	TypeScript OpenInference	TS Strategy
openai	openinference.instrumentation.openai	@arizeai/openinference-instrumentation-openai	Auto-instrument
anthropic	openinference.instrumentation.anthropic	@arizeai/openinference-instrumentation-anthropic	Auto-instrument
bedrock	openinference.instrumentation.bedrock	@arizeai/openinference-instrumentation-bedrock	Auto-instrument
langchain	openinference.instrumentation.langchain	@arizeai/openinference-instrumentation-langchain	Auto-instrument
mcp	openinference.instrumentation.mcp	@arizeai/openinference-instrumentation-mcp	Auto-instrument
beeai	openinference.instrumentation.beeai	@arizeai/openinference-instrumentation-beeai	Auto-instrument
claude-agent-sdk	—	@arizeai/openinference-instrumentation-claude-agent-sdk	Auto-instrument (TS-only!)
cohere	openinference.instrumentation.cohere	—	Registry entry, skip at runtime
groq	openinference.instrumentation.groq	—	Registry entry, skip at runtime
together	(openllmetry only)	—	Registry entry, skip at runtime
vertexai	openinference.instrumentation.vertexai	—	Registry entry, skip at runtime
google_generativeai	(openllmetry only)	—	Registry entry, skip at runtime
google_genai	openinference.instrumentation.google_genai	—	Custom neatlogs instrumentor (Task 16)
mistralai	openinference.instrumentation.mistralai	—	Registry entry, skip at runtime
ollama	(openllmetry only)	—	Registry entry, skip at runtime
watsonx	(openllmetry only)	—	Registry entry, skip at runtime
alephalpha	(openllmetry only)	—	Registry entry, skip at runtime
replicate	(openllmetry only)	—	Registry entry, skip at runtime
sagemaker	(openllmetry only)	—	Registry entry, skip at runtime
huggingface_hub	—	—	Registry entry, skip at runtime
litellm	openinference.instrumentation.litellm	—	Registry entry, skip at runtime
portkey	openinference.instrumentation.portkey	—	Registry entry, skip at runtime
azure_ai_inference	(neatlogs custom)	—	Registry entry, skip at runtime
Agent Frameworks (13 in Python)

Library	Python OpenInference	TypeScript OpenInference	TS Strategy
langchain	openinference.instrumentation.langchain	@arizeai/openinference-instrumentation-langchain	Auto-instrument
crewai	openinference.instrumentation.crewai	—	Custom neatlogs instrumentor (Task 16)
llamaindex	openinference.instrumentation.llama_index	—	Registry entry, skip at runtime
autogen	openinference.instrumentation.autogen	—	Registry entry, skip at runtime
haystack	openinference.instrumentation.haystack	—	Registry entry, skip at runtime
dspy	openinference.instrumentation.dspy	—	Registry entry, skip at runtime
agno	openinference.instrumentation.agno	—	Registry entry, skip at runtime
beeai	openinference.instrumentation.beeai	@arizeai/openinference-instrumentation-beeai	Auto-instrument
openai_agents	openinference.instrumentation.openai_agents	—	Registry entry, skip at runtime
pydantic_ai	openinference.instrumentation.pydantic_ai	—	Registry entry, skip at runtime
smolagents	openinference.instrumentation.smolagents	—	Registry entry, skip at runtime
strands	openinference.instrumentation.strands	—	Registry entry, skip at runtime
pipecat	openinference.instrumentation.pipecat	—	Registry entry, skip at runtime
Vector DBs (9 in Python) — None have TypeScript OpenInference packages. All get registry entries that skip at runtime.

Other (HTTP, frameworks) — HTTP instrumentation uses OTel's own @opentelemetry/instrumentation-fetch / @opentelemetry/instrumentation-undici. No OpenInference needed.

Summary
8 libraries auto-instrumented via OpenInference: openai, anthropic, bedrock, langchain, mcp, beeai, claude-agent-sdk, bedrock-agent-runtime
2 libraries get custom neatlogs instrumentors: google_genai, crewai (Task 16)
~38 libraries get registry entries but skip at runtime (logged as debug message)
1 TS-only library: claude-agent-sdk (not in Python SDK)
Strategy
The INSTRUMENTATION_REGISTRY includes entries for all libraries (matching Python's full list). Each entry has an openinference field that is either the npm package name (if available) or null. At runtime:

User calls init({ instrumentations: ["openai", "groq"] })
InstrumentationManager looks up each library in the registry
For openai: finds @arizeai/openinference-instrumentation-openai, dynamically imports it, calls .instrument()
For groq: finds null, logs "[neatlogs] groq instrumentation not yet available for TypeScript — skipping" at debug level
No error thrown — graceful degradation
This keeps the registry future-proof. As Arize publishes new TS instrumentors (or we write custom ones), we just fill in the package name — no API changes needed.

Custom Neatlogs Instrumentors (google_genai, crewai)
For google_genai (@google/generative-ai) and crewai, we build custom instrumentors that live in src/instrumentation/custom/. These follow the same OTel Instrumentor interface and monkey-patch the target library's key methods to emit spans with OpenInference-compatible attributes. The registry's neatlogs field points to these custom instrumentors (same pattern as Python's azure_ai_inference custom instrumentor).

See Task 16 for implementation details.

Future: Additional Custom Instrumentors
For other libraries with significant TypeScript usage but no OpenInference package (e.g., Vercel AI SDK), we can add more custom instrumentors following the same pattern established in Task 16. The registry already supports a neatlogs field for custom instrumentors — just fill in the module path.

5. HTTP Auto-Instrumentation — Always-On (Same as Python)
Same as the Python SDK, init() will always call instrumentHttp() internally, which patches fetch / undici for W3C traceparent context propagation. This ensures trace context flows across HTTP boundaries without the user needing to opt in.

The SDK's own internal HTTP calls (PromptClient, NeatlogsExporter) will suppress OTel instrumentation on themselves (same as Python does with _SUPPRESS_INSTRUMENTATION_KEY), so they never generate spurious spans.

6. HTTP Client for Internal SDK Use
Python uses requests. TypeScript will use the built-in fetch API (Node 18+) for the PromptClient and NeatlogsExporter. No external HTTP dependency.

7. Transport — OTLP
Same as Python: @opentelemetry/exporter-trace-otlp-proto for span export via HTTP to {base_url}/v1/traces. The NeatlogsExporter (for log spans) uses the custom batch HTTP endpoint at /api/data/v4/batch.

Project Structure
neatlogs-typescript/
├── package.json
├── tsconfig.json
├── tsup.config.ts              # Build config (dual CJS/ESM)
├── vitest.config.ts            # Test config
├── README.md
├── LICENSE
├── src/
│   ├── index.ts                # Public API re-exports
│   ├── init.ts                 # init(), flush(), shutdown()
│   ├── version.ts              # SDK version from package.json
│   ├── types.ts                # Shared TypeScript interfaces/types
│   ├── core/
│   │   ├── index.ts
│   │   ├── span-processor.ts   # NeatlogsSpanProcessor
│   │   ├── attribute-processor.ts  # UnifiedAttributeProcessor
│   │   ├── context.ts          # trace() wrapper
│   │   ├── exporter.ts         # NeatlogsExporter (batch HTTP for logs)
│   │   ├── log.ts              # log() function
│   │   ├── log-exporter.ts     # OTel LogRecord → NeatlogsExporter bridge
│   │   ├── logger.ts           # Internal debug logger
│   │   ├── mask.ts             # PII mask registry
│   │   ├── llm-binder.ts       # bindTemplates()
│   │   ├── metrics-correlation.ts  # Token/cost tracking
│   │   ├── instrumentation-scope-parser.ts
│   │   └── crewai-task-registry.ts
│   ├── decorators/
│   │   ├── index.ts
│   │   ├── base.ts             # decorateSpan(), serialization
│   │   └── orchestration.ts    # span() wrapper + MCP_TOOL + RETRIEVER
│   ├── instrumentation/
│   │   ├── index.ts
│   │   ├── manager.ts          # InstrumentationManager
│   │   ├── registry.ts         # INSTRUMENTATION_REGISTRY
│   │   ├── http-context-propagation.ts
│   │   └── custom/
│   │       ├── google-genai.ts  # Custom instrumentor for @google/generative-ai
│   │       └── crewai.ts        # Custom instrumentor for CrewAI TS
│   ├── prompt/
│   │   ├── index.ts
│   │   ├── template.ts         # PromptTemplate, UserPromptTemplate
│   │   └── client.ts           # PromptClient, module-level API
│   ├── config/
│   │   ├── index.ts
│   │   ├── attribute-mapper.ts
│   │   ├── defaults-enricher.ts
│   │   ├── attribute-mapping.json
│   │   └── model_defaults.json
│   └── span-kinds/
│       ├── index.ts
│       └── mapping.ts
├── tests/
│   ├── unit/
│   │   ├── init.test.ts
│   │   ├── span.test.ts
│   │   ├── trace.test.ts
│   │   ├── prompt-template.test.ts
│   │   ├── prompt-client.test.ts
│   │   ├── attribute-processor.test.ts
│   │   ├── span-processor.test.ts
│   │   ├── mask.test.ts
│   │   ├── log.test.ts
│   │   ├── instrumentation-manager.test.ts
│   │   └── version.test.ts
│   └── integration/
│       └── e2e-trace.test.ts
└── examples/
    ├── basic-openai.ts
    ├── prompt-management.ts
    ├── multi-agent-workflow.ts
    └── custom-spans.ts

Tasks
Task 1: Project scaffolding and build system [parallel]
Set up the neatlogs-typescript repository with:

package.json with:
name: neatlogs
Node engine: >=18.0.0
Dependencies: @opentelemetry/api, @opentelemetry/sdk-trace-node, @opentelemetry/sdk-trace-base, @opentelemetry/exporter-trace-otlp-proto, @opentelemetry/resources, @opentelemetry/semantic-conventions, @opentelemetry/sdk-logs, @opentelemetry/api-logs
Dev dependencies: typescript, tsup, vitest, @types/node
Scripts: build, test, lint, dev
Exports: dual CJS/ESM via conditional exports
tsconfig.json targeting ES2022, strict mode, module NodeNext
tsup.config.ts for dual CJS/ESM build
vitest.config.ts
.gitignore (node_modules, dist, coverage)
src/index.ts — empty placeholder with TODO comment
src/types.ts — all shared TypeScript interfaces:
InitOptions (mirrors Python init() params)
SpanOptions (mirrors Python span() params)
TraceOptions (mirrors Python trace() params)
SpanKind union type: "WORKFLOW" | "AGENT" | "CHAIN" | "TOOL" | "RETRIEVER" | "EMBEDDING" | "MCP_TOOL" | "GUARDRAIL"
MaskFunction type: (spanData: Record<string, any>) => Record<string, any> | null
CachedPrompt interface
PromptMessage interface: { role: string; content: string }
Files: package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, .gitignore, src/index.ts, src/types.ts

Task 2: Core infrastructure — logger, version, mask, span-kinds [parallel]
Implement the foundational modules that other modules depend on.

src/core/logger.ts — Internal debug logger (mirrors core/logger.py):

getLogger() returns a logger that only outputs when debug mode is enabled
Uses console.debug / console.warn / console.error
Controlled by a module-level _debugEnabled flag set during init()
src/version.ts — SDK version (mirrors version.py):

Export __version__ read from package.json at build time
Use createRequire or bundled constant
src/core/mask.ts — PII mask registry (mirrors core/mask.py):

registerMask(fn: MaskFunction): string — register and return lookup key
applyMask(spanData, globalMask): Record<string, any> — per-span mask takes precedence over global
Module-level _MASK_REGISTRY: Map<string, MaskFunction>
src/span-kinds/mapping.ts — Span kind constants (mirrors span_kinds/mapping.py):

VALID_SPAN_KINDS set
SpanKindMapping object
Files: src/core/logger.ts, src/version.ts, src/core/mask.ts, src/span-kinds/mapping.ts, src/span-kinds/index.ts

Task 3: Config — attribute mapping + model defaults [parallel]
Port the configuration system that drives attribute normalization.

src/config/attribute-mapping.json — Copy verbatim from Python config/attribute-mapping.json

src/config/model_defaults.json — Copy verbatim from Python config/model_defaults.json

src/config/attribute-mapper.ts — (mirrors config/attribute_mapper.py):

AttributeMapper class
loadMappingConfig() — load JSON config
mapAttribute(source: string): string | null — resolve attribute name via mapping rules
Support wildcard patterns from the JSON config
src/config/defaults-enricher.ts — (mirrors config/defaults_enricher.py):

DefaultsEnricher class
enrich(spanDict, modelName) — add pricing, token limits, context window from model_defaults.json
Files: src/config/attribute-mapping.json, src/config/model_defaults.json, src/config/attribute-mapper.ts, src/config/defaults-enricher.ts, src/config/index.ts

Task 4: Attribute processor + instrumentation scope parser [after 2, 3]
Port the core attribute normalization pipeline.

src/core/attribute-processor.ts — (mirrors core/attribute_processor.py, 1215 lines):

UnifiedAttributeProcessor class
normalize(spanDict): Record<string, any> — the main pipeline:
Extract span metadata (name, kind, trace/span IDs)
Detect span kind from openinference.span.kind
Map framework-specific attributes via AttributeMapper
Extract LLM semantics (model, tokens, cost, streaming)
Extract framework-specific data (messages, documents, tools)
Enrich with defaults from DefaultsEnricher
Merge into final normalized dict
Uses AttributeMapper and DefaultsEnricher from Task 3
src/core/instrumentation-scope-parser.ts — (mirrors core/instrumentation_scope_parser.py):

parseInstrumentationScope(scopeName: string) — detect framework from OTel scope
Returns { framework: string; convention: "openinference" | "openllmetry" | "neatlogs" }
src/core/metrics-correlation.ts — (mirrors core/metrics_correlation.py):

Token usage extraction and cost calculation
extractTokenUsage(attrs) and calculateCost(model, tokens)
Files: src/core/attribute-processor.ts, src/core/instrumentation-scope-parser.ts, src/core/metrics-correlation.ts

Task 5: Span processor [after 4]
Port the NeatlogsSpanProcessor that pre-processes spans before export.

src/core/span-processor.ts — (mirrors core/span_processor.py, 466 lines):

NeatlogsSpanProcessor implements OTel SpanProcessor interface
onStart(span, parentContext):
Track parent spans for RETRIEVER suppression (deduplication)
Suppress OpenInference RETRIEVER parent spans
onEnd(span):
Convert ReadableSpan to mutable dict
Run UnifiedAttributeProcessor.normalize()
Apply mask via applyMask()
Optional file logging (controlled by NEATLOGS_LOG_SPANS / NEATLOGS_LOG_RAW_SPANS env vars)
Write normalized attributes back to span
Track performance stats
shutdown() and forceFlush() — delegate to inner processor
Constructor takes { sampleRate, debug, mask }
Files: src/core/span-processor.ts
Task 6: Decorators — span() function wrapper [after 2]
Port the unified @span decorator as a function wrapper.

src/decorators/base.ts — (mirrors decorators/_base.py):

serializeObj(obj: any): any — handle Pydantic-like objects, plain objects, primitives
safeJsonDumps(value: any): string — safe JSON serialization
bindCallArgs(fn, args): Record<string, any> — extract named arguments
shouldCaptureContent(): boolean — check NEATLOGS_TRACE_CONTENT env var
setCommonSpanAttrs(span, opts) — set openinference.span.kind, neatlogs.internal, tags, metadata, etc.
decorateSpan(opts): (fn) => wrappedFn — core wrapper factory:
Creates OTel span via tracer.startActiveSpan()
Sets common attributes
Captures input/output as input.value / output.value
Handles async and sync functions
Supports captureStdout (via console interception)
Supports per-span mask
Calls optional postprocessResult callback
src/decorators/orchestration.ts — (mirrors decorators/orchestration.py):

span(options: SpanOptions, fn: Function) — the primary public API:
Validates kind against VALID_SPAN_KINDS
Routes MCP_TOOL to createMcpToolWrapper() (special Pydantic-like handling)
Sets kind-specific attributes (AGENT: role/goal, TOOL: tool_name/parameters, EMBEDDING: model/dimension)
Sets RETRIEVER postprocessor for auto document extraction
Delegates to decorateSpan()
createMcpToolWrapper(opts, fn) — MCP_TOOL special handling:
Checks first arg for .toJSON() / plain object (JS equivalent of Pydantic .model_dump())
Wraps string results as { result: "..." }
Sets both mcp.* and standard attributes
retrieverPostprocessor(span, result, boundInputs) — extract documents from result:
Look for query in query, question, text keys
Extract documents from list/tuple results or dict with documents/docs/results keys
Set retrieval.documents.N.document.* attributes (up to 20 docs)
Also export a class-method decorator variant:

Span(options: SpanOptions) — TC39 Stage 3 decorator for class methods
Thin wrapper around the same decorateSpan() logic
Files: src/decorators/base.ts, src/decorators/orchestration.ts, src/decorators/index.ts

Task 7: Context manager — trace() [after 2, 6]
Port the trace() context manager as an async wrapper function.

src/core/context.ts — (mirrors core/context.py):

Python's with trace(...) becomes a callback-based wrapper in TypeScript:

typescript
await trace({ name: "my-trace" }, async (span) => {
  // ... your code
});

trace(options: TraceOptions, fn: (span) => T | Promise<T>): Promise<T>
Get session config from getSessionConfig()
Determine if root trace needed (session_id set + no active parent span)
Set prompt template/variables in OTel context via context.with()
Create span (root or child)
Set span attributes (kind, prompt template, version, custom attributes)
Register per-span mask if provided
Execute callback
Finalize prompt capture (read from PromptContext / UserPromptContext)
Clean up context
Files: src/core/context.ts
Task 8: Prompt system — templates + client [after 2]
Port the prompt management system.

src/prompt/template.ts — (mirrors prompt/template.py):

PromptContext class — static methods using AsyncLocalStorage:
set(template, variables), getTemplate(), getVariables(), clear()
UserPromptContext class — same pattern for user prompts
PromptTemplate class:
Constructor takes string | PromptMessage[]
variables getter — extract {{variable}} names via regex
compile(variables) — render template, store in PromptContext
_renderString(text, variables) — {{key}} replacement
UserPromptTemplate class — identical structure, uses UserPromptContext
src/prompt/client.ts — (mirrors prompt/client.py):

Error classes: PromptClientError, PromptApiError, PromptNotFoundError
CachedPrompt interface (matches Python dataclass)
PromptHandle class:
Properties: id, name, version, content, messages, config, labels, updatedAt, type
compile(variables) — render content string
compileMessages(variables) — render message list
PromptClient class:
Constructor: { baseUrl, apiKey }
Uses fetch() for HTTP (no external deps)
Suppresses OTel instrumentation on its own HTTP calls
Methods: getPrompt(), fetchPrompt(), listPrompts(), createPrompt(), updatePrompt(), deletePrompt(), removeTag(), saveAsVersion()
Module-level convenience functions (use shared client from init()):
getPrompt(), fetchPrompt(), listPrompts(), createPrompt(), updatePrompt(), saveAsVersion(), deletePrompt(), removeTag()
normalizePromptObject(raw) — normalize API response to CachedPrompt
renderTemplate(template, variables) — {{key}} replacement
Files: src/prompt/template.ts, src/prompt/client.ts, src/prompt/index.ts

Task 9: Log system [after 2]
Port the logging/step capture system.

src/core/log.ts — (mirrors core/log.py):

log(msgTemplate, options?) — capture a timestamped step:
Render template with {key} placeholders
Echo to console when debug mode enabled
Emit OTel LogRecord with log.template, log.level, log.{key} attributes
Auto-picks up trace_id/span_id from active context
CaptureStdoutContext class — intercept console.log within a span:
Replace console.log temporarily
Route each line through OTel logger
Restore original on exit
src/core/log-exporter.ts — (mirrors core/log_exporter.py):

NeatlogsLogExporter — bridges OTel LogRecord → NeatlogsExporter
Converts log records to span-like dicts for the batch endpoint
src/core/exporter.ts — (mirrors core/exporter.py):

NeatlogsExporter — batch HTTP exporter for log spans:
Buffers spans, flushes on interval or batch size
Posts to /api/data/v4/batch
Headers: x-api-key
Handles disableExport flag
Files: src/core/log.ts, src/core/log-exporter.ts, src/core/exporter.ts

Task 10: Instrumentation manager + registry [after 2]
Port the auto-instrumentation system.

src/instrumentation/registry.ts — (mirrors instrumentation/registry.py):

INSTRUMENTATION_REGISTRY constant — exact same structure as Python:
tags: { llm: [...], embedding: [...], retrieval: [...], agent: [...], tool: [...], http: [...], framework: [...] }
libraries: each library with openinference, openllmetry, neatlogs, default_span_kind
For TypeScript, the openinference field uses @arizeai/openinference-instrumentation-* package names where available, null otherwise
getLibrariesByTag(tag) and getLibraryInfo(library) helpers
src/instrumentation/manager.ts — (mirrors instrumentation/manager.py):

InstrumentationManager class:
Constructor: { provider, debug, excludedUrls }
instrumentHttp() — always called by init(), instruments fetch / undici for W3C traceparent context propagation
instrument(libraries: string[]) — for each library:
Look up in registry
Try to dynamically require() / import() the instrumentor package
If found, call .instrument({ tracerProvider })
If not found, log debug message and skip
Track instrumented: string[] list
Dual-convention priority: neatlogs custom > OpenInference > skip (no OpenLLMetry for AI libs to avoid duplicates)
src/instrumentation/http-context-propagation.ts — (mirrors instrumentation/http_context_propagation.py):

Patch fetch / undici to propagate W3C traceparent headers
Best-effort, no-op if unsupported
Files: src/instrumentation/registry.ts, src/instrumentation/manager.ts, src/instrumentation/http-context-propagation.ts, src/instrumentation/index.ts

Task 11: init(), flush(), shutdown() [after 5, 6, 7, 8, 9, 10]
Wire everything together in the initialization module.

src/init.ts — (mirrors init.py):

Module-level state: _initialized, _tracerProvider, _meterProvider, _logProvider, _spanProcessor, _debugMode, _sessionConfig
init(options: InitOptions):
Guard against double-init
Resolve API key from options or NEATLOGS_API_KEY env var
Resolve workflow name (from options or process.argv[1])
Resolve session ID (explicit, or auto-generate if autoSession)
Store session config
Create OTel Resource with service name, version, workflow, session, user, tags, PII settings
Create TracerProvider with expanded span limits (10,000 attrs)
Add NeatlogsSpanProcessor (pre-processing + file logging)
Add BatchSpanProcessor + OTLPSpanExporter (transport to {baseUrl}/v1/traces)
Set up MeterProvider
If captureLogs: set up LoggerProvider + NeatlogsLogExporter + NeatlogsExporter
Create InstrumentationManager, call instrumentHttp() (always-on, same as Python), then instrument(instrumentations)
Register process.on('beforeExit', shutdown) handler
Set _initialized = true
flush(timeoutMs = 30000): Promise<boolean> — flush tracer, meter, log providers
shutdown(timeoutMs = 30000): Promise<boolean> — shutdown all providers, reset state
getSessionConfig() — return copy of session config
isDebugEnabled() — return debug flag
Files: src/init.ts
Task 12: Remaining core utilities [after 2]
Port the remaining small utility modules.

src/core/llm-binder.ts — (mirrors core/llm_binder.py):

bindTemplates(options) — bind compiled prompt messages to the current span's LLM metadata
Reads from PromptContext and sets attributes on the active span
src/core/crewai-task-registry.ts — (mirrors core/crewai_task_registry.py):

registerCrewaiTask(taskName, taskDescription) — register CrewAI tasks for improved tracing
Module-level registry map
Files: src/core/llm-binder.ts, src/core/crewai-task-registry.ts, src/core/index.ts

Task 13: Public API barrel + final wiring [after 11, 12]
Wire up the public API surface.

src/index.ts — Re-export everything matching Python's __all__:

typescript
// Lifecycle
export { init, flush, shutdown } from './init';
// Instrumentation
export { span, Span } from './decorators';
export { trace } from './core/context';
export { log } from './core/log';
// Prompt management
export { PromptTemplate, UserPromptTemplate } from './prompt/template';
export { PromptClient, PromptHandle, CachedPrompt } from './prompt/client';
export { PromptClientError, PromptApiError, PromptNotFoundError } from './prompt/client';
export { getPrompt, fetchPrompt, listPrompts, createPrompt, updatePrompt, saveAsVersion, deletePrompt, removeTag } from './prompt/client';
// Utilities
export { bindTemplates } from './core/llm-binder';
export { registerCrewaiTask } from './core/crewai-task-registry';
// Types
export type { InitOptions, SpanOptions, TraceOptions, SpanKind, MaskFunction } from './types';
// Version
export { __version__ } from './version';

Verify the build produces valid CJS and ESM output. Run tsup and check dist/.

Files: src/index.ts
Task 14: Unit tests [after 13]
Write comprehensive unit tests using Vitest.

tests/unit/init.test.ts:

init() creates TracerProvider with correct resource attributes
init() with disableExport: true skips OTLP exporter
init() with no API key disables export
Double init() is a no-op
flush() and shutdown() work correctly
autoSession generates session ID
Tags validation (must be string array)
tests/unit/span.test.ts:

span() creates spans with correct kind attribute
All 8 span kinds work
Invalid kind throws error
Agent-specific attributes (role, goal) are set
Tool-specific attributes (tool_name, parameters) are set
Embedding-specific attributes (model, dimension) are set
Input/output capture works
captureInput: false suppresses input
Async functions work correctly
Error handling sets error status
tests/unit/trace.test.ts:

trace() creates child span
trace() creates root span when session_id set and no parent
Prompt template attributes are set
Prompt variables are captured
tests/unit/prompt-template.test.ts:

Variable extraction from string templates
Variable extraction from message list templates
compile() renders correctly
Missing variables throw error
PromptContext stores/retrieves correctly
tests/unit/prompt-client.test.ts:

PromptHandle.compile() renders content
PromptHandle.compileMessages() renders messages
PromptClient.getPrompt() calls correct endpoint
Error handling for API errors
Module-level functions use shared client
tests/unit/attribute-processor.test.ts:

LLM span normalization
Retriever span normalization
Agent span normalization
Tool span normalization
Model defaults enrichment
Wildcard attribute mapping
tests/unit/span-processor.test.ts:

onEnd() normalizes attributes
Mask is applied
RETRIEVER deduplication works
File logging when env var set
tests/unit/mask.test.ts:

registerMask() returns key
applyMask() with per-span mask takes precedence
applyMask() with global mask works
Mask exception returns original data
tests/unit/log.test.ts:

log() emits OTel LogRecord
Template rendering with {key} placeholders
Debug echo to console
tests/unit/instrumentation-manager.test.ts:

instrument() with available library succeeds
instrument() with unavailable library logs and skips
Registry lookup works
tests/unit/version.test.ts:

__version__ returns a semver string
Files: All files in tests/unit/

Task 15: Examples + README [after 13]
Create example files and update the README.

examples/basic-openai.ts:

typescript
import { init, span, shutdown } from 'neatlogs';
import OpenAI from 'openai';

init({ apiKey: process.env.NEATLOGS_API_KEY, instrumentations: ['openai'] });

const myWorkflow = span({ kind: 'WORKFLOW', name: 'qa-bot' }, async (query: string) => {
  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: query }],
  });
  return response.choices[0].message.content;
});

await myWorkflow('What is TypeScript?');
await shutdown();

examples/prompt-management.ts — PromptTemplate + PromptClient usage

examples/multi-agent-workflow.ts — Nested spans with WORKFLOW > AGENT > TOOL

examples/custom-spans.ts — All span kinds demonstrated

README.md — Comprehensive README with:

Quick start
Installation
API reference (init, span, trace, PromptTemplate)
Supported instrumentations
Configuration options
Examples
Files: examples/*.ts, README.md

Task 16: Custom instrumentors — google_genai + crewai [after 10]
Build custom neatlogs instrumentors for @google/generative-ai and CrewAI TypeScript, since no OpenInference packages exist for these in the JS ecosystem.

src/instrumentation/custom/google-genai.ts — Custom instrumentor for @google/generative-ai:

Implements OTel Instrumentor interface (instrument() / disable())
Monkey-patches GenerativeModel.generateContent() and GenerativeModel.generateContentStream():
Creates span with openinference.span.kind = "LLM"
Captures gen_ai.request.model, llm.input_messages, llm.invocation_parameters
On response: captures llm.output_messages, llm.token_count.prompt, llm.token_count.completion
For streaming: wraps the async iterator to accumulate chunks, then set attributes on span end
Monkey-patches GoogleGenerativeAI.getGenerativeModel() to auto-patch returned model instances
Sets gen_ai.system = "google_genai" attribute
Reference: Python's OpenInference google_genai instrumentor for attribute mapping
src/instrumentation/custom/crewai.ts — Custom instrumentor for CrewAI TypeScript:

Implements OTel Instrumentor interface
Monkey-patches key CrewAI classes (Crew, Agent, Task) if the crewai package is importable:
Crew.kickoff() → span with kind WORKFLOW, captures crew name, agents, tasks
Agent.execute() → span with kind AGENT, captures agent role, goal, backstory
Task.execute() → span with kind TASK, captures task description, expected output
Sets crewai.* attributes matching the Python SDK's CrewAI span conventions
Graceful no-op if crewai is not installed
Registry updates: Update INSTRUMENTATION_REGISTRY entries for google_genai and crewai to set the neatlogs field pointing to these custom instrumentor modules.

Files: src/instrumentation/custom/google-genai.ts, src/instrumentation/custom/crewai.ts, update src/instrumentation/registry.ts

Testing
Task	Test Expectations
Task 1	npm run build produces dist/ with CJS + ESM. npm test runs (even if no tests yet).
Task 2	Unit tests for logger, version, mask, span-kinds. registerMask / applyMask edge cases.
Task 3	Unit tests for AttributeMapper wildcard matching. JSON configs load without error.
Task 4	Unit tests for UnifiedAttributeProcessor.normalize() with mock span dicts for LLM, RETRIEVER, AGENT, TOOL kinds.
Task 5	Unit tests for NeatlogsSpanProcessor.onEnd() — verify normalization, masking, RETRIEVER suppression.
Task 6	Unit tests for span() — all 8 kinds, input/output capture, error handling, async support.
Task 7	Unit tests for trace() — child span, root span, prompt capture.
Task 8	Unit tests for PromptTemplate.compile(), PromptHandle.compile(), PromptClient with mocked fetch.
Task 9	Unit tests for log() — template rendering, OTel LogRecord emission.
Task 10	Unit tests for InstrumentationManager.instrument() — available/unavailable library handling.
Task 11	Integration test: init() → create span → flush() → shutdown(). Verify span has correct attributes.
Task 12	Unit tests for bindTemplates() and registerCrewaiTask().
Task 13	Build verification: npm run build succeeds, exports resolve correctly in both CJS and ESM.
Task 14	All unit tests pass. Coverage target: >80% on core modules.
Task 15	Examples compile without errors (tsc --noEmit examples/*.ts).
Task 16	Unit tests for google-genai instrumentor (mock GenerativeModel, verify spans + attributes). Unit tests for crewai instrumentor (mock Crew/Agent/Task, verify spans + attributes).
Final	End-to-end: init() with real API key → instrument OpenAI → make LLM call → flush() → verify trace appears on Neatlogs dashboard.
Files to Modify
All files are new (the TypeScript repo is empty). Key files by importance:

package.json — project config, dependencies, exports
tsconfig.json — TypeScript config
tsup.config.ts — build config
src/index.ts — public API surface
src/types.ts — shared interfaces
src/init.ts — SDK initialization (most critical)
src/core/span-processor.ts — span pre-processing
src/core/attribute-processor.ts — attribute normalization (largest file)
src/decorators/orchestration.ts — span() wrapper
src/core/context.ts — trace() wrapper
src/prompt/template.ts — prompt templates
src/prompt/client.ts — prompt management API
src/instrumentation/manager.ts — auto-instrumentation
src/instrumentation/registry.ts — library registry
src/core/log.ts — log capture
src/core/exporter.ts — batch HTTP exporter
src/core/mask.ts — PII masking
src/config/attribute-mapping.json — semantic mapping config
src/config/model_defaults.json — model pricing/limits
src/instrumentation/custom/google-genai.ts — custom Google GenAI instrumentor
src/instrumentation/custom/crewai.ts — custom CrewAI instrumentor
tests/unit/*.test.ts — unit tests
examples/*.ts — usage examples
README.md — documentation