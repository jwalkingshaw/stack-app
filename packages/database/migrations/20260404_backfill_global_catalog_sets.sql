BEGIN;

-- ============================================================
-- Backfill: Global Products + Global Assets sets
--
-- Ensures every organisation has a "Global Products" and
-- "Global Assets" share_set, then populates them with all
-- pre-existing products and assets that were created before
-- addResourceToGlobalCatalogSet() was wired into the API.
--
-- Mirrors the exact logic in addResourceToGlobalCatalogSet():
--   • Parent products  → resource_type='product',  include_descendants=true
--   • Variant products → resource_type='variant',  include_descendants=false
--   • Standalone products (no parent, no children)
--                      → resource_type='product',  include_descendants=false
--   • Assets           → resource_type='asset',    include_descendants=false
--
-- Skips catalog_visibility='restricted' products (brand-internal;
-- never partner-visible). Includes 'partner_exclusive' as explicit
-- items — they simply won't be auto-expanded via include_descendants.
--
-- Safe to run multiple times: uses ON CONFLICT DO NOTHING on
-- share_sets (organization_id, module_key, name) and
-- share_set_items (share_set_id, resource_type, resource_id).
-- ============================================================

DO $$
DECLARE
  org_row  RECORD;
  prod_set_id  UUID;
  asset_set_id UUID;
  admin_kinde_id TEXT;
BEGIN
  FOR org_row IN
    SELECT DISTINCT id FROM organizations
  LOOP

    -- ── Pick any active member to use as created_by ──────────────
    SELECT kinde_user_id INTO admin_kinde_id
    FROM organization_members
    WHERE organization_id = org_row.id
      AND status = 'active'
    LIMIT 1;

    -- Fall back to a sentinel if the org has no members yet
    IF admin_kinde_id IS NULL THEN
      admin_kinde_id := 'system-backfill';
    END IF;

    -- ── Ensure "Global Products" set ─────────────────────────────
    SELECT id INTO prod_set_id
    FROM share_sets
    WHERE organization_id = org_row.id
      AND module_key = 'products'
      AND name = 'Global Products';

    IF prod_set_id IS NULL THEN
      INSERT INTO share_sets (
        organization_id, module_key, name, description, metadata, created_by
      ) VALUES (
        org_row.id,
        'products',
        'Global Products',
        'System-managed catalog set for broadly eligible products.',
        '{"system": true, "global": true, "eligibility": {"status": ["Active"]}}'::jsonb,
        admin_kinde_id
      )
      ON CONFLICT (organization_id, module_key, name) DO NOTHING
      RETURNING id INTO prod_set_id;

      -- If another concurrent session inserted it, look it up
      IF prod_set_id IS NULL THEN
        SELECT id INTO prod_set_id
        FROM share_sets
        WHERE organization_id = org_row.id
          AND module_key = 'products'
          AND name = 'Global Products';
      END IF;
    END IF;

    -- ── Ensure "Global Assets" set ───────────────────────────────
    SELECT id INTO asset_set_id
    FROM share_sets
    WHERE organization_id = org_row.id
      AND module_key = 'assets'
      AND name = 'Global Assets';

    IF asset_set_id IS NULL THEN
      INSERT INTO share_sets (
        organization_id, module_key, name, description, metadata, created_by
      ) VALUES (
        org_row.id,
        'assets',
        'Global Assets',
        'System-managed catalog set for broadly eligible assets.',
        '{"system": true, "global": true, "eligibility": {"asset_scope": ["shared", "public"], "version_window": "valid_now"}}'::jsonb,
        admin_kinde_id
      )
      ON CONFLICT (organization_id, module_key, name) DO NOTHING
      RETURNING id INTO asset_set_id;

      IF asset_set_id IS NULL THEN
        SELECT id INTO asset_set_id
        FROM share_sets
        WHERE organization_id = org_row.id
          AND module_key = 'assets'
          AND name = 'Global Assets';
      END IF;
    END IF;

    -- ── Skip if either set couldn't be resolved ──────────────────
    IF prod_set_id IS NULL OR asset_set_id IS NULL THEN
      RAISE WARNING 'Could not resolve global sets for org %; skipping.', org_row.id;
      CONTINUE;
    END IF;

    -- ── Parent products (have child variants) ────────────────────
    --    include_descendants=true so future variants are visible
    INSERT INTO share_set_items (
      share_set_id, organization_id, resource_type, resource_id,
      include_descendants, market_ids, channel_ids, locale_ids,
      metadata, created_by
    )
    SELECT
      prod_set_id,
      org_row.id,
      'product',
      p.id,
      true,
      '{}',
      '{}',
      '{}',
      '{"source": "global_default_auto_include", "backfill": true}'::jsonb,
      admin_kinde_id
    FROM products p
    WHERE p.organization_id = org_row.id
      AND p.parent_id IS NULL
      AND p.catalog_visibility <> 'restricted'
      AND EXISTS (
        SELECT 1 FROM products c
        WHERE c.parent_id = p.id
          AND c.organization_id = org_row.id
      )
    ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING;

    -- ── Standalone products (no parent, no children) ─────────────
    INSERT INTO share_set_items (
      share_set_id, organization_id, resource_type, resource_id,
      include_descendants, market_ids, channel_ids, locale_ids,
      metadata, created_by
    )
    SELECT
      prod_set_id,
      org_row.id,
      'product',
      p.id,
      false,
      '{}',
      '{}',
      '{}',
      '{"source": "global_default_auto_include", "backfill": true}'::jsonb,
      admin_kinde_id
    FROM products p
    WHERE p.organization_id = org_row.id
      AND p.parent_id IS NULL
      AND p.catalog_visibility <> 'restricted'
      AND NOT EXISTS (
        SELECT 1 FROM products c
        WHERE c.parent_id = p.id
          AND c.organization_id = org_row.id
      )
    ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING;

    -- ── Variants (have a parent) ──────────────────────────────────
    --    resource_type='variant' so they're addressable separately
    INSERT INTO share_set_items (
      share_set_id, organization_id, resource_type, resource_id,
      include_descendants, market_ids, channel_ids, locale_ids,
      metadata, created_by
    )
    SELECT
      prod_set_id,
      org_row.id,
      'variant',
      p.id,
      false,
      '{}',
      '{}',
      '{}',
      '{"source": "global_default_auto_include", "backfill": true}'::jsonb,
      admin_kinde_id
    FROM products p
    WHERE p.organization_id = org_row.id
      AND p.parent_id IS NOT NULL
      AND p.catalog_visibility <> 'restricted'
    ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING;

    -- ── Assets ───────────────────────────────────────────────────
    INSERT INTO share_set_items (
      share_set_id, organization_id, resource_type, resource_id,
      include_descendants, market_ids, channel_ids, locale_ids,
      metadata, created_by
    )
    SELECT
      asset_set_id,
      org_row.id,
      'asset',
      a.id,
      false,
      '{}',
      '{}',
      '{}',
      '{"source": "global_default_auto_include", "backfill": true}'::jsonb,
      admin_kinde_id
    FROM dam_assets a
    WHERE a.organization_id = org_row.id
    ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING;

  END LOOP;
END $$;

COMMIT;
