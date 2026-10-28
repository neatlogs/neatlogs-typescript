import { z } from 'zod';
import { abKeySchema, allocationVersionSchema } from '../ab-test/protocol.js';

export const agentParamsSchema = z.record(z.string().min(1).max(100), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]));
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const expiry = z.string().datetime({ offset: true });
const uuid = z.string().uuid();
export const agentAttributesSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/), z.union([z.string().max(256), z.boolean()]))
  .refine(value => Object.keys(value).length <= 20);
export const agentUnitSchema = z.string().min(1).max(512);
const sessionCompletion = { unit: z.literal('session'), completionPolicy: z.literal('explicit') };
const customerCompletion = { unit: z.literal('end_user'), completionPolicy: z.literal('fixed_horizon') };
const live = {
  testId: uuid, experimentId: uuid, candidateRevision: revision, allocationVersion: allocationVersionSchema,
  currentFingerprint: fingerprint, candidateFingerprint: fingerprint, policyDigest: fingerprint,
  status: z.enum(['running', 'paused', 'auto_paused']),
  effectiveTrafficBps: z.number().int().min(0).max(10000), targetTrafficBps: z.number().int().min(0).max(10000),
  split: z.object({ a: z.number().int().min(0).max(10000), b: z.number().int().min(0).max(10000) }).strict(),
};
export const agentConfigSchema = z.object({
  protocolVersion: z.literal(2), agentKey: abKeySchema, revision, expiresAt: expiry,
  current: z.object({ fingerprint, params: agentParamsSchema }).strict(),
  live: z.union([z.object({ ...live, ...sessionCompletion }).strict(), z.object({ ...live, ...customerCompletion }).strict()]).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.live && (value.live.split.a + value.live.split.b !== 10000 || value.live.effectiveTrafficBps > value.live.targetTrafficBps || value.current.fingerprint !== value.live.currentFingerprint))
    ctx.addIssue({ code: 'custom', message: 'Invalid agent allocation' });
});
const base = { protocolVersion: z.literal(2), agentKey: abKeySchema, revision, expiresAt: expiry, params: agentParamsSchema, fingerprint };
const assigned = { ...base, reason: z.literal('assigned'), arm: z.enum(['a', 'b']), experimentId: uuid, candidateRevision: revision,
  testId: uuid, allocationVersion: allocationVersionSchema, enrollmentId: uuid, assignmentId: uuid };
export const agentAssignmentSchema = z.union([
  z.object({ ...base, reason: z.enum(['outside_audience', 'outside_share', 'paused', 'current']), arm: z.literal('a') }).strict(),
  z.object({ ...assigned, ...sessionCompletion }).strict(),
  z.object({ ...assigned, ...customerCompletion }).strict(),
]);
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentAssignment = z.infer<typeof agentAssignmentSchema>;
export type AgentAttributes = z.infer<typeof agentAttributesSchema>;
