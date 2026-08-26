import { describe, expect, it, vi } from 'vitest';
import { runDoctorCli } from '../../src/doctor-cli.js';

function io(env: NodeJS.ProcessEnv = {}) {
  const output: string[] = [];
  const errors: string[] = [];
  return { output, errors, overrides: { env, stdout: (line: string) => output.push(line), stderr: (line: string) => errors.push(line) } };
}

describe('doctor CLI', () => {
  it('runs local checks without network access or credentials', async () => {
    const value = io({ NEATLOGS_ENDPOINT: 'http://localhost:4100', NEATLOGS_API_KEY: 'configured' });
    const fetch = vi.fn();
    const code = await runDoctorCli(['doctor', '--local', '--json'], { ...value.overrides, fetch });
    expect(code).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(value.output[0]!)).toMatchObject({ format_version: 'neatlogs.doctor/v2', mode: 'local', status: 'pass', capture: null });
  });

  it('reports missing credentials without exposing environment content', async () => {
    const value = io({ NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    expect(await runDoctorCli(['doctor', '--local', '--json'], value.overrides)).toBe(2);
    expect(JSON.parse(value.output[0]!)).toMatchObject({ status: 'fail', first_failure: 'MISSING_CREDENTIALS' });
  });

  it('does not attempt a probe without credentials', async () => {
    const value = io();
    const fetch = vi.fn();
    const code = await runDoctorCli(['doctor', '--probe', '--json'], { ...value.overrides, fetch });
    expect(code).toBe(3);
    expect(fetch).not.toHaveBeenCalled();
    expect(value.output[0]).not.toContain('undefined');
    expect(JSON.parse(value.output[0]!)).toMatchObject({ first_failure: 'MISSING_CREDENTIALS' });
  });

  it('polls the actual backend receipt shape and passes only after visibility', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const diagnosticSessionId = `diag_${'a'.repeat(18)}`;
    const stages = ['auth', 'schema_decode', 'pii', 'kafka', 'raw_durable', 'root_resolution', 'simplified_durable', 'visibility'].map((stage) => ({ stage, status: 'accepted', reason_code: `${stage.toUpperCase()}_ACCEPTED`, at: '2030-01-01T00:00:00Z', internal: 'never-print' }));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ format_version: 'neatlogs.doctor-session/v2', diagnostic_id: diagnosticSessionId, probe_token: 'dpt_secret', created_at: '2030-01-01T00:00:00Z', expires_at: '2030-01-01T00:10:00Z', fixture_version: 'doctor-fixture/v1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ format_version: 'neatlogs.diagnostic-receipt/v2', diagnostic_id: diagnosticSessionId, status: 'pass', first_failure: null, stages, private_logic: 'never-print' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const code = await runDoctorCli(['doctor', '--probe', '--json'], { ...value.overrides, fetch: fetch as typeof globalThis.fetch, sleep: async () => undefined });
    expect(code).toBe(0);
    expect(fetch).toHaveBeenNthCalledWith(1, new URL('http://localhost:4100/api/diagnostics/v2/sessions'), expect.objectContaining({ body: '{}', headers: expect.objectContaining({ 'x-api-key': 'private-key' }) }));
    expect(fetch).toHaveBeenNthCalledWith(2, new URL(`http://localhost:4100/api/diagnostics/v2/sessions/${diagnosticSessionId}`), expect.objectContaining({ method: 'GET' }));
    expect(value.output[0]).toContain(diagnosticSessionId);
    expect(value.output[0]).toContain('simplified_durable');
    expect(value.output[0]).not.toContain('private-key');
    expect(value.output[0]).not.toContain('dpt_secret');
    expect(value.output[0]).not.toContain('never-print');
  });

  it('never treats auth-only session creation as probe success', async () => {
    const value = io({ NEATLOGS_API_KEY: 'private-key', NEATLOGS_ENDPOINT: 'http://localhost:4100' });
    const diagnosticSessionId = `diag_${'b'.repeat(18)}`;
    const session = { format_version: 'neatlogs.diagnostic-receipt/v2', diagnostic_id: diagnosticSessionId, status: 'pending', first_failure: null, stages: [{ stage: 'auth', status: 'accepted', reason_code: 'AUTH_ACCEPTED', at: '2030-01-01T00:00:00Z' }] };
    const fetch = vi.fn(async (_url: URL, options?: RequestInit) => options?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(options?.method === 'POST' ? { format_version: 'neatlogs.doctor-session/v2', diagnostic_id: diagnosticSessionId, probe_token: 'dpt_secret', created_at: '2030-01-01T00:00:00Z', expires_at: '2030-01-01T00:10:00Z', fixture_version: 'doctor-fixture/v1' } : session), { status: options?.method === 'POST' ? 201 : 200 }));
    const code = await runDoctorCli(['doctor', '--probe', '--json'], { ...value.overrides, fetch: fetch as typeof globalThis.fetch, sleep: async () => undefined });
    expect(code).toBe(3);
    expect(JSON.parse(value.output[0]!)).toMatchObject({ status: 'fail', first_failure: 'BACKEND_PROBE_INCOMPLETE', stages: [{ stage: 'auth', status: 'accepted' }] });
    expect(value.output[0]).not.toContain('dpt_secret');
  });

  it('uses stable invocation exit code four', async () => {
    const value = io();
    expect(await runDoctorCli(['doctor'], value.overrides)).toBe(4);
    expect(value.errors[0]).toContain('Usage:');
  });
});
