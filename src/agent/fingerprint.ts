import { createHash } from 'node:crypto';
import { canonical } from '../replay/contracts.js';
import type { AbParams } from '../ab-test/protocol.js';

export class AgentCanonicalError extends Error {}

function wellFormed(value: string): void {
  if (Array.from(value).some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char)))
    throw new AgentCanonicalError('Agent identity contains unsupported Unicode');
}
const digest = (value: Parameters<typeof canonical>[0]): string => createHash('sha256').update(canonical(value)).digest('hex');

export function agentVersionFingerprint(agentKey: string, params: AbParams): string {
  const normalized: AbParams = {};
  if (Object.keys(params).length > 20) throw new AgentCanonicalError('Invalid agent parameters');
  for (const [key, value] of Object.entries(params)) {
    wellFormed(key);
    if (!key || key.length > 100 || !(value === null || typeof value === 'boolean' || typeof value === 'string' && value.length <= 2000 || typeof value === 'number' && Number.isFinite(value)))
      throw new AgentCanonicalError('Invalid agent parameters');
    if (typeof value === 'string') {
      wellFormed(value);
      if (/\p{Unassigned}/u.test(value)) throw new AgentCanonicalError('Unsupported NFC Unicode version');
    }
    Object.defineProperty(normalized, key, { value: typeof value === 'string' ? value.normalize('NFC') : value, enumerable: true });
  }
  return digest({ version: 1, agentKey, params: normalized });
}

export function agentAttributesDigest(attributes: Record<string, string | boolean>, keys = Object.keys(attributes)): string {
  const selected: Record<string, string | boolean> = {};
  for (const key of keys) if (Object.hasOwn(attributes, key)) {
    const value = attributes[key]!;
    wellFormed(key);
    if (typeof value === 'string') wellFormed(value);
    Object.defineProperty(selected, key, { value, enumerable: true });
  }
  return digest({ version: 1, attributes: selected });
}
