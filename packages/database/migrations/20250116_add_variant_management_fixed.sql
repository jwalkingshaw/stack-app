-- Variant Management Schema for PIM-focused variant handling
-- Phase 1: Sports Nutrition focus with extensibility for future categories

-- ============================================================================
-- 1. VARIANT ATTRIBUTE TYPES
-- Defines the types of variants (Flavor, Size, Format, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS variant_attribute_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- "flavor", "size", "format" (internal key)
    display_name VARCHAR(100) NOT NULL, -- "Flavor", "Size", "Format" (user-facing)
    description TEXT, -- "The flavor profile of the product"
    display_order INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    category VARCHAR(50) DEFAULT 'sports_nutrition', -- Future: 'apparel', 'electronics', etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure unique attribute names per organization
    CONSTRAINT unique_variant_type_per_org UNIQUE (organization_id, name)
);

-- ============================================================================
-- 2. VARIANT ATTRIBUTE VALUES
-- Specific values for each attribute type (Chocolate, Vanilla, 5lb, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS variant_attribute_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_type_id UUID NOT NULL REFERENCES variant_attribute_types(id) ON DELETE CASCADE,
    value VARCHAR(100) NOT NULL, -- "chocolate", "5lb", "powder" (internal key)
    display_name VARCHAR(100) NOT NULL, -- "Rich Chocolate", "5 Pound Tub", "Powder Form"
    description TEXT, -- Additional description if needed
    hex_color VARCHAR(7), -- For color swatches (#FF5733)
    image_url TEXT, -- URL to variant-specific image (flavor photos, etc.)
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure unique values per attribute type
    CONSTRAINT unique_value_per_attribute_type UNIQUE (attribute_type_id, value)
);

-- ============================================================================
-- 3. ENHANCE EXISTING PRODUCTS TABLE
-- Add variant-specific columns to existing products table
-- ============================================================================

-- Add variant attributes storage (JSONB for flexibility)
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_attributes JSONB DEFAULT '{}';

-- Add primary image for variant display
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_url TEXT;

-- Add media assets collection (images, videos, documents)
ALTER TABLE products ADD COLUMN IF NOT EXISTS media_assets JSONB DEFAULT '[]';

-- Add weight and dimensions for PIM purposes (not inventory)
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_g DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions JSONB DEFAULT '{}'; -- {"length": 10, "width": 5, "height": 15, "unit": "cm"}

-- Add SEO and marketing fields per variant
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketing_tags TEXT[];

-- Add channel-specific content capability
ALTER TABLE products ADD COLUMN IF NOT EXISTS channel_content JSONB DEFAULT '{}'; -- {"amazon": {...}, "shopify": {...}}

-- ============================================================================
-- 4. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for variant attribute queries
CREATE INDEX IF NOT EXISTS idx_products_variant_attributes ON products USING GIN (variant_attributes);

-- Index for parent-child relationships
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products (parent_id) WHERE parent_id IS NOT NULL;

-- Index for product type filtering
CREATE INDEX IF NOT EXISTS idx_products_type ON products (type);

-- Index for organization + type queries
CREATE INDEX IF NOT EXISTS idx_products_org_type ON products (organization_id, type);

-- Index for variant attribute types by organization
CREATE INDEX IF NOT EXISTS idx_variant_types_org ON variant_attribute_types (organization_id);

-- Index for variant values by attribute type
CREATE INDEX IF NOT EXISTS idx_variant_values_type ON variant_attribute_values (attribute_type_id);

-- ============================================================================
-- 5. SEED DATA FUNCTION FOR SPORTS NUTRITION
-- Pre-populate with common sports nutrition variant types
-- ============================================================================

CREATE OR REPLACE FUNCTION setup_sports_nutrition_variants(org_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert Flavor attribute type
    INSERT INTO variant_attribute_types (organization_id, name, display_name, description, display_order, category)
    VALUES (org_id, 'flavor', 'Flavor', 'The flavor profile of the product', 1, 'sports_nutrition')
    ON CONFLICT (organization_id, name) DO NOTHING;

    -- Insert Size attribute type
    INSERT INTO variant_attribute_types (organization_id, name, display_name, description, display_order, category)
    VALUES (org_id, 'size', 'Size', 'The container size or weight of the product', 2, 'sports_nutrition')
    ON CONFLICT (organization_id, name) DO NOTHING;

    -- Insert Format attribute type
    INSERT INTO variant_attribute_types (organization_id, name, display_name, description, display_order, category)
    VALUES (org_id, 'format', 'Format', 'The physical format of the product', 3, 'sports_nutrition')
    ON CONFLICT (organization_id, name) DO NOTHING;

    -- Insert Serving Count attribute type
    INSERT INTO variant_attribute_types (organization_id, name, display_name, description, display_order, category)
    VALUES (org_id, 'serving_count', 'Serving Count', 'Number of servings per container', 4, 'sports_nutrition')
    ON CONFLICT (organization_id, name) DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to convert standalone product to parent when adding variants
CREATE OR REPLACE FUNCTION convert_to_parent_product(product_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Update the product type to 'parent'
    UPDATE products
    SET type = 'parent',
        has_variants = true,
        updated_at = NOW()
    WHERE id = product_id AND type = 'standalone';

    -- The variant_count will be managed by triggers
END;
$$ LANGUAGE plpgsql;

-- Function to get all variant combinations for a parent product
CREATE OR REPLACE FUNCTION get_variant_combinations(parent_product_id UUID)
RETURNS TABLE(
    variant_id UUID,
    product_name TEXT,
    sku TEXT,
    variant_attributes JSONB,
    status TEXT,
    primary_image_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.product_name,
        p.sku,
        p.variant_attributes,
        p.status,
        p.primary_image_url
    FROM products p
    WHERE p.parent_id = parent_product_id
    AND p.type = 'variant'
    ORDER BY p.created_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. TRIGGERS FOR AUTOMATIC MANAGEMENT (FIXED)
-- ============================================================================

-- Update variant count when variants are added/removed
CREATE OR REPLACE FUNCTION update_variant_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
        -- Increment variant count
        UPDATE products
        SET variant_count = variant_count + 1,
            has_variants = true,
            updated_at = NOW()
        WHERE id = NEW.parent_id;

    ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
        -- Decrement variant count
        UPDATE products
        SET variant_count = GREATEST(variant_count - 1, 0),
            has_variants = (variant_count - 1) > 0,
            updated_at = NOW()
        WHERE id = OLD.parent_id;

    ELSIF TG_OP = 'UPDATE' AND OLD.parent_id != NEW.parent_id THEN
        -- Handle parent change (remove from old, add to new)
        IF OLD.parent_id IS NOT NULL THEN
            UPDATE products
            SET variant_count = GREATEST(variant_count - 1, 0),
                has_variants = (variant_count - 1) > 0,
                updated_at = NOW()
            WHERE id = OLD.parent_id;
        END IF;

        IF NEW.parent_id IS NOT NULL THEN
            UPDATE products
            SET variant_count = variant_count + 1,
                has_variants = true,
                updated_at = NOW()
            WHERE id = NEW.parent_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create separate triggers for each operation to avoid WHEN condition issues
DROP TRIGGER IF EXISTS trigger_update_variant_count_insert ON products;
DROP TRIGGER IF EXISTS trigger_update_variant_count_update ON products;
DROP TRIGGER IF EXISTS trigger_update_variant_count_delete ON products;

-- Insert trigger - only fires for variant products
CREATE TRIGGER trigger_update_variant_count_insert
    AFTER INSERT ON products
    FOR EACH ROW
    WHEN (NEW.type = 'variant')
    EXECUTE FUNCTION update_variant_count();

-- Update trigger - fires when type changes to/from variant or parent_id changes
CREATE TRIGGER trigger_update_variant_count_update
    AFTER UPDATE ON products
    FOR EACH ROW
    WHEN (OLD.type = 'variant' OR NEW.type = 'variant')
    EXECUTE FUNCTION update_variant_count();

-- Delete trigger - only fires for variant products
CREATE TRIGGER trigger_update_variant_count_delete
    AFTER DELETE ON products
    FOR EACH ROW
    WHEN (OLD.type = 'variant')
    EXECUTE FUNCTION update_variant_count();

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE variant_attribute_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_attribute_values ENABLE ROW LEVEL SECURITY;

-- Policies for variant_attribute_types
CREATE POLICY variant_attribute_types_org_policy ON variant_attribute_types
    FOR ALL USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE kinde_user_id = current_setting('app.current_user_id', true)::text
        AND status = 'active'
    ));

-- Policies for variant_attribute_values
CREATE POLICY variant_attribute_values_org_policy ON variant_attribute_values
    FOR ALL USING (
        attribute_type_id IN (
            SELECT id FROM variant_attribute_types
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE kinde_user_id = current_setting('app.current_user_id', true)::text
                AND status = 'active'
            )
        )
    );

-- ============================================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE variant_attribute_types IS 'Defines the types of variant attributes (Flavor, Size, etc.) per organization';
COMMENT ON TABLE variant_attribute_values IS 'Specific values for each variant attribute type (Chocolate, 5lb, etc.)';
COMMENT ON COLUMN products.variant_attributes IS 'JSONB storage for variant attribute combinations {"flavor": "chocolate", "size": "5lb"}';
COMMENT ON COLUMN products.media_assets IS 'Array of media URLs and metadata for product images, videos, documents';
COMMENT ON COLUMN products.channel_content IS 'Channel-specific product content for different marketplaces and websites';