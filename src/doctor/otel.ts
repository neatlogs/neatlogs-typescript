/**
 * Neatlogs trace doctor — OTel GenAI semconv validation + token-waste patterns.
 *
 * PR #21 additions. Both walks share the same LLM-kind predicate
 * (`isLlmKind()`), which returns true if either the neatlogs `kind=llm` is
 * set OR an OTel `gen_ai.operation.name` in `OTEL_GENAI_LLM_OPERATIONS` is
 * present. This makes the checks portable across wrappers that have fully
 * migrated to OTel GenAI semconv and wrappers that still use the neatlogs
 * namespaced attrs.
 *
 * Reference: https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md
 *
 * §12.8.2 (PR #21 review): the OTel GenAI walker MUST check `isLlmKind()`
 * BEFORE looking at `neatlogs.span.kind` and `gen_ai.operation.name`
 * separately. A span with `neatlogs.span.kind == "tool"` and
 * `gen_ai.operation.name == "chat"` is a tool span, not an LLM span, and
 * must be skipped regardless of the OTel op-name. The isLlmKind()
 * predicate checks `neatlogs.span.kind == "llm"` OR the OTel op is in the
 * LLM set — if neatlogs says "tool", the span is not LLM-kind and we skip.
 */

import {
  DoctorFinding,
  type SpanDict,
  OTEL_GENAI_OPERATION_NAME,
  OTEL_GENAI_LLM_OPERATIONS,
  OVERSIZED_PROMPT_CHAR_THRESHOLD,
  REPEATED_SYSTEM_PROMPT_THRESHOLD,
} from './types.js';
import { isInternal, truncate } from './visibility.js';
import { readAttrs } from './io-checks.js';

// ---------------------------------------------------------------------------
// Shared LLM-kind predicate
// ---------------------------------------------------------------------------

/**
 * True if the span represents an LLM operation, either by neatlogs kind
 * or by OTel `gen_ai.operation.name`.
 *
 * Order matters: a tool span with `gen_ai.operation.name == "chat"` is
 * still a tool span, not an LLM span. So the neatlogs-kind check (when
 * present and equal to "llm") takes precedence; the OTel fallback only
 * applies when the neatlogs kind is absent or not "llm".
 */
