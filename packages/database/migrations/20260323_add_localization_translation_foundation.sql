BEGIN;

-- -----------------------------------------------------------------------------
-- Phase D0 foundation: localization settings, translation jobs, glossary, meters
-- -----------------------------------------------------------------------------

ALTER TABLE IF EXISTS product_fields
  ADD COLUMN IF NOT EXISTS is_translatable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_write_assist_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS translation_content_type TEXT NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_fields'
      AND column_name = 'translation_content_type'
  ) THEN
    BEGIN
      ALTER TABLE product_fields
        ADD CONSTRAINT product_fields_translation_content_type_check
          CHECK (translation_content_type IN ('title', 'description', 'bullets', 'other'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS organization_localization_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  translation_enabled BOOLEAN NOT NULL DEFAULT false,
  write_assist_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_create_pending_tasks_for_new_locale BOOLEAN NOT NULL DEFAULT false,
  default_source_locale_id UUID REFERENCES locales(id) ON DELETE SET NULL,
  default_target_locale_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_localization_settings_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_org_localization_settings_default_source_locale
  ON organization_localization_settings(default_source_locale_id);

DROP TRIGGER IF EXISTS set_org_localization_settings_updated_at ON organization_localization_settings;
CREATE TRIGGER set_org_localization_settings_updated_at
  BEFORE UPDATE ON organization_localization_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE organization_localization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_localization_settings_select_policy ON organization_localization_settings;
DROP POLICY IF EXISTS org_localization_settings_write_policy ON organization_localization_settings;

CREATE POLICY org_localization_settings_select_policy ON organization_localization_settings
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY org_localization_settings_write_policy ON organization_localization_settings
  FOR ALL USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS translation_glossaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_language_code TEXT NOT NULL,
  target_language_code TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deepl',
  provider_glossary_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT translation_glossaries_provider_check
    CHECK (provider IN ('deepl')),
  CONSTRAINT translation_glossaries_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT translation_glossaries_name_nonempty
    CHECK (btrim(name) <> ''),
  CONSTRAINT translation_glossaries_unique_pair
    UNIQUE (organization_id, name, source_language_code, target_language_code)
);

CREATE INDEX IF NOT EXISTS idx_translation_glossaries_org_active
  ON translation_glossaries(organization_id, is_active, updated_at DESC);

DROP TRIGGER IF EXISTS set_translation_glossaries_updated_at ON translation_glossaries;
CREATE TRIGGER set_translation_glossaries_updated_at
  BEFORE UPDATE ON translation_glossaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE translation_glossaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translation_glossaries_select_policy ON translation_glossaries;
DROP POLICY IF EXISTS translation_glossaries_write_policy ON translation_glossaries;

CREATE POLICY translation_glossaries_select_policy ON translation_glossaries
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY translation_glossaries_write_policy ON translation_glossaries
  FOR ALL USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS translation_glossary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  glossary_id UUID NOT NULL REFERENCES translation_glossaries(id) ON DELETE CASCADE,
  source_term TEXT NOT NULL,
  target_term TEXT NOT NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT translation_glossary_entries_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT translation_glossary_entries_source_nonempty
    CHECK (btrim(source_term) <> ''),
  CONSTRAINT translation_glossary_entries_target_nonempty
    CHECK (btrim(target_term) <> ''),
  CONSTRAINT translation_glossary_entries_unique_source_term
    UNIQUE (glossary_id, source_term)
);

