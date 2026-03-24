BEGIN;

-- ============================================================
-- Extend product_asset_links for variant-level asset attachment
-- and add label/document metadata fields.
--
-- Changes:
--   1. variant_id nullable FK — links an asset attachment to a
--      specific product variant rather than the whole parent product.
--      When set, the link belongs to that variant; when NULL, it
--      applies to the product as a whole (existing behaviour).
--
--   2. document_lot_number TEXT — COA is per batch; stores which
--      lot number this document covers.
--
--   3. document_version TEXT — which label/SFP version this file
--      represents (matches label_version on dam_assets).
--
--   4. approved_for_market_ids UUID[] — this label variant is
--      approved for the listed markets only.
--
--   5. sort_order INT — ordering within multi-document slots
--      (e.g., COA slot with multiple lot COAs).
--
-- Uniqueness:
--   The existing unique constraint covers
--   (organization_id, product_id, asset_id, link_context).
--   We extend it to also differentiate by variant_id, so the
--   same asset can be attached to both the parent and a variant,
--   or to two different variants, without colliding.
-- ============================================================

ALTER TABLE public.product_asset_links
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS document_lot_number TEXT,
  ADD COLUMN IF NOT EXISTS document_version TEXT,
  ADD COLUMN IF NOT EXISTS approved_for_market_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Drop old unique constraint and recreate including variant_id
ALTER TABLE public.product_asset_links
  DROP CONSTRAINT IF EXISTS product_asset_links_unique;

ALTER TABLE public.product_asset_links
  ADD CONSTRAINT product_asset_links_unique UNIQUE (
    organization_id,
    product_id,
    asset_id,
    link_context,
    variant_id
  ) DEFERRABLE INITIALLY IMMEDIATE;

-- Index for fast variant-scoped lookups
CREATE INDEX IF NOT EXISTS idx_product_asset_links_variant_id
  ON public.product_asset_links (variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_asset_links_org_variant
  ON public.product_asset_links (organization_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_asset_links_approved_markets
  ON public.product_asset_links USING GIN (approved_for_market_ids)
  WHERE cardinality(approved_for_market_ids) > 0;

COMMIT;
