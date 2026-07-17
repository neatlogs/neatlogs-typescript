/**
 * @deprecated Use `wrapMastra()` from `neatlogs/mastra`.
 *
 * The current `@neatlogs/instrumentation-mastra`
 * bridge activates its spans on the GLOBAL OpenTelemetry context
 * (`context.active()` / `context.with()`), so a foreign co-tenant (Datadog, …)
 * can still parent or be parented by Mastra's spans in both directions — the
 * private provider alone cannot isolate that. Until the bridge is redesigned to
 * accept the injected Neatlogs private-context runtime, use the explicit
 * `wrapMastra()` wrapper instead.
 */
export async function getMastraObservability(): Promise<any> {
  throw new Error(
    'getMastraObservability() is not supported because the ' +
      '@neatlogs/instrumentation-mastra bridge activates spans on the global ' +
      'OpenTelemetry context, which cannot be isolated from other tracing SDKs ' +
      '(Datadog, etc.).\n\n' +
      "Use wrapMastra() from 'neatlogs/mastra' instead.",
  );
}

/** @internal Legacy lifecycle hook retained until this export is removed. */
export function _resetMastraCache(): void {
  // Kept as an internal lifecycle hook until the legacy bridge export is
  // removed in the next major release.
}
