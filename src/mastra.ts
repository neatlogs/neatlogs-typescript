import { getTracerProvider } from './init.js';

let _cached: any = null;

export async function getMastraObservability(): Promise<any> {
  if (_cached) return _cached;

  const tracerProvider = getTracerProvider();

  let createFn: any;
  try {
    const mod = await import('@neatlogs/instrumentation-mastra');
    createFn = mod.createNeatlogsMastraObservability;
  } catch {
    throw new Error(
      '@neatlogs/instrumentation-mastra is required for getMastraObservability(). ' +
        'Install it with: npm install @neatlogs/instrumentation-mastra',
    );
  }

  const { observability } = await createFn(tracerProvider);
  _cached = observability;
  return _cached;
}
