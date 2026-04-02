-- Add output_profile_id to share_sets
-- Links a share set to the output profile that defines its content contract.
--
-- Purpose:
--   A share set answers "which products/assets can a partner see."
--   An output profile answers "which fields are required and how they're validated."
--   Linking them means a partner's view of products is scored against a specific
--   profile — e.g. a partner granted "Amazon US Catalog" sees readiness scored
--   against the amazon-us profile's field rules.
--
-- Behaviour:
--   ON DELETE SET NULL — deleting a profile does not remove the share set or its
--   items; it just clears the profile context (readiness scoring falls back to
--   unscored until a new profile is assigned).
--
-- Cardinality:
--   Many share sets can reference the same profile (one profile, many audiences).
--   One share set has at most one profile (one content contract per package).

ALTER TABLE public.share_sets
  ADD COLUMN IF NOT EXISTS output_profile_id UUID
    REFERENCES public.output_channel_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_share_sets_output_profile
  ON public.share_sets (output_profile_id)
  WHERE output_profile_id IS NOT NULL;

-- RLS: no new policies needed — share_sets already has org-scoped RLS.
-- output_profile_id is readable/writable under the same rules.