CREATE INDEX IF NOT EXISTS idx_translation_glossary_entries_org_glossary
  ON translation_glossary_entries(organization_id, glossary_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_translation_glossary_entries_updated_at ON translation_glossary_entries;
CREATE TRIGGER set_translation_glossary_entries_updated_at
  BEFORE UPDATE ON translation_glossary_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE translation_glossary_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translation_glossary_entries_select_policy ON translation_glossary_entries;
DROP POLICY IF EXISTS translation_glossary_entries_write_policy ON translation_glossary_entries;

CREATE POLICY translation_glossary_entries_select_policy ON translation_glossary_entries
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY translation_glossary_entries_write_policy ON translation_glossary_entries
  FOR ALL USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS translation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by TEXT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  source_locale_id UUID REFERENCES locales(id) ON DELETE SET NULL,
  target_locale_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_selection JSONB NOT NULL DEFAULT '{}'::jsonb,
  product_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  provider TEXT NOT NULL DEFAULT 'deepl',
  provider_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_chars BIGINT NOT NULL DEFAULT 0,
  actual_chars BIGINT NOT NULL DEFAULT 0,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT translation_jobs_type_check
    CHECK (job_type IN ('translate', 'write_assist')),
  CONSTRAINT translation_jobs_status_check
    CHECK (status IN ('queued', 'running', 'review_required', 'completed', 'failed', 'cancelled')),
  CONSTRAINT translation_jobs_provider_check
    CHECK (provider IN ('deepl')),
  CONSTRAINT translation_jobs_scope_object
    CHECK (jsonb_typeof(scope) = 'object'),
  CONSTRAINT translation_jobs_field_selection_object
    CHECK (jsonb_typeof(field_selection) = 'object'),
  CONSTRAINT translation_jobs_provider_meta_object
    CHECK (jsonb_typeof(provider_meta) = 'object'),
  CONSTRAINT translation_jobs_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT translation_jobs_chars_nonnegative
    CHECK (estimated_chars >= 0 AND actual_chars >= 0),
  CONSTRAINT translation_jobs_id_org_unique
    UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_org_status_created
  ON translation_jobs(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_org_requested_by_created
  ON translation_jobs(organization_id, requested_by, created_at DESC);

DROP TRIGGER IF EXISTS set_translation_jobs_updated_at ON translation_jobs;
CREATE TRIGGER set_translation_jobs_updated_at
  BEFORE UPDATE ON translation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE translation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translation_jobs_select_policy ON translation_jobs;
DROP POLICY IF EXISTS translation_jobs_write_policy ON translation_jobs;

CREATE POLICY translation_jobs_select_policy ON translation_jobs
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY translation_jobs_write_policy ON translation_jobs
  FOR ALL USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin', 'member')
        AND status = 'active'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin', 'member')
        AND status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS translation_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_field_id UUID REFERENCES product_fields(id) ON DELETE SET NULL,
  field_code TEXT NOT NULL,
  source_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_value JSONB NOT NULL DEFAULT 'null'::jsonb,
  suggested_value JSONB,
  edited_value JSONB,
  final_value JSONB,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  applied_by TEXT,
  applied_at TIMESTAMPTZ,
  provider_request_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_response_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT translation_job_items_job_org_fk
    FOREIGN KEY (job_id, organization_id)
    REFERENCES translation_jobs(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT translation_job_items_status_check
    CHECK (status IN ('queued', 'generated', 'reviewed', 'approved', 'rejected', 'applied', 'failed', 'stale')),
  CONSTRAINT translation_job_items_source_scope_object
    CHECK (jsonb_typeof(source_scope) = 'object'),
  CONSTRAINT translation_job_items_target_scope_object
    CHECK (jsonb_typeof(target_scope) = 'object'),
  CONSTRAINT translation_job_items_provider_request_meta_object
    CHECK (jsonb_typeof(provider_request_meta) = 'object'),
  CONSTRAINT translation_job_items_provider_response_meta_object
    CHECK (jsonb_typeof(provider_response_meta) = 'object'),
  CONSTRAINT translation_job_items_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_translation_job_items_org_status_updated
  ON translation_job_items(organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_translation_job_items_job_status
  ON translation_job_items(job_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_translation_job_items_product_status
  ON translation_job_items(product_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS set_translation_job_items_updated_at ON translation_job_items;
CREATE TRIGGER set_translation_job_items_updated_at
  BEFORE UPDATE ON translation_job_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE translation_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translation_job_items_select_policy ON translation_job_items;
DROP POLICY IF EXISTS translation_job_items_write_policy ON translation_job_items;

CREATE POLICY translation_job_items_select_policy ON translation_job_items
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY translation_job_items_write_policy ON translation_job_items
  FOR ALL USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin', 'member')
        AND status = 'active'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin', 'member')
        AND status = 'active'
    )
  );

ALTER TABLE IF EXISTS organization_usage_daily
  ADD COLUMN IF NOT EXISTS translation_chars BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS write_chars BIGINT NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS organization_usage_monthly_snapshots
  ADD COLUMN IF NOT EXISTS translation_chars BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS write_chars BIGINT NOT NULL DEFAULT 0;

COMMENT ON TABLE organization_localization_settings IS
  'Organization-level localization and AI writing configuration.';
COMMENT ON TABLE translation_jobs IS
  'Translation/write-assist jobs for scoped product content.';
COMMENT ON TABLE translation_job_items IS
  'Per-field work items generated from translation/write-assist jobs.';
COMMENT ON TABLE translation_glossaries IS
  'Provider-linked glossaries for terminology control.';
COMMENT ON TABLE translation_glossary_entries IS
  'Glossary source/target term entries.';

COMMIT;
