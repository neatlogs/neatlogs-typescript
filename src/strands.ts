/**
 * Strands currently creates and activates spans through the process-global
 * OpenTelemetry context. Neatlogs always uses a private provider, so this
 * integration is rejected until Strands can accept an injected private-context
 * runtime or Neatlogs ships an explicit wrapper that owns span creation.
 */
export function strandsHooks<T extends object>(_agent: T): T {
  throw new Error(
    'strandsHooks() is not supported because the Strands Agents tracer creates ' +
      'and activates spans on the global OpenTelemetry context ' +
      '(context.active() / context.with()), which cannot be isolated from other ' +
      'tracing SDKs (Datadog, etc.).',
  );
}
