// Ambient declarations for OPTIONAL peer dependencies that may not be installed
// at build time. These are loaded via dynamic import() behind try/catch at
// runtime (see src/mastra.ts), so the SDK works without them — but the DTS
// build needs a type for the module specifier or it fails to emit declarations.
declare module '@neatlogs/instrumentation-mastra' {
  export function createNeatlogsMastraObservability(
    tracerProvider: unknown,
    options?: unknown,
  ): Promise<{ observability: unknown; exporter: unknown }>;
  // Allow any other named exports without typing them.
  const _default: unknown;
  export default _default;
}
