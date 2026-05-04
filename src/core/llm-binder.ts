/**
 * LLM template binding for frameworks that manage LLM calls internally (e.g. CrewAI).
 *
 * Usage:
 *   const boundLlm = bindTemplates(llm, systemTpl, userTpl, { content: '...' });
 *   const agent = new Agent({ llm: boundLlm, ... });
 *
 * When the LLM's invoke/call method runs, this wrapper fires first:
 *   1. Sets prompt template + user prompt template in OTel context
 *   2. Calls the instrumented class-level invoke (creates the LLM span)
 *   3. span_processor reads context -> templates land on the LLM span
 */

import { context as otelContext, type Context } from '@opentelemetry/api';
import { getLogger } from './logger.js';
import { PromptContext, UserPromptContext } from '../prompt/template.js';

const logger = getLogger();

/**
 * Return a copy of `llm` whose invoke()/call() injects prompt template context
 * before the instrumented LLM span is created.
 *
 * @param llm - Any LangChain-compatible chat model or crewai.LLM
 * @param systemTpl - PromptTemplate for the agent backstory / system role
 * @param userTpl - Optional UserPromptTemplate for the task description
 * @param compiledVars - Variable values to pass to userTpl.compile()
 * @returns A new LLM instance with template context pre-wired
 */
export function bindTemplates(
  llm: any,
  systemTpl: any,
  userTpl?: any,
  compiledVars?: Record<string, any>,
): any {
  const systemStr = String(systemTpl.template);
  const userStr = userTpl ? String(userTpl.template) : null;

  // Clone the LLM so different agents can each have their own binding.
  // Prefer Object.create (preserves prototype chain and methods) over
  // structuredClone (which strips functions).
  let llmCopy: any;
  try {
    // Shallow copy that preserves prototype chain (like Python's copy.copy)
    llmCopy = Object.create(Object.getPrototypeOf(llm), Object.getOwnPropertyDescriptors(llm));
  } catch {
    try {
      // Try structured clone for plain data objects
      llmCopy = structuredClone(llm);
    } catch {
      // Fall back to binding in place
      llmCopy = llm;
      logger.debug(
        `LLM type ${llm?.constructor?.name ?? 'unknown'} is not copyable — binding in place.`,
      );
    }
  }

  // Find the method to wrap: prefer invoke(), fall back to call()
  let methodName: string;
  if (typeof llmCopy.invoke === 'function') {
    methodName = 'invoke';
  } else if (typeof llmCopy.call === 'function') {
    methodName = 'call';
  } else {
    logger.warn(
      `LLM type ${llm?.constructor?.name ?? 'unknown'} has neither invoke() nor call() — ` +
        'prompt templates will not be captured on spans.',
    );
    return llmCopy;
  }

  const originalMethod = llmCopy[methodName].bind(llmCopy);

  llmCopy[methodName] = function wrappedWithTemplates(...args: any[]) {
    // Compile system template (stores in PromptContext)
    systemTpl.compile();

    // Compile user template if provided
    if (userTpl && compiledVars) {
      userTpl.compile(compiledVars);
    }

    // Call the original (instrumented) method
    try {
      return originalMethod(...args);
    } finally {
      PromptContext.clear();
      if (userTpl && compiledVars) {
        UserPromptContext.clear();
      }
    }
  };

  logger.debug(
    `Wrapped ${llm?.constructor?.name ?? 'unknown'}.${methodName}() with template injection.`,
  );

  return llmCopy;
}
