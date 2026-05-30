/**
 * Neatlogs Strands Agents integration.
 *
 * Usage:
 *   import { init } from 'neatlogs';
 *   import { strandsHooks } from 'neatlogs/strands';
 *   import { Agent } from '@strands-agents/sdk';
 *
 *   await init({ apiKey, workflowName });   // registers the OTel tracer provider
 *   const agent = strandsHooks(new Agent({ model }));
 *
 * The Strands Agents SDK emits its own OpenTelemetry spans (gen_ai.* semantic
 * conventions) for agent invocations, model calls, and tool calls. Those spans
 * flow into neatlogs automatically once `init()` has registered the global
 * tracer provider — and the neatlogs attribute mapper translates Strands'
 * `gen_ai.*` attributes into the `neatlogs.*` namespace (span kind, tool name,
 * model, token counts, etc.).
 *
 * Because Strands self-instruments and its native tracing cannot be disabled,
 * `strandsHooks()` does NOT emit its own spans — doing so would duplicate every
 * agent/model/tool span. It is a pass-through kept for API symmetry with the
 * other framework integrations: call it (or don't) — `init()` is what enables
 * capture. The function marks the agent so re-wrapping is a no-op.
 */

export function strandsHooks<T extends object>(agent: T): T {
  if (agent && typeof agent === 'object') {
    try {
      Object.defineProperty(agent, '_neatlogs_patched', {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      (agent as any)._neatlogs_patched = true;
    }
  }
  return agent;
}
