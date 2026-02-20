-- Migration: Add SCIN system identifier and identifier rules

-- 1) Add SCIN column and ensure it is populated and unique
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS scin TEXT;

-- Backfill SCIN for existing rows
UPDATE products
SET scin = COALESCE(
  scin,
  UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::text, '-', ''), 1, 8))
)
WHERE scin IS NULL;

-- Enforce uniqueness and non-null for SCIN
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_scin_unique ON products (scin);
ALTER TABLE products
  ALTER COLUMN scin SET NOT NULL;

-- 2) Allow SKU to be empty for drafts
ALTER TABLE products
  ALTER COLUMN sku DROP NOT NULL;

-- 3) Ensure barcode (UPC/GTIN/EAN) is globally unique when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'barcode'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
      ON products (barcode)
      WHERE barcode IS NOT NULL;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'upc'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_upc_unique
      ON products (upc)
      WHERE upc IS NOT NULL;
  END IF;
END $$;

-- 4) Add product family rules for identifiers on Active
ALTER TABLE product_families
  ADD COLUMN IF NOT EXISTS require_sku_on_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS require_barcode_on_active BOOLEAN DEFAULT FALSE;

-- 5) Ensure SCIN is set on insert
CREATE OR REPLACE FUNCTION set_product_scin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scin IS NULL OR NEW.scin = '' THEN
    NEW.scin := UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_product_scin_before_insert ON products;
CREATE TRIGGER set_product_scin_before_insert
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION set_product_scin();
