-- Migration: Strengthen product & asset security, add asset taxonomy
-- Date: 2025-02-21
-- Description:
--   * Drop legacy variant count triggers to avoid duplicate executions
--   * Extend product status lifecycle to include "Deleted"
--   * Introduce normalized asset tags & categories with RLS
--   * Tighten RLS policies for products, families, assets, and relationships

BEGIN;

-- ============================================================================
-- 1. Remove legacy triggers that duplicate variant count updates
-- ============================================================================
DROP TRIGGER IF EXISTS update_variant_count_on_insert ON products;
DROP TRIGGER IF EXISTS update_variant_count_on_delete ON products;

-- ============================================================================
-- 2. Extend product lifecycle statuses
-- ============================================================================
ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE products
    ADD CONSTRAINT products_status_check CHECK (
        status = ANY (
            ARRAY[
                'Draft'::text,
                'Active'::text,
                'Inactive'::text,
                'Discontinued'::text,
                'Deleted'::text
            ]
        )
    );

-- ============================================================================
-- 3. Asset tag & category taxonomy
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    color TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT asset_tags_unique_per_org UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    parent_id UUID REFERENCES asset_categories(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT asset_categories_unique_per_org UNIQUE (organization_id, slug),
    CONSTRAINT asset_categories_path_unique UNIQUE (organization_id, path)
);

