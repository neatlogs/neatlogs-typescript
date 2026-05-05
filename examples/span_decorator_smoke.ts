import { init, Span, flush, shutdown } from 'neatlogs';

process.env.NEATLOGS_LOG_RAW_SPANS = 'true';
process.env.NEATLOGS_LOG_SPANS = 'true';
process.env.NEATLOGS_LOG_RAW_SPANS_FILE = 'logs/span_decorator_smoke_raw_spans.jsonl';
process.env.NEATLOGS_LOG_SPANS_FILE = 'logs/span_decorator_smoke_processed_spans.jsonl';

const workflowName = `${process.env.NEATLOGS_WORKFLOW_PREFIX ?? ''}span_decorator_smoke`;

class SkillDecoratorAgent {
  async run(topic: string) {
    const summary = await this.research(topic);
    const score = this.score(summary);
    return { topic, summary, score };
  }

  async research(topic: string) {
    return `Skill-file decorator smoke research for ${topic}`;
  }

  score(text: string) {
    return Math.min(100, text.length);
  }
}

function applySpanDecorator<T extends (...args: any[]) => any>(
  instance: object,
  methodName: string,
  options: Parameters<typeof Span>[0],
) {
  const original = ((instance as any)[methodName] as T).bind(instance);
  const context: ClassMethodDecoratorContext = {
    kind: 'method',
    name: methodName,
    static: false,
    private: false,
    access: { has: (obj) => methodName in Object(obj), get: (obj) => (obj as any)[methodName] },
    addInitializer: () => {},
    metadata: {},
  };
  const wrapped = Span(options)(original, context).bind(instance) as T;
  (instance as any)[methodName] = wrapped;
}

async function main() {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY ?? '',
    endpoint: process.env.NEATLOGS_ENDPOINT ?? 'https://staging-cloud.neatlogs.com',
    workflowName,
    tags: ['typescript-skill-run', 'span-decorator-smoke'],
    debug: true,
  });

  // Runtime probe note: TSX's native Stage 3 decorator transform currently drops
  // `this` for this SDK decorator shape. To validate the exported Span()
  // decorator implementation end-to-end without changing repo code, apply the
  // same TC39 decorator function manually and bind it to the instance.
  const agent = new SkillDecoratorAgent();
  applySpanDecorator(agent, 'run', { kind: 'WORKFLOW', name: workflowName, description: 'Stage 3 decorator workflow smoke test' });
  applySpanDecorator(agent, 'research', { kind: 'AGENT', name: 'decorated_research_agent', role: 'researcher' });
  applySpanDecorator(agent, 'score', { kind: 'TOOL', name: 'decorated_score_tool', toolName: 'decorated_score_tool' });

  const result = await agent.run('stage 3 TypeScript decorators');
  console.log('[span-decorator-smoke] result', JSON.stringify(result));

  await flush();
  await shutdown();
}

main().catch((err) => {
  console.error('[span-decorator-smoke] failed', err);
  process.exitCode = 1;
});
