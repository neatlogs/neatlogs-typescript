/**
 * Token usage extraction and cost calculation.
 *
 * Port of Python neatlogs/core/metrics_correlation.py
 *
 * The Python module is primarily an OTel metrics proxy that attaches metric
 * data points to the current trace/span. The TypeScript port focuses on the
 * token-usage extraction and cost-calculation utilities that are consumed by
 * the attribute processor.
 */

// ────────────────────────────────────────────────────────
// Token usage extraction
// ────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Extract prompt/completion/total tokens from multiple possible attribute keys.
 *
 * Covers both OpenInference and OpenLLMetry/gen_ai conventions.
 */
export function extractTokenUsage(attrs: Record<string, any>): TokenUsage {
  const prompt = toNumber(
    attrs['llm.token_count.prompt'] ??
      attrs['gen_ai.usage.input_tokens'] ??
      attrs['llm.usage.prompt_tokens'] ??
      0,
  );

  const completion = toNumber(
    attrs['llm.token_count.completion'] ??
      attrs['gen_ai.usage.output_tokens'] ??
      attrs['llm.usage.completion_tokens'] ??
      0,
  );

  const total = toNumber(
    attrs['llm.token_count.total'] ??
      attrs['llm.usage.total_tokens'] ??
      attrs['gen_ai.usage.total_tokens'] ??
      0,
  );

  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total || prompt + completion,
  };
}

// ────────────────────────────────────────────────────────
// Cost calculation
// ────────────────────────────────────────────────────────

/**
 * Per-token pricing (USD) for well-known models.
 *
 * Values are per-token (not per 1K tokens). Update as needed.
 */
const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  // OpenAI GPT-4o
  'gpt-4o': { prompt: 2.5e-6, completion: 10e-6 },
  'gpt-4o-mini': { prompt: 0.15e-6, completion: 0.6e-6 },
  // OpenAI GPT-4
  'gpt-4': { prompt: 30e-6, completion: 60e-6 },
  'gpt-4-turbo': { prompt: 10e-6, completion: 30e-6 },
  // OpenAI GPT-3.5
  'gpt-3.5-turbo': { prompt: 0.5e-6, completion: 1.5e-6 },
  // OpenAI o1/o3/o4
  'o1': { prompt: 15e-6, completion: 60e-6 },
  'o1-mini': { prompt: 3e-6, completion: 12e-6 },
  'o1-preview': { prompt: 15e-6, completion: 60e-6 },
  'o3': { prompt: 10e-6, completion: 40e-6 },
  'o3-mini': { prompt: 1.1e-6, completion: 4.4e-6 },
  'o4-mini': { prompt: 1.1e-6, completion: 4.4e-6 },
  // Anthropic Claude
  'claude-3-5-sonnet': { prompt: 3e-6, completion: 15e-6 },
  'claude-3-5-haiku': { prompt: 0.8e-6, completion: 4e-6 },
  'claude-3-opus': { prompt: 15e-6, completion: 75e-6 },
  'claude-3-sonnet': { prompt: 3e-6, completion: 15e-6 },
  'claude-3-haiku': { prompt: 0.25e-6, completion: 1.25e-6 },
  'claude-sonnet-4': { prompt: 3e-6, completion: 15e-6 },
  'claude-opus-4': { prompt: 15e-6, completion: 75e-6 },
  // Google Gemini
  'gemini-1.5-pro': { prompt: 1.25e-6, completion: 5e-6 },
  'gemini-1.5-flash': { prompt: 0.075e-6, completion: 0.3e-6 },
  'gemini-2.0-flash': { prompt: 0.075e-6, completion: 0.3e-6 },
  // Mistral
  'mistral-large': { prompt: 2e-6, completion: 6e-6 },
  'mistral-small': { prompt: 0.2e-6, completion: 0.6e-6 },
  // Cohere
  'command-r-plus': { prompt: 2.5e-6, completion: 10e-6 },
  'command-r': { prompt: 0.15e-6, completion: 0.6e-6 },
  // DeepSeek
  'deepseek-chat': { prompt: 0.14e-6, completion: 0.28e-6 },
  'deepseek-reasoner': { prompt: 0.55e-6, completion: 2.19e-6 },
};

/**
 * Calculate estimated cost in USD based on model name and token counts.
 *
 * Uses prefix matching so that versioned model names (e.g. "gpt-4o-2024-05-13")
 * are matched against the base entry.
 *
 * @returns Estimated cost in USD, or 0 if the model is unknown.
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!model) return 0;

  const modelLower = model.toLowerCase();

  // Exact match first
  if (modelLower in MODEL_PRICING) {
    const p = MODEL_PRICING[modelLower];
    return promptTokens * p.prompt + completionTokens * p.completion;
  }

  // Prefix match (longest prefix wins)
  let bestMatch = '';
  for (const key of Object.keys(MODEL_PRICING)) {
    if (modelLower.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }

  if (bestMatch) {
    const p = MODEL_PRICING[bestMatch];
    return promptTokens * p.prompt + completionTokens * p.completion;
  }

  return 0;
}

// ────────────────────────────────────────────────────────
// Metric emitter (OTel metric proxy, simplified)
// ────────────────────────────────────────────────────────

export interface MetricPoint {
  traceId: string;
  spanId: string;
  metricName: string;
  metricType: string;
  description: string;
  unit: string;
  value: number;
  attributes: Record<string, any>;
  timestamp: number;
}

export interface MetricExporter {
  exportMetrics(points: MetricPoint[]): void;
}

/**
 * Emits metric data points enriched with trace/span context.
 */
export class MetricEmitter {
  private exporter: MetricExporter;

  constructor(exporter: MetricExporter) {
    this.exporter = exporter;
  }

  emit(opts: {
    metricName: string;
    metricType: string;
    value: number;
    unit: string;
    description: string;
    attributes?: Record<string, any>;
    traceId?: string;
    spanId?: string;
  }): void {
    if (!opts.traceId || !opts.spanId) return;

    const point: MetricPoint = {
      traceId: opts.traceId,
      spanId: opts.spanId,
      metricName: opts.metricName,
      metricType: opts.metricType,
      description: opts.description || '',
      unit: opts.unit || '',
      value: opts.value,
      attributes: opts.attributes ?? {},
      timestamp: Date.now() * 1_000_000, // nanoseconds
    };

    try {
      this.exporter.exportMetrics([point]);
    } catch {
      // swallow errors
    }
  }
}

// ────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}
