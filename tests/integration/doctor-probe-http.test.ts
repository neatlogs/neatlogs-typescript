import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { getCapturedEnvelope } from '../../src/core/doctor-capture.js';
import type { DiagnosticEnvelope } from '../../src/doctor-v2.js';
import { runDoctorCli } from '../../src/doctor-cli.js';

function persistedTrace(traceId: string, envelope: DiagnosticEnvelope | null) {
  if (!envelope) return null;
  const kinds: Record<string, string> = {
    WORKFLOW: 'workflow',
    AGENT: 'agent_action',
    LLM: 'llm',
    TOOL: 'tool_call',
  };
  return {
    _id: traceId,
    status: 'success',
    finalizationStatus: 'finalized',
    workflowName: 'neatlogs.doctor.v2',
    spanCount: envelope.spans.length,
    promptTokens: 11,
    completionTokens: 7,
    totalTokensUsed: 18,
    spans: envelope.spans.map((span) => {
      const materializedIo: Record<string, Readonly<{ input: unknown; output: unknown }>> = {
        'doctor.probe.root': { input: 'generated diagnostic input', output: 'Value: 2' },
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
      const io = materializedIo[span.name]!;
      return {
        span_id: span.span_id,
        ...(span.parent_span_id ? { parent_span_id: span.parent_span_id } : {}),
        node_name: span.name,
        node_type: kinds[span.kind],
        data: { input_value: io.input, output_value: io.output },
        span_metadata: span.attributes,
      };
    }),
  };
}

describe('Doctor probe over the actual OTLP HTTP exporter', () => {
  it('sends the versioned authenticated trace and reads back the exact trace ID', async () => {
    const requests: Array<Readonly<{
      method: string;
      path: string;
      apiKey?: string;
      doctor?: string;
      contentEncoding?: string;
      bodyBytes: number;
    }>> = [];
    let acceptedEnvelope: DiagnosticEnvelope | null = null;
    const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        method: request.method ?? '',
        path: request.url ?? '',
        apiKey: request.headers['x-api-key'] as string | undefined,
        doctor: request.headers['x-neatlogs-doctor'] as string | undefined,
        contentEncoding: request.headers['content-encoding'],
        bodyBytes: Buffer.concat(chunks).byteLength,
      });

      if (request.method === 'POST' && request.url === '/v1/traces') {
        acceptedEnvelope = getCapturedEnvelope();
        response.writeHead(200);
        response.end();
        return;
      }
      const traceId = /^\/api\/traces\/v3\/([0-9a-f]{32})$/.exec(request.url ?? '')?.[1];
      const trace = traceId ? persistedTrace(traceId, acceptedEnvelope) : null;
      if (request.method === 'GET' && trace) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(trace));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP test server did not bind');
    const output: string[] = [];

    try {
      const code = await runDoctorCli(['doctor', '--probe', '--json'], {
        env: {
          NEATLOGS_API_KEY: 'doctor-project-key',
          NEATLOGS_ENDPOINT: `http://127.0.0.1:${address.port}`,
        },
        stdout: (line) => output.push(line),
        stderr: () => undefined,
        probeTimeoutMs: 5_000,
        requestTimeoutMs: 1_000,
        pollIntervalMs: 10,
      });

      expect(code, JSON.stringify({ requests, output }, null, 2)).toBe(0);
      expect(JSON.parse(output[0]!)).toMatchObject({
        mode: 'probe',
        status: 'pass',
        capture: {
          span_count: 4,
          semantic_digest: 'sha256:7163d2de42c4165f3ae552279fdde2ec0839413ce608c6e5d71f3fb532df319b',
        },
        probe: {
          visible: true,
          readback_trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
          finalized: true,
          meaningful_root_count: 1,
          duplicate_span_count: 0,
          readback_span_count: 4,
        },
      });
      const post = requests.find((request) => request.method === 'POST');
      const read = requests.find((request) => request.method === 'GET');
      expect(post).toMatchObject({
        path: '/v1/traces',
        apiKey: 'doctor-project-key',
        doctor: 'v1',
        contentEncoding: 'gzip',
      });
      expect(post?.bodyBytes).toBeGreaterThan(0);
      expect(read).toMatchObject({ apiKey: 'doctor-project-key' });
      expect(read?.path).toMatch(/^\/api\/traces\/v3\/[0-9a-f]{32}$/);
      expect(output[0]).not.toContain('doctor-project-key');
    } finally {
      server.close();
      await once(server, 'close');
    }
  }, 15_000);

  it('classifies a rejected project key without exposing it', async () => {
    const requests: Array<Readonly<{ method: string; path: string }>> = [];
    const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      for await (const _chunk of request) {
        // Drain the real OTLP request before replying.
      }
      requests.push({ method: request.method ?? '', path: request.url ?? '' });
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'unauthorized' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP test server did not bind');
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const code = await runDoctorCli(['doctor', '--probe', '--json'], {
        env: {
          NEATLOGS_API_KEY: 'rejected-project-key',
          NEATLOGS_ENDPOINT: `http://127.0.0.1:${address.port}`,
        },
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        probeTimeoutMs: 2_000,
        requestTimeoutMs: 500,
        pollIntervalMs: 10,
      });

      expect(code).toBe(3);
      expect(JSON.parse(stdout[0]!)).toMatchObject({
        mode: 'probe',
        status: 'fail',
        first_failure: 'AUTH_FAILED',
      });
      expect(requests.some((request) => request.method === 'POST' && request.path === '/v1/traces')).toBe(true);
      expect(requests.some((request) => request.method === 'GET' && /^\/api\/traces\/v3\/[0-9a-f]{32}$/.test(request.path))).toBe(true);
      expect(`${stdout.join('\n')}\n${stderr.join('\n')}`).not.toContain('rejected-project-key');
    } finally {
      server.close();
      await once(server, 'close');
    }
  }, 15_000);
});
