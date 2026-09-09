import schema from './contracts/v2/neatlogs-telemetry.schema.json';

export const TELEMETRY_CONTRACT_VERSION = '2.0.0' as const;
export const TELEMETRY_SCHEMA_VERSION = 2 as const;
export const TELEMETRY_SCHEMA_SHA256 =
  'ae79717d127e2faa761ad83c8a51a08cae6fce00a04446d46dcc6d1a371818ce' as const;

/** Parsed canonical telemetry contract bundled from the public schema bytes. */
export const TELEMETRY_SCHEMA_V2 = Object.freeze(schema);

/** The frozen source-dialect order used for canonical conflict resolution. */
export const TELEMETRY_CONFLICT_PRECEDENCE = Object.freeze(
  [...schema['x-neatlogs-policy'].conflict_precedence] as const,
);
