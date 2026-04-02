BEGIN;

-- Assets list and recency filters
CREATE INDEX IF NOT EXISTS idx_dam_assets_org_created_at_desc
  ON dam_assets (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dam_assets_org_updated_at_desc
  ON dam_assets (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dam_assets_org_folder_created_at_desc
  ON dam_assets (organization_id, folder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dam_assets_org_asset_scope
  ON dam_assets (organization_id, asset_scope);

-- Product list and recency filters
CREATE INDEX IF NOT EXISTS idx_products_org_created_at_desc
  ON products (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_org_parent_created_at_desc
  ON products (organization_id, parent_id, created_at DESC);

-- Product/asset linking lookups used by list filtering
CREATE INDEX IF NOT EXISTS idx_product_asset_links_org_product_active
  ON product_asset_links (organization_id, product_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_asset_links_org_asset_active
  ON product_asset_links (organization_id, asset_id, is_active, created_at DESC);

-- Completeness and scoped field value reads
CREATE INDEX IF NOT EXISTS idx_product_field_values_product_field_scope
  ON product_field_values (
    product_id,
    product_field_id,
    market_id,
    channel_id,
    locale_id,
    destination_id
  );

COMMIT;
