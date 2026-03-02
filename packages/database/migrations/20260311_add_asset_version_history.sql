BEGIN;

ALTER TABLE IF EXISTS dam_assets
  ADD COLUMN IF NOT EXISTS current_version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_version_comment TEXT,
  ADD COLUMN IF NOT EXISTS current_version_effective_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_version_effective_to TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_version_changed_by TEXT,
  ADD COLUMN IF NOT EXISTS current_version_changed_at TIMESTAMPTZ;

UPDATE dam_assets
SET
  current_version_number = COALESCE(current_version_number, 1),
  current_version_changed_by = COALESCE(current_version_changed_by, created_by),
  current_version_changed_at = COALESCE(current_version_changed_at, updated_at, created_at)
WHERE
  current_version_number IS NULL
  OR current_version_changed_by IS NULL
  OR current_version_changed_at IS NULL;

CREATE TABLE IF NOT EXISTS dam_asset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  mime_type TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  thumbnail_urls JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}'::text[],
  description TEXT,
  change_comment TEXT,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dam_asset_versions_effective_window_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CONSTRAINT dam_asset_versions_unique_per_asset UNIQUE (asset_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_dam_asset_versions_org_asset_created
  ON dam_asset_versions (organization_id, asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dam_asset_versions_org_created
  ON dam_asset_versions (organization_id, created_at DESC);

ALTER TABLE dam_asset_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dam_asset_versions'
      AND policyname = 'Users can view asset versions in their organization'
  ) THEN
    CREATE POLICY "Users can view asset versions in their organization" ON dam_asset_versions
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id
          FROM organization_members
          WHERE kinde_user_id = current_setting('app.current_user_id', true)
            AND status = 'active'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dam_asset_versions'
      AND policyname = 'Users can manage asset versions in their organization'
  ) THEN
    CREATE POLICY "Users can manage asset versions in their organization" ON dam_asset_versions
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id
          FROM organization_members
          WHERE kinde_user_id = current_setting('app.current_user_id', true)
            AND role IN ('owner', 'admin', 'member')
            AND status = 'active'
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_organization_storage_on_asset_file_size_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id = OLD.organization_id THEN
    UPDATE organizations
    SET storage_used = storage_used + (NEW.file_size - OLD.file_size)
    WHERE id = NEW.organization_id;
  ELSE
    UPDATE organizations
    SET storage_used = storage_used - OLD.file_size
    WHERE id = OLD.organization_id;

    UPDATE organizations
    SET storage_used = storage_used + NEW.file_size
    WHERE id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_storage_on_asset_update ON dam_assets;
CREATE TRIGGER update_storage_on_asset_update
  AFTER UPDATE OF file_size, organization_id ON dam_assets
  FOR EACH ROW
  WHEN (OLD.file_size IS DISTINCT FROM NEW.file_size OR OLD.organization_id IS DISTINCT FROM NEW.organization_id)
  EXECUTE FUNCTION update_organization_storage_on_asset_file_size_change();

CREATE OR REPLACE FUNCTION update_organization_storage_on_asset_version_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations
    SET storage_used = storage_used + NEW.file_size
    WHERE id = NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations
    SET storage_used = storage_used - OLD.file_size
    WHERE id = OLD.organization_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_storage_on_asset_version_insert ON dam_asset_versions;
CREATE TRIGGER update_storage_on_asset_version_insert
  AFTER INSERT ON dam_asset_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_organization_storage_on_asset_version_change();

DROP TRIGGER IF EXISTS update_storage_on_asset_version_delete ON dam_asset_versions;
CREATE TRIGGER update_storage_on_asset_version_delete
  AFTER DELETE ON dam_asset_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_organization_storage_on_asset_version_change();

COMMIT;
