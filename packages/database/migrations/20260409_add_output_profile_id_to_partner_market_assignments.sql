-- Add output_profile_id to partner_market_assignments
-- This enables the simplified partner sharing model:
-- brand assigns a partner to a market AND a channel profile in one step.
-- When a partner browses via market access, readiness is scored against this profile.

ALTER TABLE partner_market_assignments
  ADD COLUMN IF NOT EXISTS output_profile_id UUID
    REFERENCES output_channel_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN partner_market_assignments.output_profile_id IS
  'The output channel profile (channel) used to score product readiness when this partner browses via market access. NULL = no readiness scoring.';
