import { isSpanContextValid } from '@opentelemetry/api';
import { getNeatlogsRootSpan } from './core/provider.js';
import { _doctorRuntimeSnapshot } from './init.js';
import {
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_SCHEMA_SHA256,
  TELEMETRY_SCHEMA_VERSION,
} from './schema-v2.js';
import type { InitOptions } from './types.js';
import { __version__ } from './version.js';

export const DOCTOR_FORMAT_VERSION = 'neatlogs.doctor/v1' as const;
export type DoctorStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export type DoctorCheck = Readonly<{
  name: string;
  status: DoctorStatus;
  reason_code: string;
  message: string;
  details?: Readonly<Record<string, string>>;
}>;

export type DoctorResult = Readonly<{
  format_version: typeof DOCTOR_FORMAT_VERSION;
  sdk_version: string;
  ready: boolean;
  checks: readonly DoctorCheck[];
}>;

export type DoctorOptions = Pick<
  InitOptions,
  'endpoint' | 'sampleRate' | 'disableExport' | 'tracerProvider'
>;

function check(
  name: string,
  status: DoctorStatus,
  reason_code: string,
  message: string,
  details?: Record<string, string>,
): DoctorCheck {
  return Object.freeze({ name, status, reason_code, message, ...(details ? { details: Object.freeze(details) } : {}) });
}

function runtimeCheck(): DoctorCheck {
  const version = process.versions.node;
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  if (!Number.isFinite(major)) return check('runtime', 'warn', 'NODE_RUNTIME_VERSION_UNKNOWN', 'Node.js runtime version could not be parsed', { version });
  if (major < 18) return check('runtime', 'fail', 'NODE_RUNTIME_UNSUPPORTED', 'Node.js 18 or newer is required', { version });
  return check('runtime', 'pass', 'NODE_RUNTIME_SUPPORTED', 'Node.js runtime is supported', { version });
}

function packageCheck(): DoctorCheck {
  return check('package', 'pass', 'PACKAGE_METADATA_PRESENT', 'Neatlogs package metadata is present', { package: 'neatlogs', version: __version__ });
}

function endpointCheck(options: DoctorOptions): DoctorCheck {
  const raw = options.endpoint?.trim() || process.env.NEATLOGS_ENDPOINT?.trim() || 'https://ingest.neatlogs.com';
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return check('endpoint', 'fail', 'ENDPOINT_INVALID', 'Endpoint must be an HTTP(S) origin without credentials, query, or fragment'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.host) {
    return check('endpoint', 'fail', 'ENDPOINT_INVALID', 'Endpoint must be an HTTP(S) origin without credentials, query, or fragment');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    return check('endpoint', 'fail', 'ENDPOINT_PATH_UNSUPPORTED', 'Endpoint must be an origin; the SDK appends /v1/traces', { scheme: parsed.protocol.slice(0, -1), host: parsed.host });
  }
  return check('endpoint', 'pass', 'ENDPOINT_VALID', 'Endpoint origin is valid', { scheme: parsed.protocol.slice(0, -1), host: parsed.host });
}

function samplerCheck(options: DoctorOptions): DoctorCheck {
  const rate = options.sampleRate ?? 1;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1 || (options.tracerProvider && options.sampleRate !== undefined)) {
    return check('sampler', 'fail', 'SAMPLER_INVALID', 'Sample rate must be finite and between 0 and 1 and cannot configure a caller-owned provider');
  }
  return check('sampler', 'pass', 'SAMPLER_PARENT_BASED_VALID', 'ParentBased trace sampling is valid', { root_sample_rate: String(rate) });
}

function runtimeChecks(options: DoctorOptions): DoctorCheck[] {
  const runtime = _doctorRuntimeSnapshot();
  const queue = options.disableExport
    ? check('queue', 'warn', 'EXPORT_QUEUE_DISABLED', 'Export is disabled, so no batch queue will be created')
    : check('queue', 'pass', 'EXPORT_QUEUE_BATCHED', 'Export uses the OpenTelemetry batch span processor');
  if (!runtime.initialized || runtime.state !== 'running') {
    return [
      queue,
      check('export_health', 'unknown', 'EXPORT_HEALTH_UNOBSERVABLE', 'No running Neatlogs runtime is selected'),
      check('root', 'unknown', 'ROOT_UNOBSERVABLE', 'No running Neatlogs runtime is selected'),
    ];
  }
  const health = runtime.exportHealth;
  const exportCheck = !health
    ? check('export_health', 'unknown', 'EXPORT_HEALTH_UNOBSERVABLE', 'The running runtime has no export sink')
    : health.droppedSpans > 0 || health.exportFailures > 0
      ? check('export_health', 'fail', 'EXPORT_HEALTH_UNHEALTHY', 'The selected runtime has masking drops or exporter failures', { dropped_spans: String(health.droppedSpans), export_failures: String(health.exportFailures) })
      : check('export_health', 'pass', 'EXPORT_HEALTHY', 'The selected runtime has no observed export failures or drops', { dropped_spans: '0', export_failures: '0' });
  const root = getNeatlogsRootSpan();
  const context = root?.spanContext();
  const rootCheck = !root || !context
    ? check('root', 'unknown', 'ROOT_NOT_ACTIVE', 'The current async context does not carry an active Neatlogs root')
    : isSpanContextValid(context)
      ? check('root', 'pass', 'ROOT_IDS_VALID', 'Active owned root has valid trace and span IDs', { trace_id: context.traceId, span_id: context.spanId })
      : check('root', 'fail', 'ROOT_OWNERSHIP_INVALID', 'Owned context does not resolve to one active root');
  return [queue, exportCheck, rootCheck];
}

/**
 * Return local readiness without network access, initialization, flushing,
 * shutdown, configuration mutation, or credential disclosure.
 */
export function doctor(options: DoctorOptions = {}): DoctorResult {
  const checks: DoctorCheck[] = [
    runtimeCheck(),
    packageCheck(),
    check('schema', 'pass', 'SCHEMA_V2_HASH_VALID', 'Embedded telemetry schema v2 hash and fixtures are valid', { contract_version: TELEMETRY_CONTRACT_VERSION, schema_version: String(TELEMETRY_SCHEMA_VERSION), schema_sha256: TELEMETRY_SCHEMA_SHA256 }),
    check('transport', 'pass', 'TRANSPORT_OTLP_HTTP_PROTOBUF', 'SDK transport is OTLP HTTP/protobuf', { path: '/v1/traces' }),
    endpointCheck(options),
    samplerCheck(options),
    check('ownership', 'pass', 'OTEL_PROVIDER_PRIVATE', 'Neatlogs owns a private provider and leaves global OpenTelemetry state untouched'),
    ...runtimeChecks(options),
  ];
  return Object.freeze({ format_version: DOCTOR_FORMAT_VERSION, sdk_version: __version__, ready: !checks.some((item) => item.status === 'fail'), checks: Object.freeze(checks) });
}
