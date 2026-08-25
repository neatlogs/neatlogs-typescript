import schema from './contracts/v2/neatlogs-telemetry.schema.json';

export const TELEMETRY_CONTRACT_VERSION = '2.0.0' as const;
export const TELEMETRY_SCHEMA_VERSION = 2 as const;
export const TELEMETRY_SCHEMA_SHA256 =
  '1ce32734138c2ffc316c4299f5ae3eebec2f94381a538a383af49ba93eec9f9d' as const;

/** Parsed canonical telemetry contract bundled from the authoritative schema bytes. */
export const TELEMETRY_SCHEMA_V2 = Object.freeze(schema);

/** The frozen source-dialect order used for canonical conflict resolution. */
export const TELEMETRY_CONFLICT_PRECEDENCE = Object.freeze(
  [...schema['x-neatlogs-policy'].conflict_precedence] as const,
);
