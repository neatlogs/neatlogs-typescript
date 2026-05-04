import { AsyncLocalStorage } from 'node:async_hooks';
import type { PromptMessage } from '../types.js';

// ---------------------------------------------------------------------------
// Async-local context for system prompts
// ---------------------------------------------------------------------------

interface PromptContextData {
  template: string;
  variables: Record<string, any>;
}

const _promptStorage = new AsyncLocalStorage<PromptContextData>();

/**
 * Manages system prompt metadata in async-local context for automatic tracing.
 */
export class PromptContext {
  /**
   * Store system prompt template and variables in context.
   */
  static set(template: string, variables: Record<string, any>): void {
    // enterWith mutates the current async context in-place
    _promptStorage.enterWith({ template, variables });
  }

  /**
   * Retrieve system prompt template from context.
   */
  static getTemplate(): string | undefined {
    return _promptStorage.getStore()?.template;
  }

  /**
   * Retrieve system prompt variables from context.
   */
  static getVariables(): Record<string, any> | undefined {
    return _promptStorage.getStore()?.variables;
  }

  /**
   * Clear system prompt context.
   */
  static clear(): void {
    _promptStorage.enterWith(undefined as unknown as PromptContextData);
  }
}

// ---------------------------------------------------------------------------
// Async-local context for user prompts
// ---------------------------------------------------------------------------

const _userPromptStorage = new AsyncLocalStorage<PromptContextData>();

/**
 * Manages user/human prompt metadata in async-local context for automatic tracing.
 */
export class UserPromptContext {
  /**
   * Store user prompt template and variables in context.
   */
  static set(template: string, variables: Record<string, any>): void {
    _userPromptStorage.enterWith({ template, variables });
  }

  /**
   * Retrieve user prompt template from context.
   */
  static getTemplate(): string | undefined {
    return _userPromptStorage.getStore()?.template;
  }

  /**
   * Retrieve user prompt variables from context.
   */
  static getVariables(): Record<string, any> | undefined {
    return _userPromptStorage.getStore()?.variables;
  }

  /**
   * Clear user prompt context.
   */
  static clear(): void {
    _userPromptStorage.enterWith(undefined as unknown as PromptContextData);
  }
}

// ---------------------------------------------------------------------------
// Shared context setter type for the base template class
// ---------------------------------------------------------------------------

interface ContextSetter {
  set(template: string, variables: Record<string, any>): void;
}

// ---------------------------------------------------------------------------
// BasePromptTemplate — shared logic for system and user prompts
// ---------------------------------------------------------------------------

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Serialize a template (string or message array) to a meaningful string.
 * For message arrays, produces a JSON string of role/content pairs instead
 * of the useless `[object Object]` that `String()` would produce.
 */
function _serializeTemplate(template: string | PromptMessage[]): string {
  if (typeof template === 'string') return template;
  if (Array.isArray(template)) {
    return JSON.stringify(template.map((m) => ({ role: m.role, content: m.content })));
  }
  return String(template);
}

/**
 * Base class for prompt templates with `{{variable}}` placeholders.
 *
 * Extracts variables, compiles templates, and renders strings.
 * Subclasses only need to specify the context class and display name.
 */
abstract class BasePromptTemplate {
  protected readonly _template: string | PromptMessage[];
  protected readonly _variables: string[];

  /**
   * @param template - Either a string with `{{variable}}` placeholders or
   *   an array of `PromptMessage` objects whose `content` fields contain placeholders.
   */
  constructor(template: string | PromptMessage[]) {
    this._template = template;
    this._variables = this._extractVariables();
  }

  /** List of unique variable names found in this template. */
  get variables(): string[] {
    return this._variables;
  }

  /** The raw template (string or message array). */
  get template(): string | PromptMessage[] {
    return this._template;
  }

  /** The context class to store template/variables for automatic tracing. */
  protected abstract get _contextSetter(): ContextSetter;

  /** Display name for toString(). */
  protected abstract get _displayName(): string;

  /**
   * Compile the prompt template with the given variables.
   *
   * @param variables - Key/value pairs to substitute for `{{key}}` placeholders.
   * @returns The rendered string or rendered message array.
   * @throws {Error} If any required variables are missing.
   */
  compile(variables?: Record<string, any>): string | PromptMessage[] {
    const vars = variables ?? {};

    const missing = this._variables.filter((v) => !(v in vars));
    if (missing.length > 0) {
      throw new Error(
        `Missing required variables: ${missing.join(', ')}. Template requires: ${this._variables.join(', ')}`,
      );
    }

    this._contextSetter.set(_serializeTemplate(this._template), vars);

    if (typeof this._template === 'string') {
      return this._renderString(this._template, vars);
    }

    return this._template.map((msg) => ({
      role: msg.role,
      content: this._renderString(msg.content, vars),
    }));
  }

  /**
   * Replace `{{key}}` placeholders in a string with the corresponding values.
   */
  private _renderString(text: string, variables: Record<string, any>): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{{${key}}}`, String(value));
    }
    return result;
  }

  toString(): string {
    if (typeof this._template === 'string') {
      return this._template.length > 50
        ? `${this._displayName}('${this._template.slice(0, 50)}...')`
        : `${this._displayName}('${this._template}')`;
    }
    return `${this._displayName}(${this._template.length} messages, variables=${JSON.stringify(this._variables)})`;
  }

  // ---- private ----

  private _extractVariables(): string[] {
    if (typeof this._template === 'string') {
      return [...new Set(Array.from(this._template.matchAll(VARIABLE_PATTERN), (m) => m[1]))];
    }

    const found: string[] = [];
    for (const msg of this._template) {
      if (msg.content) {
        for (const match of msg.content.matchAll(VARIABLE_PATTERN)) {
          found.push(match[1]);
        }
      }
    }
    return [...new Set(found)];
  }
}

// ---------------------------------------------------------------------------
// SystemPromptTemplate — system/AI instruction prompt
// ---------------------------------------------------------------------------

/**
 * Template for the system/AI instruction prompt with `{{variable}}` placeholders.
 */
export class SystemPromptTemplate extends BasePromptTemplate {
  protected get _contextSetter(): ContextSetter {
    return PromptContext;
  }

  protected get _displayName(): string {
    return 'SystemPromptTemplate';
  }
}

/** Backward-compatible alias for SystemPromptTemplate. */
export const PromptTemplate = SystemPromptTemplate;

// ---------------------------------------------------------------------------
// UserPromptTemplate — user/human turn prompt
// ---------------------------------------------------------------------------

/**
 * Template for the user/human turn prompt with `{{variable}}` placeholders.
 *
 * Identical to {@link SystemPromptTemplate} but stores context in {@link UserPromptContext}.
 */
export class UserPromptTemplate extends BasePromptTemplate {
  protected get _contextSetter(): ContextSetter {
    return UserPromptContext;
  }

  protected get _displayName(): string {
    return 'UserPromptTemplate';
  }
}
