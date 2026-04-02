-- Add source_output_profile_id to field_groups
-- Links a field group to the output profile that scaffolded it.
-- Required for:
--   1. Scaffold idempotency check (prevent double-scaffold)
--   2. Export API — reliably locate the right field group for a profile
--   3. Product page — profile-aware field group badges and links
--
-- ON DELETE SET NULL so deleting a profile does not cascade-delete the field
-- group (the brand's content is preserved; it just loses the profile link).

ALTER TABLE public.field_groups
  ADD COLUMN IF NOT EXISTS source_output_profile_id UUID
    REFERENCES public.output_channel_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_field_groups_source_output_profile
  ON public.field_groups (source_output_profile_id)
  WHERE source_output_profile_id IS NOT NULL;

-- RLS: no new policies needed — field_groups already has org-scoped RLS.
-- source_output_profile_id is readable/writable under the same rules.
