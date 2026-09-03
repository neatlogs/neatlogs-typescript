import { describe, expect, it, vi } from 'vitest';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { runDoctorCli } from '../../src/doctor-cli.js';
import { getDoctorCaptureStats } from '../../src/core/doctor-capture.js';

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
      status: 'success',
      finalizationStatus: 'finalized',
      workflowName: 'neatlogs.doctor.v2',
      spanCount: spans.length,
      promptTokens: 11,
      completionTokens: 7,
      totalTokensUsed: 18,
      spans: spans.map((item) => {
        const rawKind = String(item.attributes['openinference.span.kind'] ?? item.attributes['neatlogs.span.kind'] ?? '');
        const kind = rawKind.replace(/^Neatlogs\./, '').toUpperCase();
        const materializedIo: Record<string, Readonly<{ input: unknown; output: unknown }>> = {
          'doctor.probe.root': {
            input: 'generated diagnostic input',
            output: 'Value: 2',
          },
          'doctor.probe.agent': {
            input: 'Prompt: generated diagnostic input',
            output: JSON.stringify({ text: 'generated diagnostic output' }),
          },
          'doctor.probe.llm': {
            input: { prompt: 'generated diagnostic input' },
            output: 'Text: generated diagnostic output',
          },
          'doctor.probe.tool': { input: 'Value: 1', output: 'Value: 2' },
        };
        const io = materializedIo[item.name]!;
        return {
          span_id: item.spanContext().spanId,
          ...(item.parentSpanId ? { parent_span_id: item.parentSpanId } : {}),
          node_name: item.name,
          node_type: kindToType[kind],
          data: {
            input_value: io.input,
            output_value: io.output,
          },
          span_metadata: {
            'neatlogs.doctor': item.attributes['neatlogs.doctor'],
            'neatlogs.doctor.version': item.attributes['neatlogs.doctor.version'],
            'service.name': item.attributes['service.name'],
            'telemetry.sdk.language': item.attributes['telemetry.sdk.language'],
            'telemetry.sdk.version': item.attributes['telemetry.sdk.version'],
            'neatlogs.span.kind': item.attributes['neatlogs.span.kind'],
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
      capture: {
        span_count: 4,
        semantic_digest: 'sha256:7163d2de42c4165f3ae552279fdde2ec0839413ce608c6e5d71f3fb532df319b',
      },
      ownership: { provider: 'private' },
      queue: { mode: 'diagnostic_capture', pending_spans: 0, dropped_spans: 0 },
      flush: { outcome: 'success', timeout_ms: 5000 },
      checks: expect.arrayContaining([
        expect.objectContaining({ reason_code: 'LOCAL_ENVELOPE_VALID' }),
        expect.objectContaining({ reason_code: 'CONTROLLED_HIERARCHY_VALID' }),
        expect.objectContaining({ reason_code: 'CONTROLLED_METADATA_VALID' }),
      ]),
    });
    expect(getDoctorCaptureStats().traceCount).toBe(0);
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
      capture: {
        span_count: 4,
        semantic_digest: 'sha256:7163d2de42c4165f3ae552279fdde2ec0839413ce608c6e5d71f3fb532df319b',
      },
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
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      mode: 'probe', status: 'pass',
      capture: {
        span_count: 4,
        semantic_digest: 'sha256:7163d2de42c4165f3ae552279fdde2ec0839413ce608c6e5d71f3fb532df319b',
      },
      probe: {
        ingest_route: '/v1/traces', marker_header: 'x-neatlogs-doctor', marker_version: 'v1',
        readback_trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
        finalized: true, meaningful_root_count: 1, duplicate_span_count: 0,
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
      probeTimeoutMs: 5,
      requestTimeoutMs: 5,
      pollIntervalMs: 5,
      probeExporter: fixture.probeExporter,
    });
    expect(code).toBe(3);
    expect(fetch).toHaveBeenCalled();
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(2);
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
      first_failure: 'TYPED_TOKENS_INVALID',
      probe: { typed_tokens_valid: false },
    });
  });

  it.each([
    ['mismatched trace identity', (response: any) => {
      response._id = 'f'.repeat(32);
    }, 'TRACE_ID_MISMATCH', { readback_trace_id: 'f'.repeat(32) }],
    ['non-terminal trace', (response: any) => {
      response.status = 'processing';
      response.finalizationStatus = 'pending';
    }, 'TRACE_NOT_FINALIZED', { finalized: false }],
    ['terminal error trace', (response: any) => {
      response.status = 'error';
      response.finalizationStatus = 'finalized';
    }, 'TRACE_NOT_FINALIZED', { finalized: false }],
    ['multiple meaningful roots', (response: any) => {
      const agent = response.spans.find((item: any) => item.node_name === 'doctor.probe.agent');
      delete agent.parent_span_id;
    }, 'ROOT_COUNT_INVALID', { meaningful_root_count: 2 }],
    ['duplicate span identity', (response: any) => {
      response.spans[3].span_id = response.spans[0].span_id;
    }, 'DUPLICATE_SPANS', { duplicate_span_count: 1 }],
  ])('fails closed for %s proof', async (_name, mutate, expectedReason, expectedProbe) => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fixture = successfulProbeFixture();
    const fetch = vi.fn(async () => {
      const response = fixture.response() as any;
      mutate(response);
      return new Response(JSON.stringify(response), { status: 200 });
    });
    const code = await runDoctorCli(['doctor', '--probe', '--json'], {
      ...value.overrides,
      fetch: fetch as typeof globalThis.fetch,
      probeExporter: fixture.probeExporter,
    });
    expect(code).toBe(3);
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      status: 'fail', first_failure: expectedReason, probe: expectedProbe,
    });
  });

  it('cancels a permanently stalled read request within the deadline', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fixture = successfulProbeFixture();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_url: URL, options?: RequestInit) => {
      signal = options?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    const code = await runDoctorCli(['doctor', '--probe', '--json'], {
      ...value.overrides,
      fetch: fetch as typeof globalThis.fetch,
      probeExporter: fixture.probeExporter,
      requestTimeoutMs: 5,
      probeTimeoutMs: 20,
    });
    expect(code).toBe(3);
    expect(signal?.aborted).toBe(true);
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      status: 'fail', first_failure: 'BACKEND_PROBE_UNAVAILABLE',
    });
  });

  it.each([
    ['extra span', (response: any) => {
      response.spans.push({
        ...response.spans[3],
        span_id: 'f'.repeat(16),
        parent_span_id: response.spans[0].span_id,
        node_name: 'unexpected',
      });
      response.spanCount = 5;
    }, 'TRACE_INCOMPLETE'],
    ['wrong edge', (response: any) => {
      const llm = response.spans.find((item: any) => item.node_name === 'doctor.probe.llm');
      const root = response.spans.find((item: any) => item.node_name === 'doctor.probe.root');
      llm.parent_span_id = root.span_id;
    }, 'HIERARCHY_INVALID'],
    ['missing metadata', (response: any) => {
      response.spans[0].span_metadata['telemetry.sdk.version'] = undefined;
    }, 'METADATA_INVALID'],
    ['null output', (response: any) => {
      response.spans[0].data.output_value = null;
    }, 'INPUT_OUTPUT_INVALID'],
  ])('fails closed for %s', async (_name, mutate, expectedReason) => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fixture = successfulProbeFixture();
    const fetch = vi.fn(async () => {
      const response = fixture.response() as any;
      mutate(response);
      return new Response(JSON.stringify(response), { status: 200 });
    });
    const code = await runDoctorCli(['doctor', '--probe', '--json'], {
      ...value.overrides,
      fetch: fetch as typeof globalThis.fetch,
      probeExporter: fixture.probeExporter,
    });
    expect(code).toBe(3);
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      status: 'fail', first_failure: expectedReason,
    });
  });

  it('maps authenticated read rejection without exposing the key', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const fixture = successfulProbeFixture();
    const fetch = vi.fn(async () => new Response(null, { status: 403 }));
    const code = await runDoctorCli(['doctor', '--probe', '--json'], {
      ...value.overrides,
      fetch: fetch as typeof globalThis.fetch,
      probeExporter: fixture.probeExporter,
    });
    expect(code).toBe(3);
    expect(value.output[0]).not.toContain('private-key');
    expect(JSON.parse(value.output[0]!)).toMatchObject({
      status: 'fail', first_failure: 'AUTH_FAILED',
    });
  });

  it('uses stable invocation exit code four', async () => {
    const value = io();
    expect(await runDoctorCli(['doctor'], value.overrides)).toBe(4);
    expect(value.errors[0]).toContain('Usage:');
  });
});