export function isLlmKind(span: SpanDict): boolean {
  const attrs = readAttrs(span);
  if (attrs['neatlogs.span.kind'] === 'llm') return true;
  const op = attrs[OTEL_GENAI_OPERATION_NAME];
  if (typeof op === 'string' && OTEL_GENAI_LLM_OPERATIONS.has(op)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// OTel GenAI findings (§4.16.A)
// ---------------------------------------------------------------------------

/**
 * Validate that LLM-kind spans also carry OTel GenAI semconv attrs.
 *
 * Two findings:
 * - `otel-genai-missing` (warning): LLM span has no `gen_ai.operation.name`.
 *   Trace won't be interoperable with OTel GenAI tools (Langfuse, Phoenix,
 *   Arize) that filter on `gen_ai.*`.
 * - `otel-genai-inconsistent` (info): span has BOTH neatlogs and OTel attrs
 *   but they disagree (e.g. neatlogs=llm vs OTel=embeddings). Signals a
 *   wrapper bug or a migration in progress.
 *
 * Internal spans are excluded. Foreign-scope spans are also implicitly
 * excluded because `isLlmKind` requires neatlogs `kind=llm` OR an OTel
 * chat-style op-name; foreign wrappers usually have neither.
 */
export function otelGenaiFindings(
  visible: readonly SpanDict[],
  traceId: string,
  runId: string,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  let missingCount = 0;
  for (const span of visible) {
    if (isInternal(span)) continue;
    if (!isLlmKind(span)) continue;
    const attrs = readAttrs(span);
    const otelOp = attrs[OTEL_GENAI_OPERATION_NAME];
    if (otelOp === undefined || otelOp === null) {
      missingCount += 1;
      continue;
    }
    // Both present: if neatlogs says "llm" and the OTel op is NOT one of
    // the LLM operations, the kinds disagree — flag the inconsistency.
    if (attrs['neatlogs.span.kind'] === 'llm' && typeof otelOp === 'string') {
      if (!OTEL_GENAI_LLM_OPERATIONS.has(otelOp)) {
        findings.push(
          new DoctorFinding({
            severity: 'info',
            code: 'otel-genai-inconsistent',
            title:
              'LLM span has mismatched neatlogs/OTel GenAI operation kind',
            evidence: `span '${truncate(span.name ?? '<unnamed>')}' has neatlogs.span.kind='llm' but ${OTEL_GENAI_OPERATION_NAME}='${otelOp}'`,
            suggestion:
              'Update the wrapper so the neatlogs span kind and the OTel GenAI operation name agree. Reference: https://opentelemetry.io/docs/specs/semconv/gen-ai/',
            traceId,
            runId,
            fixClass: 'config',
            relatedCodes: ['missing-span-kind'],
          }),
        );
      }
    }
  }
  if (missingCount > 0) {
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'otel-genai-missing',
        title: 'LLM span(s) lack OTel GenAI semantic-convention attributes',
        evidence: `${missingCount} LLM span(s) missing ${OTEL_GENAI_OPERATION_NAME}. Langfuse, Phoenix, and other OTel GenAI tools will skip these.`,
        suggestion:
          'Set the OTel GenAI attributes on every LLM span. The SDK does this automatically when the span is created via the OTel GenAI instrumentation (e.g. opentelemetry-instrumentation-openai). Reference: https://opentelemetry.io/docs/specs/semconv/gen-ai/',
        traceId,
        runId,
        fixClass: 'config',
        relatedCodes: ['otel-genai-inconsistent'],
      }),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Token-waste findings (§4.16.B)
// ---------------------------------------------------------------------------

/**
 * Total character count of an LLM span's prompt content.
 *
 * Walks the standard locations:
 * - `gen_ai.input.messages` (OTel semconv, list of message dicts)
 * - `neatlogs.llm.input_messages.*` (neatlogs-namespaced; concatenated)
 * - `neatlogs.llm.prompts.*` (older neatlogs layout; concatenated)
 * - `neatlogs.llm.system` (just the system prompt)
 *
 * Returns 0 if no prompt content is found.
 */
export function llmPromptSize(span: SpanDict): number {
  const attrs = readAttrs(span);
  let n = 0;
  // OTel semconv: list of message dicts
  const msgs = attrs['gen_ai.input.messages'];
  if (Array.isArray(msgs)) {
    for (const m of msgs) {
      if (m && typeof m === 'object') {
        const content = (m as Record<string, unknown>)['content'];
        if (typeof content === 'string') {
          n += content.length;
        } else if (Array.isArray(content)) {
          // content can be a list of {type, text} dicts
          for (const part of content) {
            if (part && typeof part === 'object') {
              const text = (part as Record<string, unknown>)['text'];
              if (typeof text === 'string') n += text.length;
            }
          }
        }
      }
    }
  }
  // neatlogs namespaced: each numbered attribute holds a serialized message
  for (const prefix of ['neatlogs.llm.input_messages.', 'neatlogs.llm.prompts.']) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith(prefix) && typeof v === 'string') {
        n += v.length;
      }
    }
  }
  const sys = attrs['neatlogs.llm.system'];
  if (typeof sys === 'string') n += sys.length;
  return n;
}

/**
 * Return the system prompt text for an LLM span, or None.
 *
 * Looks at `neatlogs.llm.system` (neatlogs) and the first
 * `gen_ai.system_instructions` (OTel semconv) message. For the OTel form,
 * the content may be a string OR a list of `{type, text}` parts, joined
 * with `\n`.
 */
