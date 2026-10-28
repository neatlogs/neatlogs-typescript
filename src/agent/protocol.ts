import { z } from 'zod';
import { abKeySchema, allocationVersionSchema } from '../ab-test/protocol.js';

export const agentParamsSchema = z.record(z.string().min(1).max(100), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]));
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const expiry = z.string().datetime({ offset: true });
const uuid = z.string().uuid();
const attributeKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/);
export const AGENT_PROFILE = 'serving-trace-v1' as const;
export const AGENT_CAPABILITY_HEADER = 'X-Neatlogs-Agent-Capability';
export const agentAttributesSchema = z.record(attributeKey, z.union([z.string().max(256), z.boolean()]))
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
const legacyConfigSchema = z.object({
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
const legacyAssignmentSchema = z.union([
  z.object({ ...base, reason: z.enum(['outside_audience', 'outside_share', 'paused', 'current']), arm: z.literal('a') }).strict(),
  z.object({ ...assigned, ...sessionCompletion }).strict(),
  z.object({ ...assigned, ...customerCompletion }).strict(),
]);
const servingRef = z.object({ revisionId: uuid, revision, digest: fingerprint }).strict();
const serving = servingRef.extend({
  unit: z.enum(['session', 'end_user']),
  requiredAttributeKeys: z.array(attributeKey).max(20).refine(keys => new Set(keys).size === keys.length && keys.every((key, index) => key === [...keys].sort()[index])),
  allowedIdentities: z.array(z.object({ publicationId: uuid, fingerprint }).strict()).max(32)
    .refine(identities => new Set(identities.map(identity => identity.publicationId)).size === identities.length),
}).strict();
const enhancedLive = z.object(live).omit({ currentFingerprint: true }).extend({
  agentProfile: z.enum(['legacy-v2', AGENT_PROFILE]),
  current: z.object({ fingerprint, params: agentParamsSchema }).strict(),
  baselineServing: servingRef.nullable(),
});
const enhancedConfigSchema = z.object({
  protocolVersion: z.literal(2), profile: z.literal(AGENT_PROFILE), agentKey: abKeySchema, revision, expiresAt: expiry,
  current: z.object({ fingerprint, params: agentParamsSchema }).strict(),
  live: z.union([enhancedLive.extend(sessionCompletion).strict(), enhancedLive.extend(customerCompletion).strict()]).nullable(),
  serving: serving.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.live && (value.live.split.a + value.live.split.b !== 10000 || value.live.effectiveTrafficBps > value.live.targetTrafficBps || value.serving && value.live.unit !== value.serving.unit))
    ctx.addIssue({ code: 'custom', message: 'Invalid enhanced agent allocation' });
});
const enhancedBase = { ...base, profile: z.literal(AGENT_PROFILE) };
const enhancedAssignmentSchema = z.union([
  z.object({ ...enhancedBase, reason: z.enum(['outside_audience', 'outside_share', 'paused', 'current']), arm: z.literal('a') }).strict(),
  z.object({ ...assigned, profile: z.literal(AGENT_PROFILE), ...sessionCompletion }).strict(),
  z.object({ ...assigned, profile: z.literal(AGENT_PROFILE), ...customerCompletion }).strict(),
  z.object({ ...enhancedBase, reason: z.literal('published'), unit: z.enum(['session', 'end_user']), unitId: agentUnitSchema,
    attributesDigest: fingerprint, serving: servingRef.extend({ publicationId: uuid }).strict() }).strict(),
]);
export const agentConfigSchema = z.union([legacyConfigSchema, enhancedConfigSchema]);
export const agentAssignmentSchema = z.union([legacyAssignmentSchema, enhancedAssignmentSchema]);
export type AgentConfig = (z.infer<typeof legacyConfigSchema> & { profile?: never; serving?: never }) | z.infer<typeof enhancedConfigSchema>;
type EnhancedAssignment = z.infer<typeof enhancedAssignmentSchema>;
export type AgentAssignment = (z.infer<typeof legacyAssignmentSchema> & { profile?: never; serving?: never; attributesDigest?: never })
  | Exclude<EnhancedAssignment, { reason: 'published' }>
  | (Extract<EnhancedAssignment, { reason: 'published' }> & { arm?: never });
export type AgentAttributes = z.infer<typeof agentAttributesSchema>;
