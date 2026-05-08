import { init, Span, flush, shutdown } from 'neatlogs';

process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/span_decorator_native_probe_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/span_decorator_native_probe_processed_spans.jsonl';

const workflowName = `${process.env.NEATLOGS_WORKFLOW_PREFIX ?? ''}span_decorator_native_probe`;

class NativeDecoratorAgent {
  @Span({ kind: 'WORKFLOW', name: workflowName, description: 'Native @Span decorator probe' })
  async run(topic: string) {
    const summary = await this.research(topic);
    return { topic, summary };
  }

  @Span({ kind: 'AGENT', name: 'native_decorated_research_agent', role: 'researcher' })
  async research(topic: string) {
    return `Native decorator probe for ${topic}`;
  }
}

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'https://staging-cloud.neatlogs.com',
    workflowName,
    tags: ['typescript-skill-run', 'span-decorator-native-probe'],
    debug: true,
  });

  const agent = new NativeDecoratorAgent();
  const result = await agent.run('stage 3 TypeScript decorators');
  console.log('[span-decorator-native-probe] result', JSON.stringify(result));

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error('[span-decorator-native-probe] failed', err);
  process.exitCode = 1;
});
