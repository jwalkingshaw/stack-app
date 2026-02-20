-- Migration: Support asset upload metadata and product-asset linking
-- Date: 2025-02-24
-- Adds:
--   * Additional metadata columns on dam_assets for product awareness and path info
--   * Helper trigger to keep file_path aligned with storage key
--   * product_asset_links table to relate assets to products with RLS and indexes

BEGIN;

-- ============================================================================
-- 1) Extend dam_assets with metadata used by the new upload + linking flows
-- ============================================================================
ALTER TABLE dam_assets
  ADD COLUMN IF NOT EXISTS product_identifiers TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS asset_scope TEXT DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Backfill file_path from existing storage key
UPDATE dam_assets
SET file_path = COALESCE(file_path, s3_key)
WHERE file_path IS NULL;

-- Keep file_path in sync on writes
CREATE OR REPLACE FUNCTION set_dam_asset_file_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.file_path IS NULL OR NEW.file_path = '' THEN
    NEW.file_path := NEW.s3_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dam_assets_set_file_path_before_write ON dam_assets;
CREATE TRIGGER dam_assets_set_file_path_before_write
  BEFORE INSERT OR UPDATE ON dam_assets
  FOR EACH ROW
  EXECUTE FUNCTION set_dam_asset_file_path();

-- Index for product identifier lookups
CREATE INDEX IF NOT EXISTS idx_dam_assets_product_identifiers
  ON dam_assets USING GIN (product_identifiers);

-- ============================================================================
-- 2) Product <> Asset linking table for richer relationships
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_asset_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
  asset_type TEXT DEFAULT 'general',
  link_context TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'auto',
  confidence DOUBLE PRECISION DEFAULT 0.5,
  match_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_asset_links_unique UNIQUE (organization_id, product_id, asset_id, link_context)
);

DROP TRIGGER IF EXISTS set_product_asset_links_updated_at ON product_asset_links;
CREATE TRIGGER set_product_asset_links_updated_at
  BEFORE UPDATE ON product_asset_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_product_asset_links_org_product
  ON product_asset_links (organization_id, product_id);

CREATE INDEX IF NOT EXISTS idx_product_asset_links_org_asset
  ON product_asset_links (organization_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_product_asset_links_org_context
  ON product_asset_links (organization_id, link_context);

-- ============================================================================
-- 3) RLS for product_asset_links aligned with other product/asset tables
-- ============================================================================
ALTER TABLE product_asset_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_asset_links_select_policy ON product_asset_links;
DROP POLICY IF EXISTS product_asset_links_manage_policy ON product_asset_links;

CREATE POLICY product_asset_links_select_policy ON product_asset_links
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id = ANY (get_user_accessible_org_ids())
  );

CREATE POLICY product_asset_links_manage_policy ON product_asset_links
  FOR ALL USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
        AND role IN ('owner', 'admin')
    )
  );

COMMIT;
