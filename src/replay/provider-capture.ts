import { createHash } from 'node:crypto';
import type { Span } from '@opentelemetry/api';
import { z } from 'zod';
import { mediaReferences, sanitizeMediaPayload } from '../core/media.js';
import type { DatasetJson } from '../dataset/api.js';
import { isCompleteProviderResponse, providerData, replayProviderOperationSchema, type ReplayProviderOperation } from './provider.js';

export const MODEL_CAPTURE_ATTRIBUTE = 'neatlogs.replay.model_capture';
const MAX_BYTES = 1024 * 1024;
const recording = z.object({
  version: z.literal(1),
  operation: replayProviderOperationSchema,
  input: z.json(),
  output: z.json(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  // F-040: present only on captures assembled from a stream. It is inside the digest, and readers that
  // predate it use a strict schema, so they reject a streamed capture instead of replaying it.
  stream: z.literal(true).optional(),
}).strict();

function safeBody(value: unknown, response = false): DatasetJson {
  const body = providerData(value, response);
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded) > MAX_BYTES || mediaReferences(body, 'replay').length ||
      JSON.stringify(sanitizeMediaPayload(body, 'replay')) !== encoded) throw new Error('Provider data is not losslessly capturable.');
  return body;
}

function digest(operation: ReplayProviderOperation, input: DatasetJson, output: DatasetJson, stream = false) {
  const signed = stream ? { version: 1, operation, input, output, stream: true } : { version: 1, operation, input, output };
  return createHash('sha256').update(JSON.stringify(signed)).digest('hex');
}

/** Snapshot the request before caller/provider mutation; absence is an honest cache miss. */
export function prepareProviderCapture(
  span: Span,
  operation: ReplayProviderOperation,
  request: unknown,
  supported: boolean,
  options: { stream?: boolean } = {},
): ((response: unknown) => void) | undefined {
  // Undefined means capture cannot happen, so callers can skip any work done only for it.
  if (!supported || !span.isRecording()) return undefined;
  let input: DatasetJson;
  try {
    input = safeBody(request);
  } catch {
    return undefined;
  }
  const stream = options.stream === true;
  return response => {
    try {
      const output = safeBody(response, true);
      if (!isCompleteProviderResponse(operation, output)) return;
      const signed = digest(operation, input, output, stream);
      const encoded = JSON.stringify(stream
        ? { version: 1, operation, input, output, digest: signed, stream: true }
        : { version: 1, operation, input, output, digest: signed });
      if (Buffer.byteLength(encoded) <= MAX_BYTES) span.setAttribute(MODEL_CAPTURE_ATTRIBUTE, encoded);
    } catch {
      // Telemetry must not alter the provider result or failure.
    }
  };
}

export function readProviderCapture(value: unknown) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BYTES) throw new Error('Missing complete provider capture.');
  const saved = recording.parse(JSON.parse(value));
  const input = safeBody(saved.input);
  const output = safeBody(saved.output);
  const stream = saved.stream === true;
  if (digest(saved.operation, input, output, stream) !== saved.digest || !isCompleteProviderResponse(saved.operation, output)) throw new Error('Provider capture changed or is incomplete.');
  return { name: saved.operation, input, output, stream };
}
