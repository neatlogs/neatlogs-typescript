/**
 * Neatlogs Semantic Conventions - Attribute Mapper
 *
 * Maps vendor-specific attributes to the unified neatlogs.* namespace
 * using configuration from attribute-mapping.json.
 */

import { getLogger } from '../core/logger.js';
import attributeMappingConfig from './attribute-mapping.json';

const logger = getLogger();

interface MappingConfig {
  sources: string[] | Record<string, string[]>;
  target?: string;
  indexed?: boolean;
  target_content?: string;
  description?: string;
  priority?: string;
  values?: Record<string, string>;
  mappings?: Record<string, any>;
  [key: string]: any;
}

/** Flatten sources into a single array of source patterns, regardless of shape. */
function flattenSources(sources: string[] | Record<string, string[]> | undefined): string[] {
  if (!sources) return [];
  if (Array.isArray(sources)) return sources;
  // Object form: { id: [...], name: [...], ... } — flatten all arrays
  const result: string[] = [];
  for (const arr of Object.values(sources)) {
    if (Array.isArray(arr)) {
      result.push(...arr);
    }
  }
  return result;
}

export class AttributeMapper {
  private config: Record<string, any>;
  private mappings: Record<string, any>;
  private keepAsIs: Set<string>;
  private ignorePatterns: string[];
  private compiledIgnorePatterns: RegExp[];
  private _regexCache: Map<string, RegExp> = new Map();

  constructor(config?: Record<string, any>) {
    this.config = config ?? (attributeMappingConfig as Record<string, any>);

    this.mappings = this.config.mappings ?? {};
    // keep_as_is / ignore may live at top-level or inside mappings
    const keepAsIsAttrs =
      this.config.keep_as_is?.attributes ??
      this.mappings.keep_as_is?.attributes ??
      [];
    this.keepAsIs = new Set<string>(keepAsIsAttrs);
    this.ignorePatterns =
      this.config.ignore?.patterns ??
      this.mappings.ignore?.patterns ??
      [];
    // Pre-compile ignore patterns for performance (avoid per-call regex creation)
    this.compiledIgnorePatterns = this.ignorePatterns.map(
      (pattern) => new RegExp('^' + pattern.replace(/\*/g, '.*') + '$'),
    );
  }

  /** Check if an attribute should be ignored. */
  shouldIgnore(attrName: string): boolean {
    for (const regex of this.compiledIgnorePatterns) {
      if (regex.test(attrName)) {
        return true;
      }
    }
    return false;
  }

  /** Check if an attribute should be kept unchanged (OTel standard). */
  shouldKeepAsIs(attrName: string): boolean {
    return this.keepAsIs.has(attrName);
  }

  /** Extract and normalize span kind from multiple possible sources. */
  mapSpanKind(attributes: Record<string, any>): string {
    const spanKindConfig = this.mappings.span_kind ?? {};
    const sources: string[] = spanKindConfig.sources ?? [];
    const valuesMap: Record<string, string> = spanKindConfig.values ?? {};
    const priority: string = spanKindConfig.priority ?? 'openinference';

    let spanKindValue: string | undefined;

    if (priority === 'openinference') {
      if ('openinference.span.kind' in attributes) {
        spanKindValue = attributes['openinference.span.kind'];
      }
    } else {
      for (const source of sources) {
        if (source in attributes) {
          spanKindValue = attributes[source];
          break;
        }
      }
    }

    if (spanKindValue && spanKindValue in valuesMap) {
      return valuesMap[spanKindValue];
    }

    // Infer LLM span from attributes
    const isLlmSpan = [
      'llm.model_name',
      'gen_ai.request.model',
      'llm.token_count.prompt',
      'llm.token_count.completion',
      'gen_ai.usage.prompt_tokens',
      'gen_ai.usage.completion_tokens',
    ].some((key) => key in attributes);

    if (isLlmSpan) {
      return 'llm';
    }

    return 'unknown';
  }

  /** Map a simple attribute from multiple sources to target. */
  mapSimpleAttribute(
    mappingConfig: MappingConfig,
    attributes: Record<string, any>,
  ): any | undefined {
    const sources = flattenSources(mappingConfig.sources);
    for (const source of sources) {
      if (source in attributes) {
        return attributes[source];
      }
    }
    return undefined;
  }

  /** Get or create a cached RegExp for a source pattern. */
  private _getPatternRegex(sourcePattern: string): RegExp {
    let cached = this._regexCache.get(sourcePattern);
    if (!cached) {
      let regexPattern = sourcePattern.replace(/\{i\}/g, '(\\d+)');
      regexPattern = regexPattern.replace(/\./g, '\\.');
      cached = new RegExp('^' + regexPattern + '$');
      this._regexCache.set(sourcePattern, cached);
    }
    return cached;
  }

