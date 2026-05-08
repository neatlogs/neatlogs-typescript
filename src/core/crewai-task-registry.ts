/**
 * Registry for CrewAI task template bindings.
 *
 * Call registerCrewaiTask(task, userTpl, vars) in your task setup after creating
 * each Task. The span processor reads and clears the entry when the corresponding
 * AGENT span ends, stamping the template onto that span.
 */

import { getLogger } from './logger.js';

const logger = getLogger();

/** Registry: taskId -> [templateStr, varsJson] */
const _registry = new Map<string, [string, string | null]>();

/**
 * Register a user prompt template for a CrewAI task.
 *
 * @param task - A CrewAI Task instance (must have an .id property)
 * @param userTpl - A neatlogs UserPromptTemplate describing the task prompt
 * @param vars - Variable values passed to userTpl at task-creation time
 */
export function registerCrewaiTask(
  task: { id: string | number },
  userTpl: { template: string | any },
  vars?: Record<string, any>,
): void {
  const taskId = String(task.id);
  const tplStr = String(userTpl.template);
  const varsJson =
    vars && Object.keys(vars).length > 0
      ? JSON.stringify(vars, (_key, val) => (typeof val === 'undefined' ? null : val))
      : null;

  _registry.set(taskId, [tplStr, varsJson]);
  logger.debug(`Registered CrewAI task ${taskId}`);
}

/**
 * Remove and return the registry entry for taskId, or undefined if absent.
 */
export function popEntry(taskId: string): [string, string | null] | undefined {
  const entry = _registry.get(taskId);
  if (entry) {
    _registry.delete(taskId);
  }
  return entry;
}

/**
 * Clear all registered tasks. Used for testing.
 * @internal
 */
export function _clearTaskRegistry(): void {
  _registry.clear();
}