export function llmSystemPrompt(span: SpanDict): string | null {
  const attrs = readAttrs(span);
  const sys = attrs['neatlogs.llm.system'];
  if (typeof sys === 'string' && sys) return sys;
  const si = attrs['gen_ai.system_instructions'];
  if (Array.isArray(si) && si.length > 0) {
    const parts: string[] = [];
    for (const m of si) {
      if (m && typeof m === 'object') {
        const content = (m as Record<string, unknown>)['content'];
        if (typeof content === 'string') {
          parts.push(content);
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part && typeof part === 'object') {
              const text = (part as Record<string, unknown>)['text'];
              if (typeof text === 'string') parts.push(text);
            }
          }
        }
      }
    }
    if (parts.length > 0) return parts.join('\n');
  }
  return null;
}

/**
 * Return the set of tool names defined on an LLM span, or empty.
 *
 * Reads:
 * - `gen_ai.tool.definitions` (OTel semconv, list of {name, ...} dicts)
 * - `neatlogs.llm.tools` (JSON string, list of {function: {name, ...}} dicts)
 */
export function llmToolDefinitions(span: SpanDict): Set<string> {
  const attrs = readAttrs(span);
  const out = new Set<string>();
  const td = attrs['gen_ai.tool.definitions'];
  if (Array.isArray(td)) {
    for (const t of td) {
      if (t && typeof t === 'object') {
        const name = (t as Record<string, unknown>)['name'];
        if (typeof name === 'string') out.add(name);
      }
    }
  }
  const tools = attrs['neatlogs.llm.tools'];
  if (typeof tools === 'string' && tools) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(tools);
    } catch {
      parsed = null;
    }
    if (Array.isArray(parsed)) {
      for (const t of parsed) {
        if (t && typeof t === 'object') {
          const fn = (t as Record<string, unknown>)['function'];
          if (fn && typeof fn === 'object') {
            const name = (fn as Record<string, unknown>)['name'];
            if (typeof name === 'string') out.add(name);
          } else {
            const name = (t as Record<string, unknown>)['name'];
            if (typeof name === 'string') out.add(name);
          }
        }
      }
    }
  }
  return out;
}

/**
 * Return the set of tool names called in this span (assistant message).
 *
 * Reads:
 * - OTel: `gen_ai.output.messages` with `tool_calls[*].function.name`
 * - neatlogs: each `neatlogs.llm.tool_calls.*` is a JSON string of
 *   `{function: {name, ...}}`. Parsed with try/except.
 */
export function llmToolCalls(span: SpanDict): Set<string> {
  const attrs = readAttrs(span);
  const out = new Set<string>();
  const msgs = attrs['gen_ai.output.messages'];
  if (Array.isArray(msgs)) {
    for (const m of msgs) {
      if (!m || typeof m !== 'object') continue;
      const toolCalls = (m as Record<string, unknown>)['tool_calls'];
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          if (tc && typeof tc === 'object') {
            const fn = (tc as Record<string, unknown>)['function'];
            if (fn && typeof fn === 'object') {
              const name = (fn as Record<string, unknown>)['name'];
              if (typeof name === 'string') out.add(name);
            }
          }
        }
      }
    }
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('neatlogs.llm.tool_calls.') && typeof v === 'string') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(v);
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed === 'object') {
        const fn = (parsed as Record<string, unknown>)['function'];
        if (fn && typeof fn === 'object') {
          const name = (fn as Record<string, unknown>)['name'];
          if (typeof name === 'string') out.add(name);
        }
      }
    }
  }
  return out;
}

/**
 * Detect token-waste patterns in LLM spans.
 *
 * Three findings:
 * - `oversized-prompt` (warning): a single LLM span's prompt exceeds
 *   `OVERSIZED_PROMPT_CHAR_THRESHOLD` chars.
 * - `repeated-system-prompt` (info, PII-gated): the same system prompt
 *   content appears `REPEATED_SYSTEM_PROMPT_THRESHOLD`+ times. Only
 *   checked when `readPromptContent=True` (PII concern).
 * - `unused-tool-definition` (info): a tool defined on an LLM span is
 *   never called in any subsequent span.
 *
 * Internal spans are excluded.
 */