  /** Map indexed attributes like messages (llm.input_messages.0.role). */
  mapIndexedAttributes(
    mappingConfig: MappingConfig,
    attributes: Record<string, any>,
    targetBase: string,
  ): Record<string, any> {
    const mapped: Record<string, any> = {};
    const rawSources = mappingConfig.sources;

    if (Array.isArray(rawSources)) {
      // Simple array of source patterns
      for (const [attrName, attrValue] of Object.entries(attributes)) {
        for (const sourcePattern of rawSources) {
          const match = attrName.match(this._getPatternRegex(sourcePattern));

          if (match) {
            const index = match[1];
            const target = targetBase.replace(/\{i\}/g, index);
            mapped[target] = attrValue;
          }
        }
      }
    } else if (rawSources && typeof rawSources === 'object') {
      // Object form: { field: [sourcePatterns...] }
      // e.g. { id: ["llm.tool_calls.{i}.id"], name: ["llm.tool_calls.{i}.name"] }
      for (const [field, sourcePatterns] of Object.entries(rawSources)) {
        if (!Array.isArray(sourcePatterns)) continue;
        for (const [attrName, attrValue] of Object.entries(attributes)) {
          for (const sourcePattern of sourcePatterns) {
            const match = attrName.match(this._getPatternRegex(sourcePattern));

            if (match) {
              const index = match[1];
              const target = targetBase.replace(/\{i\}/g, index) + '.' + field;
              mapped[target] = attrValue;
            }
          }
        }
      }
    }

    return mapped;
  }

  /** Recursively map nested configuration. */
  mapNestedConfig(
    config: Record<string, any>,
    attributes: Record<string, any>,
    spanKind?: string,
  ): Record<string, any> {
    const mapped: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      if (['description', 'sources', 'target', 'indexed', 'priority', 'values', 'applies_to'].includes(key)) {
        continue;
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (Array.isArray(value.applies_to) && spanKind && !value.applies_to.includes(spanKind)) {
          continue;
        }
        if ('sources' in value) {
          if (value.indexed) {
            const target = value.target ?? '';
            const indexedMapped = this.mapIndexedAttributes(value, attributes, target);
            Object.assign(mapped, indexedMapped);

            if ('target_content' in value) {
              const contentTarget = value.target_content;
              const contentMapped = this.mapIndexedAttributes(value, attributes, contentTarget);
              Object.assign(mapped, contentMapped);
            }
          } else {
            let target = value.target ?? '';
            if (spanKind && target.includes('{span_kind}')) {
              target = target.replace(/\{span_kind\}/g, spanKind);
            }

            const result = this.mapSimpleAttribute(value, attributes);
            if (result !== undefined) {
              mapped[target] = result;
            }
          }
        } else {
          const nestedMapped = this.mapNestedConfig(value, attributes, spanKind);
          Object.assign(mapped, nestedMapped);
        }
      }
    }

