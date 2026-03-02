BEGIN;

-- -----------------------------------------------------------------------------
-- Phase B: asset scope assignments + scoped IDs on product field values
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS asset_scope_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  locale_id UUID REFERENCES locales(id) ON DELETE CASCADE,
  destination_id UUID REFERENCES channel_destinations(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('upload', 'bulk_edit', 'manual', 'rule')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asset_scope_assignments_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT asset_scope_assignments_destination_requires_channel
    CHECK (destination_id IS NULL OR channel_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_scope_assignments_unique_scope
  ON asset_scope_assignments (
    organization_id,
    asset_id,
    market_id,
    channel_id,
    locale_id,
    destination_id
  )
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_asset_scope_assignments_org_asset
  ON asset_scope_assignments (organization_id, asset_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_asset_scope_assignments_org_scope
  ON asset_scope_assignments (organization_id, market_id, channel_id, destination_id, locale_id)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS set_asset_scope_assignments_updated_at ON asset_scope_assignments;
CREATE TRIGGER set_asset_scope_assignments_updated_at
  BEFORE UPDATE ON asset_scope_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE asset_scope_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_scope_assignments_select_policy ON asset_scope_assignments;
DROP POLICY IF EXISTS asset_scope_assignments_write_policy ON asset_scope_assignments;

CREATE POLICY asset_scope_assignments_select_policy ON asset_scope_assignments
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY asset_scope_assignments_write_policy ON asset_scope_assignments
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

COMMENT ON TABLE asset_scope_assignments IS
  'Canonical scope tuples for each asset, supporting global and scoped authoring contexts.';

-- -----------------------------------------------------------------------------
-- Extend product_field_values with scoped FK IDs (keeping locale/channel text for compatibility)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS product_field_values
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES channel_destinations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locale_id UUID REFERENCES locales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_field_values_market_id
  ON product_field_values(market_id);

CREATE INDEX IF NOT EXISTS idx_product_field_values_channel_id
  ON product_field_values(channel_id);

CREATE INDEX IF NOT EXISTS idx_product_field_values_destination_id
  ON product_field_values(destination_id);

CREATE INDEX IF NOT EXISTS idx_product_field_values_locale_id
  ON product_field_values(locale_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_field_values_unique_scope_ids
  ON product_field_values (
    product_id,
    product_field_id,
    COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(destination_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(locale_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE (
    market_id IS NOT NULL
    OR channel_id IS NOT NULL
    OR destination_id IS NOT NULL
    OR locale_id IS NOT NULL
  );

-- Backfill locale_id from legacy locale code.
UPDATE product_field_values pfv
SET locale_id = l.id
FROM locales l
WHERE pfv.locale_id IS NULL
  AND pfv.locale IS NOT NULL
  AND btrim(pfv.locale) <> ''
  AND LOWER(l.code) = LOWER(btrim(pfv.locale));

-- Backfill channel_id from legacy channel code using product organization.
UPDATE product_field_values pfv
SET channel_id = c.id
FROM products p
JOIN channels c
  ON c.organization_id = p.organization_id
WHERE pfv.product_id = p.id
  AND pfv.channel_id IS NULL
  AND pfv.channel IS NOT NULL
  AND btrim(pfv.channel) <> ''
  AND LOWER(c.code) = LOWER(btrim(pfv.channel));

CREATE OR REPLACE FUNCTION sync_product_field_value_scope_codes()
RETURNS TRIGGER AS $$
DECLARE
  product_org_id UUID;
BEGIN
  SELECT organization_id INTO product_org_id
  FROM products
  WHERE id = NEW.product_id;

  -- Locale code <-> locale_id
  IF NEW.locale_id IS NOT NULL THEN
    SELECT code INTO NEW.locale
    FROM locales
    WHERE id = NEW.locale_id;
  ELSIF NEW.locale IS NOT NULL AND btrim(NEW.locale) <> '' THEN
    SELECT id INTO NEW.locale_id
    FROM locales
    WHERE LOWER(code) = LOWER(btrim(NEW.locale))
    LIMIT 1;
  END IF;

  -- Channel code <-> channel_id (organization-scoped)
  IF NEW.channel_id IS NOT NULL THEN
    SELECT code INTO NEW.channel
    FROM channels
    WHERE id = NEW.channel_id
      AND organization_id = product_org_id;
  ELSIF NEW.channel IS NOT NULL AND btrim(NEW.channel) <> '' THEN
    SELECT id INTO NEW.channel_id
    FROM channels
    WHERE organization_id = product_org_id
      AND LOWER(code) = LOWER(btrim(NEW.channel))
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_product_field_value_scope_codes_trigger ON product_field_values;
CREATE TRIGGER sync_product_field_value_scope_codes_trigger
  BEFORE INSERT OR UPDATE OF locale, channel, locale_id, channel_id
  ON product_field_values
  FOR EACH ROW
  EXECUTE FUNCTION sync_product_field_value_scope_codes();

COMMENT ON FUNCTION sync_product_field_value_scope_codes IS
  'Keeps product_field_values locale/channel text mirrors aligned with locale_id/channel_id.';

COMMIT;
