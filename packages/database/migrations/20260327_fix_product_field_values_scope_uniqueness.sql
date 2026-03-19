BEGIN;

-- Remove legacy uniqueness that blocks scoped tuples across markets/destinations.
ALTER TABLE IF EXISTS product_field_values
  DROP CONSTRAINT IF EXISTS unique_product_field_locale_channel;

-- Replace prior partial scope index with full scope uniqueness.
DROP INDEX IF EXISTS idx_product_field_values_unique_scope_ids;

-- Deduplicate rows by canonical scope tuple before enforcing new unique index.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        product_id,
        product_field_id,
        market_id,
        channel_id,
        locale_id,
        destination_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM product_field_values
),
dupes AS (
  SELECT id
  FROM ranked
  WHERE rn > 1
)
DELETE FROM product_field_values
WHERE id IN (SELECT id FROM dupes);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_field_values_unique_scope_dimensions
  ON product_field_values (
    product_id,
    product_field_id,
    market_id,
    channel_id,
    locale_id,
    destination_id
  )
  NULLS NOT DISTINCT;

COMMIT;
