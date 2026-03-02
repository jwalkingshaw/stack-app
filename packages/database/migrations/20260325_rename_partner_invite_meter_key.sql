BEGIN;

UPDATE billing_plans
SET limits = jsonb_set(
  limits - 'externalPartnerInviteCount',
  '{partnerInviteCount}',
  COALESCE(limits->'partnerInviteCount', limits->'externalPartnerInviteCount', '0'::jsonb),
  true
)
WHERE limits ? 'externalPartnerInviteCount';

UPDATE billing_addons
SET increments = jsonb_set(
  increments - 'externalPartnerInviteCount',
  '{partnerInviteCount}',
  COALESCE(increments->'partnerInviteCount', increments->'externalPartnerInviteCount', '0'::jsonb),
  true
)
WHERE increments ? 'externalPartnerInviteCount';

COMMIT;