    return mapped;
  }

  /** Map all attributes from vendor-specific to neatlogs namespace. */
  mapAttributes(
    attributes: Record<string, any>,
    spanKind?: string,
  ): Record<string, any> {
    const mapped: Record<string, any> = {};

    if (!spanKind) {
      spanKind = this.mapSpanKind(attributes);
    }
    mapped['neatlogs.span.kind'] = spanKind;

    for (const [sectionName, sectionConfig] of Object.entries(this.mappings)) {
      if (sectionName === 'span_kind' || sectionName === 'keep_as_is' || sectionName === 'ignore') continue;

      if (typeof sectionConfig === 'object' && sectionConfig !== null) {
        // Skip sections that don't apply to this span kind
        if (Array.isArray(sectionConfig.applies_to) && spanKind && !sectionConfig.applies_to.includes(spanKind)) {
          continue;
        }
        if ('mappings' in sectionConfig) {
          // Process the explicit 'mappings' sub-key
          const nestedMapped = this.mapNestedConfig(
            sectionConfig.mappings,
            attributes,
            spanKind,
          );
          Object.assign(mapped, nestedMapped);
          // Also process sibling sub-sections (e.g. generic_io, span, tool, etc.)
          for (const [subKey, subVal] of Object.entries(sectionConfig)) {
            if (subKey === 'mappings' || subKey === 'description' || subKey === 'applies_to') continue;
            if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal)) {
              if (Array.isArray((subVal as any).applies_to) && spanKind && !(subVal as any).applies_to.includes(spanKind)) {
                continue;
              }
              if ('sources' in subVal) {
                if ((subVal as any).indexed) {
                  const target = (subVal as any).target ?? '';
                  const indexedMapped = this.mapIndexedAttributes(subVal as MappingConfig, attributes, target);
                  Object.assign(mapped, indexedMapped);
                } else if (Array.isArray((subVal as any).sources)) {
                  let target = (subVal as any).target ?? '';
                  if (spanKind && target.includes('{span_kind}')) {
                    target = target.replace(/\{span_kind\}/g, spanKind);
                  }
                  const result = this.mapSimpleAttribute(subVal as MappingConfig, attributes);
                  if (result !== undefined) {
                    mapped[target] = result;
                  }
                }
              } else {
                const subMapped = this.mapNestedConfig(subVal as Record<string, any>, attributes, spanKind);
                Object.assign(mapped, subMapped);
              }
            }
          }
        } else if ('sources' in sectionConfig) {
          let target = sectionConfig.target ?? '';
          if (target.includes('{span_kind}')) {
            target = target.replace(/\{span_kind\}/g, spanKind);
          }
          const result = this.mapSimpleAttribute(sectionConfig, attributes);
          if (result !== undefined) {
            mapped[target] = result;
          }
        } else {
          const nestedMapped = this.mapNestedConfig(sectionConfig, attributes, spanKind);
          Object.assign(mapped, nestedMapped);
        }
      }
    }

    // Keep OTel standard attributes
    for (const [attrName, attrValue] of Object.entries(attributes)) {
      if (this.shouldKeepAsIs(attrName) && !(attrName in mapped)) {
        mapped[attrName] = attrValue;
      }
    }

    // Collect all mapped sources
    const mappedSources = new Set<string>();
    for (const sectionConfig of Object.values(this.mappings)) {
      if (typeof sectionConfig === 'object' && sectionConfig !== null) {
        if ('sources' in sectionConfig) {
          for (const s of flattenSources((sectionConfig as any).sources)) {
            mappedSources.add(s);
          }
        }
        if ('mappings' in sectionConfig) {
          this._collectMappedSources((sectionConfig as any).mappings, mappedSources);
        }
        // Also collect from sibling sub-sections
        for (const [subKey, subVal] of Object.entries(sectionConfig)) {
          if (subKey === 'mappings' || subKey === 'description' || subKey === 'sources') continue;
          if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal)) {
            this._collectMappedSources(subVal as Record<string, any>, mappedSources);
          }
        }
      }
    }

    // Pass through unmapped, non-ignored attributes
    for (const [attrName, attrValue] of Object.entries(attributes)) {
      if (!mappedSources.has(attrName) && !(attrName in mapped) && !this.shouldIgnore(attrName)) {
        mapped[attrName] = attrValue;
      }
    }

    // Remove ignored attributes from final result
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (!this.shouldIgnore(k)) {
        result[k] = v;
      }
    }

    return result;
  }

  /** Recursively collect all source attribute names from nested config. */
  private _collectMappedSources(config: Record<string, any>, collected: Set<string>): void {
    for (const value of Object.values(config)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if ('sources' in value) {
          for (const s of flattenSources((value as any).sources)) {
            collected.add(s);
          }
        } else {
          this._collectMappedSources(value as Record<string, any>, collected);
        }
      }
    }
  }

  /** Get the span kind value mapping. */
  getSpanKindValueMapping(): Record<string, string> {
    return this.mappings.span_kind?.values ?? {};
  }

  /** Get the target neatlogs attribute name for a source attribute. */
  getTargetAttributeName(sourceAttr: string, spanKind?: string): string | undefined {
    const searchConfig = (config: Record<string, any>, targetSpanKind?: string): string | undefined => {
      for (const value of Object.values(config)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if ('sources' in value) {
            const sources = flattenSources((value as any).sources);
            if (sources.includes(sourceAttr)) {
              let target = (value as any).target ?? '';
              if (targetSpanKind && target.includes('{span_kind}')) {
                target = target.replace(/\{span_kind\}/g, targetSpanKind);
              }
              return target;
            }
          }
          const result = searchConfig(value as Record<string, any>, targetSpanKind);
          if (result) return result;
        }
      }
      return undefined;
    };

    return searchConfig(this.mappings, spanKind);
  }
}

// Singleton instance
let _mapperInstance: AttributeMapper | null = null;

/** Get the global AttributeMapper instance. */
export function getMapper(): AttributeMapper {
  if (!_mapperInstance) {
    _mapperInstance = new AttributeMapper();
  }
  return _mapperInstance;
}

/** Convenience function to map attributes using the global mapper. */
export function mapAttributes(
  attributes: Record<string, any>,
  spanKind?: string,
): Record<string, any> {
  return getMapper().mapAttributes(attributes, spanKind);
}
