import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TELEMETRY_CONFLICT_PRECEDENCE,
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_SCHEMA_SHA256,
  TELEMETRY_SCHEMA_V2,
  TELEMETRY_SCHEMA_VERSION,
} from '../../src/schema-v2.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const publicSchema = readFileSync(
  join(root, 'contracts/v2/neatlogs-telemetry.schema.json'),
);
const bundledSchema = readFileSync(
  join(root, 'src/contracts/v2/neatlogs-telemetry.schema.json'),
);

describe('canonical telemetry schema v2', () => {
  it('bundles the exact public schema bytes', () => {
    expect(bundledSchema).toEqual(publicSchema);
    expect(createHash('sha256').update(bundledSchema).digest('hex')).toBe(
      TELEMETRY_SCHEMA_SHA256,
    );
  });

  it('consumes the frozen policy instead of redefining it', () => {
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
    expect(
      TELEMETRY_SCHEMA_V2['x-neatlogs-policy'].tool_calls
        .execution_is_separate_tool_span,
    ).toBe(true);
  });
});
