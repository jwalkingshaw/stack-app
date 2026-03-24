BEGIN;

ALTER TABLE IF EXISTS partner_update_shares
  ADD COLUMN IF NOT EXISTS onboarding_share_set_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_partner_update_shares_onboarding_share_set_ids
  ON partner_update_shares
  USING GIN (onboarding_share_set_ids);

COMMIT;
