/**
 * Neatlogs opencode plugin registration.
 *
 * opencode auto-loads plugin files from `.opencode/plugin/*.ts` (project) or
 * `~/.config/opencode/plugin/*.ts` (global). This file simply re-exports the
 * Neatlogs plugin as the default export, which opencode invokes on startup.
 *
 * Set NEATLOGS_API_KEY in the environment before launching opencode. The plugin
 * bootstraps Neatlogs tracing itself (it runs inside opencode's process), so no
 * init() call is needed here. Every opencode session then produces a trace with
 * LLM spans (per assistant turn) and TOOL spans (per tool execution), keyed by
 * the opencode session id as neatlogs.conversation.id.
 *
 * Optional env:
 *   NEATLOGS_WORKFLOW_NAME           logical grouping (default: "opencode")
 *   NEATLOGS_CAPTURE_SYSTEM_PROMPT   "true" to capture the system prompt
 */

export { NeatlogsOpencodePlugin as default } from 'neatlogs/opencode';
