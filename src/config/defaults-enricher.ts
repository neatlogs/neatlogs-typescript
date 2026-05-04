/**
 * Model defaults enricher for invocation parameters.
 *
 * Loads defaults from config/model_defaults.json and intelligently merges
 * them with explicitly set parameters.
 */

import { getLogger } from '../core/logger.js';
import modelDefaultsConfig from './model_defaults.json';

const logger = getLogger();

/**
 * Get default parameters for a specific provider/operation/model.
 */
export function getDefaults(
  provider: string,
  operation: string,
  model: string,
): Record<string, any> {
  const defaultsData = modelDefaultsConfig as Record<string, any>;

  const providerData = defaultsData[provider.toLowerCase()] ?? {};
  const operationData = providerData[operation] ?? {};

  if (Object.keys(operationData).length === 0) {
    return {};
  }

  // Exact match
  if (model in operationData) {
    return { ...operationData[model] };
  }

  // Prefix match
  for (const [modelKey, defaults] of Object.entries(operationData)) {
    if (modelKey !== '_default' && model.startsWith(modelKey)) {
      logger.debug(`Matched model '${model}' to defaults for '${modelKey}'`);
      return { ...(defaults as Record<string, any>) };
    }
  }

  // Default fallback
  if ('_default' in operationData) {
    logger.debug(`Using _default for ${provider}/${operation}/${model}`);
    return { ...operationData._default };
  }

  return {};
}

/**
 * Enrich invocation parameters with model defaults.
 *
 * Merges default parameters from model_defaults.json with explicitly captured
 * parameters. Explicit parameters always take precedence.
 *
 * Modifies mergedAttrs in-place.
 */
export function enrichInvocationParameters(
  mergedAttrs: Record<string, any>,
  enableEnrichment = true,
): void {
  if (!enableEnrichment) return;

  const spanKind = mergedAttrs['openinference.span.kind'];
  if (spanKind !== 'LLM' && spanKind !== 'EMBEDDING') return;

  const provider = (mergedAttrs['llm.system'] ?? '').toLowerCase();
  const model =
    spanKind === 'EMBEDDING'
      ? mergedAttrs['embedding.model_name'] ?? ''
      : mergedAttrs['llm.model_name'] ?? '';

  if (!provider || !model) return;

  let operation: string | undefined;
  if (spanKind === 'LLM') {
    operation = provider === 'openai' ? 'chat.completions' : 'messages';
  } else if (spanKind === 'EMBEDDING') {
    operation = 'embeddings';
  }

  if (!operation) return;

  const defaults = getDefaults(provider, operation, model);
  if (Object.keys(defaults).length === 0) {
    logger.debug(`No defaults found for ${provider}/${operation}/${model}`);
    return;
  }

  const existingParamsStr = mergedAttrs['llm.invocation_parameters'] ?? '{}';
  let existingParams: Record<string, any>;
  try {
    existingParams =
      typeof existingParamsStr === 'string'
        ? JSON.parse(existingParamsStr)
        : existingParamsStr;
  } catch {
    existingParams = {};
  }

  const enrichedParams = { ...defaults, ...existingParams };
  mergedAttrs['llm.invocation_parameters'] = JSON.stringify(enrichedParams);

  logger.debug(
    `Enriched params for ${provider}/${model}: added ${Object.keys(defaults).length} defaults`,
  );
}
