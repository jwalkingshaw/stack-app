-- Output Channel Profiles
-- Defines named output destinations
-- Each profile specifies which fields and asset slots a product must have to be
-- considered "ready" for that output. This is the foundation of the Output Engine.

-- ─── output_channel_profiles ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.output_channel_profiles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  code            TEXT        NOT NULL,
  profile_type    TEXT        NOT NULL DEFAULT 'portal'
                              CHECK (profile_type IN ('portal', 'marketplace', 'retail', 'export', 'api')),
  description     TEXT,
  market_id       UUID        REFERENCES public.markets(id) ON DELETE SET NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb
                              CHECK (jsonb_typeof(metadata) = 'object'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_output_channel_profiles_org
  ON public.output_channel_profiles (organization_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_output_channel_profiles_market
  ON public.output_channel_profiles (market_id)
  WHERE market_id IS NOT NULL;

-- ─── output_profile_field_rules ─────────────────────────────────────────────
-- One row per field that a profile requires or constrains.
-- field_code matches product_fields.code in the same organization.

CREATE TABLE IF NOT EXISTS public.output_profile_field_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES public.output_channel_profiles(id) ON DELETE CASCADE,
  field_code  TEXT        NOT NULL,
  is_required BOOLEAN     NOT NULL DEFAULT true,
  max_length  INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, field_code)
);

CREATE INDEX IF NOT EXISTS idx_output_profile_field_rules_profile
  ON public.output_profile_field_rules (profile_id);

-- ─── updated_at trigger ─────────────────────────────────────────────────────

CREATE TRIGGER output_channel_profiles_updated_at
  BEFORE UPDATE ON public.output_channel_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.output_channel_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.output_profile_field_rules ENABLE ROW LEVEL SECURITY;

-- Profiles: org members can read; owner/admin can write
CREATE POLICY "output_channel_profiles_select" ON public.output_channel_profiles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY "output_channel_profiles_insert" ON public.output_channel_profiles
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "output_channel_profiles_update" ON public.output_channel_profiles
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "output_channel_profiles_delete" ON public.output_channel_profiles
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
    )
  );

-- Service role bypass
CREATE POLICY "output_channel_profiles_service_role" ON public.output_channel_profiles
  FOR ALL USING (current_setting('app.current_user_id', true) = 'service_role');

-- Field rules: inherit access from parent profile
CREATE POLICY "output_profile_field_rules_select" ON public.output_profile_field_rules
  FOR SELECT USING (
    profile_id IN (
      SELECT id FROM public.output_channel_profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE kinde_user_id = current_setting('app.current_user_id', true)
      )
    )
  );

CREATE POLICY "output_profile_field_rules_write" ON public.output_profile_field_rules
  FOR ALL USING (
    profile_id IN (
      SELECT id FROM public.output_channel_profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE kinde_user_id = current_setting('app.current_user_id', true)
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "output_profile_field_rules_service_role" ON public.output_profile_field_rules
  FOR ALL USING (current_setting('app.current_user_id', true) = 'service_role');