CREATE TABLE IF NOT EXISTS asset_tag_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES asset_tags(id) ON DELETE CASCADE,
    assigned_by TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT asset_tag_assignments_unique UNIQUE (asset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS asset_category_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES asset_categories(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    assigned_by TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT asset_category_assignments_unique UNIQUE (asset_id, category_id)
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_asset_tags_org_slug
    ON asset_tags (organization_id, slug);

CREATE INDEX IF NOT EXISTS idx_asset_categories_org_parent
    ON asset_categories (organization_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_asset_tag_assignments_asset
    ON asset_tag_assignments (asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_tag_assignments_tag
    ON asset_tag_assignments (tag_id);

CREATE INDEX IF NOT EXISTS idx_asset_category_assignments_asset
    ON asset_category_assignments (asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_category_assignments_category
    ON asset_category_assignments (category_id);

-- Keep updated_at current
DROP TRIGGER IF EXISTS set_asset_tags_updated_at ON asset_tags;
CREATE TRIGGER set_asset_tags_updated_at
    BEFORE UPDATE ON asset_tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_asset_categories_updated_at ON asset_categories;
CREATE TRIGGER set_asset_categories_updated_at
    BEFORE UPDATE ON asset_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. Tighten RLS policies for products & assets
-- ============================================================================
ALTER TABLE asset_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_category_assignments ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive policies
DROP POLICY IF EXISTS "Users can access products" ON products;
DROP POLICY IF EXISTS "Users can access product families" ON product_families;
DROP POLICY IF EXISTS "Users can access product assets" ON product_assets;

DROP POLICY IF EXISTS "Users can view folders in their organizations" ON dam_folders;
DROP POLICY IF EXISTS "Users can insert folders in their organizations" ON dam_folders;
DROP POLICY IF EXISTS "Users can update folders in their organizations" ON dam_folders;
DROP POLICY IF EXISTS "Users can delete folders in their organizations" ON dam_folders;

DROP POLICY IF EXISTS "Users can view assets in their organizations" ON dam_assets;
DROP POLICY IF EXISTS "Users can insert assets in their organizations" ON dam_assets;
DROP POLICY IF EXISTS "Users can update assets in their organizations" ON dam_assets;
DROP POLICY IF EXISTS "Users can delete assets in their organizations" ON dam_assets;

DROP POLICY IF EXISTS "Users can view collections in their organizations" ON dam_collections;
DROP POLICY IF EXISTS "Users can insert collections in their organizations" ON dam_collections;
DROP POLICY IF EXISTS "Users can update collections in their organizations" ON dam_collections;
DROP POLICY IF EXISTS "Users can delete collections in their organizations" ON dam_collections;

-- Utility expressions
WITH accessible AS (
    SELECT COALESCE(get_user_accessible_org_ids(), '{}') AS org_ids
),
managable AS (
    SELECT array_agg(organization_id) AS org_ids
    FROM organization_members
    WHERE kinde_user_id = current_setting('app.current_user_id', true)
      AND status = 'active'
      AND role IN ('owner', 'admin')
)
SELECT 1;

-- ============================================================================
-- Products
-- ============================================================================
DROP POLICY IF EXISTS products_select_policy ON products;
DROP POLICY IF EXISTS products_insert_policy ON products;
DROP POLICY IF EXISTS products_update_policy ON products;
DROP POLICY IF EXISTS products_delete_policy ON products;

CREATE POLICY products_select_policy ON products
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY products_insert_policy ON products
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY products_update_policy ON products
    FOR UPDATE USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY products_delete_policy ON products
    FOR DELETE USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- Product Families
-- ============================================================================
DROP POLICY IF EXISTS product_families_select_policy ON product_families;
DROP POLICY IF EXISTS product_families_manage_policy ON product_families;

CREATE POLICY product_families_select_policy ON product_families
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY product_families_manage_policy ON product_families
    FOR ALL USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- Product Assets bridge
-- ============================================================================
DROP POLICY IF EXISTS product_assets_select_policy ON product_assets;
DROP POLICY IF EXISTS product_assets_manage_policy ON product_assets;

CREATE POLICY product_assets_select_policy ON product_assets
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM products p
            WHERE p.id = product_id
              AND p.organization_id = ANY (get_user_accessible_org_ids())
        )
    );

CREATE POLICY product_assets_manage_policy ON product_assets
    FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM products p
            WHERE p.id = product_id
              AND p.organization_id IN (
                  SELECT organization_id
                  FROM organization_members
                  WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND status = 'active'
                    AND role IN ('owner', 'admin')
              )
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM products p
            WHERE p.id = product_id
              AND p.organization_id IN (
                  SELECT organization_id
                  FROM organization_members
                  WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND status = 'active'
                    AND role IN ('owner', 'admin')
              )
        )
    );

-- ============================================================================
-- Brand Partner Relationships
-- ============================================================================
ALTER TABLE brand_partner_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_partner_relationships_select ON brand_partner_relationships;
DROP POLICY IF EXISTS brand_partner_relationships_modify ON brand_partner_relationships;
DROP POLICY IF EXISTS brand_partner_relationships_select_policy ON brand_partner_relationships;
DROP POLICY IF EXISTS brand_partner_relationships_manage_policy ON brand_partner_relationships;
DROP POLICY IF EXISTS brand_partner_relationships_insert_policy ON brand_partner_relationships;
DROP POLICY IF EXISTS brand_partner_relationships_update_policy ON brand_partner_relationships;
DROP POLICY IF EXISTS brand_partner_relationships_delete_policy ON brand_partner_relationships;

CREATE POLICY brand_partner_relationships_select_policy ON brand_partner_relationships
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR brand_organization_id = ANY (get_user_accessible_org_ids())
        OR partner_organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY brand_partner_relationships_insert_policy ON brand_partner_relationships
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role'
        OR brand_organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY brand_partner_relationships_update_policy ON brand_partner_relationships
    FOR UPDATE USING (
        auth.role() = 'service_role'
        OR brand_organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR brand_organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY brand_partner_relationships_delete_policy ON brand_partner_relationships
    FOR DELETE USING (
        auth.role() = 'service_role'
        OR brand_organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- DAM folders, assets, collections
-- ============================================================================
DROP POLICY IF EXISTS dam_folders_select_policy ON dam_folders;
DROP POLICY IF EXISTS dam_folders_manage_policy ON dam_folders;

CREATE POLICY dam_folders_select_policy ON dam_folders
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY dam_folders_manage_policy ON dam_folders
    FOR ALL USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS dam_assets_select_policy ON dam_assets;
DROP POLICY IF EXISTS dam_assets_manage_policy ON dam_assets;

CREATE POLICY dam_assets_select_policy ON dam_assets
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY dam_assets_manage_policy ON dam_assets
    FOR ALL USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS dam_collections_select_policy ON dam_collections;
DROP POLICY IF EXISTS dam_collections_manage_policy ON dam_collections;

CREATE POLICY dam_collections_select_policy ON dam_collections
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY dam_collections_manage_policy ON dam_collections
    FOR ALL USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- Asset taxonomy RLS
-- ============================================================================
DROP POLICY IF EXISTS asset_tags_select_policy ON asset_tags;
DROP POLICY IF EXISTS asset_tags_manage_policy ON asset_tags;

CREATE POLICY asset_tags_select_policy ON asset_tags
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY asset_tags_manage_policy ON asset_tags
    FOR ALL USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS asset_categories_select_policy ON asset_categories;
DROP POLICY IF EXISTS asset_categories_manage_policy ON asset_categories;

CREATE POLICY asset_categories_select_policy ON asset_categories
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY asset_categories_manage_policy ON asset_categories
    FOR ALL USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
              AND role IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS asset_tag_assignments_select_policy ON asset_tag_assignments;
DROP POLICY IF EXISTS asset_tag_assignments_manage_policy ON asset_tag_assignments;

CREATE POLICY asset_tag_assignments_select_policy ON asset_tag_assignments
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM dam_assets a
            WHERE a.id = asset_id
              AND a.organization_id = ANY (get_user_accessible_org_ids())
        )
    );

CREATE POLICY asset_tag_assignments_manage_policy ON asset_tag_assignments
    FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM dam_assets a
            WHERE a.id = asset_id
              AND a.organization_id IN (
                  SELECT organization_id
                  FROM organization_members
                  WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND status = 'active'
                    AND role IN ('owner', 'admin')
              )
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM dam_assets a
            WHERE a.id = asset_id
              AND a.organization_id IN (
                  SELECT organization_id
                  FROM organization_members
                  WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND status = 'active'
                    AND role IN ('owner', 'admin')
              )
        )
    );

DROP POLICY IF EXISTS asset_category_assignments_select_policy ON asset_category_assignments;
DROP POLICY IF EXISTS asset_category_assignments_manage_policy ON asset_category_assignments;

CREATE POLICY asset_category_assignments_select_policy ON asset_category_assignments
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM dam_assets a
            WHERE a.id = asset_id
              AND a.organization_id = ANY (get_user_accessible_org_ids())
        )
    );

CREATE POLICY asset_category_assignments_manage_policy ON asset_category_assignments
    FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM dam_assets a
            WHERE a.id = asset_id
              AND a.organization_id IN (
                  SELECT organization_id
                  FROM organization_members
                  WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND status = 'active'
                    AND role IN ('owner', 'admin')
              )
        )
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1
            FROM dam_assets a
            WHERE a.id = asset_id
              AND a.organization_id IN (
                  SELECT organization_id
                  FROM organization_members
                  WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND status = 'active'
                    AND role IN ('owner', 'admin')
              )
        )
    );

COMMIT;
