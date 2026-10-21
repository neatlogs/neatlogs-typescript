import { AbTestClient, type AbAssignmentOptions, type AbAssignment, type LogExposureOptions } from './client.js';

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

export function logExposure(key: string, options: LogExposureOptions): boolean {
  return shared?.logExposure(key, options) ?? false;
}

/** Explicitly finish a session/user after its final trace has been exported. */
export function completeAbTestUnit(key: string, options: Parameters<AbTestClient['completeUnit']>[1]): boolean {
  return shared?.completeUnit(key, options) ?? false;
}
