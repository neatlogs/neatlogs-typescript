import { createHash } from 'node:crypto';
import { z } from 'zod';

export const abKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
export const abParamsSchema = z.record(z.string().min(1).max(100), z.union([
  z.string().max(2000), z.number().finite(), z.boolean(), z.null(),
])).refine(value => Object.keys(value).length <= 20);
const armSchema = z.object({
  key: z.enum(['a', 'b']), label: z.string().max(255), params: abParamsSchema,
  weight: z.number().int().min(0).max(10000),
});
export const allocationVersionSchema = z.number().int().min(1).max(2_147_483_647);
export const abConfigSchema = z.object({
  protocolVersion: z.literal(1), id: z.string().uuid(), key: abKeySchema,
  revision: z.number().int().positive(), allocationVersion: allocationVersionSchema,
  phase: z.enum(['analysis', 'rollout']).optional(), rolloutPercentage: z.union([z.literal(50), z.literal(100)]).optional(),
  salt: z.string().regex(/^[a-f0-9]{64}$/), unit: z.enum(['session', 'end_user']),
  status: z.enum(['draft', 'running', 'paused', 'auto_paused', 'concluded', 'ramping', 'shipped', 'rolled_back']),
  enabled: z.boolean(), defaultArm: z.enum(['a', 'b']),
  expiresAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
  refreshAfterSeconds: z.literal(60),
  assignment: z.literal('sha256_utf8_salt_colon_unit_first_uint32_be_mod_10000'),
  arms: z.tuple([armSchema.extend({ key: z.literal('a') }), armSchema.extend({ key: z.literal('b') })]),
  etag: z.string().min(1).max(200),
}).superRefine((value, ctx) => {
  const rollout = value.phase === 'rollout';
  const invalidPhase = rollout
    ? value.allocationVersion < 2 || value.rolloutPercentage === undefined || value.defaultArm !== 'a' ||
      value.enabled && (value.status !== (value.rolloutPercentage === 50 ? 'ramping' : 'shipped') || value.arms[1].weight !== value.rolloutPercentage * 100)
    : value.allocationVersion !== 1 || value.rolloutPercentage !== undefined || value.status === 'ramping' ||
      value.enabled && value.status !== 'running' || value.defaultArm !== (value.status === 'shipped' ? 'b' : 'a');
  if (value.arms[0].weight + value.arms[1].weight !== 10000 || invalidPhase ||
      !value.enabled && value.arms[value.defaultArm === 'a' ? 0 : 1].weight !== 10000) {
    ctx.addIssue({ code: 'custom', message: 'Invalid A/B allocation' });
  }
});
export const exposureSchema = z.object({
  eventId: z.string().uuid(), unitId: z.string().min(1).max(1024),
  arm: z.enum(['a', 'b']), traceId: z.string().min(1).max(255),
  allocationVersion: allocationVersionSchema, source: z.enum(['sdk', 'external']), unitComplete: z.boolean(),
});
export type AbConfig = z.infer<typeof abConfigSchema>;
export type AbParams = z.infer<typeof abParamsSchema>;
export type AbExposure = z.infer<typeof exposureSchema>;

export function assignmentBucket(salt: string, unitId: string): number {
  return createHash('sha256').update(`${salt}:${unitId}`, 'utf8').digest().readUInt32BE(0) % 10000;
}
