import { AbTestClient, type AbAssignmentOptions, type AbAssignment, type AbDecision, type LogExposureOptions } from './client.js';

let shared: AbTestClient | undefined;

export function setAbTestClient(client: AbTestClient | undefined): void {
  shared?.close();
  shared = client;
}

export function getAbTestClient(): AbTestClient | undefined { return shared; }

/** Select a version using cached settings. Call inside the trace that uses it. */
export function abTest(key: string, options: AbAssignmentOptions): AbAssignment {
  return shared?.assign(key, options) ?? {
    key, arm: 'a', params: { ...options.fallback }, reason: 'unavailable', revision: null, allocationVersion: null,
  };
}

/** Choose a version without recording traffic until the agent actually begins. */
export function chooseAbTest(key: string, options: AbAssignmentOptions): AbDecision {
  return shared?.choose(key, options) ?? {
    key, unitId: options.unit, arm: 'a', params: { ...options.fallback },
    reason: 'unavailable', revision: null, allocationVersion: null,
  };
}

/** Record the chosen version at the start of an agent run, inside its trace. */
export function recordAbTestRun(decision: AbDecision): boolean {
  return shared?.recordRun(decision) ?? false;
}

/** Close a completed conversation or observation period after its final trace export. */
export function completeAbTestDecision(decision: AbDecision, traceId: string): boolean {
  return shared?.completeDecision(decision, traceId) ?? false;
}

export function logExposure(key: string, options: LogExposureOptions): boolean {
  return shared?.logExposure(key, options) ?? false;
}

/** Explicitly finish a session/user after its final trace has been exported. */
export function completeAbTestUnit(key: string, options: Parameters<AbTestClient['completeUnit']>[1]): boolean {
  return shared?.completeUnit(key, options) ?? false;
}
