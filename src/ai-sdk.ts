/**
 * Shim that re-exports `wrapAISDK` from the optional
 * `@neatlogs/instrumentation-ai-sdk` package, mirroring the pattern in
 * src/mastra.ts.
 */

let _cached: ((aiModule: any) => any) | null = null;

export async function getAISDKWrapper(): Promise<(aiModule: any) => any> {
  if (_cached) return _cached;

  let wrap: ((aiModule: any) => any) | undefined;
  try {
    // Cast through unknown because the package is an optional peer dep that may
    // not be installed in the consuming project. Module resolution is checked
    // at runtime, not compile time.
    const mod = (await import(
      '@neatlogs/instrumentation-ai-sdk' as string
    )) as { wrapAISDK?: (aiModule: any) => any };
    wrap = mod.wrapAISDK;
  } catch {
    throw new Error(
      '@neatlogs/instrumentation-ai-sdk is required for getAISDKWrapper(). ' +
        'Install it with: npm install @neatlogs/instrumentation-ai-sdk',
    );
  }

  if (typeof wrap !== 'function') {
    throw new Error(
      '@neatlogs/instrumentation-ai-sdk loaded but does not export wrapAISDK. ' +
        'Upgrade the package to a version that exports it.',
    );
  }

  _cached = wrap;
  return wrap;
}
