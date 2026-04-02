-- Simplify catalog_visibility to two states: standard | restricted
-- Drop the redundant `partner_exclusive` value.
--
-- Background:
--   partner_exclusive was added to exclude products from market-based auto-sharing
--   while still allowing explicit set grants. But exclusivity is better expressed
--   via set membership. The flag had no UI, and its enforcement only filtered
--   auto-expansion — a product explicitly added to a set bypassed it anyway.
--
--   restricted remains valid: internal-only products that must never reach partners
--   regardless of set membership (enforcement fix applied here).

-- Step 1: Backfill — any partner_exclusive products become standard.
--   Going forward they rely on set membership for exclusivity.
UPDATE products
  SET catalog_visibility = 'standard'
  WHERE catalog_visibility = 'partner_exclusive';

-- Step 2: Drop the old enum and recreate with only two values.
--   (PostgreSQL does not support removing values from an enum, so we swap types.)
ALTER TABLE products
  ALTER COLUMN catalog_visibility TYPE TEXT;

ALTER TABLE products
  ADD CONSTRAINT catalog_visibility_values
    CHECK (catalog_visibility IN ('standard', 'restricted'));

-- Note: if a catalog_visibility_values constraint already existed from a prior migration, drop it first:
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS catalog_visibility_values;
-- then re-add above.
