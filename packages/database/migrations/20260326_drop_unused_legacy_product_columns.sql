BEGIN;

-- Remove legacy columns superseded by product_fields/product_field_values.
-- Keep core system columns and columns still used by current UI/API flows.
ALTER TABLE IF EXISTS products
  DROP COLUMN IF EXISTS barcode_type,
  DROP COLUMN IF EXISTS media_assets,
  DROP COLUMN IF EXISTS seo_keywords,
  DROP COLUMN IF EXISTS marketing_tags,
  DROP COLUMN IF EXISTS channel_content,
  DROP COLUMN IF EXISTS product_model_code,
  DROP COLUMN IF EXISTS variant_level,
  DROP COLUMN IF EXISTS parent_model_id,
  DROP COLUMN IF EXISTS family_variant_id;

COMMENT ON TABLE products IS
  'Core product identity + operational columns. Business content should live in product_fields/product_field_values.';

COMMIT;
