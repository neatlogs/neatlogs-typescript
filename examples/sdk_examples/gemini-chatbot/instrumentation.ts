declare const process: { env: Record<string, string | undefined> };

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('neatlogs');
    await init({
      apiKey: process.env.NEATLOGS_API_KEY ?? '',
      endpoint: "http://localhost:4100",
      workflowName: 'gemini-chatbot',
      debug: true,
    });
  }
}
