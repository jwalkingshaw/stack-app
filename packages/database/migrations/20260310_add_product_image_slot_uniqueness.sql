BEGIN;

-- Ensure one active slot assignment per product and distribution scope.
-- This applies to any link that sets document_slot_code (images/docs).
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_product_asset_active_slot_scope
ON product_asset_links (
  organization_id,
  product_id,
  document_slot_code,
  COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(destination_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(locale_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE is_active = true AND document_slot_code IS NOT NULL;

COMMIT;