export function tokenWasteFindings(
  visible: readonly SpanDict[],
  traceId: string,
  runId: string,
  readPromptContent: boolean,
): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const oversized: string[] = [];
  const systemPromptCounts = new Map<string, number>();
  const allDefinedTools = new Set<string>();
  const allCalledTools = new Set<string>();

  for (const span of visible) {
    if (isInternal(span)) continue;
    if (!isLlmKind(span)) continue;
    const name = String(span.name ?? '<unnamed>');
    // Oversized check — always runs, no PII.
    const size = llmPromptSize(span);
    if (size > OVERSIZED_PROMPT_CHAR_THRESHOLD) {
      oversized.push(`${name} (${size} chars)`);
    }
    // Repeated system-prompt — only with opt-in (PII).
    if (readPromptContent) {
      const sys = llmSystemPrompt(span);
      if (sys !== null) {
        systemPromptCounts.set(sys, (systemPromptCounts.get(sys) ?? 0) + 1);
      }
    }
    // Tool definitions vs. calls — no PII (just tool names).
    for (const t of llmToolDefinitions(span)) allDefinedTools.add(t);
    for (const t of llmToolCalls(span)) allCalledTools.add(t);
  }

  if (oversized.length > 0) {
    const examples = oversized.slice(0, 3).map((s) => truncate(s)).join(', ');
    const suffix = oversized.length > 3 ? ' ...' : '';
    findings.push(
      new DoctorFinding({
        severity: 'warning',
        code: 'oversized-prompt',
        title: 'LLM span(s) have oversized prompt content',
        evidence: `${oversized.length} LLM span(s) exceed ${OVERSIZED_PROMPT_CHAR_THRESHOLD} chars in prompt: ${examples}${suffix}`,
        suggestion:
          "Almost certainly a bug: usually a leaked retrieved document, CSV, or log dump. Cap the prompt with the wrapper's max_input_chars or truncate the source data before it reaches the LLM.",
        traceId,
        runId,
        fixClass: 'config',
      }),
    );
  }

  if (readPromptContent) {
    const repeated: Array<[string, number]> = [];
    for (const [text, n] of systemPromptCounts) {
      if (n >= REPEATED_SYSTEM_PROMPT_THRESHOLD) repeated.push([text, n]);
    }
    if (repeated.length > 0) {
      repeated.sort((a, b) => b[1] - a[1]);
      const [topText, topCount] = repeated[0]!;
      findings.push(
        new DoctorFinding({
          severity: 'info',
          code: 'repeated-system-prompt',
          title: 'Same system prompt content sent many times — consider prompt caching',
          evidence: `${repeated.length} distinct system prompt(s) repeated >= ${REPEATED_SYSTEM_PROMPT_THRESHOLD} times. Top repeat: ${topCount} times (${topText.length} chars each).`,
          suggestion:
            "If the system prompt is static, enable your provider's prompt caching (OpenAI cached_prompt_tokens, Anthropic cache_control, Gemini cachedContent). Repeated prefixes over ~1k tokens are usually free or heavily discounted at the provider.",
          traceId,
          runId,
          fixClass: 'config',
        }),
      );
    }
  }

  const unused = Array.from(allDefinedTools).filter((t) => !allCalledTools.has(t)).sort();
  if (unused.length > 0) {
    const examples = unused.slice(0, 3).join(', ');
    const suffix = unused.length > 3 ? ' ...' : '';
    findings.push(
      new DoctorFinding({
        severity: 'info',
        code: 'unused-tool-definition',
        title: 'Tool(s) defined in prompt but never called',
        evidence: `${unused.length} tool(s) defined but not called: ${examples}${suffix}`,
        suggestion:
          'Either the model chose not to call them (drop them from the prompt to save tokens) or the wrapper is silently dropping tool calls (check the wrapper\'s tool-call routing).',
        traceId,
        runId,
        fixClass: 'config',
        relatedCodes: ['missing-span-kind'],
      }),
    );
  }

  return findings;
}
