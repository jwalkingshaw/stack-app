-- Extend partner_update_kit_items to support email and social item types

-- 1. Drop and recreate the item_type check constraint
ALTER TABLE partner_update_kit_items
  DROP CONSTRAINT IF EXISTS partner_update_kit_items_item_type_check;

ALTER TABLE partner_update_kit_items
  ADD CONSTRAINT partner_update_kit_items_item_type_check
  CHECK (item_type IN ('product', 'asset', 'url', 'text', 'email', 'social'));

-- 3. Drop the payload shape constraint and recreate with email/social branches
ALTER TABLE partner_update_kit_items
  DROP CONSTRAINT IF EXISTS partner_update_kit_items_type_payload_ck;

ALTER TABLE partner_update_kit_items
  ADD CONSTRAINT partner_update_kit_items_type_payload_ck CHECK (
    (item_type = 'product' AND product_id IS NOT NULL AND asset_id IS NULL AND url IS NULL)
    OR (item_type = 'asset' AND asset_id IS NOT NULL AND product_id IS NULL AND url IS NULL)
    OR (item_type = 'url' AND url IS NOT NULL AND length(btrim(url)) > 0 AND product_id IS NULL AND asset_id IS NULL)
    OR (item_type = 'text' AND product_id IS NULL AND asset_id IS NULL AND url IS NULL AND content_json <> '{}'::jsonb)
    OR (item_type = 'email' AND product_id IS NULL AND asset_id IS NULL AND url IS NULL AND content_json <> '{}'::jsonb)
    OR (item_type = 'social' AND product_id IS NULL AND asset_id IS NULL AND url IS NULL AND content_json <> '{}'::jsonb)
  );
