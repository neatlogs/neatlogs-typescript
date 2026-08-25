import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TELEMETRY_CONFLICT_PRECEDENCE,
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_SCHEMA_SHA256,
  TELEMETRY_SCHEMA_V2,
  TELEMETRY_SCHEMA_VERSION,
} from '../../src/schema-v2.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const publicSchemaPath = join(root, 'contracts/v2/neatlogs-telemetry.schema.json');
const bundledSchemaPath = join(root, 'src/contracts/v2/neatlogs-telemetry.schema.json');
const manifestPath = join(root, 'contracts/v2/manifest.json');
const fixtureRoot = join(root, 'contracts/v2/fixtures/valid');

const publicSchema = readFileSync(publicSchemaPath);
const bundledSchema = readFileSync(bundledSchemaPath);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;

describe('canonical telemetry schema v2', () => {
  it('bundles the exact authoritative schema bytes and manifest hash', () => {
    const actualHash = createHash('sha256').update(publicSchema).digest('hex');
    expect(bundledSchema).toEqual(publicSchema);
    expect(actualHash).toBe(TELEMETRY_SCHEMA_SHA256);
    expect(manifest['schema_sha256']).toBe(actualHash);
    expect(manifest['contract_version']).toBe(TELEMETRY_CONTRACT_VERSION);
  });

  it('exports the canonical policy without redefining it', () => {
    expect(TELEMETRY_SCHEMA_VERSION).toBe(2);
    expect(TELEMETRY_SCHEMA_V2['x-neatlogs-policy'].contract_version).toBe(
      TELEMETRY_CONTRACT_VERSION,
    );
    expect(TELEMETRY_CONFLICT_PRECEDENCE).toEqual([
      'native-v2',
      'neatlogs-direct',
      'otel-genai',
      'openinference',
      'provider-specific',
      'external-legacy',
      'unknown-raw',
    ]);
  });

  it('keeps canonical golden fixtures structurally ready for full schema validation', () => {
    const required = new Set(TELEMETRY_SCHEMA_V2.required);
    const allowedKinds = new Set(
      TELEMETRY_SCHEMA_V2.$defs.spanKind.enum.map((kind) => String(kind)),
    );
    const fixtureNames = readdirSync(fixtureRoot).filter((name) => name.endsWith('.json'));
    expect(fixtureNames.length).toBeGreaterThan(0);

    for (const fixtureName of fixtureNames) {
      const fixture = JSON.parse(
        readFileSync(join(fixtureRoot, fixtureName), 'utf8'),
      ) as Record<string, any>;
      for (const field of required) expect(fixture).toHaveProperty(field);
      expect(fixture['schema_version']).toBe(TELEMETRY_SCHEMA_VERSION);
      expect(fixture['trace_id']).toMatch(/^[0-9a-f]{32}$/);
      expect(fixture['span_id']).toMatch(/^[0-9a-f]{16}$/);
      expect(allowedKinds.has(String(fixture['kind']))).toBe(true);
      expect(fixture['semantic']?.kind).toBe(fixture['kind']);
    }
  });
});
