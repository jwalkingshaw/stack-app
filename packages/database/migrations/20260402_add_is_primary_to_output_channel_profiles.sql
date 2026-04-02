-- Add is_primary to output_channel_profiles
-- Marks the org's default profile for list-level readiness display.
--
-- Purpose:
--   A product can have readiness scores against many profiles simultaneously.
--   The PIM table (product list) needs to show one score per product without
--   requiring the user to pick a profile first. is_primary determines which
--   profile that score is drawn from.
--
-- Constraints:
--   No DB-level uniqueness enforced — enforced at application layer so the UI
--   can update the primary flag without a transaction dance. The API should
--   unset the previous primary before setting a new one, or use a single UPDATE.
--
-- Behaviour:
--   Default false — existing profiles are unaffected.
--   When no profile has is_primary = true, the PIM table column falls back to
--   "no score" rather than picking arbitrarily.
--
-- Future:
--   The partner portal may also use is_primary to determine the default
--   readiness context when a partner is granted multiple share sets.

ALTER TABLE public.output_channel_profiles
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_output_channel_profiles_primary
  ON public.output_channel_profiles (organization_id, is_primary)
  WHERE is_primary = true;

-- RLS: no new policies needed — output_channel_profiles already has org-scoped RLS.
