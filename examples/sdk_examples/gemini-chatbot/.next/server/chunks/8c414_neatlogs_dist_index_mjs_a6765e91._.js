module.exports = [
"[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/neatlogs@file+..+..+..+neatlogs-1.0.2.tgz_@mastra+core@1.35.0_@standard-community+stand_4e53fa4cc4b4842a7fcd624c1b75e4fa/node_modules/neatlogs/dist/index.mjs [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// src/init.ts
__turbopack_context__.s([
    "PromptApiError",
    ()=>PromptApiError,
    "PromptClient",
    ()=>PromptClient,
    "PromptClientError",
    ()=>PromptClientError,
    "PromptHandle",
    ()=>PromptHandle,
    "PromptNotFoundError",
    ()=>PromptNotFoundError,
    "PromptTemplate",
    ()=>PromptTemplate,
    "Span",
    ()=>Span,
    "UserPromptTemplate",
    ()=>UserPromptTemplate,
    "__version__",
    ()=>__version__,
    "bindTemplates",
    ()=>bindTemplates,
    "createAITelemetry",
    ()=>createAITelemetry,
    "createPrompt",
    ()=>createPrompt,
    "deletePrompt",
    ()=>deletePrompt,
    "fetchPrompt",
    ()=>fetchPrompt,
    "flush",
    ()=>flush,
    "getMastraObservability",
    ()=>getMastraObservability,
    "getPrompt",
    ()=>getPrompt,
    "getSessionConfig",
    ()=>getSessionConfig,
    "init",
    ()=>init,
    "isDebugEnabled",
    ()=>isDebugEnabled,
    "listPrompts",
    ()=>listPrompts,
    "log",
    ()=>log,
    "registerCrewaiTask",
    ()=>registerCrewaiTask,
    "removeTag",
    ()=>removeTag,
    "saveAsVersion",
    ()=>saveAsVersion,
    "shutdown",
    ()=>shutdown,
    "span",
    ()=>span,
    "trace",
    ()=>trace2,
    "updatePrompt",
    ()=>updatePrompt,
    "wrapAISDK",
    ()=>wrapAISDK
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/path [external] (path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$metrics$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/metrics-api.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$2d$logs$40$0$2e$57$2e$2$2f$node_modules$2f40$opentelemetry$2f$api$2d$logs$2f$build$2f$esm$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api-logs@0.57.2/node_modules/@opentelemetry/api-logs/build/esm/index.js [instrumentation] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$resources$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$resources$2f$build$2f$esm$2f$Resource$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+resources@1.30.1_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/resources/build/esm/Resource.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$semantic$2d$conventions$40$1$2e$41$2e$1$2f$node_modules$2f40$opentelemetry$2f$semantic$2d$conventions$2f$build$2f$esm$2f$stable_attributes$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+semantic-conventions@1.41.1/node_modules/@opentelemetry/semantic-conventions/build/esm/stable_attributes.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$trace$2d$node$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$trace$2d$node$2f$build$2f$src$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+sdk-trace-node@1.30.1_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-trace-node/build/src/index.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$trace$2d$base$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$trace$2d$base$2f$build$2f$esm$2f$platform$2f$node$2f$export$2f$BatchSpanProcessor$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+sdk-trace-base@1.30.1_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-trace-base/build/esm/platform/node/export/BatchSpanProcessor.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$exporter$2d$trace$2d$otlp$2d$proto$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$exporter$2d$trace$2d$otlp$2d$proto$2f$build$2f$esm$2f$platform$2f$node$2f$OTLPTraceExporter$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+exporter-trace-otlp-proto@0.57.2_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/exporter-trace-otlp-proto/build/esm/platform/node/OTLPTraceExporter.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$metrics$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$metrics$2f$build$2f$esm$2f$MeterProvider$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+sdk-metrics@1.30.1_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-metrics/build/esm/MeterProvider.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$logs$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$logs$2f$build$2f$esm$2f$LoggerProvider$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+sdk-logs@0.57.2_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-logs/build/esm/LoggerProvider.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$logs$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$logs$2f$build$2f$esm$2f$export$2f$SimpleLogRecordProcessor$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+sdk-logs@0.57.2_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-logs/build/esm/export/SimpleLogRecordProcessor.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$logs$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$logs$2f$build$2f$esm$2f$platform$2f$node$2f$export$2f$BatchLogRecordProcessor$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+sdk-logs@0.57.2_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/sdk-logs/build/esm/platform/node/export/BatchLogRecordProcessor.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$exporter$2d$logs$2d$otlp$2d$proto$40$0$2e$216$2e$0_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$exporter$2d$logs$2d$otlp$2d$proto$2f$build$2f$esm$2f$platform$2f$node$2f$OTLPLogExporter$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+exporter-logs-otlp-proto@0.216.0_@opentelemetry+api@1.9.1/node_modules/@opentelemetry/exporter-logs-otlp-proto/build/esm/platform/node/OTLPLogExporter.js [instrumentation] (ecmascript)");
// src/core/span-processor.ts
var __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/fs [external] (fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$perf_hooks__$5b$external$5d$__$28$perf_hooks$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/perf_hooks [external] (perf_hooks, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/context-api.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/trace-api.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$trace_flags$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/trace/trace_flags.js [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/trace/status.js [instrumentation] (ecmascript)");
// src/prompt/template.ts
var __TURBOPACK__imported__module__$5b$externals$5d2f$async_hooks__$5b$external$5d$__$28$async_hooks$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/async_hooks [external] (async_hooks, cjs)");
// src/core/context.ts
var __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/context/context.js [instrumentation] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
// src/core/logger.ts
var LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};
var _logLevel = "INFO";
var _disabled = false;
function _getConfiguredLevel() {
    const envLevel = process.env.NEATLOGS_LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LOG_LEVELS) {
        return envLevel;
    }
    return "INFO";
}
_logLevel = _getConfiguredLevel();
function getLogger() {
    return {
        debug (message, ...args) {
            if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.DEBUG) {
                console.debug(`[neatlogs] ${message}`, ...args);
            }
        },
        info (message, ...args) {
            if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.INFO) {
                console.info(`[neatlogs] ${message}`, ...args);
            }
        },
        warn (message, ...args) {
            if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.WARN) {
                console.warn(`[neatlogs] ${message}`, ...args);
            }
        },
        error (message, ...args) {
            if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.ERROR) {
                console.error(`[neatlogs] ${message}`, ...args);
            }
        }
    };
}
function enableDebugLogging() {
    _logLevel = "DEBUG";
}
// src/core/instrumentation-scope-parser.ts
var SCOPE_PATTERNS = {
    // Neatlogs custom instrumentations
    "@neatlogs/instrumentation-google-genai": {
        provider: "google",
        framework: "google_genai"
    },
    "@neatlogs/instrumentation-mastra": {
        framework: "mastra"
    },
    "@neatlogs/instrumentation-ai-sdk": {
        framework: "ai_sdk"
    },
    // Vercel AI SDK native scope (the `ai` package emits this directly)
    ai: {
        framework: "ai_sdk"
    },
    // OpenInference instrumentations (npm @arizeai scope names)
    "@arizeai/openinference-instrumentation-openai": {
        provider: "openai",
        framework: "openai"
    },
    "@arizeai/openinference-instrumentation-anthropic": {
        provider: "anthropic",
        framework: "anthropic"
    },
    "@arizeai/openinference-instrumentation-langchain": {
        framework: "langchain"
    },
    "@arizeai/openinference-instrumentation-bedrock": {
        provider: "bedrock",
        platform: "bedrock",
        framework: "bedrock"
    },
    "@arizeai/openinference-instrumentation-vertexai": {
        provider: "vertex_ai",
        platform: "vertex_ai",
        framework: "vertex_ai"
    },
    "@arizeai/openinference-instrumentation-mistralai": {
        provider: "mistral",
        framework: "mistral"
    },
    "@arizeai/openinference-instrumentation-cohere": {
        provider: "cohere",
        framework: "cohere"
    },
    "@arizeai/openinference-instrumentation-groq": {
        provider: "groq",
        framework: "groq"
    },
    "@arizeai/openinference-instrumentation-llama-index": {
        framework: "llamaindex"
    },
    "@arizeai/openinference-instrumentation-llamaindex": {
        framework: "llamaindex"
    },
    "@arizeai/openinference-instrumentation-crewai": {
        framework: "crewai"
    },
    "@arizeai/openinference-instrumentation-haystack": {
        framework: "haystack"
    },
    "@arizeai/openinference-instrumentation-dspy": {
        framework: "dspy"
    },
    "@arizeai/openinference-instrumentation-beeai": {
        framework: "beeai"
    },
    "@arizeai/openinference-instrumentation-mcp": {
        framework: "mcp"
    },
    "@arizeai/openinference-instrumentation-claude-agent-sdk": {
        framework: "claude_agent_sdk"
    },
    // OpenInference instrumentations (Python-style scope names)
    "openinference.instrumentation.openai": {
        provider: "openai",
        framework: "openai"
    },
    "openinference.instrumentation.anthropic": {
        provider: "anthropic",
        framework: "anthropic"
    },
    "openinference.instrumentation.google_genai": {
        provider: "google",
        framework: "google_genai"
    },
    "openinference.instrumentation.bedrock": {
        provider: "bedrock",
        platform: "bedrock",
        framework: "bedrock"
    },
    "openinference.instrumentation.vertexai": {
        provider: "vertex_ai",
        platform: "vertex_ai",
        framework: "vertex_ai"
    },
    "openinference.instrumentation.mistralai": {
        provider: "mistral",
        framework: "mistral"
    },
    "openinference.instrumentation.cohere": {
        provider: "cohere",
        framework: "cohere"
    },
    "openinference.instrumentation.groq": {
        provider: "groq",
        framework: "groq"
    },
    // OpenInference frameworks (Python-style scope names)
    "openinference.instrumentation.mastra": {
        framework: "mastra"
    },
    "openinference.instrumentation.langchain": {
        framework: "langchain"
    },
    "openinference.instrumentation.llama_index": {
        framework: "llamaindex"
    },
    "openinference.instrumentation.llamaindex": {
        framework: "llamaindex"
    },
    "openinference.instrumentation.crewai": {
        framework: "crewai"
    },
    "openinference.instrumentation.haystack": {
        framework: "haystack"
    },
    "openinference.instrumentation.dspy": {
        framework: "dspy"
    },
    // OpenLLMetry (Traceloop) instrumentations
    "opentelemetry.instrumentation.openai": {
        provider: "openai",
        framework: "openai"
    },
    "opentelemetry.instrumentation.anthropic": {
        provider: "anthropic",
        framework: "anthropic"
    },
    "opentelemetry.instrumentation.google_generativeai": {
        provider: "google",
        framework: "google_genai"
    },
    "opentelemetry.instrumentation.bedrock": {
        provider: "bedrock",
        platform: "bedrock",
        framework: "bedrock"
    },
    "opentelemetry.instrumentation.vertexai": {
        provider: "vertex_ai",
        platform: "vertex_ai",
        framework: "vertex_ai"
    },
    "opentelemetry.instrumentation.cohere": {
        provider: "cohere",
        framework: "cohere"
    },
    "opentelemetry.instrumentation.mistralai": {
        provider: "mistral",
        framework: "mistral"
    },
    // OpenLLMetry frameworks
    "opentelemetry.instrumentation.langchain": {
        framework: "langchain"
    },
    "opentelemetry.instrumentation.llamaindex": {
        framework: "llamaindex"
    },
    "opentelemetry.instrumentation.crewai": {
        framework: "crewai"
    },
    "opentelemetry.instrumentation.haystack": {
        framework: "haystack"
    },
    // Native framework telemetry
    "haystack.telemetry": {
        framework: "haystack"
    },
    crewai: {
        framework: "crewai"
    },
    langchain: {
        framework: "langchain"
    },
    llama_index: {
        framework: "llamaindex"
    }
};
var GEN_AI_SYSTEM_TO_PROVIDER = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google",
    vertex_ai: "vertex_ai",
    bedrock: "bedrock",
    azure_openai: "openai",
    // Azure OpenAI uses OpenAI provider
    cohere: "cohere",
    mistral: "mistral",
    groq: "groq"
};
function parseInstrumentationScope(scopeName) {
    if (!scopeName) return {};
    const scopeLower = scopeName.toLowerCase();
    if (scopeLower in SCOPE_PATTERNS) {
        return {
            ...SCOPE_PATTERNS[scopeLower]
        };
    }
    for (const [pattern, info] of Object.entries(SCOPE_PATTERNS)){
        if (scopeLower.startsWith(pattern)) {
            return {
                ...info
            };
        }
    }
    const result = {};
    if (scopeLower.includes("langchain")) {
        result.framework = "langchain";
    } else if (scopeLower.includes("llama") || scopeLower.includes("llamaindex")) {
        result.framework = "llamaindex";
    } else if (scopeLower.includes("crewai") || scopeLower.includes("crew")) {
        result.framework = "crewai";
    } else if (scopeLower.includes("haystack")) {
        result.framework = "haystack";
    } else if (scopeLower.includes("dspy")) {
        result.framework = "dspy";
    } else if (scopeLower.includes("vercel-ai") || scopeLower.includes("ai-sdk")) {
        result.framework = "ai_sdk";
    }
    if (scopeLower.includes("openai")) {
        result.provider = "openai";
        if (scopeLower.includes("azure")) {
            result.platform = "azure_openai";
        }
    } else if (scopeLower.includes("anthropic") || scopeLower.includes("claude")) {
        result.provider = "anthropic";
    } else if (scopeLower.includes("google") || scopeLower.includes("gemini") || scopeLower.includes("genai")) {
        result.provider = "google";
    } else if (scopeLower.includes("bedrock")) {
        result.provider = "bedrock";
        result.platform = "bedrock";
    } else if (scopeLower.includes("vertex")) {
        result.platform = "vertex_ai";
        if (!result.provider) {
            result.provider = "vertex_ai";
        }
    } else if (scopeLower.includes("mistral")) {
        result.provider = "mistral";
    } else if (scopeLower.includes("cohere")) {
        result.provider = "cohere";
    } else if (scopeLower.includes("groq")) {
        result.provider = "groq";
    }
    return result;
}
function enrichWithScopeDetection(attrs, scopeName, parentScopeName = null) {
    if (scopeName) {
        if (!("neatlogs.instrumentation.name" in attrs)) {
            attrs["neatlogs.instrumentation.name"] = scopeName;
        }
    }
    const currentInfo = parseInstrumentationScope(scopeName);
    if (currentInfo.provider && !("neatlogs.provider" in attrs)) {
        attrs["neatlogs.provider"] = currentInfo.provider;
    }
    if (currentInfo.platform && !("neatlogs.platform" in attrs)) {
        attrs["neatlogs.platform"] = currentInfo.platform;
    }
    if (parentScopeName) {
        const parentInfo = parseInstrumentationScope(parentScopeName);
        if (parentInfo.framework && !("neatlogs.framework" in attrs)) {
            attrs["neatlogs.framework"] = parentInfo.framework;
        }
    }
    if (!("neatlogs.framework" in attrs) && currentInfo.framework) {
        attrs["neatlogs.framework"] = currentInfo.framework;
    }
    const genAiSystem = (attrs["gen_ai.system"] ?? "").toLowerCase();
    if (genAiSystem && !("neatlogs.provider" in attrs)) {
        const mapped = GEN_AI_SYSTEM_TO_PROVIDER[genAiSystem];
        if (mapped) {
            attrs["neatlogs.provider"] = mapped;
        }
    }
    const llmModel = attrs["llm.model_name"] ?? "";
    if (llmModel && !("neatlogs.platform" in attrs)) {
        if (llmModel.startsWith("anthropic.") || llmModel.startsWith("meta.") || llmModel.startsWith("amazon.")) {
            attrs["neatlogs.platform"] = "bedrock";
        } else if (llmModel.toLowerCase().includes("azure")) {
            attrs["neatlogs.platform"] = "azure_openai";
        }
    }
}
// src/span-kinds/constants.ts
var VECTOR_DB_SYSTEMS = /* @__PURE__ */ new Set([
    "chroma",
    "chromadb",
    "pinecone",
    "qdrant",
    "milvus",
    "marqo",
    "weaviate",
    "lancedb",
    "astra",
    "pgvector",
    "elasticsearch"
]);
var RETRIEVAL_OPS = [
    "query",
    "search",
    "get",
    "fetch",
    "find",
    "retrieve",
    "scroll",
    "peek",
    "discover",
    "recommend",
    "aggregate",
    "hybrid_search",
    "select"
];
var VECTOR_DB_NAMES = [
    "chroma",
    "pinecone",
    "weaviate",
    "qdrant",
    "milvus",
    "lancedb",
    "marqo",
    "astra"
];
// src/span-kinds/mapping.ts
var VALID_SPAN_KINDS = /* @__PURE__ */ new Set([
    "WORKFLOW",
    "AGENT",
    "CHAIN",
    "TOOL",
    "RETRIEVER",
    "EMBEDDING",
    "MCP_TOOL",
    "GUARDRAIL"
]);
var ALL_SPAN_KINDS = /* @__PURE__ */ new Set([
    ...VALID_SPAN_KINDS,
    "LLM",
    "RERANKER",
    "EVALUATOR",
    "VECTOR_STORE"
]);
function inferSpanKindFromName(spanName) {
    const nameLower = spanName.toLowerCase();
    if ([
        "openai",
        "anthropic",
        "cohere",
        "bedrock",
        "chat",
        "completion",
        "llm",
        "gemini",
        "google_genai"
    ].some((kw)=>nameLower.includes(kw))) {
        return "LLM";
    }
    if (nameLower.includes("embed")) {
        return "EMBEDDING";
    }
    if (VECTOR_DB_NAMES.some((db)=>nameLower.includes(db))) {
        if (RETRIEVAL_OPS.some((kw)=>nameLower.includes(kw))) {
            return "RETRIEVER";
        }
        return "VECTOR_STORE";
    }
    if ([
        "retriev",
        "search",
        "query"
    ].some((kw)=>nameLower.includes(kw))) {
        return "RETRIEVER";
    }
    if (nameLower.includes("rerank")) {
        return "RERANKER";
    }
    if (nameLower.includes("agent")) {
        return "AGENT";
    }
    if ([
        "tool",
        "function"
    ].some((kw)=>nameLower.includes(kw))) {
        return "TOOL";
    }
    if ([
        "guardrail",
        "validate",
        "moderate",
        "safety"
    ].some((kw)=>nameLower.includes(kw))) {
        return "GUARDRAIL";
    }
    if ([
        "evaluat",
        "score",
        "metric"
    ].some((kw)=>nameLower.includes(kw))) {
        return "EVALUATOR";
    }
    return "CHAIN";
}
// src/config/model_defaults.json
var model_defaults_default = {
    openai: {
        "chat.completions": {
            "gpt-5.2": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                max_tokens: null,
                stream: false,
                n: 1
            },
            "gpt-5.1": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                max_tokens: null,
                stream: false,
                n: 1
            },
            "gpt-5": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                max_tokens: null,
                stream: false,
                n: 1
            },
            "gpt-5-mini": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            },
            "gpt-5-nano": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            },
            "gpt-4.1": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                max_tokens: null,
                stream: false,
                n: 1
            },
            "gpt-4.1-mini": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            },
            "gpt-4o": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                max_tokens: null,
                stream: false,
                n: 1
            },
            "gpt-4o-mini": {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            },
            "o4-mini": {
                max_completion_tokens: null
            },
            o3: {
                max_completion_tokens: null
            },
            "o3-mini": {
                max_completion_tokens: null
            },
            o1: {
                max_completion_tokens: null
            },
            "o1-mini": {
                max_completion_tokens: null
            },
            _default: {
                temperature: 1,
                top_p: 1,
                stream: false
            }
        },
        embeddings: {
            _default: {
                encoding_format: "float",
                dimensions: null
            }
        }
    },
    anthropic: {
        messages: {
            "claude-opus-4-6": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 8192,
                stream: false
            },
            "claude-opus-4-5": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 8192,
                stream: false
            },
            "claude-opus-4-1": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 4096,
                stream: false
            },
            "claude-opus-4": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 4096,
                stream: false
            },
            "claude-sonnet-4-5": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 8192,
                stream: false
            },
            "claude-sonnet-4": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 8192,
                stream: false
            },
            "claude-haiku-4-5": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 8192,
                stream: false
            },
            "claude-3-5-sonnet": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 4096,
                stream: false,
                stop_sequences: null
            },
            "claude-3-5-haiku": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 4096,
                stream: false
            },
            "claude-3-opus": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 4096,
                stream: false
            },
            "claude-3-haiku": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: 4096,
                stream: false
            },
            _default: {
                temperature: 1,
                stream: false
            }
        }
    },
    cohere: {
        chat: {
            _default: {
                temperature: 0.3,
                p: 0.75,
                k: 0,
                max_tokens: null,
                safety_mode: "CONTEXTUAL"
            }
        },
        generate: {
            _default: {
                temperature: 0.9,
                p: null,
                k: 0,
                max_tokens: null,
                safety_mode: "CONTEXTUAL"
            }
        }
    },
    google: {
        generateContent: {
            "gemini-2.5-pro": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-2.5-flash": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-2.0-flash": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-2.0-flash-lite": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-2.0-flash-thinking": {
                temperature: 1,
                top_p: 0.95,
                top_k: 64,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-1.5-pro": {
                temperature: 1,
                top_p: 0.94,
                top_k: 40,
                max_output_tokens: null,
                stop_sequences: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-1.5-flash": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-1.0-pro": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            _default: {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            }
        }
    },
    vertex_ai: {
        generateContent: {
            "gemini-2.5-pro": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-2.5-flash": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-2.0-flash": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-1.5-pro": {
                temperature: 1,
                top_p: 0.94,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            "gemini-1.5-flash": {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: null,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            },
            _default: {
                temperature: 1,
                top_p: 0.95,
                top_k: 40,
                safety_settings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            }
        }
    },
    bedrock: {
        _note: "Claude Sonnet 4.5 and Haiku 4.5 on Bedrock: Use EITHER temperature OR top_p, not both",
        messages: {
            "anthropic.claude-sonnet-4-5": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: null
            },
            "anthropic.claude-haiku-4-5": {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_tokens: null
            },
            "anthropic.claude-3-5-sonnet-20241022": {
                temperature: 1,
                top_p: 1,
                top_k: null,
                max_tokens: null
            },
            "anthropic.claude-3-5-sonnet-20240620": {
                temperature: 1,
                top_p: 1,
                top_k: null,
                max_tokens: null,
                stop_sequences: null
            },
            "anthropic.claude-3-5-haiku-20241022": {
                temperature: 1,
                top_p: 1,
                top_k: null,
                max_tokens: null
            },
            "anthropic.claude-3-opus": {
                temperature: 1,
                top_p: 1,
                top_k: null,
                max_tokens: null
            },
            "anthropic.claude-3-haiku": {
                temperature: 1,
                top_p: 1,
                top_k: null,
                max_tokens: null
            },
            "meta.llama3": {
                temperature: 0.5,
                top_p: 0.9,
                max_gen_len: null
            },
            "mistral.mistral-7b-instruct": {
                temperature: 0.5,
                top_p: 0.9,
                top_k: 50,
                max_tokens: null
            },
            "amazon.titan-text": {
                temperature: 0.7,
                topP: 0.9,
                maxTokenCount: null
            },
            _default: {
                temperature: 1,
                top_p: 1
            }
        }
    },
    groq: {
        "chat.completions": {
            "llama-3.3-70b-versatile": {
                temperature: 1,
                top_p: 1,
                max_tokens: 1024,
                stream: false
            },
            "llama-3.1-70b-versatile": {
                temperature: 1,
                top_p: 1,
                max_tokens: 1024,
                stream: false
            },
            "mixtral-8x7b-32768": {
                temperature: 1,
                top_p: 1,
                max_tokens: 1024,
                stream: false
            },
            _default: {
                temperature: 1,
                top_p: 1,
                max_tokens: 1024,
                stream: false
            }
        }
    },
    deepseek: {
        "chat.completions": {
            "deepseek-chat": {
                temperature: 1,
                top_p: 1,
                max_tokens: 4096,
                frequency_penalty: 0,
                presence_penalty: 0,
                stream: false
            },
            "deepseek-reasoner": {
                temperature: 1,
                top_p: 1,
                max_tokens: 8192,
                stream: false
            },
            _default: {
                temperature: 1,
                top_p: 1,
                stream: false
            }
        }
    },
    mistral: {
        chat: {
            "mistral-large-latest": {
                temperature: 0.7,
                top_p: 1,
                max_tokens: null,
                safe_prompt: false
            },
            "mistral-small-latest": {
                temperature: 0.7,
                top_p: 1,
                max_tokens: null
            },
            "pixtral-large-latest": {
                temperature: 0.7,
                top_p: 1,
                max_tokens: null
            },
            "pixtral-12b-2409": {
                temperature: 0.7,
                top_p: 1,
                max_tokens: null
            },
            "codestral-latest": {
                temperature: 0,
                top_p: 1,
                max_tokens: null
            },
            "ministral-8b-latest": {
                temperature: 0.7,
                top_p: 1,
                max_tokens: null
            },
            "ministral-3b-latest": {
                temperature: 0.7,
                top_p: 1,
                max_tokens: null
            },
            _default: {
                temperature: 0.7,
                top_p: 1
            }
        }
    },
    ollama: {
        generate: {
            _default: {
                temperature: 0.8,
                top_k: 40,
                top_p: 0.9,
                num_predict: -1,
                repeat_penalty: 1.1,
                stream: false
            }
        },
        chat: {
            _default: {
                temperature: 0.8,
                top_k: 40,
                top_p: 0.9,
                num_predict: -1,
                stream: false
            }
        }
    },
    together: {
        "chat.completions": {
            _default: {
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                max_tokens: 512,
                stream: false
            }
        },
        completions: {
            _default: {
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                max_tokens: 128
            }
        }
    },
    replicate: {
        predictions: {
            "meta/llama-2": {
                temperature: 0.75,
                top_p: 0.9,
                max_new_tokens: 500
            },
            "meta/llama-3": {
                temperature: 0.75,
                top_p: 0.9,
                max_new_tokens: 500
            },
            _default: {
                temperature: 0.75,
                top_p: 0.9
            }
        }
    },
    huggingface: {
        text_generation: {
            _default: {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_new_tokens: null,
                do_sample: true
            }
        },
        conversational: {
            _default: {
                temperature: 1,
                top_p: null,
                top_k: null,
                max_length: null
            }
        }
    },
    azure_openai: {
        "chat.completions": {
            _default: {
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                max_tokens: null,
                stream: false
            }
        }
    },
    aleph_alpha: {
        completion: {
            _default: {
                temperature: 0,
                top_p: 0,
                top_k: 0,
                maximum_tokens: 64
            }
        }
    },
    watsonx: {
        generate: {
            _default: {
                temperature: 0.7,
                top_p: 1,
                top_k: 50,
                max_new_tokens: 200
            }
        }
    },
    writer: {
        completion: {
            _default: {
                temperature: 0.7,
                top_p: 1,
                max_tokens: 1024
            }
        }
    }
};
// src/config/defaults-enricher.ts
var logger = getLogger();
function getDefaults(provider, operation, model) {
    const defaultsData = model_defaults_default;
    const providerData = defaultsData[provider.toLowerCase()] ?? {};
    const operationData = providerData[operation] ?? {};
    if (Object.keys(operationData).length === 0) {
        return {};
    }
    if (model in operationData) {
        return {
            ...operationData[model]
        };
    }
    for (const [modelKey, defaults] of Object.entries(operationData)){
        if (modelKey !== "_default" && model.startsWith(modelKey)) {
            logger.debug(`Matched model '${model}' to defaults for '${modelKey}'`);
            return {
                ...defaults
            };
        }
    }
    if ("_default" in operationData) {
        logger.debug(`Using _default for ${provider}/${operation}/${model}`);
        return {
            ...operationData._default
        };
    }
    return {};
}
function enrichInvocationParameters(mergedAttrs, enableEnrichment = true) {
    if (!enableEnrichment) return;
    const spanKind = mergedAttrs["openinference.span.kind"];
    if (spanKind !== "LLM" && spanKind !== "EMBEDDING") return;
    const provider = (mergedAttrs["llm.system"] ?? "").toLowerCase();
    const model = spanKind === "EMBEDDING" ? mergedAttrs["embedding.model_name"] ?? "" : mergedAttrs["llm.model_name"] ?? "";
    if (!provider || !model) return;
    let operation;
    if (spanKind === "LLM") {
        operation = provider === "openai" ? "chat.completions" : "messages";
    } else if (spanKind === "EMBEDDING") {
        operation = "embeddings";
    }
    if (!operation) return;
    const defaults = getDefaults(provider, operation, model);
    if (Object.keys(defaults).length === 0) {
        logger.debug(`No defaults found for ${provider}/${operation}/${model}`);
        return;
    }
    const existingParamsStr = mergedAttrs["llm.invocation_parameters"] ?? "{}";
    let existingParams;
    try {
        existingParams = typeof existingParamsStr === "string" ? JSON.parse(existingParamsStr) : existingParamsStr;
    } catch  {
        existingParams = {};
    }
    const enrichedParams = {
        ...defaults,
        ...existingParams
    };
    mergedAttrs["llm.invocation_parameters"] = JSON.stringify(enrichedParams);
    logger.debug(`Enriched params for ${provider}/${model}: added ${Object.keys(defaults).length} defaults`);
}
// src/core/attribute-processor.ts
var logger2 = getLogger();
var PYTHON_REPR_RE = /^<[A-Za-z_].*?\bat\s+0x[0-9a-fA-F]+>$/;
var OI_TOOL_RE = /^llm\.output_messages\.(\d+)\.message\.tool_calls\.(\d+)\.tool_call\.function\.(name|arguments)$/;
var OI_TOOL_ID_RE = /^llm\.output_messages\.(\d+)\.message\.tool_calls\.(\d+)\.tool_call\.id$/;
var OI_SCHEMA_RE = /^llm\.tools\.(\d+)\.tool\.json_schema$/;
var OL_FN_RE = /^llm\.request\.functions\.(\d+)\.(name|description|input_schema)$/;
var INPUT_MSG_TOOL_RE = /^llm\.input_messages\.(\d+)\.message\.(tool_call_id|name)$/;
var PROVIDER_TO_SYSTEM = {
    openai: "openai",
    azure: "openai",
    azure_openai: "openai",
    anthropic: "anthropic",
    cohere: "cohere",
    mistral: "mistralai",
    mistralai: "mistralai",
    google: "google",
    vertex_ai: "vertexai",
    groq: "groq",
    xai: "xai",
    deepseek: "deepseek"
};
function isPythonRepr(s) {
    return PYTHON_REPR_RE.test(s.trim());
}
function cleanPythonReprs(obj) {
    if (obj === null || obj === void 0) return obj;
    if (Array.isArray(obj)) {
        return obj.filter((item)=>!(typeof item === "string" && isPythonRepr(item))).map((item)=>cleanPythonReprs(item));
    }
    if (typeof obj === "object") {
        const cleaned = {};
        for (const [k, v] of Object.entries(obj)){
            if (typeof v === "string" && isPythonRepr(v)) continue;
            cleaned[k] = cleanPythonReprs(v);
        }
        return cleaned;
    }
    return obj;
}
function safeParse(val) {
    try {
        return JSON.parse(val);
    } catch  {
        return void 0;
    }
}
function safeStringify(val) {
    try {
        return JSON.stringify(val);
    } catch  {
        return String(val);
    }
}
var UnifiedAttributeProcessor = class {
    mapper;
    debug;
    constructor(mapper, debug = false){
        this.mapper = mapper;
        this.debug = debug;
    }
    // ── Public entry point ──────────────────────────────
    /**
   * Normalize a raw span dict into the neatlogs.* namespace.
   *
   * Steps:
   * 1. Merge resource + span attributes
   * 2. Detect framework/provider/platform from instrumentation scope
   * 3. Normalize vendor conventions (tool calls, tool defs, MCP, vector DB, etc.)
   * 4. Extract operational metrics (duration, TTFT)
   * 5. Upcycle events (retriever docs, embedding dimensions)
   * 6. Enrich invocation parameters with model defaults
   * 7. Apply namespace mapping via AttributeMapper
   * 8. Fill provider / system gaps
   * 9. Add intermediate ReAct steps
   * 10. Filter embedding vectors if applicable
   */ normalize(spanDict) {
        const resAttrs = spanDict.resource ?? {};
        const attrs = {
            ...resAttrs,
            ...spanDict.attributes
        };
        attrs["_span_name"] = spanDict.name;
        const scopeName = spanDict.instrumentation_scope?.name ?? null;
        enrichWithScopeDetection(attrs, scopeName, null);
        if (this.debug) {
            logger2.debug(`[ScopeDetection] trace_id=${spanDict.trace_id} span_id=${spanDict.span_id} span_name=${spanDict.name} scope=${scopeName} framework=${attrs["neatlogs.framework"] ?? ""} provider=${attrs["neatlogs.provider"] ?? ""} platform=${attrs["neatlogs.platform"] ?? ""}`);
        }
        this.normalizeConventions(spanDict, attrs);
        const computedMetrics = this.extractOperationalMetrics(spanDict, attrs);
        Object.assign(attrs, computedMetrics);
        const eventAttrs = this.upcycleEvents(spanDict);
        Object.assign(attrs, eventAttrs);
        try {
            enrichInvocationParameters(attrs, true);
        } catch (e) {
            logger2.warn(`Failed to enrich invocation parameters: ${e?.message ?? e}`);
        }
        const unified = this.applyNamespaceMapping(attrs);
        this.addIntermediateSteps(unified);
        const spanKind = (unified["neatlogs.span.kind"] ?? "").toLowerCase();
        if (spanKind === "embedding" || spanKind === "vector_store") {
            return this.filterEmbeddingVectors(unified);
        }
        return unified;
    }
    // ── Convention normalization ────────────────────────
    normalizeConventions(spanDict, attrs) {
        if (this.isHttpLikeSpanKind(spanDict.kind) && this.looksLikeHttp(attrs)) {
            attrs["openinference.span.kind"] = "HTTP";
        }
        if (!("openinference.span.kind" in attrs) && Object.keys(attrs).some((k)=>k.startsWith("crewai.crew."))) {
            attrs["openinference.span.kind"] = "CHAIN";
        }
        this.addCrewaiTokenUsageFallback(attrs);
        this.addReasoningTokensFromOutputValue(attrs);
        this.addCrewaiKickoffTelemetry(attrs);
        this.extractVercelAiSdkAttrs(attrs);
        this.extractToolCalls(attrs);
        for (const [k, v] of Object.entries(attrs)){
            const m = INPUT_MSG_TOOL_RE.exec(k);
            if (m) {
                const [, msgIdx, field] = m;
                attrs[`llm.input_messages.${msgIdx}.${field}`] = v;
            }
        }
        this.extractInvalidToolCalls(attrs);
        this.extractToolCallIdFromOutput(attrs);
        this.extractToolDefinitions(attrs);
        this.detectVectorDbSpanKind(attrs);
        this.parseMcpFromTraceloop(attrs);
        this.processMcpSignals(attrs);
        this.handleEmbeddingSpans(attrs);
        this.handleVectorDbDocAttributes(attrs);
        this.extractLangchainMetadata(attrs);
    }
    extractToolCalls(attrs) {
        const toolCalls = {};
        const keysToRemove = [];
        for (const [k, v] of Object.entries(attrs)){
            let m = OI_TOOL_RE.exec(k);
            if (m) {
                const [, , callIdxStr, field] = m;
                const idx = parseInt(callIdxStr, 10);
                if (!toolCalls[idx]) toolCalls[idx] = {};
                toolCalls[idx][field] = v;
                keysToRemove.push(k);
                continue;
            }
            m = OI_TOOL_ID_RE.exec(k);
            if (m) {
                const [, , callIdxStr] = m;
                const idx = parseInt(callIdxStr, 10);
                if (!toolCalls[idx]) toolCalls[idx] = {};
                toolCalls[idx]["id"] = v;
                keysToRemove.push(k);
                continue;
            }
        }
        for (const idx of Object.keys(toolCalls).map(Number).sort((a, b)=>a - b)){
            const tc = toolCalls[idx];
            if (tc.id !== void 0) attrs[`llm.tool_calls.${idx}.id`] = tc.id;
            if (tc.name !== void 0) attrs[`llm.tool_calls.${idx}.name`] = tc.name;
            if (tc.arguments !== void 0) attrs[`llm.tool_calls.${idx}.arguments`] = tc.arguments;
        }
        for (const k of keysToRemove){
            delete attrs[k];
        }
    }
    extractInvalidToolCalls(attrs) {
        const llmOutput = attrs["llm.output"] ?? attrs["output.value"];
        if (!llmOutput || typeof llmOutput !== "string") return;
        try {
            const outputData = JSON.parse(llmOutput);
            if (typeof outputData === "object" && outputData !== null && !Array.isArray(outputData)) {
                const generations = outputData.generations;
                if (Array.isArray(generations) && generations.length > 0 && Array.isArray(generations[0]) && generations[0].length > 0) {
                    const message = generations[0][0]?.message;
                    const invalidCalls = message?.invalid_tool_calls;
                    if (Array.isArray(invalidCalls) && invalidCalls.length > 0) {
                        attrs["llm.invalid_tool_calls"] = JSON.stringify(invalidCalls);
                    }
                }
            }
        } catch  {}
    }
    extractToolCallIdFromOutput(attrs) {
        const toolOutput = attrs["tool.output"] ?? attrs["output.value"];
        if (!toolOutput || typeof toolOutput !== "string") return;
        try {
            const outputData = JSON.parse(toolOutput);
            if (typeof outputData === "object" && outputData !== null && !Array.isArray(outputData)) {
                const toolCallId = outputData.tool_call_id ?? outputData.toolCallId;
                if (toolCallId) {
                    attrs["tool_call_id"] = toolCallId;
                }
            }
        } catch  {}
    }
    extractToolDefinitions(attrs) {
        const toolDefs = {};
        const keysToRemove = [];
        for (const [k, v] of Object.entries(attrs)){
            let m = OL_FN_RE.exec(k);
            if (m) {
                const [, idxStr, field] = m;
                const idx = parseInt(idxStr, 10);
                if (!toolDefs[idx]) toolDefs[idx] = {};
                toolDefs[idx][field] = v;
                keysToRemove.push(k);
                continue;
            }
            m = OI_SCHEMA_RE.exec(k);
            if (m) {
                const idx = parseInt(m[1], 10);
                let schema = v;
                if (typeof schema === "string") {
                    schema = safeParse(schema) ?? null;
                }
                if (typeof schema === "object" && schema !== null) {
                    if (!toolDefs[idx]) toolDefs[idx] = {};
                    const td = toolDefs[idx];
                    if (!td.name) td.name = schema.name;
                    if (!td.description) td.description = schema.description;
                    if (!td.input_schema) td.input_schema = schema.input_schema ?? schema.parameters;
                }
                keysToRemove.push(k);
            }
        }
        for (const idx of Object.keys(toolDefs).map(Number).sort((a, b)=>a - b)){
            const td = toolDefs[idx];
            if (td.name !== void 0 && td.name !== null) {
                if (!("llm.tools." + idx + ".name" in attrs)) {
                    attrs[`llm.tools.${idx}.name`] = td.name;
                }
            }
            if (td.description !== void 0 && td.description !== null) {
                if (!("llm.tools." + idx + ".description" in attrs)) {
                    attrs[`llm.tools.${idx}.description`] = td.description;
                }
            }
            if (td.input_schema !== void 0 && td.input_schema !== null) {
                let val = td.input_schema;
                if (typeof val !== "string") {
                    val = safeStringify(val);
                }
                if (!("llm.tools." + idx + ".input_schema" in attrs)) {
                    attrs[`llm.tools.${idx}.input_schema`] = val;
                }
            }
        }
        for (const k of keysToRemove){
            delete attrs[k];
        }
    }
    detectVectorDbSpanKind(attrs) {
        if ("openinference.span.kind" in attrs) return;
        const dbSystem = attrs["db.system"];
        if (typeof dbSystem !== "string") return;
        if (!VECTOR_DB_SYSTEMS.has(dbSystem.toLowerCase())) return;
        const dbOperation = (attrs["db.operation"] ?? "").toLowerCase();
        const spanName = (attrs["_span_name"] ?? "").toLowerCase();
        let isRetrieval = false;
        if (dbOperation) {
            isRetrieval = RETRIEVAL_OPS.some((op)=>dbOperation.includes(op));
        } else {
            isRetrieval = RETRIEVAL_OPS.some((op)=>spanName.includes(op));
        }
        attrs["openinference.span.kind"] = isRetrieval ? "RETRIEVER" : "VECTOR_STORE";
    }
    parseMcpFromTraceloop(attrs) {
        const rawInput = attrs["traceloop.entity.input"];
        if (rawInput === void 0 || rawInput === null) return;
        try {
            const entityInput = typeof rawInput === "string" ? JSON.parse(rawInput) : rawInput;
            if (typeof entityInput !== "object" || entityInput === null || Array.isArray(entityInput)) return;
            if ("method" in entityInput) {
                attrs["mcp.method.name"] = entityInput.method;
            }
            if ("params" in entityInput) {
                attrs["mcp.request.argument"] = JSON.stringify(entityInput.params);
            }
            if ("tool_name" in entityInput) {
                attrs["mcp.tool.name"] = entityInput.tool_name;
                if ("arguments" in entityInput && typeof entityInput.arguments === "object" && entityInput.arguments !== null) {
                    attrs["mcp.tool.arguments"] = JSON.stringify(entityInput.arguments);
                }
            }
        } catch  {}
    }
    processMcpSignals(attrs) {
        const hasMcpSignal = typeof attrs["mcp.method.name"] === "string" && !!attrs["mcp.method.name"] || typeof attrs["mcp.tool.name"] === "string" && !!attrs["mcp.tool.name"] || "mcp.request.argument" in attrs || "mcp.tool.arguments" in attrs;
        if (hasMcpSignal && "traceloop.entity.output" in attrs && !("mcp.response.value" in attrs)) {
            attrs["mcp.response.value"] = attrs["traceloop.entity.output"];
        }
        if (attrs["mcp.method.name"] === "initialize" && "traceloop.entity.output" in attrs) {
            try {
                const output = typeof attrs["traceloop.entity.output"] === "string" ? JSON.parse(attrs["traceloop.entity.output"]) : attrs["traceloop.entity.output"];
                if (output && typeof output === "object") {
                    if ("protocolVersion" in output) {
                        attrs["mcp.protocol_version"] = output.protocolVersion;
                    }
                    if ("serverInfo" in output && typeof output.serverInfo === "object") {
                        const info = output.serverInfo;
                        attrs["mcp.server.name"] = info.name ?? "";
                        attrs["mcp.server.version"] = info.version ?? "";
                    }
                    if ("capabilities" in output) {
                        attrs["mcp.server.capabilities"] = JSON.stringify(output.capabilities).slice(0, 2e3);
                    }
                }
            } catch  {}
        }
        if (attrs["mcp.method.name"] === "tools/list" && "traceloop.entity.output" in attrs) {
            try {
                const output = typeof attrs["traceloop.entity.output"] === "string" ? JSON.parse(attrs["traceloop.entity.output"]) : attrs["traceloop.entity.output"];
                if (output && typeof output === "object" && Array.isArray(output.tools)) {
                    const tools = output.tools;
                    attrs["mcp.tools.count"] = tools.length;
                    const toolNames = tools.filter((t)=>"name" in t).map((t)=>t.name);
                    attrs["mcp.tools.names"] = JSON.stringify(toolNames);
                }
            } catch  {}
        }
    }
    handleEmbeddingSpans(attrs) {
        const spanKind = (attrs["openinference.span.kind"] ?? "").toUpperCase();
        if (spanKind !== "EMBEDDING") return;
        const embeddings = [];
        for (const [key, value] of Object.entries(attrs)){
            if (key.startsWith("embedding.embeddings.") && key.endsWith(".embedding.text")) {
                const parts = key.split(".");
                if (parts.length >= 3) {
                    const index = parseInt(parts[2], 10);
                    if (!isNaN(index)) {
                        embeddings.push({
                            index,
                            text: value
                        });
                    }
                }
            }
        }
        if (embeddings.length > 0) {
            embeddings.sort((a, b)=>a.index - b.index);
            attrs["embeddings_data"] = JSON.stringify(embeddings);
        }
        const hasEmbeddingAttrs = Object.keys(attrs).some((k)=>k.startsWith("embedding.") || k.startsWith("gen_ai.embedding"));
        if (hasEmbeddingAttrs) {
            attrs["neatlogs._skip_output_value"] = true;
        }
    }
    /**
   * Extract vendor-specific keys from attrs into a plain object,
   * mapping each source key to a short target name.
   */ _extractKeys(attrs, keyMap) {
        const result = {};
        for (const [srcKey, tgtName] of Object.entries(keyMap)){
            if (srcKey in attrs) {
                result[tgtName] = attrs[srcKey];
            }
        }
        return result;
    }
    handleVectorDbDocAttributes(attrs) {
        const dbSystem = (attrs["db.system"] ?? "").toLowerCase();
        if (dbSystem === "chroma") {
            const docKeyMap = {
                "db.chroma.add.ids_count": "ids_count",
                "db.chroma.add.embeddings_count": "embeddings_count",
                "db.chroma.add.metadatas_count": "metadatas_count",
                "db.chroma.add.documents_count": "documents_count",
                "db.chroma.upsert.ids_count": "ids_count",
                "db.chroma.upsert.embeddings_count": "embeddings_count",
                "db.chroma.upsert.metadatas_count": "metadatas_count",
                "db.chroma.upsert.documents_count": "documents_count",
                "db.chroma.query.n_results": "requested_top_k",
                "db.chroma.query.include": "include"
            };
            const docAttrs = this._extractKeys(attrs, docKeyMap);
            if (Object.keys(docAttrs).length > 0) {
                attrs["document_attributes"] = JSON.stringify(docAttrs);
            }
        } else if (dbSystem === "marqo") {
            const inputKeyMap = {
                "marqo.limit": "limit",
                "marqo.hits_count": "hits_count",
                "marqo.filter": "filter"
            };
            const inputParams = this._extractKeys(attrs, inputKeyMap);
            if (Object.keys(inputParams).length > 0) {
                attrs["retrieval_input_params"] = JSON.stringify(inputParams);
            }
            const docKeyMap = {
                "marqo.document_count": "document_count",
                "marqo.items_processed": "items_processed"
            };
            const docAttrs = this._extractKeys(attrs, docKeyMap);
            if (Object.keys(docAttrs).length > 0) {
                attrs["document_attributes"] = JSON.stringify(docAttrs);
            }
        } else if (dbSystem === "qdrant") {
            const docKeyMap = {
                "qdrant.upsert.points_count": "points_count"
            };
            const docAttrs = this._extractKeys(attrs, docKeyMap);
            if (Object.keys(docAttrs).length > 0) {
                attrs["document_attributes"] = JSON.stringify(docAttrs);
            }
        } else if (dbSystem === "milvus") {
            const docKeyMap = {
                "db.milvus.insert.data_count": "insert.data_count",
                "db.milvus.search.data_count": "search.data_count",
                "db.milvus.search.limit": "search.limit",
                "db.milvus.search.output_fields_count": "search.output_fields_count",
                "db.milvus.search.result_count": "search.result_count",
                "db.milvus.search.filter": "search.filter"
            };
            const docAttrs = this._extractKeys(attrs, docKeyMap);
            if (Object.keys(docAttrs).length > 0) {
                attrs["document_attributes"] = JSON.stringify(docAttrs);
            }
        }
    }
    // ── LangChain metadata extraction ───────────────────
    /**
   * LangChain instrumentation puts model info in `metadata` as a JSON string
   * with `ls_provider`, `ls_model_name`, `ls_temperature`, `ls_max_tokens`.
   * Extract these into standard positions when the standard attributes are missing.
   */ extractLangchainMetadata(attrs) {
        const raw = attrs["metadata"];
        if (!raw || typeof raw !== "string") return;
        let meta;
        try {
            meta = JSON.parse(raw);
        } catch  {
            return;
        }
        if (typeof meta !== "object" || meta === null) return;
        if (meta.ls_model_name && !attrs["llm.model_name"]) {
            attrs["llm.model_name"] = meta.ls_model_name;
        }
        if (meta.ls_provider && !attrs["llm.system"]) {
            const providerMap = {
                google_genai: "google",
                openai: "openai",
                anthropic: "anthropic"
            };
            attrs["llm.system"] = providerMap[meta.ls_provider] ?? meta.ls_provider;
        }
        const hasTemp = meta.ls_temperature !== void 0;
        const hasMaxTokens = meta.ls_max_tokens !== void 0;
        if (hasTemp || hasMaxTokens) {
            let existing = {};
            try {
                existing = JSON.parse(attrs["llm.invocation_parameters"] ?? "{}");
            } catch  {
                existing = {};
            }
            if (hasTemp && !("temperature" in existing)) {
                existing["temperature"] = meta.ls_temperature;
            }
            if (hasMaxTokens && !("max_tokens" in existing)) {
                existing["max_tokens"] = meta.ls_max_tokens;
            }
            if (meta.ls_model_name && !("model" in existing)) {
                existing["model"] = meta.ls_model_name;
            }
            attrs["llm.invocation_parameters"] = JSON.stringify(existing);
        }
    }
    // ── Vercel AI SDK extraction ───────────────────────
    /**
   * The Vercel AI SDK emits its own `ai.*` namespace alongside `gen_ai.*`. Map
   * the AI-SDK-specific keys onto the canonical `llm.*` / `gen_ai.*` / `tool.*`
   * keys that the existing pipeline already understands. Span-kind inference
   * runs first so downstream `applyNamespaceMapping` resolves it correctly.
   */ extractVercelAiSdkAttrs(attrs) {
        const spanName = attrs["_span_name"] ?? "";
        const isAiSdkSpan = spanName.startsWith("ai.") || "ai.model.id" in attrs || "ai.toolCall.name" in attrs;
        if (!isAiSdkSpan) return;
        if (!("openinference.span.kind" in attrs)) {
            if (spanName === "ai.toolCall") {
                attrs["openinference.span.kind"] = "TOOL";
            } else if (spanName.startsWith("ai.embed")) {
                attrs["openinference.span.kind"] = "EMBEDDING";
            } else if (spanName.startsWith("ai.rerank")) {
                attrs["openinference.span.kind"] = "RERANKER";
            } else if (spanName.endsWith(".doStream") || spanName.endsWith(".doGenerate") || spanName.endsWith(".doRerank") || spanName.endsWith(".doEmbed")) {
                if (spanName.includes("embed")) {
                    attrs["openinference.span.kind"] = "EMBEDDING";
                } else if (spanName.includes("rerank")) {
                    attrs["openinference.span.kind"] = "RERANKER";
                } else {
                    attrs["openinference.span.kind"] = "LLM";
                }
            } else if (spanName === "ai.generateText" || spanName === "ai.streamText" || spanName === "ai.generateObject" || spanName === "ai.streamObject") {
                attrs["openinference.span.kind"] = "CHAIN";
            }
        }
        if ("ai.model.id" in attrs && !("llm.model_name" in attrs)) {
            attrs["llm.model_name"] = attrs["ai.model.id"];
        }
        if ("ai.model.provider" in attrs && !("llm.provider" in attrs)) {
            const raw = String(attrs["ai.model.provider"]);
            attrs["llm.provider"] = raw.split(".")[0];
        }
        if ("ai.usage.promptTokens" in attrs && !("llm.token_count.prompt" in attrs)) {
            attrs["llm.token_count.prompt"] = attrs["ai.usage.promptTokens"];
        }
        if ("ai.usage.completionTokens" in attrs && !("llm.token_count.completion" in attrs)) {
            attrs["llm.token_count.completion"] = attrs["ai.usage.completionTokens"];
        }
        if ("ai.usage.totalTokens" in attrs && !("llm.token_count.total" in attrs)) {
            attrs["llm.token_count.total"] = attrs["ai.usage.totalTokens"];
        }
        const settingMap = {
            "ai.settings.temperature": "gen_ai.request.temperature",
            "ai.settings.maxTokens": "gen_ai.request.max_tokens",
            "ai.settings.topP": "gen_ai.request.top_p",
            "ai.settings.topK": "gen_ai.request.top_k",
            "ai.settings.frequencyPenalty": "gen_ai.request.frequency_penalty",
            "ai.settings.presencePenalty": "gen_ai.request.presence_penalty",
            "ai.settings.stopSequences": "gen_ai.request.stop_sequences"
        };
        for (const [src, tgt] of Object.entries(settingMap)){
            if (src in attrs && !(tgt in attrs)) {
                attrs[tgt] = attrs[src];
            }
        }
        if (!("llm.invocation_parameters" in attrs)) {
            const params = {};
            if ("gen_ai.request.temperature" in attrs) params.temperature = attrs["gen_ai.request.temperature"];
            if ("gen_ai.request.max_tokens" in attrs) params.max_tokens = attrs["gen_ai.request.max_tokens"];
            if ("gen_ai.request.top_p" in attrs) params.top_p = attrs["gen_ai.request.top_p"];
            if ("gen_ai.request.top_k" in attrs) params.top_k = attrs["gen_ai.request.top_k"];
            if ("gen_ai.request.frequency_penalty" in attrs) params.frequency_penalty = attrs["gen_ai.request.frequency_penalty"];
            if ("gen_ai.request.presence_penalty" in attrs) params.presence_penalty = attrs["gen_ai.request.presence_penalty"];
            if ("gen_ai.request.stop_sequences" in attrs) params.stop_sequences = attrs["gen_ai.request.stop_sequences"];
            if (Object.keys(params).length > 0) {
                attrs["llm.invocation_parameters"] = JSON.stringify(params);
            }
        }
        if ("ai.operationId" in attrs && !("gen_ai.operation.name" in attrs)) {
            attrs["gen_ai.operation.name"] = attrs["ai.operationId"];
        }
        if ("ai.response.text" in attrs && !("llm.output_messages.0.message.content" in attrs)) {
            attrs["llm.output_messages.0.message.role"] = "assistant";
            attrs["llm.output_messages.0.message.content"] = attrs["ai.response.text"];
        }
        if ("ai.response.finishReason" in attrs && !("llm.response.finish_reason" in attrs)) {
            attrs["llm.response.finish_reason"] = attrs["ai.response.finishReason"];
        }
        if ("ai.response.id" in attrs && !("gen_ai.response.id" in attrs)) {
            attrs["gen_ai.response.id"] = attrs["ai.response.id"];
        }
        const rawMessages = attrs["ai.prompt.messages"];
        if (typeof rawMessages === "string") {
            try {
                const parsed = JSON.parse(rawMessages);
                if (Array.isArray(parsed)) {
                    parsed.forEach((msg, i)=>{
                        if (msg && typeof msg === "object") {
                            if (typeof msg.role === "string") {
                                attrs[`llm.input_messages.${i}.message.role`] = msg.role;
                            }
                            if (typeof msg.content === "string") {
                                attrs[`llm.input_messages.${i}.message.content`] = msg.content;
                            } else if (msg.content !== void 0) {
                                attrs[`llm.input_messages.${i}.message.content`] = JSON.stringify(msg.content);
                            }
                        }
                    });
                }
            } catch  {}
        }
        const rawToolCalls = attrs["ai.response.toolCalls"];
        if (typeof rawToolCalls === "string") {
            try {
                const parsed = JSON.parse(rawToolCalls);
                if (Array.isArray(parsed)) {
                    parsed.forEach((tc, i)=>{
                        if (tc && typeof tc === "object") {
                            if (tc.toolName !== void 0) {
                                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.function.name`] = tc.toolName;
                            }
                            if (tc.args !== void 0) {
                                const argStr = typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args);
                                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.function.arguments`] = argStr;
                            }
                            if (tc.toolCallId !== void 0) {
                                attrs[`llm.output_messages.0.message.tool_calls.${i}.tool_call.id`] = tc.toolCallId;
                            }
                        }
                    });
                }
            } catch  {}
        }
        if ("ai.value" in attrs && typeof attrs["ai.value"] === "string") {
            try {
                attrs["ai.value"] = JSON.parse(attrs["ai.value"]);
            } catch  {}
        }
        if ("ai.values" in attrs && Array.isArray(attrs["ai.values"])) {
            attrs["ai.values"] = JSON.stringify(attrs["ai.values"].map((v)=>{
                if (typeof v === "string") {
                    try {
                        return JSON.parse(v);
                    } catch  {}
                }
                return v;
            }));
        }
        if (spanName === "ai.toolCall") {
            if ("ai.toolCall.name" in attrs && !("tool.name" in attrs)) {
                attrs["tool.name"] = attrs["ai.toolCall.name"];
            }
            if ("ai.toolCall.args" in attrs && !("input.value" in attrs)) {
                const raw = attrs["ai.toolCall.args"];
                attrs["input.value"] = typeof raw === "string" ? raw : JSON.stringify(raw);
            }
            if ("ai.toolCall.result" in attrs && !("output.value" in attrs)) {
                const raw = attrs["ai.toolCall.result"];
                attrs["output.value"] = typeof raw === "string" ? raw : JSON.stringify(raw);
            }
        }
    }
    // ── CrewAI-specific ─────────────────────────────────
    addCrewaiTokenUsageFallback(attrs) {
        const usage = attrs["neatlogs.crew.token_usage"];
        if (typeof usage !== "string" || !usage) return;
        if ("llm.token_count.prompt" in attrs || "llm.token_count.completion" in attrs || "llm.token_count.total" in attrs) {
            return;
        }
        const parsed = {};
        const re = /([a-zA-Z_]+)=(\d+)/g;
        let match;
        while((match = re.exec(usage)) !== null){
            parsed[match[1]] = parseInt(match[2], 10);
        }
        if ("prompt_tokens" in parsed) {
            attrs["llm.token_count.prompt"] = parsed["prompt_tokens"];
        }
        if ("completion_tokens" in parsed) {
            attrs["llm.token_count.completion"] = parsed["completion_tokens"];
        }
        if ("total_tokens" in parsed) {
            attrs["llm.token_count.total"] = parsed["total_tokens"];
        }
        if ("cached_prompt_tokens" in parsed) {
            attrs["llm.token_count.prompt_details.cache_read"] = parsed["cached_prompt_tokens"];
        }
    }
    addReasoningTokensFromOutputValue(attrs) {
        if ("llm.token_count.completion_details.reasoning" in attrs) return;
        if ("llm.usage.reasoning_tokens" in attrs) return;
        const outputValue = attrs["output.value"];
        if (typeof outputValue !== "string") return;
        try {
            const parsed = JSON.parse(outputValue);
            const usage = parsed?.usage ?? {};
            const details = usage.completion_tokens_details ?? {};
            const reasoning = details.reasoning_tokens;
            if (reasoning && reasoning > 0) {
                attrs["llm.token_count.completion_details.reasoning"] = reasoning;
            }
        } catch  {}
    }
    addCrewaiKickoffTelemetry(attrs) {
        const spanName = String(attrs["_span_name"] ?? "");
        if (!(spanName.startsWith("Crew_") && spanName.endsWith(".kickoff"))) return;
        if (!("crew_number_of_tasks" in attrs)) {
            const count = this.coerceCollectionCount(attrs["crew_tasks"]);
            if (count !== null) {
                attrs["crew_number_of_tasks"] = count;
            }
        }
        if (!("crew_number_of_agents" in attrs)) {
            const count = this.coerceCollectionCount(attrs["crew_agents"]);
            if (count !== null) {
                attrs["crew_number_of_agents"] = count;
            }
        }
    }
    coerceCollectionCount(value) {
        if (value === null || value === void 0) return null;
        if (typeof value === "boolean") return value ? 1 : 0;
        if (typeof value === "number") {
            return Number.isFinite(value) ? Math.floor(value) : null;
        }
        if (Array.isArray(value)) return value.length;
        if (typeof value === "object" && value !== null) return Object.keys(value).length;
        if (typeof value === "string") {
            const s = value.trim();
            if (!s) return null;
            if (/^\d+$/.test(s)) {
                return parseInt(s, 10);
            }
            try {
                const parsed = JSON.parse(s);
                if (Array.isArray(parsed)) return parsed.length;
                if (typeof parsed === "object" && parsed !== null) return Object.keys(parsed).length;
            } catch  {}
        }
        return null;
    }
    // ── Operational metrics ─────────────────────────────
    extractOperationalMetrics(spanDict, attrs) {
        const computed = {};
        const startTime = typeof spanDict.start_time === "number" ? spanDict.start_time : Number(spanDict.start_time);
        const endTime = typeof spanDict.end_time === "number" ? spanDict.end_time : Number(spanDict.end_time);
        const durationNs = endTime - startTime;
        computed["neatlogs.metrics.duration_ms"] = durationNs / 1e6;
        if (attrs["neatlogs.llm.metrics.ttft_ms"] !== void 0) {
            return computed;
        }
        const chunkTimestamps = [];
        if (spanDict.events) {
            for (const event of spanDict.events){
                if (event.name === "gen_ai.content.chunk") {
                    const ts = typeof event.timestamp === "number" ? event.timestamp : Number(event.timestamp);
                    chunkTimestamps.push(ts);
                }
            }
        }
        if (chunkTimestamps.length > 0) {
            const firstNs = chunkTimestamps[0];
            const ttftMs = Math.round((firstNs - startTime) / 1e6 * 1e3) / 1e3;
            computed["neatlogs.llm.metrics.ttft_ms"] = ttftMs;
            if (chunkTimestamps.length >= 2) {
                const lastNs = chunkTimestamps[chunkTimestamps.length - 1];
                const stgMs = Math.round((lastNs - firstNs) / 1e6 * 1e3) / 1e3;
                computed["neatlogs.llm.metrics.streaming_time_to_generate_ms"] = stgMs;
            }
        }
        return computed;
    }
    // ── Event upcycling ─────────────────────────────────
    upcycleEvents(spanDict) {
        const upcycled = {};
        const retrieverDocs = [];
        if (!spanDict.events) return upcycled;
        for (const event of spanDict.events){
            const eAttrs = event.attributes ?? {};
            if (event.name === "db.query.result") {
                const doc = {
                    timestamp: String(event.timestamp)
                };
                if ("db.query.result.id" in eAttrs) doc["id"] = eAttrs["db.query.result.id"];
                if ("db.query.result.distance" in eAttrs) doc["distance"] = eAttrs["db.query.result.distance"];
                if ("db.query.result.document" in eAttrs) doc["document"] = eAttrs["db.query.result.document"];
                if ("db.query.result.metadata" in eAttrs) {
                    const metadata = eAttrs["db.query.result.metadata"];
                    if (typeof metadata === "string") {
                        doc["metadata"] = safeParse(metadata) ?? String(metadata);
                    } else {
                        doc["metadata"] = metadata;
                    }
                }
                for (const field of [
                    "_id",
                    "title",
                    "text",
                    "category",
                    "_score"
                ]){
                    if (field in eAttrs) doc[field] = eAttrs[field];
                }
                retrieverDocs.push(doc);
            } else if (event.name === "db.search.result") {
                const doc = {
                    timestamp: String(event.timestamp)
                };
                if ("db.search.query.id" in eAttrs) doc["query_id"] = eAttrs["db.search.query.id"];
                if ("db.search.result.id" in eAttrs) doc["result_id"] = eAttrs["db.search.result.id"];
                if ("db.search.result.distance" in eAttrs) doc["distance"] = eAttrs["db.search.result.distance"];
                if ("db.search.result.entity" in eAttrs) doc["entity"] = eAttrs["db.search.result.entity"];
                retrieverDocs.push(doc);
            } else if (event.name === "db.query.embeddings") {
                const vector = eAttrs["db.query.embeddings.vector"] ?? eAttrs["vector"];
                if (vector && (Array.isArray(vector) || ArrayBuffer.isView(vector))) {
                    upcycled["neatlogs.db.query.embeddings.dimension"] = vector.length;
                    if (this.debug) {
                        logger2.debug(`Calculated embedding dimension: ${vector.length}`);
                    }
                }
            }
        }
        if (retrieverDocs.length > 0) {
            upcycled["retrieval_documents"] = JSON.stringify(retrieverDocs);
        }
        return upcycled;
    }
    // ── Namespace mapping ───────────────────────────────
    applyNamespaceMapping(attrs) {
        const unified = this.mapper.mapAttributes(attrs);
        const currentKind = unified["neatlogs.span.kind"];
        if (!currentKind || currentKind === "unknown") {
            const oiKind = attrs["openinference.span.kind"];
            if (oiKind) {
                unified["neatlogs.span.kind"] = String(oiKind).toLowerCase();
            } else {
                const scopeName = attrs["neatlogs.instrumentation.name"] ?? "";
                const spanName = attrs["_span_name"] ?? "";
                if (spanName && scopeName !== "next.js") {
                    const inferred = inferSpanKindFromName(spanName).toLowerCase();
                    unified["neatlogs.span.kind"] = inferred;
                }
            }
        }
        const llmRequestType = (attrs["llm.request.type"] ?? "").toLowerCase();
        const genAiOperation = (attrs["gen_ai.operation.name"] ?? "").toLowerCase();
        const spanNameLower = (attrs["_span_name"] ?? "").toLowerCase();
        const hasExplicitKind = "openinference.span.kind" in attrs || "traceloop.span.kind" in attrs;
        if (!hasExplicitKind && (llmRequestType === "rerank" || genAiOperation === "rerank" || spanNameLower.includes("rerank"))) {
            unified["neatlogs.span.kind"] = "reranker";
        }
        const spanKind = (attrs["neatlogs.span.kind"] ?? attrs["openinference.span.kind"] ?? "").toLowerCase();
        if (![
            "embedding",
            "retriever",
            "vector_store"
        ].includes(spanKind)) {
            delete unified["neatlogs.vectordb.embedding_model"];
        }
        if (this.debug) {
            logger2.debug(`[ScopeDetectionFinal] span_name=${attrs["_span_name"]} scope=${attrs["neatlogs.instrumentation.name"]} framework=${unified["neatlogs.framework"]}`);
        }
        this.fillProviderGaps(attrs, unified);
        return unified;
    }
    // ── Provider/system gap filling ─────────────────────
    fillProviderGaps(attrs, unified) {
        if (!unified["neatlogs.llm.provider"]) {
            const scopeProvider = unified["neatlogs.provider"] ?? attrs["neatlogs.provider"] ?? "";
            if (scopeProvider) {
                unified["neatlogs.llm.provider"] = scopeProvider;
            } else {
                const model = String(attrs["llm.model_name"] ?? attrs["gen_ai.request.model"] ?? attrs["llm.model"] ?? "");
                const inferred = this.inferProviderFromModel(model);
                if (inferred) {
                    unified["neatlogs.llm.provider"] = inferred;
                }
            }
        }
        if (!unified["neatlogs.llm.system"]) {
            const provider = (unified["neatlogs.llm.provider"] ?? unified["neatlogs.provider"] ?? "").toLowerCase();
            const system = PROVIDER_TO_SYSTEM[provider] ?? "";
            if (system) {
                unified["neatlogs.llm.system"] = system;
            }
        }
    }
    inferProviderFromModel(model) {
        if (!model) return "";
        const m = model.toLowerCase();
        if (/^(gpt-|o1-|o3-|o4-|text-embedding-|text-davinci-)/.test(m)) return "openai";
        if (m.startsWith("claude-")) return "anthropic";
        if (m.startsWith("gemini-") || m.startsWith("gemma-")) return "google";
        if (m.startsWith("mistral-") || m.startsWith("mixtral-")) return "mistralai";
        if (m.startsWith("command-") || m.startsWith("embed-english") || m.startsWith("embed-multilingual")) return "cohere";
        if (m.startsWith("anthropic.") || m.startsWith("meta.") || m.startsWith("amazon.") || m.startsWith("nova-") || m.startsWith("titan-")) return "aws";
        if (m.startsWith("grok-")) return "xai";
        if (m.startsWith("deepseek-")) return "deepseek";
        return "";
    }
    // ── Intermediate ReAct steps ────────────────────────
    addIntermediateSteps(unified) {
        if ("neatlogs.llm.intermediate_steps" in unified) return;
        if (String(unified["neatlogs.span.kind"] ?? "").toLowerCase() !== "llm") return;
        const steps = this.extractReactStepsFromMessages(unified);
        if (steps.length === 0) return;
        unified["neatlogs.llm.intermediate_steps"] = JSON.stringify(steps);
    }
    extractReactStepsFromMessages(unified) {
        const outputTexts = this.collectRoleTexts(unified, "neatlogs.llm.output_messages", "assistant");
        const steps = this.parseReactSteps(outputTexts);
        if (steps.length > 0) return steps;
        const inputTexts = this.collectRoleTexts(unified, "neatlogs.llm.input_messages", "assistant");
        return this.parseReactSteps(inputTexts);
    }
    collectRoleTexts(unified, prefix, role) {
        const idxRe = new RegExp(`^${escapeRegExp(prefix)}\\.(\\d+)\\.content$`);
        const idxs = /* @__PURE__ */ new Set();
        for (const k of Object.keys(unified)){
            const m = idxRe.exec(k);
            if (m) {
                idxs.add(parseInt(m[1], 10));
            }
        }
        const texts = [];
        for (const i of [
            ...idxs
        ].sort((a, b)=>a - b)){
            const r = unified[`${prefix}.${i}.role`];
            if (typeof r !== "string" || r.toLowerCase() !== role) continue;
            const c = unified[`${prefix}.${i}.content`];
            if (typeof c === "string" && c.toLowerCase().includes("thought:")) {
                texts.push(c.slice(0, 2e4));
            }
        }
        return texts;
    }
    parseReactSteps(texts) {
        if (texts.length === 0) return [];
        const markerRe = /(?:^|\n)\s*(Thought|Context|Action|Action Input|Observation|Final Answer)\s*:\s*/gim;
        const allSteps = [];
        for (const text of texts){
            const matches = [];
            let m;
            markerRe.lastIndex = 0;
            while((m = markerRe.exec(text)) !== null){
                matches.push({
                    label: m[1].trim().toLowerCase(),
                    start: m.index + m[0].length,
                    matchStart: m.index
                });
            }
            if (matches.length === 0) continue;
            let cur = {};
            const commit = ()=>{
                if (Object.keys(cur).length === 0) return;
                if (!Object.values(cur).some((v)=>v)) {
                    cur = {};
                    return;
                }
                if (allSteps.length > 0) {
                    const last = allSteps[allSteps.length - 1];
                    if (JSON.stringify(last) === JSON.stringify(cur)) {
                        cur = {};
                        return;
                    }
                }
                allSteps.push(cur);
                cur = {};
            };
            for(let idx = 0; idx < matches.length; idx++){
                const { label, start: contentStart } = matches[idx];
                const contentEnd = idx + 1 < matches.length ? matches[idx + 1].matchStart : text.length;
                const value = text.slice(contentStart, contentEnd).trim();
                if (label === "thought" && Object.keys(cur).length > 0) {
                    commit();
                }
                if (label === "thought") {
                    cur["thought"] = truncate(value, 600);
                } else if (label === "context") {
                    cur["context"] = truncate(value, 500);
                } else if (label === "action") {
                    cur["action"] = truncate(value, 200);
                } else if (label === "action input") {
                    cur["action_input"] = truncate(value, 1e3);
                } else if (label === "observation") {
                    cur["observation"] = truncate(value, 500);
                } else if (label === "final answer") {
                    cur["final_answer"] = truncate(value, 1200);
                }
            }
            commit();
        }
        return allSteps;
    }
    // ── I/O sanitization ────────────────────────────────
    /**
   * Remove Python object reprs from input.value / output.value JSON strings.
   * Also drops the top-level "self" key that CrewAI injects.
   */ sanitizeIoValue(val) {
        if (typeof val !== "string") return val;
        try {
            const parsed = JSON.parse(val);
            const cleaned = cleanPythonReprs(parsed);
            if (typeof cleaned === "object" && cleaned !== null && !Array.isArray(cleaned)) {
                delete cleaned["self"];
            }
            if (JSON.stringify(cleaned) !== JSON.stringify(parsed)) {
                return JSON.stringify(cleaned);
            }
        } catch  {}
        return val;
    }
    // ── Embedding vector filter ─────────────────────────
    filterEmbeddingVectors(attrs) {
        const filtered = {};
        for (const [key, value] of Object.entries(attrs)){
            if (key.includes(".embedding.vector") || key.includes(".embeddings.") || key === "ai.embeddings" || key === "ai.embedding") {
                if (this.debug) {
                    logger2.debug(`[FILTER] Dropped embedding vector key: ${key}`);
                }
                continue;
            }
            if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length > 1e3) {
                if (this.debug) {
                    logger2.debug(`[FILTER] Dropped large array (${value.length} elements): ${key}`);
                }
                continue;
            }
            filtered[key] = value;
        }
        return filtered;
    }
    // ── Helpers ─────────────────────────────────────────
    looksLikeHttp(attrs) {
        for (const k of [
            "http.method",
            "http.url",
            "http.status_code",
            "http.route"
        ]){
            if (k in attrs) return true;
        }
        return Object.keys(attrs).some((key)=>key.startsWith("http."));
    }
    /**
   * Check if the raw span kind indicates CLIENT (OTel SpanKind.CLIENT = 3).
   */ isHttpLikeSpanKind(kind) {
        if (typeof kind === "number") return kind === 3;
        return String(kind).toUpperCase() === "CLIENT";
    }
};
function truncate(val, maxLen) {
    val = (val ?? "").trim();
    if (val.length <= maxLen) return val;
    return val.slice(0, maxLen) + `...(truncated,len=${val.length})`;
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// src/core/mask.ts
var logger3 = getLogger();
var _MASK_REGISTRY = /* @__PURE__ */ new Map();
var _nextId = 0;
function registerMask(fn) {
    const key = String(++_nextId);
    _MASK_REGISTRY.set(key, fn);
    return key;
}
function applyMask(spanData, globalMask) {
    const maskId = spanData?.attributes?.["neatlogs.mask_id"];
    let maskFn = null;
    if (maskId) {
        maskFn = _MASK_REGISTRY.get(String(maskId)) ?? null;
    }
    if (!maskFn) {
        maskFn = globalMask ?? null;
    }
    if (!maskFn) {
        return spanData;
    }
    try {
        const result = maskFn(spanData);
        if (result === null) return null;
        return result !== void 0 ? result : spanData;
    } catch (exc) {
        logger3.warn(`mask callable raised an exception for span '${spanData?.name}': ${exc} \u2014 original span data will be exported unchanged.`);
        return spanData;
    }
}
;
var _promptStorage = new __TURBOPACK__imported__module__$5b$externals$5d2f$async_hooks__$5b$external$5d$__$28$async_hooks$2c$__cjs$29$__["AsyncLocalStorage"]();
var PromptContext = class {
    /**
   * Store system prompt template and variables in context.
   */ static set(template, variables) {
        _promptStorage.enterWith({
            template,
            variables
        });
    }
    /**
   * Retrieve system prompt template from context.
   */ static getTemplate() {
        return _promptStorage.getStore()?.template;
    }
    /**
   * Retrieve system prompt variables from context.
   */ static getVariables() {
        return _promptStorage.getStore()?.variables;
    }
    /**
   * Clear system prompt context.
   */ static clear() {
        _promptStorage.enterWith(void 0);
    }
};
var _userPromptStorage = new __TURBOPACK__imported__module__$5b$externals$5d2f$async_hooks__$5b$external$5d$__$28$async_hooks$2c$__cjs$29$__["AsyncLocalStorage"]();
var UserPromptContext = class {
    /**
   * Store user prompt template and variables in context.
   */ static set(template, variables) {
        _userPromptStorage.enterWith({
            template,
            variables
        });
    }
    /**
   * Retrieve user prompt template from context.
   */ static getTemplate() {
        return _userPromptStorage.getStore()?.template;
    }
    /**
   * Retrieve user prompt variables from context.
   */ static getVariables() {
        return _userPromptStorage.getStore()?.variables;
    }
    /**
   * Clear user prompt context.
   */ static clear() {
        _userPromptStorage.enterWith(void 0);
    }
};
var VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;
var BasePromptTemplate = class {
    _template;
    _variables;
    /**
   * @param template - Either a string with `{{variable}}` placeholders or
   *   an array of `PromptMessage` objects whose `content` fields contain placeholders.
   */ constructor(template){
        this._template = template;
        this._variables = this._extractVariables();
    }
    /** List of unique variable names found in this template. */ get variables() {
        return this._variables;
    }
    /** The raw template (string or message array). */ get template() {
        return this._template;
    }
    /**
   * Compile the prompt template with the given variables.
   *
   * @param variables - Key/value pairs to substitute for `{{key}}` placeholders.
   * @returns The rendered string or rendered message array.
   * @throws {Error} If any required variables are missing.
   */ compile(variables) {
        const vars = variables ?? {};
        const missing = this._variables.filter((v)=>!(v in vars));
        if (missing.length > 0) {
            throw new Error(`Missing required variables: ${missing.join(", ")}. Template requires: ${this._variables.join(", ")}`);
        }
        this._contextSetter.set(typeof this._template === "string" ? this._template : this._template.map((msg)=>`${msg.role}: ${msg.content}`).join("\n"), vars);
        if (typeof this._template === "string") {
            return this._renderString(this._template, vars);
        }
        return this._template.map((msg)=>({
                role: msg.role,
                content: this._renderString(msg.content, vars)
            }));
    }
    /**
   * Replace `{{key}}` placeholders in a string with the corresponding values.
   */ _renderString(text, variables) {
        let result = text;
        for (const [key, value] of Object.entries(variables)){
            result = result.replaceAll(`{{${key}}}`, String(value));
        }
        return result;
    }
    toString() {
        if (typeof this._template === "string") {
            return this._template.length > 50 ? `${this._displayName}('${this._template.slice(0, 50)}...')` : `${this._displayName}('${this._template}')`;
        }
        return `${this._displayName}(${this._template.length} messages, variables=${JSON.stringify(this._variables)})`;
    }
    // ---- private ----
    _extractVariables() {
        if (typeof this._template === "string") {
            return [
                ...new Set(Array.from(this._template.matchAll(VARIABLE_PATTERN), (m)=>m[1]))
            ];
        }
        const found = [];
        for (const msg of this._template){
            if (msg.content) {
                for (const match of msg.content.matchAll(VARIABLE_PATTERN)){
                    found.push(match[1]);
                }
            }
        }
        return [
            ...new Set(found)
        ];
    }
};
var PromptTemplate = class extends BasePromptTemplate {
    get _contextSetter() {
        return PromptContext;
    }
    get _displayName() {
        return "PromptTemplate";
    }
};
var UserPromptTemplate = class extends BasePromptTemplate {
    get _contextSetter() {
        return UserPromptContext;
    }
    get _displayName() {
        return "UserPromptTemplate";
    }
};
;
;
var logger4 = getLogger();
var TRACER_NAME = "neatlogs";
function safeJsonDumps(value) {
    try {
        return JSON.stringify(value, (_key, val)=>{
            if (typeof val === "bigint") return val.toString();
            if (val instanceof Error) return {
                message: val.message,
                name: val.name,
                stack: val.stack
            };
            if (typeof val === "function") return `[Function: ${val.name || "anonymous"}]`;
            return val;
        });
    } catch  {
        return String(value);
    }
}
function serializeObj(obj) {
    if (obj === null || obj === void 0) return obj;
    if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") return obj;
    if (typeof obj.toJSON === "function") return obj.toJSON();
    if (Array.isArray(obj)) return obj.map(serializeObj);
    if (typeof obj === "object") {
        const result = {};
        for (const [key, value] of Object.entries(obj)){
            result[key] = serializeObj(value);
        }
        return result;
    }
    return String(obj);
}
function shouldCaptureContent() {
    const envVal = process.env.NEATLOGS_TRACE_CONTENT;
    if (envVal === void 0 || envVal === "") return true;
    return envVal.toLowerCase() !== "false" && envVal !== "0";
}
function setCommonSpanAttrs(span2, opts) {
    if (opts.kind) {
        span2.setAttribute("openinference.span.kind", opts.kind);
    }
    if (opts.internal) {
        span2.setAttribute("neatlogs.internal", true);
    }
    if (opts.description) {
        span2.setAttribute("neatlogs.description", opts.description);
    }
    if (opts.mask) {
        const maskId = registerMask(opts.mask);
        span2.setAttribute("neatlogs.mask_id", maskId);
    }
}
function decorateSpan(opts, fn) {
    const tracer = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getTracer(TRACER_NAME);
    const spanName = opts.spanName ?? opts.name ?? (fn.name || "anonymous");
    const captureInput = opts.captureInput !== false;
    const captureOutput = opts.captureOutput !== false;
    const doCapture = shouldCaptureContent();
    const wrapped = (...args)=>{
        return tracer.startActiveSpan(spanName, (span2)=>{
            try {
                setCommonSpanAttrs(span2, opts);
                if (captureInput && doCapture && args.length > 0) {
                    try {
                        const inputValue = args.length === 1 ? serializeObj(args[0]) : args.map(serializeObj);
                        span2.setAttribute("input.value", safeJsonDumps(inputValue));
                    } catch (err) {
                        logger4.debug(`Failed to capture input: ${err}`);
                    }
                }
                const result = fn(...args);
                if (result instanceof Promise) {
                    return result.then((resolved)=>{
                        if (captureOutput && doCapture) {
                            try {
                                span2.setAttribute("output.value", safeJsonDumps(serializeObj(resolved)));
                            } catch (err) {
                                logger4.debug(`Failed to capture output: ${err}`);
                            }
                        }
                        if (opts.postprocessResult) {
                            try {
                                const boundInputs = _extractBoundInputs(fn, args);
                                opts.postprocessResult(span2, resolved, boundInputs);
                            } catch (err) {
                                logger4.debug(`Postprocess failed: ${err}`);
                            }
                        }
                        span2.setStatus({
                            code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].OK
                        });
                        span2.end();
                        return resolved;
                    }).catch((error)=>{
                        span2.setStatus({
                            code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].ERROR,
                            message: error?.message ?? String(error)
                        });
                        span2.recordException(error instanceof Error ? error : new Error(String(error)));
                        span2.end();
                        throw error;
                    });
                }
                if (captureOutput && doCapture) {
                    try {
                        span2.setAttribute("output.value", safeJsonDumps(serializeObj(result)));
                    } catch (err) {
                        logger4.debug(`Failed to capture output: ${err}`);
                    }
                }
                if (opts.postprocessResult) {
                    try {
                        const boundInputs = _extractBoundInputs(fn, args);
                        opts.postprocessResult(span2, result, boundInputs);
                    } catch (err) {
                        logger4.debug(`Postprocess failed: ${err}`);
                    }
                }
                span2.setStatus({
                    code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].OK
                });
                span2.end();
                return result;
            } catch (error) {
                span2.setStatus({
                    code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].ERROR,
                    message: error?.message ?? String(error)
                });
                span2.recordException(error instanceof Error ? error : new Error(String(error)));
                span2.end();
                throw error;
            }
        });
    };
    Object.defineProperty(wrapped, "name", {
        value: spanName,
        configurable: true
    });
    return wrapped;
}
function _extractBoundInputs(fn, args) {
    const result = {};
    const fnStr = fn.toString();
    const match = fnStr.match(/\(([^)]*)\)/);
    if (match) {
        const paramNames = match[1].split(",").map((p)=>p.trim().replace(/\s*[:=].*$/, "").replace(/^\.\.\./, "")).filter(Boolean);
        for(let i = 0; i < Math.min(paramNames.length, args.length); i++){
            result[paramNames[i]] = args[i];
        }
    }
    return result;
}
// src/core/context.ts
var logger5 = getLogger();
var _sessionConfig = {};
function _setSessionConfig(config) {
    _sessionConfig = config;
}
function getSessionConfig() {
    return {
        ..._sessionConfig
    };
}
var PROMPT_VARIABLES_KEY = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["createContextKey"])("neatlogs.prompt_variables");
var PROMPT_TEMPLATE_KEY = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["createContextKey"])("neatlogs.prompt_template");
var PROMPT_VERSION_KEY = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["createContextKey"])("neatlogs.prompt_version");
var USER_PROMPT_TEMPLATE_KEY = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["createContextKey"])("neatlogs.user_prompt_template");
var USER_PROMPT_VARIABLES_KEY = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["createContextKey"])("neatlogs.user_prompt_variables");
var KNOWN_OPTION_KEYS = /* @__PURE__ */ new Set([
    "name",
    "kind",
    "input",
    "promptTemplate",
    "promptVariables",
    "userPromptTemplate",
    "userPromptVariables",
    "version",
    "mask",
    "attributes"
]);
function _setSpanAttributes(span2, kind, attributes) {
    span2.setAttribute("neatlogs.internal", true);
    span2.setAttribute("openinference.span.kind", kind ?? "CHAIN");
    for (const [key, value] of Object.entries(attributes)){
        span2.setAttribute(key, value);
    }
}
function _finalizePromptCapture(span2, isPromptTemplateObj, isUserPromptTemplateObj) {
    if (isPromptTemplateObj) {
        const capturedVars = PromptContext.getVariables();
        if (capturedVars) {
            span2.setAttribute("llm.prompt_template_variables", JSON.stringify(capturedVars));
            logger5.debug(`[trace] Auto-captured variables from PromptContext: ${Object.keys(capturedVars).join(", ")}`);
        }
    }
    if (isUserPromptTemplateObj) {
        const capturedUserVars = UserPromptContext.getVariables();
        if (capturedUserVars) {
            span2.setAttribute("llm.user_prompt_template_variables", JSON.stringify(capturedUserVars));
            logger5.debug(`[trace] Auto-captured variables from UserPromptContext: ${Object.keys(capturedUserVars).join(", ")}`);
        }
    }
}
async function trace2(options, fn) {
    const { name, kind, input, promptTemplate, promptVariables, userPromptTemplate, userPromptVariables, version, mask, attributes: explicitAttributes, ...extraOptions } = options;
    const sessionConfig = getSessionConfig();
    const sessionId = sessionConfig.sessionId;
    const currentSpan = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getSpan(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active());
    const isInActiveTrace = currentSpan !== void 0 && currentSpan.isRecording();
    const shouldCreateRootTrace = !!sessionId && !isInActiveTrace;
    let templateString;
    let isPromptTemplateObj = false;
    if (promptTemplate !== void 0) {
        if (promptTemplate instanceof PromptTemplate) {
            isPromptTemplateObj = true;
            const t = promptTemplate.template;
            templateString = typeof t === "string" ? t : JSON.stringify(t);
            logger5.debug(`[trace] Using PromptTemplate object with variables: ${promptTemplate.variables.join(", ")}`);
        } else if (typeof promptTemplate === "string") {
            templateString = promptTemplate;
        } else {
            const t = promptTemplate.template;
            templateString = typeof t === "string" ? t : JSON.stringify(t);
        }
    }
    let userTemplateString;
    let isUserPromptTemplateObj = false;
    if (userPromptTemplate !== void 0) {
        if (userPromptTemplate instanceof UserPromptTemplate) {
            isUserPromptTemplateObj = true;
            const t = userPromptTemplate.template;
            userTemplateString = typeof t === "string" ? t : JSON.stringify(t);
            logger5.debug(`[trace] Using UserPromptTemplate object with variables: ${userPromptTemplate.variables.join(", ")}`);
        } else if (typeof userPromptTemplate === "string") {
            userTemplateString = userPromptTemplate;
        } else {
            const t = userPromptTemplate.template;
            userTemplateString = typeof t === "string" ? t : JSON.stringify(t);
        }
    }
    let ctx = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active();
    const variablesJson = promptVariables ? JSON.stringify(promptVariables) : void 0;
    const userVariablesJson = userPromptVariables ? JSON.stringify(userPromptVariables) : void 0;
    if (variablesJson) {
        ctx = ctx.setValue(PROMPT_VARIABLES_KEY, variablesJson);
        logger5.debug(`[trace] Set neatlogs.prompt_variables in context: ${variablesJson}`);
    }
    if (templateString) {
        ctx = ctx.setValue(PROMPT_TEMPLATE_KEY, templateString);
        logger5.debug(`[trace] Set neatlogs.prompt_template in context: ${templateString}`);
    }
    if (userVariablesJson) {
        ctx = ctx.setValue(USER_PROMPT_VARIABLES_KEY, userVariablesJson);
        logger5.debug(`[trace] Set neatlogs.user_prompt_variables in context: ${userVariablesJson}`);
    }
    if (userTemplateString) {
        ctx = ctx.setValue(USER_PROMPT_TEMPLATE_KEY, userTemplateString);
        logger5.debug(`[trace] Set neatlogs.user_prompt_template in context: ${userTemplateString}`);
    }
    if (version) {
        ctx = ctx.setValue(PROMPT_VERSION_KEY, version);
        logger5.debug(`[trace] Set neatlogs.prompt_version in context: ${version}`);
    }
    const extraAttributes = {
        ...explicitAttributes ?? {}
    };
    for (const [key, value] of Object.entries(extraOptions)){
        if (!KNOWN_OPTION_KEYS.has(key)) {
            extraAttributes[key] = value;
        }
    }
    const tracer = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getTracer("neatlogs.trace");
    const spanCallback = async (span2)=>{
        _setSpanAttributes(span2, kind, extraAttributes);
        if (input !== void 0 && input !== null) {
            span2.setAttribute("input.value", safeJsonDumps(serializeObj(input)));
        }
        if (mask) {
            const maskId = registerMask(mask);
            span2.setAttribute("neatlogs.mask_id", maskId);
        }
        try {
            const result = await fn(span2);
            _finalizePromptCapture(span2, isPromptTemplateObj, isUserPromptTemplateObj);
            if (result !== void 0 && result !== null) {
                const spanAttrs = span2.attributes ?? span2._attributes;
                const hasOutput = spanAttrs && ("output.value" in spanAttrs || "neatlogs.output.value" in spanAttrs);
                if (!hasOutput) {
                    span2.setAttribute("output.value", safeJsonDumps(serializeObj(result)));
                }
            }
            return result;
        } catch (error) {
            span2.setStatus({
                code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].ERROR,
                message: error instanceof Error ? error.message : String(error)
            });
            span2.recordException(error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally{
            if (isPromptTemplateObj) {
                PromptContext.clear();
            }
            if (isUserPromptTemplateObj) {
                UserPromptContext.clear();
            }
            span2.end();
        }
    };
    if (shouldCreateRootTrace) {
        logger5.debug(`[trace] Creating NEW root trace '${name}' (sessionId=${sessionId})`);
        return tracer.startActiveSpan(name, {}, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["ROOT_CONTEXT"], spanCallback);
    } else {
        logger5.debug(`[trace] Creating child span '${name}'`);
        return tracer.startActiveSpan(name, {}, ctx, spanCallback);
    }
}
// src/core/crewai-task-registry.ts
var logger6 = getLogger();
var _registry = /* @__PURE__ */ new Map();
function registerCrewaiTask(task, userTpl, vars) {
    const taskId = String(task.id);
    const tplStr = String(userTpl.template);
    const varsJson = vars && Object.keys(vars).length > 0 ? JSON.stringify(vars, (_key, val)=>typeof val === "undefined" ? null : val) : null;
    _registry.set(taskId, [
        tplStr,
        varsJson
    ]);
    logger6.debug(`Registered CrewAI task ${taskId}`);
}
function popEntry(taskId) {
    const entry = _registry.get(taskId);
    if (entry) {
        _registry.delete(taskId);
    }
    return entry;
}
// src/config/attribute-mapping.json
var attribute_mapping_default = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Neatlogs Semantic Conventions - Attribute Mapping Configuration",
    description: "Maps vendor-specific attributes (OpenInference, OpenLLMetry) to unified neatlogs.* namespace",
    version: "1.0.0",
    mappings: {
        span_kind: {
            description: "Span classification/type",
            sources: [
                "openinference.span.kind",
                "traceloop.span.kind"
            ],
            target: "neatlogs.span.kind",
            values: {
                LLM: "llm",
                TOOL: "tool",
                AGENT: "agent",
                CHAIN: "chain",
                WORKFLOW: "workflow",
                TASK: "task",
                RETRIEVER: "retriever",
                EMBEDDING: "embedding",
                VECTOR_STORE: "vector_store",
                RERANKER: "reranker",
                GUARDRAIL: "guardrail",
                EVALUATOR: "evaluator",
                MCP_TOOL: "mcp_tool",
                HTTP: "http"
            },
            priority: "openinference"
        },
        llm: {
            description: "LLM-specific attributes",
            mappings: {
                model_name: {
                    sources: [
                        "llm.model_name",
                        "gen_ai.response.model",
                        "gen_ai.request.model",
                        "traceloop.association.properties.ls_model_name"
                    ],
                    target: "neatlogs.llm.model_name"
                },
                provider: {
                    sources: [
                        "llm.provider",
                        "traceloop.association.properties.ls_provider"
                    ],
                    target: "neatlogs.llm.provider"
                },
                system: {
                    sources: [
                        "llm.system",
                        "gen_ai.system"
                    ],
                    target: "neatlogs.llm.system"
                },
                request_type: {
                    sources: [
                        "llm.request.type",
                        "neatlogs.llm.operation.name",
                        "neatlogs.llm.operation.type"
                    ],
                    target: "neatlogs.llm.request_type"
                },
                choices: {
                    sources: [
                        "gen_ai.client.generation.choices",
                        "llm.request.n"
                    ],
                    target: "neatlogs.llm.generation_choices"
                },
                token_count: {
                    mappings: {
                        total: {
                            sources: [
                                "llm.token_count.total",
                                "llm.usage.total_tokens",
                                "ai.usage.totalTokens"
                            ],
                            target: "neatlogs.llm.token_count.total"
                        },
                        prompt: {
                            sources: [
                                "llm.token_count.prompt",
                                "gen_ai.usage.input_tokens",
                                "ai.usage.promptTokens"
                            ],
                            target: "neatlogs.llm.token_count.prompt"
                        },
                        completion: {
                            sources: [
                                "llm.token_count.completion",
                                "gen_ai.usage.output_tokens",
                                "ai.usage.completionTokens"
                            ],
                            target: "neatlogs.llm.token_count.completion"
                        },
                        reasoning: {
                            sources: [
                                "llm.token_count.completion_details.reasoning",
                                "llm.usage.reasoning_tokens"
                            ],
                            target: "neatlogs.llm.token_count.reasoning"
                        },
                        cached: {
                            sources: [
                                "neatlogs.llm.token_count.cached_read",
                                "llm.token_count.prompt_details.cache_read",
                                "llm.token_count.prompt.cache_read",
                                "gen_ai.usage.cache_read_input_tokens"
                            ],
                            target: "neatlogs.llm.token_count.cache_read"
                        },
                        cache_write: {
                            sources: [
                                "neatlogs.llm.token_count.cached_write",
                                "llm.token_count.prompt_details.cache_write",
                                "gen_ai.usage.cache_creation_input_tokens"
                            ],
                            target: "neatlogs.llm.token_count.cache_write"
                        },
                        prompt_audio: {
                            sources: [
                                "llm.token_count.prompt_details.audio"
                            ],
                            target: "neatlogs.llm.token_count.prompt_audio"
                        },
                        completion_audio: {
                            sources: [
                                "neatlogs.llm.token_count.audio",
                                "llm.token_count.completion_details.audio"
                            ],
                            target: "neatlogs.llm.token_count.completion_audio"
                        }
                    }
                },
                tool_calls: {
                    description: "Tool/function calls extracted from provider responses",
                    sources: {
                        id: [
                            "llm.tool_calls.{i}.id"
                        ],
                        name: [
                            "llm.tool_calls.{i}.name"
                        ],
                        arguments: [
                            "llm.tool_calls.{i}.arguments"
                        ]
                    },
                    target: "neatlogs.llm.tool_calls.{i}",
                    indexed: true
                },
                invalid_tool_calls: {
                    description: "Invalid or malformed tool calls",
                    sources: [
                        "llm.invalid_tool_calls"
                    ],
                    target: "neatlogs.llm.invalid_tool_calls"
                },
                tools: {
                    description: "Tool definitions passed to the model",
                    sources: {
                        name: [
                            "llm.tools.{i}.name"
                        ],
                        description: [
                            "llm.tools.{i}.description"
                        ],
                        input_schema: [
                            "llm.tools.{i}.input_schema"
                        ]
                    },
                    target: "neatlogs.llm.tools.{i}",
                    indexed: true
                },
                messages: {
                    mappings: {
                        input_role: {
                            sources: [
                                "llm.input_messages.{i}.message.role",
                                "gen_ai.prompt.{i}.role"
                            ],
                            target: "neatlogs.llm.input_messages.{i}.role",
                            indexed: true
                        },
                        input_content: {
                            sources: [
                                "llm.input_messages.{i}.message.content",
                                "gen_ai.prompt.{i}.content"
                            ],
                            target: "neatlogs.llm.input_messages.{i}.content",
                            indexed: true
                        },
                        input_tool_call_id: {
                            sources: [
                                "llm.input_messages.{i}.tool_call_id",
                                "llm.input_messages.{i}.message.tool_call_id"
                            ],
                            target: "neatlogs.llm.input_messages.{i}.tool_call_id",
                            indexed: true
                        },
                        input_name: {
                            sources: [
                                "llm.input_messages.{i}.name",
                                "llm.input_messages.{i}.message.name"
                            ],
                            target: "neatlogs.llm.input_messages.{i}.name",
                            indexed: true
                        },
                        output_role: {
                            sources: [
                                "llm.output_messages.{i}.message.role",
                                "gen_ai.completion.{i}.role"
                            ],
                            target: "neatlogs.llm.output_messages.{i}.role",
                            indexed: true
                        },
                        output_content: {
                            sources: [
                                "llm.output_messages.{i}.message.content",
                                "gen_ai.completion.{i}.content"
                            ],
                            target: "neatlogs.llm.output_messages.{i}.content",
                            indexed: true
                        },
                        system_prompt: {
                            sources: [
                                "gen_ai.system_instructions"
                            ],
                            target: "neatlogs.llm.system_prompt"
                        }
                    },
                    invocation_parameters: {
                        sources: [
                            "llm.invocation_parameters"
                        ],
                        target: "neatlogs.llm.invocation_parameters"
                    },
                    temperature: {
                        sources: [
                            "gen_ai.request.temperature",
                            "traceloop.association.properties.ls_temperature"
                        ],
                        target: "neatlogs.llm.temperature"
                    },
                    intermediate_steps: {
                        description: "Derived ReAct-style steps extracted by the SDK (JSON array string).",
                        sources: [
                            "llm.intermediate_steps"
                        ],
                        target: "neatlogs.llm.intermediate_steps"
                    },
                    top_p: {
                        sources: [
                            "gen_ai.request.top_p"
                        ],
                        target: "neatlogs.llm.top_p"
                    },
                    top_k: {
                        sources: [
                            "gen_ai.request.top_k",
                            "llm.top_k"
                        ],
                        target: "neatlogs.llm.top_k"
                    },
                    max_tokens: {
                        sources: [
                            "gen_ai.request.max_tokens"
                        ],
                        target: "neatlogs.llm.max_tokens"
                    },
                    frequency_penalty: {
                        sources: [
                            "gen_ai.request.frequency_penalty",
                            "llm.frequency_penalty"
                        ],
                        target: "neatlogs.llm.frequency_penalty"
                    },
                    presence_penalty: {
                        sources: [
                            "gen_ai.request.presence_penalty",
                            "llm.presence_penalty"
                        ],
                        target: "neatlogs.llm.presence_penalty"
                    },
                    stop_sequences: {
                        sources: [
                            "gen_ai.request.stop_sequences",
                            "llm.chat.stop_sequences"
                        ],
                        target: "neatlogs.llm.stop_sequences"
                    },
                    is_streaming: {
                        sources: [
                            "llm.is_streaming"
                        ],
                        target: "neatlogs.llm.is_streaming"
                    },
                    headers: {
                        sources: [
                            "llm.headers"
                        ],
                        target: "neatlogs.llm.headers"
                    },
                    finish_reason: {
                        sources: [
                            "llm.response.finish_reason",
                            "llm.finish_reason",
                            "gen_ai.response.finish_reasons",
                            "gen_ai.completion.0.finish_reason"
                        ],
                        target: "neatlogs.llm.finish_reason"
                    },
                    stop_reason: {
                        sources: [
                            "llm.response.stop_reason",
                            "gen_ai.response.stop_reason"
                        ],
                        target: "neatlogs.llm.stop_reason"
                    },
                    response_id: {
                        sources: [
                            "gen_ai.response.id"
                        ],
                        target: "neatlogs.llm.response_id"
                    },
                    prompt_template: {
                        template: {
                            sources: [
                                "neatlogs.prompt.template",
                                "llm.prompt_template.template",
                                "llm.prompt_template",
                                "traceloop.prompt.template"
                            ],
                            target: "neatlogs.llm.prompt_template"
                        },
                        variables: {
                            sources: [
                                "neatlogs.prompt.template_variables",
                                "llm.prompt_template.variables",
                                "llm.prompt_template_variables",
                                "traceloop.prompt.template_variables"
                            ],
                            target: "neatlogs.llm.prompt_template_variables"
                        },
                        user_template: {
                            sources: [
                                "llm.user_prompt_template",
                                "neatlogs.user_prompt.template"
                            ],
                            target: "neatlogs.llm.user_prompt_template"
                        },
                        user_variables: {
                            sources: [
                                "llm.user_prompt_template_variables",
                                "neatlogs.user_prompt.template_variables"
                            ],
                            target: "neatlogs.llm.user_prompt_template_variables"
                        },
                        version: {
                            sources: [
                                "neatlogs.prompt.version",
                                "llm.prompt_template.version",
                                "traceloop.prompt.version"
                            ],
                            target: "neatlogs.llm.prompt_template.version"
                        },
                        key: {
                            sources: [
                                "traceloop.prompt.key"
                            ],
                            target: "neatlogs.llm.prompt_key"
                        },
                        vendor: {
                            sources: [
                                "prompt.vendor"
                            ],
                            target: "neatlogs.llm.prompt_vendor"
                        },
                        id: {
                            sources: [
                                "prompt.id"
                            ],
                            target: "neatlogs.llm.prompt_id"
                        },
                        url: {
                            sources: [
                                "prompt.url"
                            ],
                            target: "neatlogs.llm.prompt_url"
                        }
                    }
                }
            },
            generic_io: {
                description: "Generic input/output for any span type",
                input: {
                    sources: [
                        "input.value",
                        "traceloop.entity.input"
                    ],
                    target: "neatlogs.{span_kind}.input"
                },
                output: {
                    sources: [
                        "output.value",
                        "traceloop.entity.output"
                    ],
                    target: "neatlogs.{span_kind}.output"
                },
                input_mime_type: {
                    sources: [
                        "input.mime_type"
                    ],
                    target: "neatlogs.{span_kind}.input_mime_type"
                },
                output_mime_type: {
                    sources: [
                        "output.mime_type"
                    ],
                    target: "neatlogs.{span_kind}.output_mime_type"
                }
            },
            span: {
                description: "Span metadata",
                name: {
                    sources: [
                        "traceloop.entity.name"
                    ],
                    target: "neatlogs.span.name"
                },
                path: {
                    sources: [
                        "traceloop.entity.path"
                    ],
                    target: "neatlogs.span.path"
                }
            },
            tool: {
                name: {
                    sources: [
                        "tool.name"
                    ],
                    target: "neatlogs.tool.name"
                },
                description: {
                    sources: [
                        "tool.description",
                        "gen_ai.tool.description"
                    ],
                    target: "neatlogs.tool.description"
                },
                parameters: {
                    sources: [
                        "tool.parameters"
                    ],
                    target: "neatlogs.tool.parameters"
                },
                json_schema: {
                    sources: [
                        "tool.json_schema"
                    ],
                    target: "neatlogs.tool.json_schema"
                },
                id: {
                    sources: [
                        "tool.id",
                        "gen_ai.tool.call.id"
                    ],
                    target: "neatlogs.tool.id"
                },
                call_id: {
                    sources: [
                        "tool.call_id",
                        "tool_call_id"
                    ],
                    target: "neatlogs.tool_call.id"
                }
            },
            agent: {
                description: "Agent attributes",
                name: {
                    sources: [
                        "agent.name"
                    ],
                    target: "neatlogs.agent.name"
                },
                role: {
                    sources: [
                        "agent_role"
                    ],
                    target: "neatlogs.agent.role"
                }
            },
            crewai: {
                description: "CrewAI framework attributes (from OpenInference instrumentation)",
                crew_id: {
                    sources: [
                        "crew_id"
                    ],
                    target: "neatlogs.crewai.crew_id"
                },
                crew_key: {
                    sources: [
                        "crew_key"
                    ],
                    target: "neatlogs.crewai.crew_key"
                },
                crew_number_of_agents: {
                    sources: [
                        "crew_number_of_agents"
                    ],
                    target: "neatlogs.crewai.crew_number_of_agents"
                },
                crew_number_of_tasks: {
                    sources: [
                        "crew_number_of_tasks"
                    ],
                    target: "neatlogs.crewai.crew_number_of_tasks"
                },
                version: {
                    sources: [
                        "crewai_version"
                    ],
                    target: "neatlogs.crewai.version"
                },
                task_id: {
                    sources: [
                        "task_id"
                    ],
                    target: "neatlogs.task.id"
                },
                task_key: {
                    sources: [
                        "task_key"
                    ],
                    target: "neatlogs.task.key"
                }
            },
            retriever: {
                description: "Retrieval/Vector DB attributes",
                documents: {
                    sources: {
                        id: [
                            "retrieval.documents.{i}.document.id",
                            "db.query.result.id"
                        ],
                        content: [
                            "retrieval.documents.{i}.document.content",
                            "db.query.result.document"
                        ],
                        score: [
                            "retrieval.documents.{i}.document.score",
                            "document.score",
                            "db.query.result.score",
                            "db.query.result.distance"
                        ],
                        metadata: [
                            "retrieval.documents.{i}.document.metadata",
                            "db.query.result.metadata"
                        ]
                    },
                    target: "neatlogs.retriever.documents.{i}",
                    indexed: true
                },
                query: {
                    sources: [
                        "retrieval.query",
                        "db.query.text"
                    ],
                    target: "neatlogs.retriever.query"
                },
                top_k: {
                    sources: [
                        "retrieval.top_k",
                        "db.vector.query.top_k"
                    ],
                    target: "neatlogs.retriever.top_k"
                }
            },
            db: {
                description: "Database operations (vector DBs, etc.)",
                system: {
                    sources: [
                        "db.system"
                    ],
                    target: "neatlogs.db.system"
                },
                collection_name: {
                    sources: [
                        "db.collection.name"
                    ],
                    target: "neatlogs.db.collection_name"
                },
                operation: {
                    sources: [
                        "db.operation"
                    ],
                    target: "neatlogs.db.operation"
                },
                documents_count: {
                    sources: [
                        "db.chroma.add.documents_count",
                        "db.pinecone.add.documents_count"
                    ],
                    target: "neatlogs.db.documents_count"
                },
                ids_count: {
                    sources: [
                        "db.chroma.add.ids_count",
                        "db.pinecone.add.ids_count"
                    ],
                    target: "neatlogs.db.ids_count"
                },
                metadatas_count: {
                    sources: [
                        "db.chroma.add.metadatas_count",
                        "db.pinecone.add.metadatas_count"
                    ],
                    target: "neatlogs.db.metadatas_count"
                }
            },
            vectordb: {
                description: "Vector Database specific attributes (Marqo, Qdrant, Milvus, etc.)",
                index_name: {
                    sources: [
                        "vector_db_index_name",
                        "marqo.index_name",
                        "qdrant.upsert.collection_name",
                        "qdrant.search.collection_name",
                        "db.milvus.create_collection.collection_name",
                        "db.milvus.search.collection_name",
                        "db.milvus.insert.collection_name",
                        "db.chroma.collection.name"
                    ],
                    target: "neatlogs.vectordb.index_name"
                },
                embedding_model: {
                    sources: [
                        "embedding_model",
                        "marqo.model",
                        "embedding.model_name"
                    ],
                    target: "neatlogs.vectordb.embedding_model"
                },
                retrieval_query: {
                    sources: [
                        "retrieval_query",
                        "db.marqo.search.query"
                    ],
                    target: "neatlogs.vectordb.retrieval_query"
                },
                retrieval_time_taken: {
                    sources: [
                        "retrieval_time_taken",
                        "db.marqo.search.processing_time"
                    ],
                    target: "neatlogs.vectordb.retrieval_time_taken"
                },
                vector_dimension: {
                    sources: [
                        "vector_dimension",
                        "db.milvus.create_collection.dimension",
                        "db.milvus.search.query_vector_dimension"
                    ],
                    target: "neatlogs.vectordb.vector_dimension"
                },
                similarity_algorithm: {
                    sources: [
                        "vector_similarity_algorithm",
                        "db.milvus.create_collection.metric_type"
                    ],
                    target: "neatlogs.vectordb.similarity_algorithm"
                },
                document_attributes: {
                    sources: [
                        "document_attributes"
                    ],
                    target: "neatlogs.vectordb.document_attributes",
                    description: "Computed JSON field from SDK"
                },
                retrieval_input_params: {
                    sources: [
                        "retrieval_input_params"
                    ],
                    target: "neatlogs.vectordb.retrieval_input_params",
                    description: "Computed JSON field from SDK (Marqo limit, hits_count, filter)"
                },
                retrieval_documents: {
                    sources: [
                        "retrieval_documents"
                    ],
                    target: "neatlogs.vectordb.retrieval_documents",
                    description: "Computed JSON array from SDK events"
                }
            },
            reranker: {
                description: "Reranker model attributes",
                applies_to: [
                    "reranker"
                ],
                model_name: {
                    sources: [
                        "reranker.model_name",
                        "ai.model.id"
                    ],
                    target: "neatlogs.reranker.model_name"
                },
                provider: {
                    sources: [
                        "ai.model.provider"
                    ],
                    target: "neatlogs.reranker.provider",
                    description: "Vercel AI SDK reranker provider (e.g. gateway, cohere)"
                },
                query: {
                    sources: [
                        "reranker.query",
                        "ai.rerank.query"
                    ],
                    target: "neatlogs.reranker.query"
                },
                documents: {
                    sources: [
                        "ai.documents"
                    ],
                    target: "neatlogs.reranker.input_documents",
                    description: "Vercel AI SDK rerank input documents array"
                },
                ranking: {
                    sources: [
                        "ai.ranking"
                    ],
                    target: "neatlogs.reranker.output_documents",
                    description: "Vercel AI SDK rerank output ranking array"
                },
                ranking_type: {
                    sources: [
                        "ai.ranking.type"
                    ],
                    target: "neatlogs.reranker.ranking_type",
                    description: "Vercel AI SDK rerank type (e.g. text)"
                },
                top_k: {
                    sources: [
                        "reranker.top_k"
                    ],
                    target: "neatlogs.reranker.top_k"
                },
                max_retries: {
                    sources: [
                        "ai.settings.maxRetries"
                    ],
                    target: "neatlogs.reranker.max_retries",
                    description: "Vercel AI SDK max retries setting"
                },
                input_documents: {
                    sources: {
                        id: [
                            "reranker.input_documents.{i}.document.id"
                        ],
                        content: [
                            "reranker.input_documents.{i}.document.content"
                        ],
                        metadata: [
                            "reranker.input_documents.{i}.document.metadata"
                        ]
                    },
                    target: "neatlogs.reranker.input_documents.{i}",
                    indexed: true
                },
                output_documents: {
                    sources: {
                        id: [
                            "reranker.output_documents.{i}.document.id"
                        ],
                        content: [
                            "reranker.output_documents.{i}.document.content"
                        ],
                        score: [
                            "reranker.output_documents.{i}.document.score",
                            "reranker.output_documents.{i}.relevance_score"
                        ],
                        metadata: [
                            "reranker.output_documents.{i}.document.metadata"
                        ]
                    },
                    target: "neatlogs.reranker.output_documents.{i}",
                    indexed: true
                }
            },
            embedding: {
                description: "Embedding model attributes",
                applies_to: [
                    "embedding"
                ],
                input: {
                    sources: [
                        "ai.value",
                        "ai.values"
                    ],
                    target: "neatlogs.embedding.input",
                    description: "Vercel AI SDK embed/embedMany input value(s)"
                },
                model_name: {
                    sources: [
                        "embedding.model_name",
                        "ai.model.id"
                    ],
                    target: "neatlogs.embedding.model_name"
                },
                text: {
                    sources: [
                        "embedding.text"
                    ],
                    target: "neatlogs.embedding.text"
                },
                vector: {
                    sources: [
                        "embedding.vector"
                    ],
                    target: "neatlogs.embedding.vector"
                },
                token_count: {
                    sources: [
                        "embedding.token_count",
                        "ai.usage.tokens"
                    ],
                    target: "neatlogs.embedding.token_count"
                },
                invocation_parameters: {
                    sources: [
                        "embedding.invocation_parameters"
                    ],
                    target: "neatlogs.embedding.invocation_parameters"
                },
                embeddings_data: {
                    sources: [
                        "embeddings_data"
                    ],
                    target: "neatlogs.embedding.embeddings_data",
                    description: "Computed JSON array from SDK (embedding.embeddings.*.embedding.text)"
                }
            },
            session: {
                description: "Session tracking",
                id: {
                    sources: [
                        "session.id"
                    ],
                    target: "neatlogs.session.id"
                }
            },
            user: {
                description: "User tracking",
                id: {
                    sources: [
                        "user.id"
                    ],
                    target: "neatlogs.user.id"
                }
            },
            workflow: {
                description: "Workflow/Chain metadata",
                name: {
                    sources: [
                        "traceloop.workflow.name"
                    ],
                    target: "neatlogs.workflow.name"
                }
            },
            entity: {
                description: "LangChain entity metadata (from OpenLLMetry/Traceloop)",
                name: {
                    sources: [
                        "traceloop.entity.name"
                    ],
                    target: "neatlogs.entity.name"
                },
                path: {
                    sources: [
                        "traceloop.entity.path"
                    ],
                    target: "neatlogs.entity.path"
                }
            },
            langgraph: {
                description: "LangGraph execution metadata (from OpenLLMetry/Traceloop association properties)",
                step: {
                    sources: [
                        "traceloop.association.properties.langgraph_step"
                    ],
                    target: "neatlogs.langgraph.step"
                },
                node: {
                    sources: [
                        "traceloop.association.properties.langgraph_node"
                    ],
                    target: "neatlogs.langgraph.node"
                },
                triggers: {
                    sources: [
                        "traceloop.association.properties.langgraph_triggers"
                    ],
                    target: "neatlogs.langgraph.triggers"
                },
                path: {
                    sources: [
                        "traceloop.association.properties.langgraph_path"
                    ],
                    target: "neatlogs.langgraph.path"
                },
                checkpoint_ns: {
                    sources: [
                        "traceloop.association.properties.langgraph_checkpoint_ns",
                        "traceloop.association.properties.checkpoint_ns"
                    ],
                    target: "neatlogs.langgraph.checkpoint_ns"
                },
                task_id: {
                    sources: [
                        "traceloop.association.properties.langgraph_task_id"
                    ],
                    target: "neatlogs.langgraph.task_id"
                },
                thread_id: {
                    sources: [
                        "traceloop.association.properties.thread_id"
                    ],
                    target: "neatlogs.langgraph.thread_id"
                }
            },
            mcp: {
                description: "Model Context Protocol (MCP) attributes",
                method: {
                    sources: [
                        "mcp.method.name",
                        "mcp.method"
                    ],
                    target: "neatlogs.mcp.method"
                },
                request_id: {
                    sources: [
                        "mcp.request.id"
                    ],
                    target: "neatlogs.mcp.request_id"
                },
                request_argument: {
                    sources: [
                        "mcp.request.argument"
                    ],
                    target: "neatlogs.mcp.request_argument"
                },
                response_value: {
                    sources: [
                        "mcp.response.value"
                    ],
                    target: "neatlogs.mcp.response_value"
                },
                session_init_options: {
                    sources: [
                        "mcp.session.init_options"
                    ],
                    target: "neatlogs.mcp.session_init_options"
                },
                protocol_version: {
                    sources: [
                        "mcp.protocol_version"
                    ],
                    target: "neatlogs.mcp.protocol_version"
                },
                server: {
                    name: {
                        sources: [
                            "mcp.server.name"
                        ],
                        target: "neatlogs.mcp.server.name"
                    },
                    version: {
                        sources: [
                            "mcp.server.version"
                        ],
                        target: "neatlogs.mcp.server.version"
                    },
                    capabilities: {
                        sources: [
                            "mcp.server.capabilities"
                        ],
                        target: "neatlogs.mcp.server.capabilities"
                    }
                },
                tool: {
                    name: {
                        sources: [
                            "mcp.tool.name"
                        ],
                        target: "neatlogs.mcp.tool.name"
                    },
                    arguments: {
                        sources: [
                            "mcp.tool.arguments"
                        ],
                        target: "neatlogs.mcp.tool.arguments"
                    }
                },
                tools: {
                    count: {
                        sources: [
                            "mcp.tools.count"
                        ],
                        target: "neatlogs.mcp.tools.count"
                    },
                    names: {
                        sources: [
                            "mcp.tools.names"
                        ],
                        target: "neatlogs.mcp.tools.names"
                    }
                }
            },
            framework: {
                description: "Framework-specific attributes",
                langsmith: {
                    model_name: {
                        sources: [
                            "traceloop.association.properties.ls_model_name"
                        ],
                        target: "neatlogs.framework.langsmith.model_name"
                    },
                    model_type: {
                        sources: [
                            "traceloop.association.properties.ls_model_type"
                        ],
                        target: "neatlogs.framework.langsmith.model_type"
                    },
                    provider: {
                        sources: [
                            "traceloop.association.properties.ls_provider"
                        ],
                        target: "neatlogs.framework.langsmith.provider"
                    },
                    temperature: {
                        sources: [
                            "traceloop.association.properties.ls_temperature"
                        ],
                        target: "neatlogs.framework.langsmith.temperature"
                    }
                }
            },
            graph: {
                description: "Execution Graph / Chain attributes",
                node: {
                    name: {
                        sources: [
                            "graph.node.name",
                            "traceloop.association.properties.langgraph_node"
                        ],
                        target: "neatlogs.graph.node.name"
                    },
                    id: {
                        sources: [
                            "graph.node.id"
                        ],
                        target: "neatlogs.graph.node.id"
                    },
                    parent_id: {
                        sources: [
                            "graph.node.parent_id"
                        ],
                        target: "neatlogs.graph.node.parent_id"
                    }
                }
            },
            metadata: {
                description: "Custom metadata",
                sources: [
                    "metadata"
                ],
                target: "neatlogs.metadata"
            },
            tags: {
                description: "Tags array",
                sources: [
                    "tag.tags"
                ],
                target: "neatlogs.tags"
            },
            metrics: {
                description: "Performance metrics from OpenLLMetry/OpenLit",
                llm: {
                    time_to_first_token: {
                        sources: [
                            "neatlogs.llm.metrics.time_to_first_token",
                            "gen_ai.server.time_to_first_token",
                            "llm.time_to_first_token"
                        ],
                        target: "neatlogs.llm.metrics.time_to_first_token"
                    },
                    streaming_time_to_generate: {
                        sources: [
                            "neatlogs.llm.metrics.streaming_time_to_generate",
                            "llm.chat_completions.streaming_time_to_generate"
                        ],
                        target: "neatlogs.llm.metrics.streaming_time_to_generate"
                    },
                    time_per_output_token: {
                        sources: [
                            "neatlogs.llm.metrics.time_per_output_token",
                            "gen_ai.server.time_per_output_token"
                        ],
                        target: "neatlogs.llm.metrics.time_per_output_token"
                    }
                }
            }
        },
        keep_as_is: {
            description: "OpenTelemetry standard attributes to keep unchanged",
            attributes: [
                "neatlogs.internal",
                "http.method",
                "http.request.method",
                "http.url",
                "url.full",
                "url.path",
                "http.status_code",
                "http.response.status_code",
                "http.request.body.size",
                "http.response.body.size",
                "service.name",
                "service.version",
                "telemetry.sdk.name",
                "telemetry.sdk.version",
                "telemetry.sdk.language"
            ]
        },
        ignore: {
            description: "Attributes to ignore/drop during ingestion",
            patterns: [
                "telemetry.distro.*",
                "code.*",
                "exception.*"
            ]
        }
    }
};
// src/config/attribute-mapper.ts
var logger7 = getLogger();
function flattenSources(sources) {
    if (!sources) return [];
    if (Array.isArray(sources)) return sources;
    const result = [];
    for (const arr of Object.values(sources)){
        if (Array.isArray(arr)) {
            result.push(...arr);
        }
    }
    return result;
}
var AttributeMapper = class {
    config;
    mappings;
    keepAsIs;
    ignorePatterns;
    compiledIgnorePatterns;
    _regexCache = /* @__PURE__ */ new Map();
    constructor(config){
        this.config = config ?? attribute_mapping_default;
        this.mappings = this.config.mappings ?? {};
        const keepAsIsAttrs = this.config.keep_as_is?.attributes ?? this.mappings.keep_as_is?.attributes ?? [];
        this.keepAsIs = new Set(keepAsIsAttrs);
        this.ignorePatterns = this.config.ignore?.patterns ?? this.mappings.ignore?.patterns ?? [];
        this.compiledIgnorePatterns = this.ignorePatterns.map((pattern)=>new RegExp("^" + pattern.replace(/\*/g, ".*") + "$"));
    }
    /** Check if an attribute should be ignored. */ shouldIgnore(attrName) {
        for (const regex of this.compiledIgnorePatterns){
            if (regex.test(attrName)) {
                return true;
            }
        }
        return false;
    }
    /** Check if an attribute should be kept unchanged (OTel standard). */ shouldKeepAsIs(attrName) {
        return this.keepAsIs.has(attrName);
    }
    /** Extract and normalize span kind from multiple possible sources. */ mapSpanKind(attributes) {
        const spanKindConfig = this.mappings.span_kind ?? {};
        const sources = spanKindConfig.sources ?? [];
        const valuesMap = spanKindConfig.values ?? {};
        const priority = spanKindConfig.priority ?? "openinference";
        let spanKindValue;
        if (priority === "openinference") {
            if ("openinference.span.kind" in attributes) {
                spanKindValue = attributes["openinference.span.kind"];
            }
        } else {
            for (const source of sources){
                if (source in attributes) {
                    spanKindValue = attributes[source];
                    break;
                }
            }
        }
        if (spanKindValue && spanKindValue in valuesMap) {
            return valuesMap[spanKindValue];
        }
        const isLlmSpan = [
            "llm.model_name",
            "gen_ai.request.model",
            "llm.token_count.prompt",
            "llm.token_count.completion",
            "gen_ai.usage.prompt_tokens",
            "gen_ai.usage.completion_tokens"
        ].some((key)=>key in attributes);
        if (isLlmSpan) {
            return "llm";
        }
        return "unknown";
    }
    /** Map a simple attribute from multiple sources to target. */ mapSimpleAttribute(mappingConfig, attributes) {
        const sources = flattenSources(mappingConfig.sources);
        for (const source of sources){
            if (source in attributes) {
                return attributes[source];
            }
        }
        return void 0;
    }
    /** Get or create a cached RegExp for a source pattern. */ _getPatternRegex(sourcePattern) {
        let cached = this._regexCache.get(sourcePattern);
        if (!cached) {
            let regexPattern = sourcePattern.replace(/\{i\}/g, "(\\d+)");
            regexPattern = regexPattern.replace(/\./g, "\\.");
            cached = new RegExp("^" + regexPattern + "$");
            this._regexCache.set(sourcePattern, cached);
        }
        return cached;
    }
    /** Map indexed attributes like messages (llm.input_messages.0.role). */ mapIndexedAttributes(mappingConfig, attributes, targetBase) {
        const mapped = {};
        const rawSources = mappingConfig.sources;
        if (Array.isArray(rawSources)) {
            for (const [attrName, attrValue] of Object.entries(attributes)){
                for (const sourcePattern of rawSources){
                    const match = attrName.match(this._getPatternRegex(sourcePattern));
                    if (match) {
                        const index = match[1];
                        const target = targetBase.replace(/\{i\}/g, index);
                        mapped[target] = attrValue;
                    }
                }
            }
        } else if (rawSources && typeof rawSources === "object") {
            for (const [field, sourcePatterns] of Object.entries(rawSources)){
                if (!Array.isArray(sourcePatterns)) continue;
                for (const [attrName, attrValue] of Object.entries(attributes)){
                    for (const sourcePattern of sourcePatterns){
                        const match = attrName.match(this._getPatternRegex(sourcePattern));
                        if (match) {
                            const index = match[1];
                            const target = targetBase.replace(/\{i\}/g, index) + "." + field;
                            mapped[target] = attrValue;
                        }
                    }
                }
            }
        }
        return mapped;
    }
    /** Recursively map nested configuration. */ mapNestedConfig(config, attributes, spanKind) {
        const mapped = {};
        for (const [key, value] of Object.entries(config)){
            if ([
                "description",
                "sources",
                "target",
                "indexed",
                "priority",
                "values",
                "applies_to"
            ].includes(key)) {
                continue;
            }
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                if (Array.isArray(value.applies_to) && spanKind && !value.applies_to.includes(spanKind)) {
                    continue;
                }
                if ("sources" in value) {
                    if (value.indexed) {
                        const target = value.target ?? "";
                        const indexedMapped = this.mapIndexedAttributes(value, attributes, target);
                        Object.assign(mapped, indexedMapped);
                        if ("target_content" in value) {
                            const contentTarget = value.target_content;
                            const contentMapped = this.mapIndexedAttributes(value, attributes, contentTarget);
                            Object.assign(mapped, contentMapped);
                        }
                    } else {
                        let target = value.target ?? "";
                        if (spanKind && target.includes("{span_kind}")) {
                            target = target.replace(/\{span_kind\}/g, spanKind);
                        }
                        const result = this.mapSimpleAttribute(value, attributes);
                        if (result !== void 0) {
                            mapped[target] = result;
                        }
                    }
                } else {
                    const nestedMapped = this.mapNestedConfig(value, attributes, spanKind);
                    Object.assign(mapped, nestedMapped);
                }
            }
        }
        return mapped;
    }
    /** Map all attributes from vendor-specific to neatlogs namespace. */ mapAttributes(attributes, spanKind) {
        const mapped = {};
        if (!spanKind) {
            spanKind = this.mapSpanKind(attributes);
        }
        mapped["neatlogs.span.kind"] = spanKind;
        for (const [sectionName, sectionConfig] of Object.entries(this.mappings)){
            if (sectionName === "span_kind" || sectionName === "keep_as_is" || sectionName === "ignore") continue;
            if (typeof sectionConfig === "object" && sectionConfig !== null) {
                if (Array.isArray(sectionConfig.applies_to) && spanKind && !sectionConfig.applies_to.includes(spanKind)) {
                    continue;
                }
                if ("mappings" in sectionConfig) {
                    const nestedMapped = this.mapNestedConfig(sectionConfig.mappings, attributes, spanKind);
                    Object.assign(mapped, nestedMapped);
                    for (const [subKey, subVal] of Object.entries(sectionConfig)){
                        if (subKey === "mappings" || subKey === "description" || subKey === "applies_to") continue;
                        if (typeof subVal === "object" && subVal !== null && !Array.isArray(subVal)) {
                            if (Array.isArray(subVal.applies_to) && spanKind && !subVal.applies_to.includes(spanKind)) {
                                continue;
                            }
                            if ("sources" in subVal) {
                                if (subVal.indexed) {
                                    const target = subVal.target ?? "";
                                    const indexedMapped = this.mapIndexedAttributes(subVal, attributes, target);
                                    Object.assign(mapped, indexedMapped);
                                } else if (Array.isArray(subVal.sources)) {
                                    let target = subVal.target ?? "";
                                    if (spanKind && target.includes("{span_kind}")) {
                                        target = target.replace(/\{span_kind\}/g, spanKind);
                                    }
                                    const result2 = this.mapSimpleAttribute(subVal, attributes);
                                    if (result2 !== void 0) {
                                        mapped[target] = result2;
                                    }
                                }
                            } else {
                                const subMapped = this.mapNestedConfig(subVal, attributes, spanKind);
                                Object.assign(mapped, subMapped);
                            }
                        }
                    }
                } else if ("sources" in sectionConfig) {
                    let target = sectionConfig.target ?? "";
                    if (target.includes("{span_kind}")) {
                        target = target.replace(/\{span_kind\}/g, spanKind);
                    }
                    const result2 = this.mapSimpleAttribute(sectionConfig, attributes);
                    if (result2 !== void 0) {
                        mapped[target] = result2;
                    }
                } else {
                    const nestedMapped = this.mapNestedConfig(sectionConfig, attributes, spanKind);
                    Object.assign(mapped, nestedMapped);
                }
            }
        }
        for (const [attrName, attrValue] of Object.entries(attributes)){
            if (this.shouldKeepAsIs(attrName) && !(attrName in mapped)) {
                mapped[attrName] = attrValue;
            }
        }
        const mappedSources = /* @__PURE__ */ new Set();
        for (const sectionConfig of Object.values(this.mappings)){
            if (typeof sectionConfig === "object" && sectionConfig !== null) {
                if ("sources" in sectionConfig) {
                    for (const s of flattenSources(sectionConfig.sources)){
                        mappedSources.add(s);
                    }
                }
                if ("mappings" in sectionConfig) {
                    this._collectMappedSources(sectionConfig.mappings, mappedSources);
                }
                for (const [subKey, subVal] of Object.entries(sectionConfig)){
                    if (subKey === "mappings" || subKey === "description" || subKey === "sources") continue;
                    if (typeof subVal === "object" && subVal !== null && !Array.isArray(subVal)) {
                        this._collectMappedSources(subVal, mappedSources);
                    }
                }
            }
        }
        for (const [attrName, attrValue] of Object.entries(attributes)){
            if (!mappedSources.has(attrName) && !(attrName in mapped) && !this.shouldIgnore(attrName)) {
                mapped[attrName] = attrValue;
            }
        }
        const result = {};
        for (const [k, v] of Object.entries(mapped)){
            if (!this.shouldIgnore(k)) {
                result[k] = v;
            }
        }
        return result;
    }
    /** Recursively collect all source attribute names from nested config. */ _collectMappedSources(config, collected) {
        for (const value of Object.values(config)){
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                if ("sources" in value) {
                    for (const s of flattenSources(value.sources)){
                        collected.add(s);
                    }
                } else {
                    this._collectMappedSources(value, collected);
                }
            }
        }
    }
    /** Get the span kind value mapping. */ getSpanKindValueMapping() {
        return this.mappings.span_kind?.values ?? {};
    }
    /** Get the target neatlogs attribute name for a source attribute. */ getTargetAttributeName(sourceAttr, spanKind) {
        const searchConfig = (config, targetSpanKind)=>{
            for (const value of Object.values(config)){
                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                    if ("sources" in value) {
                        const sources = flattenSources(value.sources);
                        if (sources.includes(sourceAttr)) {
                            let target = value.target ?? "";
                            if (targetSpanKind && target.includes("{span_kind}")) {
                                target = target.replace(/\{span_kind\}/g, targetSpanKind);
                            }
                            return target;
                        }
                    }
                    const result = searchConfig(value, targetSpanKind);
                    if (result) return result;
                }
            }
            return void 0;
        };
        return searchConfig(this.mappings, spanKind);
    }
};
// src/core/span-processor.ts
var logger8 = getLogger();
function resolveLogFilePath(configuredPath) {
    return __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["isAbsolute"](configuredPath) ? configuredPath : __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["join"](process.cwd(), configuredPath);
}
function createLogStream(configuredPath) {
    const logPath = resolveLogFilePath(configuredPath);
    let fd = null;
    try {
        __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["mkdirSync"](__TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["dirname"](logPath), {
            recursive: true
        });
        fd = __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["openSync"](logPath, "a");
        const stream = __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["createWriteStream"](logPath, {
            fd,
            autoClose: true
        });
        fd = null;
        stream.on("error", (error)=>{
            logger8.warn(`Failed to write span log file ${logPath}: ${error}`);
            stream.destroy();
        });
        return stream;
    } catch (error) {
        if (fd !== null) {
            try {
                __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["closeSync"](fd);
            } catch  {}
        }
        logger8.warn(`Failed to open span log file ${logPath}: ${error}`);
        return null;
    }
}
var CLOSE_STREAM_TIMEOUT_MS = 5e3;
async function closeLogStream(stream, description) {
    if (!stream || stream.destroyed || stream.writableEnded) {
        return;
    }
    await new Promise((resolve2)=>{
        let settled = false;
        const settle = ()=>{
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            stream.off("close", closeHandler);
            stream.off("error", errorHandler);
            resolve2();
        };
        const closeHandler = settle;
        const errorHandler = (error)=>{
            logger8.warn(`Failed to close ${description} log file handle: ${error}`);
            settle();
        };
        const timer = setTimeout(()=>{
            logger8.warn(`Timed out waiting for ${description} log stream to close; destroying`);
            stream.destroy();
            settle();
        }, CLOSE_STREAM_TIMEOUT_MS);
        stream.once("close", closeHandler);
        stream.once("error", errorHandler);
        try {
            stream.end();
        } catch (error) {
            logger8.warn(`Failed to close ${description} log file handle: ${error}`);
            settle();
        }
    });
}
var LLM_NAME_PATTERNS = /chat|completion|generate|embedding/i;
function hrTimeToNanos(hr) {
    return hr[0] * 1e9 + hr[1];
}
function spanToDict(span2, options) {
    const ctx = span2.spanContext();
    const includeScope = options?.includeScope ?? false;
    const dict = {
        trace_id: ctx.traceId,
        span_id: ctx.spanId,
        parent_span_id: span2.parentSpanId ?? null,
        name: span2.name,
        kind: span2.kind,
        start_time: hrTimeToNanos(span2.startTime),
        end_time: hrTimeToNanos(span2.endTime),
        attributes: {
            ...span2.attributes
        },
        resource: span2.resource?.attributes ? {
            ...span2.resource.attributes
        } : {},
        status: includeScope ? {
            code: span2.status.code,
            message: span2.status.message ?? void 0
        } : {
            code: span2.status.code,
            description: span2.status.message ?? null
        },
        events: span2.events ? span2.events.map((e)=>({
                name: e.name,
                timestamp: hrTimeToNanos(e.time),
                attributes: e.attributes ? {
                    ...e.attributes
                } : {}
            })) : []
    };
    if (includeScope) {
        dict.instrumentation_scope = span2.instrumentationLibrary ? {
            name: span2.instrumentationLibrary.name,
            version: span2.instrumentationLibrary.version
        } : null;
    }
    return dict;
}
var NeatlogsSpanProcessor = class {
    sampleRate;
    debug;
    mask;
    unifiedProcessor;
    perfStats;
    _retrieversToSuppress;
    // File logging
    _logRawSpansEnabled;
    _logProcessedSpansEnabled;
    _rawLogStream;
    _processedLogStream;
    constructor(opts = {}){
        this.sampleRate = opts.sampleRate ?? 1;
        this.debug = opts.debug ?? false;
        this.mask = opts.mask;
        this.unifiedProcessor = new UnifiedAttributeProcessor(opts.mapper ?? new AttributeMapper(), this.debug);
        this._logRawSpansEnabled = false;
        this._logProcessedSpansEnabled = false;
        this._rawLogStream = null;
        this._processedLogStream = null;
        this._initFileLogging();
        this.perfStats = {
            onStartTime: 0,
            onEndTime: 0,
            spansProcessed: 0,
            spansExported: 0
        };
        this._retrieversToSuppress = /* @__PURE__ */ new Set();
    }
    // ── File logging init ─────────────────────────────────
    _initFileLogging() {
        this._logRawSpansEnabled = this.debug || [
            "true",
            "1",
            "yes"
        ].includes((process.env.NEATLOGS_LOG_RAW_SPANS ?? "").toLowerCase());
        if (this._logRawSpansEnabled) {
            const rawPath = process.env.NEATLOGS_LOG_RAW_SPANS_FILE ?? "spans_raw_optimized.log";
            this._rawLogStream = createLogStream(rawPath);
            if (this._rawLogStream) {
                logger8.info(`Raw span logging enabled: ${resolveLogFilePath(rawPath)}`);
            }
        }
        this._logProcessedSpansEnabled = [
            "true",
            "1",
            "yes"
        ].includes((process.env.NEATLOGS_LOG_SPANS ?? "").toLowerCase());
        if (this._logProcessedSpansEnabled) {
            const processedPath = process.env.NEATLOGS_LOG_SPANS_FILE ?? "spans_optimized.log";
            this._processedLogStream = createLogStream(processedPath);
            if (this._processedLogStream) {
                logger8.info(`Processed span logging enabled: ${resolveLogFilePath(processedPath)}`);
            }
        }
    }
    // ── SpanProcessor.onStart ─────────────────────────────
    onStart(span2, parentContext) {
        const startTime = __TURBOPACK__imported__module__$5b$externals$5d2f$perf_hooks__$5b$external$5d$__$28$perf_hooks$2c$__cjs$29$__["performance"].now();
        try {
            const attrs = span2.attributes ?? {};
            const spanKind = attrs["openinference.span.kind"];
            const spanName = typeof span2.name === "string" ? span2.name : "";
            const isLlmSpan = spanKind === "LLM" || LLM_NAME_PATTERNS.test(spanName);
            if (!isLlmSpan) return;
            const ctx = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active();
            let variablesJson = ctx.getValue(PROMPT_VARIABLES_KEY);
            let template = ctx.getValue(PROMPT_TEMPLATE_KEY);
            const versionVal = ctx.getValue(PROMPT_VERSION_KEY);
            let userTemplate = ctx.getValue(USER_PROMPT_TEMPLATE_KEY);
            let userVariablesJson = ctx.getValue(USER_PROMPT_VARIABLES_KEY);
            if (!variablesJson) {
                const captured = PromptContext.getVariables();
                if (captured) {
                    variablesJson = JSON.stringify(captured);
                }
            }
            if (!template) {
                const captured = PromptContext.getTemplate();
                if (captured) {
                    template = captured;
                }
            }
            if (!userTemplate) {
                const captured = UserPromptContext.getTemplate();
                if (captured) {
                    userTemplate = captured;
                }
            }
            if (!userVariablesJson) {
                const captured = UserPromptContext.getVariables();
                if (captured) {
                    userVariablesJson = JSON.stringify(captured);
                }
            }
            if (this.debug) {
                logger8.debug(`[SpanProcessor.onStart] LLM span '${spanName}' starting`);
                logger8.debug(`  variables_json from context: ${variablesJson}`);
                logger8.debug(`  template from context: ${template}`);
                logger8.debug(`  version from context: ${versionVal}`);
                logger8.debug(`  user_template from context: ${userTemplate}`);
                logger8.debug(`  user_variables_json from context: ${userVariablesJson}`);
            }
            if (variablesJson) {
                span2.setAttribute("llm.prompt_template_variables", variablesJson);
            }
            if (template) {
                span2.setAttribute("llm.prompt_template", template);
            }
            if (versionVal) {
                span2.setAttribute("llm.prompt_template.version", versionVal);
            }
            if (userTemplate) {
                span2.setAttribute("llm.user_prompt_template", userTemplate);
            }
            if (userVariablesJson) {
                span2.setAttribute("llm.user_prompt_template_variables", userVariablesJson);
            }
        } finally{
            this.perfStats.onStartTime += __TURBOPACK__imported__module__$5b$externals$5d2f$perf_hooks__$5b$external$5d$__$28$perf_hooks$2c$__cjs$29$__["performance"].now() - startTime;
        }
    }
    // ── SpanProcessor.onEnd ───────────────────────────────
    onEnd(span2) {
        if (span2.name === "neatlogs.trace.complete") {
            return;
        }
        const startTime = __TURBOPACK__imported__module__$5b$externals$5d2f$perf_hooks__$5b$external$5d$__$28$perf_hooks$2c$__cjs$29$__["performance"].now();
        this.perfStats.spansProcessed += 1;
        try {
            if (this.debug) {
                logger8.debug(`[SpanProcessor.onEnd] Span ending: ${span2.name}`);
            }
            if (this._rawLogStream && !this._rawLogStream.destroyed) {
                try {
                    this._rawLogStream.write(JSON.stringify(spanToDict(span2)) + "\n");
                } catch (e) {
                    logger8.warn(`Failed to write span to raw log file: ${e}`);
                }
            }
            if (this.sampleRate < 1 && Math.random() > this.sampleRate) {
                return;
            }
            const spanDict = spanToDict(span2, {
                includeScope: true
            });
            const unifiedAttrs = this.unifiedProcessor.normalize(spanDict);
            let nlKind = unifiedAttrs["neatlogs.span.kind"];
            if (nlKind === "embedding" || nlKind === "vector_store") {
                const skipOutput = unifiedAttrs["neatlogs._skip_output_value"] === true;
                const keysToRemove = [];
                for (const key of Object.keys(unifiedAttrs)){
                    if (key.includes("input_messages") || key.includes("output_messages") || key.includes("gen_ai.prompt") || key.includes("gen_ai.completion") || key.includes(".content")) {
                        keysToRemove.push(key);
                    } else if (key === "neatlogs.embedding.output" || skipOutput && key === "neatlogs.embedding.input") {
                        keysToRemove.push(key);
                    }
                }
                for (const key of keysToRemove){
                    delete unifiedAttrs[key];
                }
                if (this.debug && keysToRemove.length > 0) {
                    logger8.debug(`[EMBEDDING Filter] Removed ${keysToRemove.length} large attribute keys from ${nlKind} span (skip_output=${skipOutput})`);
                }
            }
            nlKind = unifiedAttrs["neatlogs.span.kind"];
            if (nlKind !== "llm" && nlKind !== "embedding" && nlKind !== "crewai_task" && span2.name !== "PromptTemplate") {
                delete unifiedAttrs["neatlogs.llm.prompt_template"];
                delete unifiedAttrs["neatlogs.llm.prompt_template_variables"];
                delete unifiedAttrs["neatlogs.llm.prompt_template.version"];
            }
            if (span2.name === "PromptTemplate") {
                if (unifiedAttrs["neatlogs.internal"] === void 0) {
                    unifiedAttrs["neatlogs.internal"] = true;
                }
                unifiedAttrs["neatlogs.span.kind"] = "Neatlogs.INTERNAL";
            }
            if (nlKind === "retriever") {
                const isInternal = unifiedAttrs["neatlogs.internal"] === true;
                if (isInternal && span2.parentSpanId) {
                    this._retrieversToSuppress.add(span2.parentSpanId);
                }
                const spanId2 = span2.spanContext().spanId;
                if (this._retrieversToSuppress.has(spanId2)) {
                    this._retrieversToSuppress.delete(spanId2);
                    unifiedAttrs["neatlogs.internal"] = true;
                    if (this.debug) {
                        logger8.debug(`[Retriever Merge] Marked OI retriever '${span2.name}' as internal (had neatlogs retriever child)`);
                    }
                }
            }
            const resourceAttrs = {};
            if (span2.resource?.attributes) {
                for (const [key, value] of Object.entries(span2.resource.attributes)){
                    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                        resourceAttrs[key] = value;
                    } else if (Array.isArray(value)) {
                        resourceAttrs[key] = [
                            ...value
                        ];
                    } else {
                        resourceAttrs[key] = String(value);
                    }
                }
                if (this.debug && "neatlogs.tags" in resourceAttrs) {
                    logger8.debug(`[Tags] Span ${span2.name}: resource.neatlogs.tags = ${resourceAttrs["neatlogs.tags"]}`);
                }
            }
            const traceId = span2.spanContext().traceId;
            const spanId = span2.spanContext().spanId;
            let parentSpanId = span2.parentSpanId ?? null;
            if (parentSpanId === spanId) {
                if (this.debug) {
                    logger8.warn(`[SpanProcessor] Detected self-parenting span. trace_id=${traceId} span_id=${spanId} name=${span2.name}. Setting parent_span_id=None.`);
                }
                parentSpanId = null;
            }
            const kindValue = unifiedAttrs["neatlogs.span.kind"] ?? "UNKNOWN";
            const startTimeNs = hrTimeToNanos(span2.startTime);
            const endTimeNs = hrTimeToNanos(span2.endTime);
            let spanData = {
                trace_id: traceId,
                span_id: spanId,
                parent_span_id: parentSpanId,
                name: span2.name,
                kind: kindValue || "UNKNOWN",
                start_time: startTimeNs,
                end_time: endTimeNs,
                duration_ns: endTimeNs > 0 ? endTimeNs - startTimeNs : null,
                attributes: unifiedAttrs,
                resource: {
                    attributes: resourceAttrs
                },
                status: {
                    code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"][span2.status.code] ?? String(span2.status.code),
                    description: span2.status.message ?? null
                },
                events: span2.events ? span2.events.map((e)=>({
                        name: e.name,
                        timestamp: hrTimeToNanos(e.time),
                        attributes: e.attributes ? {
                            ...e.attributes
                        } : {}
                    })) : []
            };
            let results = this._normalizeFrameworkSpanNames([
                spanData
            ]);
            spanData = results[0] ?? spanData;
            results = this._injectCrewaiTaskTemplates([
                spanData
            ]);
            spanData = results[0] ?? spanData;
            this._resolveActualModelName(spanData);
            const maskedSpanData = applyMask(spanData, this.mask ?? null);
            if (maskedSpanData === null) {
                try {
                    const spanAttrs = span2.attributes ?? span2._attributes;
                    if (spanAttrs != null) {
                        spanAttrs["neatlogs.dropped"] = true;
                    }
                } catch  {}
                return;
            }
            spanData = maskedSpanData;
            const finalAttrs = spanData.attributes ?? {};
            try {
                const spanAttrs = span2.attributes ?? span2._attributes;
                if (spanAttrs != null) {
                    for (const [k, v] of Object.entries(finalAttrs)){
                        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
                            spanAttrs[k] = v;
                        } else if (Array.isArray(v) && v.every((i)=>typeof i === "string" || typeof i === "number" || typeof i === "boolean")) {
                            spanAttrs[k] = [
                                ...v
                            ];
                        }
                    }
                }
            } catch (wbExc) {
                if (this.debug) {
                    logger8.debug(`[SpanProcessor] Attr write-back failed: ${wbExc}`);
                }
            }
            if (this._processedLogStream && !this._processedLogStream.destroyed) {
                try {
                    this._processedLogStream.write(JSON.stringify(spanData) + "\n");
                } catch (e) {
                    logger8.warn(`Failed to write span to processed log file: ${e}`);
                }
            }
            this.perfStats.spansExported += 1;
            if (!span2.parentSpanId) {
                this._emitCompletionMarker(span2, traceId, resourceAttrs);
            }
        } finally{
            this.perfStats.onEndTime += __TURBOPACK__imported__module__$5b$externals$5d2f$perf_hooks__$5b$external$5d$__$28$perf_hooks$2c$__cjs$29$__["performance"].now() - startTime;
        }
    }
    // ── Completion marker ─────────────────────────────────
    _emitCompletionMarker(rootSpan, traceId, resourceAttrs) {
        try {
            const spanCtx = {
                traceId: rootSpan.spanContext().traceId,
                spanId: rootSpan.spanContext().spanId,
                isRemote: false,
                traceFlags: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$trace_flags$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["TraceFlags"].SAMPLED
            };
            const wrappedSpan = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].wrapSpanContext(spanCtx);
            const ctx = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].setSpan(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active(), wrappedSpan);
            const tracer = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getTracer("neatlogs.internal");
            const marker = tracer.startSpan("neatlogs.trace.complete", void 0, ctx);
            marker.setAttribute("neatlogs.trace.complete", true);
            marker.setAttribute("neatlogs.internal", true);
            marker.setAttribute("neatlogs.span.kind", "Neatlogs.INTERNAL");
            if (resourceAttrs["neatlogs.tags"]) {
                marker.setAttribute("neatlogs.tags", resourceAttrs["neatlogs.tags"]);
            }
            marker.end();
            if (this.debug) {
                logger8.debug(`[SpanProcessor] Emitted completion marker for trace ${traceId}`);
            }
        } catch (e) {
            logger8.warn(`[SpanProcessor] Failed to emit completion marker: ${e}`);
        }
    }
    // ── Framework span name normalization ─────────────────
    _normalizeFrameworkSpanNames(spans) {
        for (const s of spans){
            const name = s.name ?? "";
            const kind = s.kind ?? s.attributes?.["neatlogs.span.kind"] ?? "";
            if (kind !== "task" || !name.endsWith(".task")) {
                continue;
            }
            const attrs = s.attributes ?? {};
            if (!Object.keys(attrs).some((k)=>k.startsWith("neatlogs.crewai."))) {
                continue;
            }
            let desc = name.slice(0, -".task".length).trimEnd();
            while(desc.endsWith(".")){
                desc = desc.slice(0, -1).trimEnd();
            }
            if (desc) {
                if (attrs["neatlogs.task.description"] === void 0) {
                    attrs["neatlogs.task.description"] = desc;
                }
            }
            s.name = "crewai.task";
            s.attributes = attrs;
        }
        return spans;
    }
    // ── CrewAI task template injection ────────────────────
    _injectCrewaiTaskTemplates(spans) {
        for (const s of spans){
            const attrs = s.attributes ?? {};
            const taskId = attrs["neatlogs.task.id"];
            if (!taskId) continue;
            const entry = popEntry(String(taskId));
            if (!entry) continue;
            const [tplStr, varsJson] = entry;
            attrs["neatlogs.task.user_prompt_template"] = tplStr;
            if (varsJson) {
                attrs["neatlogs.task.user_prompt_template_variables"] = varsJson;
            }
            attrs["neatlogs.span.kind"] = "crewai_task";
            s.attributes = attrs;
        }
        return spans;
    }
    // ── Resolve actual model name from LLM output ────────
    // LangChain/Azure spans report deployment names (e.g., "gpt-3.5-turbo") as
    // the model name. The actual resolved model (e.g., "gpt-5-nano-2025-08-07")
    // is buried in the LLM output JSON at response_metadata.model_name.
    _resolveActualModelName(spanData) {
        const attrs = spanData.attributes ?? {};
        const kind = attrs["neatlogs.span.kind"];
        if (kind !== "llm") return;
        const currentModel = attrs["neatlogs.llm.model_name"];
        if (!currentModel) return;
        const llmOutput = attrs["neatlogs.llm.output"];
        if (!llmOutput) return;
        try {
            const output = JSON.parse(llmOutput);
            const generations = output?.generations;
            if (Array.isArray(generations) && generations[0]?.[0]) {
                const respMeta = generations[0][0]?.message?.kwargs?.response_metadata;
                if (respMeta?.model_name && respMeta.model_name !== currentModel) {
                    attrs["neatlogs.llm.model_name"] = respMeta.model_name;
                    if (this.debug) {
                        logger8.debug(`[ModelResolve] LangChain span: ${currentModel} \u2192 ${respMeta.model_name}`);
                    }
                    return;
                }
            }
            if (output?.model && output.model !== currentModel) {
                attrs["neatlogs.llm.model_name"] = output.model;
                if (this.debug) {
                    logger8.debug(`[ModelResolve] Direct response: ${currentModel} \u2192 ${output.model}`);
                }
            }
        } catch (e) {
            logger8.warn(`[ModelResolve] Failed to parse LLM output for model extraction: ${e}`);
        }
    }
    // ── forceFlush / shutdown ─────────────────────────────
    async forceFlush() {}
    async shutdown() {
        this._logPerformanceStats();
        await closeLogStream(this._rawLogStream, "raw");
        this._rawLogStream = null;
        await closeLogStream(this._processedLogStream, "processed");
        this._processedLogStream = null;
    }
    // ── Performance stats ─────────────────────────────────
    _logPerformanceStats() {
        if (!this.debug) return;
        const stats = this.perfStats;
        if (stats.spansProcessed === 0) return;
        const totalTime = stats.onStartTime + stats.onEndTime;
        const avgMs = totalTime / stats.spansProcessed;
        try {
            logger8.info(`Neatlogs overhead: ${totalTime.toFixed(2)}ms total, ${avgMs.toFixed(3)}ms/span (${stats.spansProcessed} spans processed, ${stats.spansExported} spans logged)`);
        } catch  {}
    }
    // ── Accessors for testing ─────────────────────────────
    /** @internal — exposed for testing */ get _perfStats() {
        return this.perfStats;
    }
    /** @internal — exposed for testing */ get _suppressedRetrievers() {
        return this._retrieversToSuppress;
    }
};
// src/core/filtering-exporter.ts
var FilteringExporter = class {
    constructor(_delegate){
        this._delegate = _delegate;
    }
    _delegate;
    export(spans, resultCallback) {
        const filtered = spans.filter((s)=>!s.attributes["neatlogs.dropped"] && s.instrumentationLibrary.name !== "next.js");
        if (filtered.length === 0) {
            resultCallback({
                code: 0
            });
            return;
        }
        this._delegate.export(filtered, resultCallback);
    }
    async shutdown() {
        return this._delegate.shutdown();
    }
    async forceFlush() {
        return this._delegate.forceFlush?.();
    }
};
// src/core/exporter.ts
var logger9 = getLogger();
var NeatlogsExporter = class {
    baseUrl;
    apiKey;
    batchSize;
    flushIntervalMs;
    disableExport;
    buffer = [];
    flushTimer = null;
    _shutdown = false;
    constructor(options){
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.apiKey = options.apiKey;
        this.batchSize = options.batchSize ?? 50;
        this.flushIntervalMs = options.flushIntervalMs ?? 5e3;
        this.disableExport = options.disableExport ?? false;
        if (!this.disableExport) {
            this.flushTimer = setInterval(()=>this.flush(), this.flushIntervalMs);
            if (this.flushTimer.unref) {
                this.flushTimer.unref();
            }
        }
    }
    /** Add a span-like dict to the buffer. */ export(spanData) {
        if (this._shutdown || this.disableExport) return;
        this.buffer.push(spanData);
        if (this.buffer.length >= this.batchSize) {
            this.flush().catch((err)=>{
                logger9.warn(`Failed to flush batch: ${err}`);
            });
        }
    }
    /** Flush all buffered spans to the API. */ async flush() {
        if (this.disableExport || this.buffer.length === 0) return;
        const batch = this.buffer.splice(0, this.buffer.length);
        try {
            const url = `${this.baseUrl}/api/data/v4/batch`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.apiKey
                },
                body: JSON.stringify({
                    spans: batch
                })
            });
            if (!response.ok) {
                logger9.warn(`Failed to export batch: ${response.status} ${response.statusText}`);
                this._requeueBatch(batch);
            } else {
                logger9.debug(`Exported ${batch.length} log spans`);
            }
        } catch (err) {
            logger9.warn(`Failed to export batch: ${err}`);
            this._requeueBatch(batch);
        }
    }
    /** Re-insert a failed batch into the buffer for retry, up to a limit. */ _requeueBatch(batch) {
        if (this.buffer.length < this.batchSize * 3) {
            this.buffer.unshift(...batch);
        }
    }
    /** Shutdown the exporter, flushing remaining items. */ async shutdown() {
        this._shutdown = true;
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
    }
};
;
;
;
;
var SUPPRESS_TRACING_KEY = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["createContextKey"])("OpenTelemetry SDK Context Key SUPPRESS_TRACING");
function suppressTracing(context3) {
    return context3.setValue(SUPPRESS_TRACING_KEY, true);
}
// node_modules/@opentelemetry/core/build/esm/ExportResult.js
var ExportResultCode;
(function(ExportResultCode2) {
    ExportResultCode2[ExportResultCode2["SUCCESS"] = 0] = "SUCCESS";
    ExportResultCode2[ExportResultCode2["FAILED"] = 1] = "FAILED";
})(ExportResultCode || (ExportResultCode = {}));
// src/core/log-exporter.ts
var logger10 = getLogger();
var NeatlogsLogExporter = class {
    exporter;
    logFileHandle = null;
    logEnabled;
    constructor(exporter){
        this.exporter = exporter;
        this.logEnabled = [
            "1",
            "true",
            "yes"
        ].includes((process.env.NEATLOGS_LOG_LOGS ?? "").toLowerCase());
        const logFile = process.env.NEATLOGS_LOG_LOGS_FILE ?? "";
        if (this.logEnabled && logFile) {
            const filePath = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["resolve"](process.cwd(), logFile);
            try {
                this.logFileHandle = __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["openSync"](filePath, "a");
                logger10.info(`Log record logging enabled: ${filePath}`);
            } catch (err) {
                logger10.warn(`Failed to open log file ${filePath}: ${err}`);
            }
        }
    }
    export(logRecords, resultCallback) {
        try {
            for (const record of logRecords){
                const spanDict = this._convertLogRecord(record);
                this.exporter.export(spanDict);
                this._writeToFile(record, spanDict);
            }
            resultCallback({
                code: ExportResultCode.SUCCESS
            });
        } catch (err) {
            logger10.warn(`Failed to export log records: ${err}`);
            resultCallback({
                code: ExportResultCode.FAILED
            });
        }
    }
    async shutdown() {
        if (this.logFileHandle !== null) {
            __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["closeSync"](this.logFileHandle);
            this.logFileHandle = null;
        }
    }
    async forceFlush() {
        await this.exporter.flush();
    }
    _writeToFile(record, spanDict) {
        if (!this.logEnabled || this.logFileHandle === null) return;
        const entry = {
            trace_id: spanDict.trace_id || "",
            span_id: spanDict.span_id || "",
            body: spanDict.attributes?.["log.message"] ?? "",
            severity: record.severityText ?? "",
            template: spanDict.attributes?.["log.template"] ?? "",
            timestamp: spanDict.start_time
        };
        __TURBOPACK__imported__module__$5b$externals$5d2f$fs__$5b$external$5d$__$28$fs$2c$__cjs$29$__["writeSync"](this.logFileHandle, JSON.stringify(entry) + "\n");
    }
    _convertLogRecord(record) {
        const attributes = {
            ...record.attributes ?? {}
        };
        if (record.body !== void 0 && record.body !== null) {
            attributes["log.message"] = String(record.body);
        }
        attributes["openinference.span.kind"] = "LOG";
        attributes["neatlogs.span.kind"] = "log";
        return {
            name: attributes["log.template"] ?? "log",
            kind: "LOG",
            trace_id: record.spanContext?.traceId ?? "",
            span_id: __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["randomBytes"](8).toString("hex"),
            parent_span_id: record.spanContext?.spanId ?? "",
            start_time: record.hrTime ? this._hrTimeToIso(record.hrTime) : /* @__PURE__ */ new Date().toISOString(),
            end_time: record.hrTime ? this._hrTimeToIso(record.hrTime) : /* @__PURE__ */ new Date().toISOString(),
            status: "OK",
            attributes
        };
    }
    _hrTimeToIso(hrTime) {
        const ms = hrTime[0] * 1e3 + hrTime[1] / 1e6;
        return new Date(ms).toISOString();
    }
};
;
var logger11 = getLogger();
var _otelLogger = null;
var _debugMode = false;
function _setOtelLogger(otelLogger, debug) {
    _otelLogger = otelLogger;
    _debugMode = debug;
}
function log(msgTemplate, options) {
    const { level = "info", ...variables } = options ?? {};
    let rendered = msgTemplate;
    for (const [key, value] of Object.entries(variables)){
        rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
    }
    if (_debugMode) {
        console.log(`[neatlogs:log] ${rendered}`);
    }
    if (_otelLogger) {
        const activeSpan = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getSpan(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active());
        const spanContext = activeSpan?.spanContext();
        const attributes = {
            "log.template": msgTemplate,
            "log.level": level
        };
        for (const [key, value] of Object.entries(variables)){
            attributes[`log.${key}`] = String(value);
        }
        try {
            _otelLogger.emit({
                body: rendered,
                attributes,
                ...spanContext ? {
                    spanContext
                } : {}
            });
        } catch (err) {
            logger11.warn(`Failed to emit log record: ${err}`);
        }
    }
}
// src/instrumentation/registry.ts
var INSTRUMENTATION_REGISTRY = {
    tags: {
        llm: [
            "azure_ai_inference",
            "openai",
            "anthropic",
            "cohere",
            "bedrock",
            "groq",
            "together",
            "vertexai",
            "google_generativeai",
            "mistralai",
            "ollama",
            "watsonx",
            "alephalpha",
            "replicate",
            "sagemaker",
            "huggingface_hub",
            "litellm",
            "google_genai",
            "portkey",
            "ai_sdk"
        ],
        embedding: [
            "openai",
            "cohere",
            "huggingface",
            "vertexai",
            "mistralai",
            "ollama"
        ],
        retrieval: [
            "chromadb",
            "pinecone",
            "weaviate",
            "qdrant",
            "milvus",
            "opensearch",
            "elasticsearch",
            "redis",
            "marqo"
        ],
        agent: [
            "langchain",
            "langgraph",
            "llamaindex",
            "crewai",
            "mastra",
            "autogen",
            "haystack",
            "dspy",
            "agno",
            "beeai",
            "openai_agents",
            "pydantic_ai",
            "smolagents",
            "strands",
            "pipecat",
            "ai_sdk"
        ],
        tool: [
            "langchain",
            "llamaindex",
            "haystack",
            "mcp"
        ],
        http: [
            "requests",
            "httpx",
            "urllib3",
            "aiohttp"
        ],
        framework: [
            "instructor",
            "guardrails",
            "promptflow",
            "google_adk"
        ]
    },
    libraries: {
        azure_ai_inference: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        ai_sdk: {
            openinference: null,
            openllmetry: null,
            // The wrapper is opt-in per call site; init({ instrumentations: ['ai_sdk'] })
            // is a no-op. This registry entry exists so scope detection and tagging stay
            // consistent with other LLM/agent libraries.
            neatlogs: "@neatlogs/instrumentation-ai-sdk",
            default_span_kind: "LLM"
        },
        openai: {
            openinference: "@arizeai/openinference-instrumentation-openai",
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM",
            npm_package: "openai"
        },
        anthropic: {
            openinference: "@arizeai/openinference-instrumentation-anthropic",
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM",
            npm_package: "@anthropic-ai/sdk"
        },
        cohere: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        bedrock: {
            openinference: "@arizeai/openinference-instrumentation-bedrock",
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        groq: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        together: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        vertexai: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        google_generativeai: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        mistralai: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        ollama: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        watsonx: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        alephalpha: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        replicate: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        sagemaker: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        huggingface_hub: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        litellm: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        langchain: {
            openinference: "@arizeai/openinference-instrumentation-langchain",
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "CHAIN",
            npm_package: "@langchain/core/callbacks/manager"
        },
        langgraph: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "WORKFLOW"
        },
        llamaindex: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "CHAIN"
        },
        crewai: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT",
            auto_load: [
                "litellm"
            ]
        },
        mastra: {
            openinference: null,
            openllmetry: null,
            neatlogs: "@neatlogs/instrumentation-mastra",
            default_span_kind: "AGENT"
        },
        autogen: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        haystack: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "CHAIN"
        },
        dspy: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "CHAIN"
        },
        requests: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "TOOL"
        },
        httpx: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "TOOL"
        },
        urllib3: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "TOOL"
        },
        aiohttp: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "TOOL"
        },
        chromadb: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        pinecone: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        weaviate: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        qdrant: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        milvus: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        opensearch: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        elasticsearch: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        redis: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        marqo: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "RETRIEVER"
        },
        instructor: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "CHAIN"
        },
        guardrails: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "GUARDRAIL"
        },
        google_genai: {
            openinference: null,
            openllmetry: null,
            neatlogs: "@neatlogs/instrumentation-google-genai",
            default_span_kind: "LLM",
            npm_package: "@google/genai"
        },
        google_adk: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "CHAIN"
        },
        agno: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        beeai: {
            openinference: "@arizeai/openinference-instrumentation-beeai",
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        openai_agents: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        pydantic_ai: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        smolagents: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        strands: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        pipecat: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        },
        portkey: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "LLM"
        },
        promptflow: {
            openinference: null,
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "CHAIN"
        },
        mcp: {
            openinference: "@arizeai/openinference-instrumentation-mcp",
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "TOOL"
        },
        claude_agent_sdk: {
            openinference: "@arizeai/openinference-instrumentation-claude-agent-sdk",
            openllmetry: null,
            neatlogs: null,
            default_span_kind: "AGENT"
        }
    }
};
function getLibraryInfo(library) {
    return INSTRUMENTATION_REGISTRY.libraries[library];
}
// src/instrumentation/manager.ts
var logger12 = getLogger();
var InstrumentationManager = class {
    provider;
    _instrumented = [];
    constructor(options){
        this.provider = options.provider;
    }
    /** Get list of successfully instrumented libraries. */ get instrumented() {
        return [
            ...this._instrumented
        ];
    }
    /**
   * Instrument the specified libraries.
   * Priority: neatlogs custom > OpenInference > skip
   */ async instrument(libraries) {
        for (const lib of libraries){
            const info = getLibraryInfo(lib);
            if (!info) {
                logger12.warn(`Unknown library '${lib}' \u2014 not in instrumentation registry. Skipping.`);
                continue;
            }
            if (info.neatlogs) {
                try {
                    const mod = await Promise.resolve().then(()=>{
                        const e = new Error("Cannot find module as expression is too dynamic");
                        e.code = 'MODULE_NOT_FOUND';
                        throw e;
                    });
                    const InstrumentorClass = (typeof mod.default === "function" ? mod.default : void 0) ?? Object.values(mod).find((v)=>typeof v === "function" && v.prototype?.instrument) ?? (typeof mod[Object.keys(mod)[0]] === "function" ? mod[Object.keys(mod)[0]] : void 0);
                    if (InstrumentorClass && typeof InstrumentorClass === "function") {
                        const instrumentor = new InstrumentorClass();
                        if (typeof instrumentor.instrument === "function") {
                            instrumentor.instrument({
                                tracerProvider: this.provider
                            });
                            this._instrumented.push(lib);
                            logger12.debug(`Instrumented '${lib}' via neatlogs custom instrumentor`);
                            continue;
                        }
                        if (typeof instrumentor.setTracerProvider === "function" && typeof instrumentor.enable === "function") {
                            instrumentor.setTracerProvider(this.provider);
                            instrumentor.enable();
                            if (typeof instrumentor.patchEager === "function" && info.npm_package) {
                                try {
                                    const targetMod = await Promise.resolve().then(()=>{
                                        const e = new Error("Cannot find module as expression is too dynamic");
                                        e.code = 'MODULE_NOT_FOUND';
                                        throw e;
                                    });
                                    instrumentor.patchEager(targetMod);
                                } catch (e) {
                                    logger12.debug(`Eager patch for '${lib}' skipped \u2014 ${info.npm_package} not available: ${e}`);
                                }
                            }
                            this._instrumented.push(lib);
                            logger12.debug(`Instrumented '${lib}' via neatlogs OTel instrumentor`);
                            continue;
                        }
                    }
                    logger12.debug(`neatlogs instrumentor for '${lib}' loaded but has no instrument() method \u2014 trying OpenInference`);
                } catch (err) {
                    logger12.debug(`neatlogs instrumentor for '${lib}' failed to load: ${err} \u2014 trying OpenInference`);
                }
            }
            if (info.openinference) {
                try {
                    const mod = await Promise.resolve().then(()=>{
                        const e = new Error("Cannot find module as expression is too dynamic");
                        e.code = 'MODULE_NOT_FOUND';
                        throw e;
                    });
                    const InstrumentorClass = mod.default ?? Object.values(mod).find((v)=>typeof v === "function" && v.prototype && ("instrument" in v.prototype || "manuallyInstrument" in v.prototype));
                    if (InstrumentorClass && typeof InstrumentorClass === "function") {
                        const instrumentor = new InstrumentorClass();
                        if (typeof instrumentor.instrument === "function") {
                            instrumentor.instrument({
                                tracerProvider: this.provider
                            });
                            this._instrumented.push(lib);
                            logger12.debug(`Instrumented '${lib}' via OpenInference`);
                            continue;
                        }
                        if (typeof instrumentor.setTracerProvider === "function" && typeof instrumentor.manuallyInstrument === "function") {
                            instrumentor.setTracerProvider(this.provider);
                            if (info.npm_package) {
                                try {
                                    const targetMod = await Promise.resolve().then(()=>{
                                        const e = new Error("Cannot find module as expression is too dynamic");
                                        e.code = 'MODULE_NOT_FOUND';
                                        throw e;
                                    });
                                    instrumentor.manuallyInstrument(targetMod);
                                    this._instrumented.push(lib);
                                    logger12.debug(`Instrumented '${lib}' via OpenInference (manual patch)`);
                                    continue;
                                } catch (importErr) {
                                    logger12.debug(`Could not import '${info.npm_package}' for manual instrumentation of '${lib}': ${importErr}`);
                                }
                            }
                            this._instrumented.push(lib);
                            logger12.debug(`Instrumented '${lib}' via OpenInference (tracer set, awaiting module hook)`);
                            continue;
                        }
                    }
                    if (typeof mod.instrument === "function") {
                        mod.instrument({
                            tracerProvider: this.provider
                        });
                        this._instrumented.push(lib);
                        logger12.debug(`Instrumented '${lib}' via OpenInference`);
                        continue;
                    }
                    logger12.warn(`OpenInference package for '${lib}' loaded but could not find instrumentor class`);
                } catch (err) {
                    logger12.debug(`OpenInference instrumentor for '${lib}' not available: ${err}`);
                }
            }
            if (!info.openinference && !info.neatlogs) {
                logger12.debug(`'${lib}' instrumentation not yet available for TypeScript \u2014 skipping`);
            }
        }
        if (this._instrumented.length > 0) {
            logger12.info(`Instrumented: ${this._instrumented.join(", ")}`);
        }
    }
};
;
var PromptClientError = class extends Error {
    constructor(message){
        super(message);
        this.name = "PromptClientError";
    }
};
var PromptApiError = class extends PromptClientError {
    constructor(message){
        super(message);
        this.name = "PromptApiError";
    }
};
var PromptNotFoundError = class extends PromptClientError {
    constructor(message){
        super(message);
        this.name = "PromptNotFoundError";
    }
};
var PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
function renderTemplate(template, variables) {
    return template.replace(PLACEHOLDER_PATTERN, (full, key)=>{
        return key in variables ? String(variables[key]) : full;
    });
}
function normalizePromptObject(raw) {
    let messages = null;
    const rawMessages = raw["messages"];
    if (Array.isArray(rawMessages)) {
        const messageList = [];
        for (const item of rawMessages){
            if (item && typeof item === "object") {
                messageList.push({
                    role: String(item["role"] ?? "system"),
                    content: String(item["content"] ?? "")
                });
            }
        }
        if (messageList.length > 0) {
            messages = messageList;
        }
    }
    let labels = [];
    const rawLabels = raw["labels"];
    if (Array.isArray(rawLabels)) {
        labels = rawLabels.filter((l)=>String(l).trim()).map(String);
    }
    let config = {};
    if (raw["config"] && typeof raw["config"] === "object" && !Array.isArray(raw["config"])) {
        config = {
            ...raw["config"]
        };
    }
    const content = typeof raw["content"] === "string" ? raw["content"] : null;
    const id = typeof raw["id"] === "string" ? raw["id"] : "";
    const name = typeof raw["name"] === "string" ? raw["name"] : "";
    let version = 0;
    try {
        if (raw["version"] != null) {
            version = Number(raw["version"]) || 0;
        }
    } catch  {
        version = 0;
    }
    let updatedAt = "";
    if (typeof raw["updatedAt"] === "string") {
        updatedAt = raw["updatedAt"];
    } else if (typeof raw["updated_at"] === "string") {
        updatedAt = raw["updated_at"];
    }
    let type = "text";
    if (raw["type"] === "chat") {
        type = "chat";
    }
    return {
        id,
        name,
        version,
        content,
        messages,
        config,
        labels,
        updatedAt,
        type
    };
}
var PromptHandle = class {
    _prompt;
    constructor(prompt){
        this._prompt = prompt;
    }
    get id() {
        return this._prompt.id;
    }
    get name() {
        return this._prompt.name;
    }
    get version() {
        return this._prompt.version;
    }
    get content() {
        return this._prompt.content;
    }
    get messages() {
        return this._prompt.messages ? [
            ...this._prompt.messages
        ] : null;
    }
    get config() {
        return {
            ...this._prompt.config
        };
    }
    get labels() {
        return [
            ...this._prompt.labels
        ];
    }
    get updatedAt() {
        return this._prompt.updatedAt;
    }
    get type() {
        return this._prompt.type;
    }
    /**
   * Compile string content with `{{variable}}` replacement.
   *
   * If the prompt has `content`, renders it directly.
   * If it only has `messages`, renders and joins all message contents.
   */ compile(variables) {
        const vars = variables ?? {};
        if (this._prompt.content) {
            return renderTemplate(this._prompt.content, vars);
        }
        if (this._prompt.messages) {
            const rendered = this._prompt.messages.map((msg)=>renderTemplate(msg.content ?? "", vars)).filter(Boolean);
            return rendered.join("\n\n");
        }
        return "";
    }
    /**
   * Compile message list with `{{variable}}` replacement.
   *
   * If no messages exist, returns a single synthetic system message from content.
   */ compileMessages(variables) {
        const vars = variables ?? {};
        if (this._prompt.messages) {
            return this._prompt.messages.map((msg)=>({
                    role: String(msg.role ?? "system"),
                    content: renderTemplate(String(msg.content ?? ""), vars)
                }));
        }
        return [
            {
                role: "system",
                content: renderTemplate(this._prompt.content ?? "", vars)
            }
        ];
    }
};
var PromptClient = class {
    baseUrl;
    apiKey;
    _cache = /* @__PURE__ */ new Map();
    constructor(options){
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.apiKey = options.apiKey;
    }
    // ---- public API ----------------------------------------------------------
    /**
   * Get a prompt by name, optionally pinned to a version or label.
   * Results are cached in memory by cache key.
   */ async getPrompt(name, options) {
        const version = options?.version;
        const label = options?.label;
        if (label != null && version != null) {
            throw new PromptClientError("Cannot specify both label and version.");
        }
        const cacheKey = `${name}:${label ?? ""}:${version ?? ""}`;
        const cached = this._cache.get(cacheKey);
        if (cached) {
            return new PromptHandle(cached);
        }
        const handle = await this.fetchPrompt(name, options);
        this._cache.set(cacheKey, {
            id: handle.id,
            name: handle.name,
            version: handle.version,
            content: handle.content,
            messages: handle.messages,
            config: handle.config,
            labels: handle.labels,
            updatedAt: handle.updatedAt,
            type: handle.type
        });
        return handle;
    }
    /**
   * Always fetch from the API (bypasses cache).
   */ async fetchPrompt(name, options) {
        const version = options?.version;
        const label = options?.label;
        if (label != null) {
            const path4 = `/api/v1/prompts/${encodeURIComponent(name)}/fetch`;
            const url = `${path4}?label=${encodeURIComponent(label)}`;
            const payload = await this._request(url);
            return new PromptHandle(normalizePromptObject(payload));
        }
        const listing = await this._request(`/api/managed-prompts?name=${encodeURIComponent(name)}&limit=100&offset=0`);
        const items = listing["items"] ?? [];
        if (items.length === 0) {
            throw new PromptNotFoundError(`No versions found for prompt '${name}'`);
        }
        if (version != null) {
            const match = items.find((item)=>item["version"] === version);
            if (!match) {
                throw new PromptNotFoundError(`Prompt '${name}' version ${version} not found`);
            }
            return new PromptHandle(normalizePromptObject(match));
        }
        const latest = items.reduce((a, b)=>{
            const aDate = a["createdAt"] ?? a["created_at"] ?? "";
            const bDate = b["createdAt"] ?? b["created_at"] ?? "";
            return String(aDate) >= String(bDate) ? a : b;
        });
        return new PromptHandle(normalizePromptObject(latest));
    }
    /**
   * List all prompts.
   */ async listPrompts() {
        const payload = await this._request("/api/managed-prompts?limit=100&offset=0");
        const items = payload["items"] ?? [];
        return items.map((item)=>new PromptHandle(normalizePromptObject(item)));
    }
    /**
   * Create a new prompt.
   */ async createPrompt(data) {
        const body = {
            name: data.name
        };
        if (data.content !== void 0) body["content"] = data.content;
        if (data.messages !== void 0) {
            body["messages"] = data.messages;
            body["type"] = "chat";
        } else {
            body["type"] = "text";
        }
        if (data.config !== void 0) body["config"] = data.config;
        if (data.labels !== void 0) body["labels"] = data.labels;
        const payload = await this._request("/api/managed-prompts", {
            method: "POST",
            body: JSON.stringify(body)
        });
        const promptData = payload["prompt"] ?? payload;
        return new PromptHandle(normalizePromptObject(promptData));
    }
    /**
   * Update an existing prompt.
   */ async updatePrompt(name, data) {
        const body = {
            name
        };
        if (data.content !== void 0) body["content"] = data.content;
        if (data.messages !== void 0) body["messages"] = data.messages;
        if (data.config !== void 0) body["config"] = data.config;
        if (data.labels !== void 0) body["labels"] = data.labels;
        const payload = await this._request(`/api/managed-prompts`, {
            method: "PUT",
            body: JSON.stringify(body)
        });
        const promptData = payload["prompt"] ?? payload;
        return new PromptHandle(normalizePromptObject(promptData));
    }
    /**
   * Delete a prompt by name.
   */ async deletePrompt(name) {
        await this._request(`/api/managed-prompts/${encodeURIComponent(name)}`, {
            method: "DELETE"
        });
    }
    /**
   * Remove a tag from a prompt.
   */ async removeTag(name, tag) {
        await this._request(`/api/managed-prompts/${encodeURIComponent(name)}/tags`, {
            method: "DELETE",
            body: JSON.stringify({
                tag
            })
        });
    }
    /**
   * Save the current prompt content as a new version, optionally with a label.
   */ async saveAsVersion(name, options) {
        const body = {
            promptName: name
        };
        if (options?.label) body["labels"] = [
            options.label
        ];
        const payload = await this._request("/api/prompt-playground/save-as-version", {
            method: "POST",
            body: JSON.stringify(body)
        });
        const promptData = payload["prompt"] ?? payload;
        return new PromptHandle(normalizePromptObject(promptData));
    }
    // ---- internal ------------------------------------------------------------
    /**
   * Internal fetch wrapper with auth headers and OTel suppression.
   */ async _request(path4, options) {
        const url = `${this.baseUrl}${path4}`;
        const headers = {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "x-api-key": this.apiKey,
            ...options?.headers
        };
        const fetchOptions = {
            method: options?.method ?? "GET",
            headers,
            body: options?.body
        };
        let response;
        try {
            const suppressedContext = suppressTracing(__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active());
            response = await __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].with(suppressedContext, ()=>fetch(url, fetchOptions));
        } catch  {
            response = await fetch(url, fetchOptions);
        }
        if (!response.ok) {
            const body = await response.text().catch(()=>"<unavailable>");
            throw new PromptApiError(`${fetchOptions.method} ${path4} failed (${response.status}): ${body.slice(0, 400)}`);
        }
        try {
            return await response.json();
        } catch  {
            throw new PromptApiError(`${fetchOptions.method} ${path4} returned non-JSON response`);
        }
    }
};
var _sharedClient = null;
function setSharedClient(client) {
    _sharedClient = client;
}
function getSharedClient() {
    if (!_sharedClient) {
        throw new PromptClientError("No prompt client available. Call neatlogs.init(apiKey: ...) or setSharedClient() first.");
    }
    return _sharedClient;
}
async function getPrompt(name, options) {
    return getSharedClient().getPrompt(name, options);
}
async function fetchPrompt(name, options) {
    return getSharedClient().fetchPrompt(name, options);
}
async function listPrompts() {
    return getSharedClient().listPrompts();
}
async function createPrompt(data) {
    return getSharedClient().createPrompt(data);
}
async function updatePrompt(name, data) {
    return getSharedClient().updatePrompt(name, data);
}
async function saveAsVersion(name, options) {
    return getSharedClient().saveAsVersion(name, options);
}
async function deletePrompt(name) {
    return getSharedClient().deletePrompt(name);
}
async function removeTag(name, tag) {
    return getSharedClient().removeTag(name, tag);
}
// src/version.ts
var __version__ = "1.0.0";
// src/init.ts
var logger13 = getLogger();
var _initialized = false;
var _tracerProvider = null;
var _meterProvider = null;
var _logProvider = null;
var _logSpanExporter = null;
var _spanProcessor = null;
var _debugMode2 = false;
var _sigHandlersRegistered = false;
var _shutdownOnSignal = ()=>{
    shutdown().catch(()=>{});
};
function _resolveWorkflowName(workflowName) {
    const provided = (workflowName ?? "").trim();
    if (provided) return provided;
    const argv1 = process.argv[1] ?? "";
    const base = __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["basename"](argv1, __TURBOPACK__imported__module__$5b$externals$5d2f$path__$5b$external$5d$__$28$path$2c$__cjs$29$__["extname"](argv1));
    const slug = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    if (slug && ![
        "node",
        "ts-node",
        "tsx",
        "npx",
        "-e"
    ].includes(slug)) {
        return slug;
    }
    return "neatlogs-app";
}
function _randomHex(bytes) {
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["randomBytes"])(bytes).toString("hex");
}
async function init(options = {}) {
    if (_initialized) {
        logger13.warn("Neatlogs already initialized, skipping re-initialization");
        return;
    }
    let resolvedKey;
    if (options.apiKey && options.apiKey.trim()) {
        resolvedKey = options.apiKey.trim();
    } else {
        resolvedKey = (process.env.NEATLOGS_API_KEY ?? "").trim();
    }
    let disableExportResolved = !!options.disableExport || [
        "true",
        "1",
        "yes"
    ].includes((process.env.NEATLOGS_DISABLE_EXPORT ?? "").toLowerCase());
    if (!resolvedKey) {
        disableExportResolved = true;
        resolvedKey = "disabled";
        if (options.debug) {
            logger13.warn("No NEATLOGS_API_KEY set; HTTP export disabled. Set NEATLOGS_API_KEY (or pass apiKey) to send spans to the backend.");
        }
    }
    if (options.debug) {
        enableDebugLogging();
    }
    _debugMode2 = options.debug ?? false;
    const resolvedWorkflowName = _resolveWorkflowName(options.workflowName);
    let sessionId = options.sessionId;
    if (!sessionId && options.autoSession) {
        sessionId = `session_${Date.now()}_${_randomHex(4)}`;
        if (options.debug) {
            logger13.debug(`Auto-generated session_id: ${sessionId}`);
        }
    }
    const endpoint = options.endpoint ?? "https://staging-cloud.neatlogs.com/api/data/v4/batch";
    const baseUrl = new URL(endpoint).origin;
    _setSessionConfig({
        sessionId,
        userId: options.userId,
        workflowName: resolvedWorkflowName,
        _apiKey: resolvedKey,
        _baseUrl: baseUrl
    });
    if (resolvedKey && resolvedKey !== "disabled") {
        setSharedClient(new PromptClient({
            baseUrl,
            apiKey: resolvedKey
        }));
    }
    const resourceAttrs = {
        [__TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$semantic$2d$conventions$40$1$2e$41$2e$1$2f$node_modules$2f40$opentelemetry$2f$semantic$2d$conventions$2f$build$2f$esm$2f$stable_attributes$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["ATTR_SERVICE_NAME"]]: options.workflowName || "neatlogs-app",
        "service.version": __version__,
        "neatlogs.workflow_name": resolvedWorkflowName
    };
    if (sessionId) resourceAttrs["session.id"] = sessionId;
    if (options.userId) resourceAttrs["user.id"] = options.userId;
    const tags = options.tags;
    if (tags !== void 0) {
        if (!Array.isArray(tags) || !tags.every((t)=>typeof t === "string")) {
            throw new Error("tags must be a list of strings");
        }
        resourceAttrs["neatlogs.tags"] = tags.join(",");
    }
    if (options.pii !== void 0) {
        resourceAttrs["neatlogs.pii.enabled"] = options.pii === false ? "false" : "true";
    }
    if (options.piiSpanTypes !== void 0) {
        resourceAttrs["neatlogs.pii.span_types"] = options.piiSpanTypes.join(",");
    }
    const resource = new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$resources$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$resources$2f$build$2f$esm$2f$Resource$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["Resource"](resourceAttrs);
    const provider = new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$trace$2d$node$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$trace$2d$node$2f$build$2f$src$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["NodeTracerProvider"]({
        resource,
        spanLimits: {
            attributeCountLimit: 1e4
        }
    });
    _spanProcessor = new NeatlogsSpanProcessor({
        sampleRate: options.sampleRate ?? 1,
        debug: options.debug ?? false,
        mask: options.mask
    });
    provider.addSpanProcessor(_spanProcessor);
    if (!disableExportResolved) {
        const tracesEndpoint = endpoint.endsWith("/v1/traces") ? endpoint : `${baseUrl}/v1/traces`;
        const otlpExporter = new FilteringExporter(new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$exporter$2d$trace$2d$otlp$2d$proto$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$exporter$2d$trace$2d$otlp$2d$proto$2f$build$2f$esm$2f$platform$2f$node$2f$OTLPTraceExporter$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["OTLPTraceExporter"]({
            url: tracesEndpoint,
            headers: {
                "x-api-key": resolvedKey
            }
        }));
        const batchProcessor = new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$trace$2d$base$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$trace$2d$base$2f$build$2f$esm$2f$platform$2f$node$2f$export$2f$BatchSpanProcessor$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["BatchSpanProcessor"](otlpExporter, {
            maxExportBatchSize: options.batchSize ?? 100,
            scheduledDelayMillis: (options.flushInterval ?? 5) * 1e3
        });
        provider.addSpanProcessor(batchProcessor);
        if (options.debug) {
            logger13.debug(`OTLP trace exporter configured: ${tracesEndpoint}`);
        }
    } else if (options.debug) {
        logger13.debug("Export disabled \u2014 spans will not be sent to backend");
    }
    provider.register();
    _tracerProvider = provider;
    if (options.debug) {
        logger13.debug("Neatlogs tracer provider initialized");
    }
    try {
        _meterProvider = new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$metrics$40$1$2e$30$2e$1_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$metrics$2f$build$2f$esm$2f$MeterProvider$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["MeterProvider"]({
            resource
        });
        __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$metrics$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["metrics"].setGlobalMeterProvider(_meterProvider);
        if (options.debug) {
            logger13.debug("Neatlogs meter provider initialized");
        }
    } catch  {
        if (options.debug) {
            logger13.debug("MeterProvider not available \u2014 skipping");
        }
    }
    const captureLogs = options.captureLogs ?? false;
    if (captureLogs) {
        _logSpanExporter = new NeatlogsExporter({
            baseUrl,
            apiKey: resolvedKey,
            batchSize: options.batchSize ?? 100,
            flushIntervalMs: (options.flushInterval ?? 5) * 1e3,
            disableExport: disableExportResolved
        });
        _logProvider = new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$logs$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$logs$2f$build$2f$esm$2f$LoggerProvider$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["LoggerProvider"]({
            resource
        });
        _logProvider.addLogRecordProcessor(new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$logs$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$logs$2f$build$2f$esm$2f$export$2f$SimpleLogRecordProcessor$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SimpleLogRecordProcessor"](new NeatlogsLogExporter(_logSpanExporter)));
        if (!disableExportResolved) {
            const logsEndpoint = endpoint.endsWith("/v1/logs") ? endpoint : `${baseUrl}/v1/logs`;
            const otlpLogExporter = new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$exporter$2d$logs$2d$otlp$2d$proto$40$0$2e$216$2e$0_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$exporter$2d$logs$2d$otlp$2d$proto$2f$build$2f$esm$2f$platform$2f$node$2f$OTLPLogExporter$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["OTLPLogExporter"]({
                url: logsEndpoint,
                headers: resolvedKey ? {
                    "x-api-key": resolvedKey
                } : void 0
            });
            _logProvider.addLogRecordProcessor(new __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$sdk$2d$logs$40$0$2e$57$2e$2_$40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$sdk$2d$logs$2f$build$2f$esm$2f$platform$2f$node$2f$export$2f$BatchLogRecordProcessor$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["BatchLogRecordProcessor"](otlpLogExporter));
            if (options.debug) {
                logger13.debug(`OTLP log exporter configured: ${logsEndpoint}`);
            }
        }
        __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$2d$logs$40$0$2e$57$2e$2$2f$node_modules$2f40$opentelemetry$2f$api$2d$logs$2f$build$2f$esm$2f$index$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__$3c$locals$3e$__["logs"].setGlobalLoggerProvider(_logProvider);
        const otelLogger = _logProvider.getLogger("neatlogs");
        _setOtelLogger(otelLogger, options.debug ?? false);
        if (options.debug) {
            logger13.debug(`Neatlogs log capture enabled (endpoint: ${baseUrl}/v1/logs)`);
        }
    } else if (options.debug) {
        logger13.debug("Log capture disabled (pass captureLogs: true to enable)");
    }
    const manager = new InstrumentationManager({
        provider,
        debug: options.debug
    });
    if (options.instrumentations?.length) {
        await manager.instrument(options.instrumentations);
        if (options.debug) {
            logger13.debug(`Instrumented libraries: ${manager.instrumented.join(", ")}`);
        }
    }
    if (!_sigHandlersRegistered) {
        process.on("beforeExit", _shutdownOnSignal);
        process.on("SIGTERM", _shutdownOnSignal);
        process.on("SIGINT", _shutdownOnSignal);
        _sigHandlersRegistered = true;
    }
    _initialized = true;
    if (options.debug) {
        logger13.info("Neatlogs SDK initialized successfully");
        logger13.info(`Endpoint: ${endpoint}`);
        logger13.info(`Workflow: ${resolvedWorkflowName}`);
        logger13.info(`Session: ${sessionId ?? "(none)"}`);
        logger13.info(`User: ${options.userId ?? "(none)"}`);
        logger13.info(`Tags: ${tags ?? []}`);
        logger13.info(`Instrumentations: ${manager.instrumented.join(", ") || "(none)"}`);
        logger13.info(`Sample Rate: ${options.sampleRate ?? 1}`);
    }
}
async function flush() {
    let success = true;
    if (_tracerProvider) {
        try {
            logger13.debug("Flushing tracer provider...");
            await _tracerProvider.forceFlush();
            logger13.debug("Tracer provider flushed successfully");
        } catch (e) {
            logger13.error(`Error flushing spans: ${e}`);
            success = false;
        }
    }
    if (_meterProvider) {
        try {
            logger13.debug("Flushing meter provider...");
            await _meterProvider.forceFlush();
            logger13.debug("Meter provider flushed successfully");
        } catch (e) {
            logger13.error(`Error flushing metrics: ${e}`);
            success = false;
        }
    }
    if (_logSpanExporter) {
        try {
            logger13.debug("Flushing log span exporter...");
            await _logSpanExporter.flush();
            logger13.debug("Log span exporter flushed successfully");
        } catch (e) {
            logger13.error(`Error flushing logs: ${e}`);
            success = false;
        }
    }
    return success;
}
async function shutdown() {
    if (_sigHandlersRegistered) {
        process.removeListener("beforeExit", _shutdownOnSignal);
        process.removeListener("SIGTERM", _shutdownOnSignal);
        process.removeListener("SIGINT", _shutdownOnSignal);
        _sigHandlersRegistered = false;
    }
    let success = true;
    if (_tracerProvider) {
        try {
            logger13.debug("Shutting down tracer provider...");
            await _tracerProvider.shutdown();
            logger13.debug("Tracer provider shut down successfully");
        } catch (e) {
            logger13.error(`Error shutting down tracer provider: ${e}`);
            success = false;
        }
    }
    if (_meterProvider) {
        try {
            logger13.debug("Shutting down meter provider...");
            await _meterProvider.shutdown();
            logger13.debug("Meter provider shut down successfully");
        } catch (e) {
            logger13.error(`Error shutting down meter provider: ${e}`);
            success = false;
        }
    }
    if (_logProvider) {
        try {
            logger13.debug("Shutting down log provider...");
            await _logProvider.shutdown();
            logger13.debug("Log provider shut down successfully");
        } catch (e) {
            logger13.error(`Error shutting down log provider: ${e}`);
            success = false;
        }
    }
    if (_logSpanExporter) {
        try {
            logger13.debug("Shutting down log span exporter...");
            await _logSpanExporter.shutdown();
            logger13.debug("Log span exporter shut down successfully");
        } catch (e) {
            logger13.error(`Error shutting down log span exporter: ${e}`);
            success = false;
        }
    }
    _initialized = false;
    _tracerProvider = null;
    _meterProvider = null;
    _logProvider = null;
    _logSpanExporter = null;
    _spanProcessor = null;
    _debugMode2 = false;
    _setSessionConfig({});
    logger13.info("Neatlogs SDK shutdown complete");
    return success;
}
function getTracerProvider() {
    if (!_tracerProvider) {
        throw new Error("Neatlogs is not initialized. Call init() before accessing the TracerProvider.");
    }
    return _tracerProvider;
}
function isDebugEnabled() {
    return _debugMode2;
}
// src/decorators/orchestration.ts
var logger14 = getLogger();
function span(options, fn) {
    if (!VALID_SPAN_KINDS.has(options.kind)) {
        throw new Error(`Invalid span kind: '${options.kind}'. Must be one of: ${[
            ...VALID_SPAN_KINDS
        ].join(", ")}`);
    }
    const decorateOpts = {
        ...options
    };
    switch(options.kind){
        case "AGENT":
            decorateOpts.postprocessResult = _agentPostprocessor(options);
            break;
        case "TOOL":
            decorateOpts.postprocessResult = _toolPostprocessor(options);
            break;
        case "EMBEDDING":
            decorateOpts.postprocessResult = _embeddingPostprocessor(options);
            break;
        case "RETRIEVER":
            decorateOpts.postprocessResult = retrieverPostprocessor;
            break;
        case "MCP_TOOL":
            return _createMcpToolWrapper(options, fn);
        default:
            break;
    }
    return decorateSpan(decorateOpts, fn);
}
function _agentPostprocessor(options) {
    return (span2, _result, _boundInputs)=>{
        if (options.role) {
            span2.setAttribute("neatlogs.agent.role", options.role);
        }
        if (options.goal) {
            span2.setAttribute("neatlogs.agent.goal", options.goal);
        }
    };
}
function _toolPostprocessor(options) {
    return (span2, _result, _boundInputs)=>{
        if (options.toolName) {
            span2.setAttribute("tool.name", options.toolName);
        }
        if (options.parameters) {
            span2.setAttribute("tool.parameters", safeJsonDumps(options.parameters));
        }
    };
}
function _embeddingPostprocessor(options) {
    return (span2, _result, _boundInputs)=>{
        if (options.model) {
            span2.setAttribute("embedding.model_name", options.model);
        }
        if (options.dimension) {
            span2.setAttribute("embedding.dimension", options.dimension);
        }
    };
}
function retrieverPostprocessor(span2, result, boundInputs) {
    for (const key of [
        "query",
        "question",
        "text"
    ]){
        if (key in boundInputs && typeof boundInputs[key] === "string") {
            span2.setAttribute("retrieval.query", boundInputs[key]);
            break;
        }
    }
    let docs = null;
    if (Array.isArray(result)) {
        docs = result;
    } else if (result && typeof result === "object") {
        for (const key of [
            "documents",
            "docs",
            "results"
        ]){
            if (Array.isArray(result[key])) {
                docs = result[key];
                break;
            }
        }
    }
    if (!docs) return;
    const maxDocs = Math.min(docs.length, 20);
    for(let i = 0; i < maxDocs; i++){
        const doc = docs[i];
        const prefix = `retrieval.documents.${i}.document`;
        if (typeof doc === "string") {
            span2.setAttribute(`${prefix}.content`, doc);
        } else if (doc && typeof doc === "object") {
            if (doc.content || doc.page_content || doc.text) {
                span2.setAttribute(`${prefix}.content`, doc.content ?? doc.page_content ?? doc.text);
            }
            if (doc.id) {
                span2.setAttribute(`${prefix}.id`, String(doc.id));
            }
            if (doc.score !== void 0) {
                span2.setAttribute(`${prefix}.score`, doc.score);
            }
            if (doc.metadata) {
                span2.setAttribute(`${prefix}.metadata`, safeJsonDumps(doc.metadata));
            }
        }
    }
}
function _createMcpToolWrapper(options, fn) {
    const decorateOpts = {
        ...options,
        postprocessResult: (span2, result, boundInputs)=>{
            if (options.toolName) {
                span2.setAttribute("mcp.tool.name", options.toolName);
                span2.setAttribute("tool.name", options.toolName);
            }
            if (options.parameters) {
                span2.setAttribute("mcp.tool.parameters", safeJsonDumps(options.parameters));
                span2.setAttribute("tool.parameters", safeJsonDumps(options.parameters));
            }
            if (options.toolJsonSchema) {
                span2.setAttribute("tool.json_schema", safeJsonDumps(options.toolJsonSchema));
            }
            if (typeof result === "string") {
                span2.setAttribute("output.value", safeJsonDumps({
                    result
                }));
            }
            if (boundInputs && Object.keys(boundInputs).length > 0) {
                const firstArg = Object.values(boundInputs)[0];
                if (firstArg && typeof firstArg === "object") {
                    const serialized = typeof firstArg.toJSON === "function" ? firstArg.toJSON() : serializeObj(firstArg);
                    span2.setAttribute("mcp.tool.input", safeJsonDumps(serialized));
                }
            }
        }
    };
    return decorateSpan(decorateOpts, fn);
}
function Span(options) {
    return function(target, context3) {
        span(options, target);
        function decoratorWrapper(...args) {
            const boundTarget = target.bind(this);
            const wrapped = span(options, boundTarget);
            return wrapped(...args);
        }
        Object.defineProperty(decoratorWrapper, "name", {
            value: context3.name,
            configurable: true
        });
        return decoratorWrapper;
    };
}
// src/mastra.ts
var _cached = null;
async function getMastraObservability() {
    if (_cached) return _cached;
    const tracerProvider = getTracerProvider();
    let createFn;
    try {
        const mod = await __turbopack_context__.A("[project]/Projects/neatlogs-typescript/examples/sdk_examples/gemini-chatbot/node_modules/.pnpm/@neatlogs+instrumentation-mastra@0.1.2_edb8190726b9c0715a2b14c366f33bbd/node_modules/@neatlogs/instrumentation-mastra/dist/esm/index.js [instrumentation] (ecmascript, async loader)");
        createFn = mod.createNeatlogsMastraObservability;
    } catch  {
        throw new Error("@neatlogs/instrumentation-mastra is required for getMastraObservability(). Install it with: npm install @neatlogs/instrumentation-mastra");
    }
    const { observability } = await createFn(tracerProvider);
    _cached = observability;
    return _cached;
}
;
var TRACER_NAME2 = "neatlogs.ai-sdk";
function createAITelemetry(opts = {}) {
    const userMeta = opts.metadata ?? {};
    return {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        tracer: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getTracer(TRACER_NAME2),
        metadata: {
            ...userMeta,
            neatlogsWrapped: true
        }
    };
}
function safeStringify2(value) {
    try {
        return JSON.stringify(value);
    } catch  {
        return "";
    }
}
function setInputValue(span2, opts) {
    if (opts && ("prompt" in opts || "messages" in opts)) {
        const input = opts.messages ?? opts.prompt;
        const stringified2 = safeStringify2(input);
        if (stringified2) {
            span2.setAttribute("input.value", stringified2);
        }
        return;
    }
    const stringified = safeStringify2(opts);
    if (stringified) {
        span2.setAttribute("input.value", stringified);
    }
}
function setOutputValue(span2, result) {
    if (result && typeof result === "object") {
        const r = result;
        if ("text" in r && "finishReason" in r) {
            const text = String(r.text ?? "");
            if (text) {
                span2.setAttribute("output.value", text);
            }
            if (r.finishReason) {
                span2.setAttribute("gen_ai.finish_reason", String(r.finishReason));
            }
            return;
        }
    }
    const stringified = safeStringify2(result);
    if (stringified) {
        span2.setAttribute("output.value", stringified);
    }
}
var WRAPPED_FUNCTIONS = [
    "generateText",
    "streamText",
    "generateObject",
    "streamObject",
    "embed",
    "embedMany",
    "rerank"
];
function wrapAISDK(aiModule) {
    const wrapped = {
        ...aiModule
    };
    for (const name of WRAPPED_FUNCTIONS){
        const original = aiModule[name];
        if (typeof original !== "function") continue;
        if (name === "streamText" || name === "streamObject") {
            wrapped[name] = createSyncWrapper(name, original);
        } else {
            wrapped[name] = createAsyncWrapper(name, original);
        }
    }
    return wrapped;
}
function rootSpanKind(name) {
    if (name === "embed" || name === "embedMany" || name === "rerank") return "CHAIN";
    return "WORKFLOW";
}
function getParentContext() {
    const activeSpan = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getActiveSpan();
    if (activeSpan) {
        const instrScope = activeSpan.instrumentationLibrary?.name ?? "";
        if (instrScope === "next.js") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2f$context$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["ROOT_CONTEXT"];
        }
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$context$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["context"].active();
}
function createAsyncWrapper(name, original) {
    return async function wrappedAsyncFn(opts) {
        const tracer = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getTracer(TRACER_NAME2);
        return tracer.startActiveSpan(`ai.${name}`, {
            attributes: {
                "openinference.span.kind": rootSpanKind(name)
            }
        }, getParentContext(), async (span2)=>{
            try {
                const isEmbedOrRerank = name === "embed" || name === "embedMany" || name === "rerank";
                if (!isEmbedOrRerank) {
                    setInputValue(span2, opts);
                }
                if (name === "rerank" && opts?.query) {
                    span2.setAttribute("ai.rerank.query", String(opts.query));
                }
                const merged = mergeTelemetry(opts);
                const result = await original(merged);
                if (!isEmbedOrRerank) {
                    setOutputValue(span2, result);
                }
                return result;
            } catch (err) {
                recordSpanError(span2, err);
                throw err;
            } finally{
                span2.end();
            }
        });
    };
}
function createSyncWrapper(name, original) {
    return function wrappedSyncFn(opts) {
        const tracer = __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2d$api$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["trace"].getTracer(TRACER_NAME2);
        return tracer.startActiveSpan(`ai.${name}`, {
            attributes: {
                "openinference.span.kind": rootSpanKind(name)
            }
        }, getParentContext(), (span2)=>{
            try {
                setInputValue(span2, opts);
                const merged = mergeTelemetry(opts);
                const result = original(merged);
                return result;
            } catch (err) {
                recordSpanError(span2, err);
                throw err;
            } finally{
                span2.end();
            }
        });
    };
}
function mergeTelemetry(opts) {
    const baseTelemetry = createAITelemetry({
        metadata: opts?.experimental_telemetry?.metadata
    });
    return {
        ...opts,
        experimental_telemetry: {
            ...opts?.experimental_telemetry,
            ...baseTelemetry
        }
    };
}
function recordSpanError(span2, err) {
    if (err instanceof Error) {
        span2.setStatus({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].ERROR,
            message: err.message
        });
        span2.recordException(err);
    } else {
        span2.setStatus({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$Projects$2f$neatlogs$2d$typescript$2f$examples$2f$sdk_examples$2f$gemini$2d$chatbot$2f$node_modules$2f2e$pnpm$2f40$opentelemetry$2b$api$40$1$2e$9$2e$1$2f$node_modules$2f40$opentelemetry$2f$api$2f$build$2f$esm$2f$trace$2f$status$2e$js__$5b$instrumentation$5d$__$28$ecmascript$29$__["SpanStatusCode"].ERROR,
            message: String(err)
        });
    }
}
// src/core/llm-binder.ts
var logger15 = getLogger();
function bindTemplates(llm, systemTpl, userTpl, compiledVars) {
    const systemStr = String(systemTpl.template);
    const userStr = userTpl ? String(userTpl.template) : null;
    let llmCopy;
    try {
        llmCopy = Object.create(Object.getPrototypeOf(llm), Object.getOwnPropertyDescriptors(llm));
    } catch  {
        try {
            llmCopy = structuredClone(llm);
        } catch  {
            llmCopy = llm;
            logger15.debug(`LLM type ${llm?.constructor?.name ?? "unknown"} is not copyable \u2014 binding in place.`);
        }
    }
    let methodName;
    if (typeof llmCopy.invoke === "function") {
        methodName = "invoke";
    } else if (typeof llmCopy.call === "function") {
        methodName = "call";
    } else {
        logger15.warn(`LLM type ${llm?.constructor?.name ?? "unknown"} has neither invoke() nor call() \u2014 prompt templates will not be captured on spans.`);
        return llmCopy;
    }
    const originalMethod = llmCopy[methodName].bind(llmCopy);
    llmCopy[methodName] = function wrappedWithTemplates(...args) {
        systemTpl.compile();
        if (userTpl && compiledVars) {
            userTpl.compile(compiledVars);
        }
        try {
            return originalMethod(...args);
        } finally{
            PromptContext.clear();
            if (userTpl && compiledVars) {
                UserPromptContext.clear();
            }
        }
    };
    logger15.debug(`Wrapped ${llm?.constructor?.name ?? "unknown"}.${methodName}() with template injection.`);
    return llmCopy;
}
;
 //# sourceMappingURL=index.mjs.map
}),
];

//# sourceMappingURL=8c414_neatlogs_dist_index_mjs_a6765e91._.js.map