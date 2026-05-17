import { describe, it, expect, vi } from 'vitest';

describe('getAISDKWrapper', () => {
  it('throws a friendly error when @neatlogs/instrumentation-ai-sdk is not installed', async () => {
    // Force-fail the dynamic import by mocking the module loader
    vi.resetModules();
    vi.doMock('@neatlogs/instrumentation-ai-sdk', () => {
      throw new Error('not installed');
    });

    const { getAISDKWrapper } = await import('../../src/ai-sdk.js');
    await expect(getAISDKWrapper()).rejects.toThrow(/instrumentation-ai-sdk/);

    vi.doUnmock('@neatlogs/instrumentation-ai-sdk');
  });

  it('returns the wrapAISDK function when the package is available', async () => {
    vi.resetModules();
    const fakeWrap = (m: any) => m;
    vi.doMock('@neatlogs/instrumentation-ai-sdk', () => ({
      wrapAISDK: fakeWrap,
    }));

    const { getAISDKWrapper } = await import('../../src/ai-sdk.js');
    const wrap = await getAISDKWrapper();
    expect(wrap).toBe(fakeWrap);

    vi.doUnmock('@neatlogs/instrumentation-ai-sdk');
  });
});
