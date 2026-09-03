import { describe, expect, it, vi } from 'vitest';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { runDoctorCli } from '../../src/doctor-cli.js';

function successfulProbeFixture() {
  const exported: ReadableSpan[] = [];
  const probeExporter: SpanExporter = {
    export(spans, callback) {
      exported.push(...spans);
      callback({ code: ExportResultCode.SUCCESS });
    },
    async forceFlush() {},
    async shutdown() {},
  };
  const response = () => {
    const spans = exported.filter((item) => item.name !== 'neatlogs.trace.complete');
    const kindToType: Record<string, string> = {
      WORKFLOW: 'workflow', AGENT: 'agent_action', LLM: 'llm', TOOL: 'tool_call',
    };
    return {
      _id: spans[0]!.spanContext().traceId,
      workflowName: 'neatlogs.doctor.v2',
      spanCount: spans.length,
      promptTokens: 11,
      completionTokens: 7,
      totalTokensUsed: 18,
      spans: spans.map((item) => {
        const rawKind = String(item.attributes['openinference.span.kind'] ?? item.attributes['neatlogs.span.kind'] ?? '');
        const kind = rawKind.replace(/^Neatlogs\./, '').toUpperCase();
        return {
          span_id: item.spanContext().spanId,
          ...(item.parentSpanId ? { parent_span_id: item.parentSpanId } : {}),
          node_name: item.name,
          node_type: kindToType[kind],
          data: {
            input_value: item.attributes['input.value'] ?? item.attributes['neatlogs.input'] ?? '{}',
            output_value: item.attributes['output.value'] ?? item.attributes['neatlogs.output'] ?? '{}',
          },
          span_metadata: {
            'neatlogs.doctor': item.attributes['neatlogs.doctor'],
            'neatlogs.doctor.version': item.attributes['neatlogs.doctor.version'],
            'telemetry.sdk.language': item.attributes['telemetry.sdk.language'],
          },
        };
      }),
    };
  };
  return { probeExporter, response };
}

function io(env: NodeJS.ProcessEnv = {}) {
  const output: string[] = [];
  const errors: string[] = [];
  return { output, errors, overrides: { env, stdout: (line: string) => output.push(line), stderr: (line: string) => errors.push(line) } };
}

describe('doctor CLI', () => {
  it('runs local checks without network access or credentials', async () => {
    const value = io({ NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fetch = vi.fn();
    const code = await runDoctorCli(['doctor', '--local', '--json'], { ...value.overrides, fetch });
    expect(code).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      format_version: 'neatlogs.doctor/v2', mode: 'local', status: 'pass',
      capture: { span_count: 4 },
      ownership: { provider: 'private' },
      queue: { mode: 'diagnostic_capture', pending_spans: 0, dropped_spans: 0 },
      flush: { outcome: 'success', timeout_ms: 5000 },
      checks: [{ reason_code: 'LOCAL_ENVELOPE_VALID' }],
    });
  });

  it('does not attempt a probe without credentials', async () => {
    const value = io();
    const fetch = vi.fn();
    const code = await runDoctorCli(['doctor', '--probe', '--json'], { ...value.overrides, fetch });
    expect(code).toBe(3);
    expect(fetch).not.toHaveBeenCalled();
    expect(value.output[0]).not.toContain('undefined');
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      format_version: 'neatlogs.doctor/v2', mode: 'probe', status: 'fail',
      first_failure: 'CREDENTIAL_MISSING',
      runtime: { language: 'typescript' },
      capture: { span_count: 4 },
      checks: expect.arrayContaining([expect.objectContaining({
        reason_code: 'CREDENTIAL_MISSING', remediation_code: 'SET_CREDENTIAL',
      })]),
    });
  });

  it('reports an invalid endpoint without throwing or contacting the backend', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'not-a-url' });
    const fetch = vi.fn();
    const code = await runDoctorCli(['doctor', '--probe', '--json'], { ...value.overrides, fetch });
    expect(code).toBe(3);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      status: 'fail', first_failure: 'ENDPOINT_INVALID',
      checks: expect.arrayContaining([expect.objectContaining({
        reason_code: 'ENDPOINT_INVALID', remediation_code: 'SET_ENDPOINT',
      })]),
    });
  });

  it('exports through the normal trace pipeline and verifies the exact trace', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fixture = successfulProbeFixture();
    const fetch = vi.fn(async () => new Response(JSON.stringify(fixture.response()), { status: 200 }));
    const code = await runDoctorCli(['doctor', '--probe', '--json'], {
      ...value.overrides,
      fetch: fetch as typeof globalThis.fetch,
      sleep: async () => undefined,
      probeExporter: fixture.probeExporter,
    });
    expect(code).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]![0])).toMatch(/^http:\/\/localhost:4100\/api\/traces\/v3\/[0-9a-f]{32}$/);
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: 'GET', headers: { 'x-api-key': 'private-key' },
    });
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      mode: 'probe', status: 'pass',
      capture: { span_count: 4 },
      probe: {
        ingest_route: '/v1/traces', marker_header: 'x-neatlogs-doctor', marker_version: 'v1',
        visible: true, readback_span_count: 4, hierarchy_valid: true,
        attributes_valid: true, input_output_valid: true, metadata_valid: true,
        typed_tokens_valid: true,
      },
      checks: expect.arrayContaining([expect.objectContaining({ reason_code: 'TRACE_VISIBLE' })]),
    });
    expect(value.output[0]).not.toContain('private-key');
  });

  it('never treats an accepted export without persisted visibility as success', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fixture = successfulProbeFixture();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'processing' }), { status: 202 }));
    const code = await runDoctorCli(['doctor', '--probe', '--json'], {
      ...value.overrides,
      fetch: fetch as typeof globalThis.fetch,
      sleep: async () => undefined,
      probeExporter: fixture.probeExporter,
    });
    expect(code).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(45);
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      status: 'fail', first_failure: 'BACKEND_PROBE_UNAVAILABLE',
    });
  });

  it('rejects redacted token counts returned by persistence', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fixture = successfulProbeFixture();
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ...fixture.response(),
      promptTokens: '[REDACTED]',
    }), { status: 200 }));
    const code = await runDoctorCli(['doctor', '--probe', '--json'], {
      ...value.overrides,
      fetch: fetch as typeof globalThis.fetch,
      probeExporter: fixture.probeExporter,
    });
    expect(code).toBe(3);
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      status: 'fail',
      first_failure: 'TYPED_TOKENS_VALID_FAILED',
      probe: { typed_tokens_valid: false },
    });
  });

  it('uses stable invocation exit code four', async () => {
    const value = io();
    expect(await runDoctorCli(['doctor'], value.overrides)).toBe(4);
    expect(value.errors[0]).toContain('Usage:');
  });
});
