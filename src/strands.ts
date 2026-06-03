/**
 * Neatlogs Strands Agents integration.
 *
 * Usage:
 *   import { init } from 'neatlogs';
 *   import { strandsHooks } from 'neatlogs/strands';
 *   import { Agent } from '@strands-agents/sdk';
 *
 *   await init({ apiKey, workflowName });
 *   const agent = strandsHooks(new Agent({ model }));
 *
 * Strands self-instruments via native OpenTelemetry (gen_ai.* spans for agent /
 * model / tool calls), which `init()` captures and the attribute mapper classifies
 * (kind, model, token counts).
 *
 * BUT Strands records prompt/response CONTENT as OTel span EVENTS
 * (gen_ai.user.message, gen_ai.system.message, gen_ai.choice, gen_ai.tool.message,
 * gen_ai.client.inference.operation.details) — not as span attributes. neatlogs
 * renders I/O from attributes, so without help those spans show tokens but EMPTY
 * input/output. `strandsHooks()` installs a single class-level hook on Strands'
 * own `Tracer._addEvent` chokepoint: after Strands records a message/choice event,
 * we also copy its content onto the span as input.value / output.value (+ the LLM
 * message attributes). We do NOT create spans — Strands' native tracing stays the
 * source of truth; we only enrich it. Mirrors the Python SDK's strands hook.
 */

const PATCH_FLAG = '_neatlogs_patched';

export function strandsHooks<T extends object>(agent: T): T {
  // Each Strands Agent constructs its OWN private Tracer (`agent._tracer = new
  // Tracer(...)`), and the Tracer class is NOT publicly exported — so we reach it
  // through the agent instance and patch its `_addEvent` chokepoint. Patching the
  // PROTOTYPE (reached via the instance) covers every agent sharing that class and
  // is idempotent. This is the only access path: the package's exports map blocks
  // deep imports and the top-level index doesn't export Tracer.
  installEventHookFromAgent(agent);

  if (agent && typeof agent === 'object') {
    try {
      Object.defineProperty(agent, PATCH_FLAG, {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      (agent as any)[PATCH_FLAG] = true;
    }
  }
  return agent;
}

function installEventHookFromAgent(agent: any): void {
  const tracer = agent?._tracer;
  const proto = tracer ? Object.getPrototypeOf(tracer) : undefined;
  if (!proto || typeof proto._addEvent !== 'function') return;
  if (proto._addEvent[PATCH_FLAG]) return;

  const orig = proto._addEvent;
  function patchedAddEvent(this: any, span: any, eventName: string, eventAttributes?: Record<string, unknown>) {
    const result = orig.call(this, span, eventName, eventAttributes);
    try {
      enrichSpanFromEvent(span, eventName, eventAttributes || {});
    } catch {
      // never break the agent run over tracing
    }
    return result;
  }
  (patchedAddEvent as any)[PATCH_FLAG] = true;
  proto._addEvent = patchedAddEvent;
}

function enrichSpanFromEvent(
  span: any,
  eventName: string,
  attrs: Record<string, unknown>,
): void {
  if (!span || typeof span.setAttribute !== 'function') return;
  if (typeof span.isRecording === 'function' && !span.isRecording()) return;

  // Classify from the span's own gen_ai.operation.name (set at creation): the same
  // message/choice events fire on chat (LLM), execute_tool (TOOL) and agent spans.
  // We don't set neatlogs.span.kind (the mapper does, from the span name); we only
  // route I/O to the correct namespace so a {span_kind}-templated key isn't needed.
  const isTool = readSpanOp(span) === 'execute_tool';

  // Input-side messages: gen_ai.{system,user,assistant,tool}.message
  if (eventName.startsWith('gen_ai.') && eventName.endsWith('.message')) {
    const role = eventName.slice('gen_ai.'.length, -'.message'.length);
    const content = flattenStrandsContent(attrs.content);
    if (content) {
      if (isTool) {
        span.setAttribute('input.value', content);
        span.setAttribute('neatlogs.tool.input', content);
      } else {
        appendInputMessage(span, role, content);
      }
    }
    return;
  }

  // Output: legacy gen_ai.choice or the latest-convention details event.
  if (eventName === 'gen_ai.choice') {
    const out = flattenStrandsContent(attrs.message);
    if (out) setOutput(span, isTool, out);
    return;
  }
  if (eventName === 'gen_ai.client.inference.operation.details') {
    const out = flattenStrandsContent(attrs['gen_ai.output.messages']);
    if (out) setOutput(span, isTool, out);
  }
}

function setOutput(span: any, isTool: boolean, out: string): void {
  span.setAttribute('output.value', out);
  if (isTool) {
    span.setAttribute('neatlogs.tool.output', out);
  } else {
    span.setAttribute('neatlogs.llm.output_messages.0.role', 'assistant');
    span.setAttribute('neatlogs.llm.output_messages.0.content', out);
    span.setAttribute('neatlogs.llm.output', safeStringify({ role: 'assistant', content: out }));
  }
}

function appendInputMessage(span: any, role: string, content: string): void {
  const idx = (span.__neatlogs_in_idx as number) ?? 0;
  span.setAttribute(`neatlogs.llm.input_messages.${idx}.role`, role);
  span.setAttribute(`neatlogs.llm.input_messages.${idx}.content`, content);
  span.__neatlogs_in_idx = idx + 1;
  const existing: Array<{ role: string; content: string }> = span.__neatlogs_in_msgs ?? [];
  existing.push({ role, content });
  span.__neatlogs_in_msgs = existing;
  const blob = safeStringify({ messages: existing });
  span.setAttribute('input.value', blob);
  // Flat LLM input the backend reads directly (no reliance on {span_kind} mapping).
  span.setAttribute('neatlogs.llm.input', blob);
}

function readSpanOp(span: any): string {
  // OTel spans don't expose attributes publicly; Strands' span objects carry them
  // on `.attributes`. Best-effort read of gen_ai.operation.name.
  try {
    const a = span.attributes;
    if (!a) return '';
    const v = typeof a.get === 'function' ? a.get('gen_ai.operation.name') : a['gen_ai.operation.name'];
    return typeof v === 'string' ? v.toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Strands event content arrives as a JSON string of content blocks
 * ([{text}], [{toolUse|toolResult}], or {role,parts,...}) or a plain string.
 */
function flattenStrandsContent(content: unknown): string {
  if (content == null) return '';
  let val: unknown = content;
  if (typeof val === 'string') {
    const s = val.trim();
    if (!(s.startsWith('[') || s.startsWith('{'))) return val; // already plain text
    try {
      val = JSON.parse(s);
    } catch {
      return val as string;
    }
  }
  return flattenBlocks(val);
}

function flattenBlocks(val: unknown): string {
  const items = Array.isArray(val) ? val : [val];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (!item || typeof item !== 'object') {
      if (item != null) out.push(String(item));
      continue;
    }
    const o = item as Record<string, any>;
    if (typeof o.text === 'string') out.push(o.text);
    else if (typeof o.content === 'string') out.push(o.content);
    else if (o.toolUse) out.push(`${o.toolUse.name ?? 'tool'}(${safeStringify(o.toolUse.input ?? {})})`);
    else if (o.toolResult) out.push(flattenBlocks(o.toolResult.content ?? o.toolResult));
    else if (Array.isArray(o.parts)) out.push(flattenBlocks(o.parts));
    else if (Array.isArray(o.content)) out.push(flattenBlocks(o.content));
    else out.push(safeStringify(o));
  }
  return out.filter(Boolean).join('\n');
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
