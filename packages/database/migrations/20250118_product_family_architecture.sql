-- Comprehensive Product Family Architecture
-- Combines Plytix inheritance model with Akeneo structural approach
-- Multi-tenant SaaS compatible

-- 1. Enhanced Product Families
ALTER TABLE product_families ADD COLUMN IF NOT EXISTS
    family_type TEXT DEFAULT 'standard'; -- standard, configurable

-- 2. Family Attributes (defines what attributes a family can have)
CREATE TABLE IF NOT EXISTS family_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,

    -- Attribute Definition
    attribute_code TEXT NOT NULL, -- flavor, size, color, material
    attribute_label TEXT NOT NULL, -- "Flavor", "Size", "Color", "Material"
    attribute_type TEXT NOT NULL DEFAULT 'text', -- text, number, select, color, image, boolean

    -- Validation Rules
    is_required BOOLEAN DEFAULT false,
    is_unique BOOLEAN DEFAULT false,
    validation_rules JSONB DEFAULT '{}', -- min/max length, regex, etc.

    -- Options for select/multi-select types
    attribute_options JSONB DEFAULT '[]', -- [{"value": "chocolate", "label": "Chocolate"}, ...]

    -- Display
    display_order INTEGER DEFAULT 0,
    help_text TEXT,

    -- Inheritance Configuration (Plytix approach)
    inherit_level_1 BOOLEAN DEFAULT true,  -- Product Model → Variant
    inherit_level_2 BOOLEAN DEFAULT false, -- Variant → Sub-Variant

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, family_id, attribute_code)
);

-- 3. Family Variants (defines structure like Akeneo)
CREATE TABLE IF NOT EXISTS family_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,

    -- Variant Definition
    variant_code TEXT NOT NULL, -- t_shirt_color_size, supplement_flavor_size
    variant_name TEXT NOT NULL, -- "T-Shirt by Color/Size", "Supplement by Flavor/Size"
    description TEXT,

    -- Structure Definition
    max_variant_levels INTEGER DEFAULT 1, -- 1 or 2 levels supported

    -- Level 1 Axes (which attributes define first level variants)
    level_1_axes TEXT[] DEFAULT '{}', -- ['color'] or ['flavor']

    -- Level 2 Axes (which attributes define second level variants)
    level_2_axes TEXT[] DEFAULT '{}', -- ['size'] or ['size', 'format']

    -- Attribute Distribution
    common_attributes TEXT[] DEFAULT '{}',     -- attributes shared by all variants
    level_1_attributes TEXT[] DEFAULT '{}',    -- attributes specific to level 1 variants
    level_2_attributes TEXT[] DEFAULT '{}',    -- attributes specific to level 2 variants

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, family_id, variant_code)
);

-- 4. Enhanced Products table (follow Akeneo terminology)
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_model_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_level INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_model_id UUID REFERENCES products(id);

-- Add family_variant_id column after family_variants table is created
-- (This will be added later in the migration)

-- 5. Product Attribute Values (replaces loose JSON)
CREATE TABLE IF NOT EXISTS product_attribute_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Attribute Reference
    attribute_code TEXT NOT NULL,

    -- Value Storage (polymorphic based on attribute_type)
    text_value TEXT,
    number_value DECIMAL,
    boolean_value BOOLEAN,
    date_value DATE,
    json_value JSONB, -- For complex types (arrays, objects)

    -- Inheritance Tracking
    is_inherited BOOLEAN DEFAULT false,
    inherited_from_id UUID REFERENCES products(id), -- Which product this was inherited from

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, product_id, attribute_code)
);

-- 6. Variant Generation Templates (for quick variant creation)
CREATE TABLE IF NOT EXISTS variant_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    family_variant_id UUID NOT NULL REFERENCES family_variants(id) ON DELETE CASCADE,

    template_name TEXT NOT NULL,
    level_1_combinations JSONB DEFAULT '[]', -- [{"color": "red"}, {"color": "blue"}]
    level_2_combinations JSONB DEFAULT '[]', -- [{"size": "S"}, {"size": "M"}, {"size": "L"}]

    -- Auto-generation rules
    sku_pattern TEXT, -- Pattern for generating SKUs: {model_code}-{color}-{size}
    name_pattern TEXT, -- Pattern for generating names: {model_name} - {color} - {size}

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, family_variant_id, template_name)
);

-- Now add the family_variant_id column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS family_variant_id UUID REFERENCES family_variants(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_family_attributes_org_family
    ON family_attributes(organization_id, family_id);

CREATE INDEX IF NOT EXISTS idx_family_variants_org_family
    ON family_variants(organization_id, family_id);

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_org_product
    ON product_attribute_values(organization_id, product_id);

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_attribute
    ON product_attribute_values(organization_id, attribute_code);

-- Enable RLS
ALTER TABLE family_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY family_attributes_tenant_isolation ON family_attributes
    USING (organization_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY family_variants_tenant_isolation ON family_variants
    USING (organization_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY product_attribute_values_tenant_isolation ON product_attribute_values
    USING (organization_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY variant_templates_tenant_isolation ON variant_templates
    USING (organization_id = current_setting('app.current_tenant_id')::uuid);

-- Helper Functions

-- Function to inherit attributes from parent to variant
CREATE OR REPLACE FUNCTION inherit_attributes_from_parent(
    variant_product_id UUID,
    parent_product_id UUID
) RETURNS void AS $$
DECLARE
    attr_record RECORD;
    family_id_var UUID;
BEGIN
    -- Get family ID from parent product
    SELECT family_id INTO family_id_var
    FROM products
    WHERE id = parent_product_id;

    -- Inherit attributes marked for inheritance
    FOR attr_record IN
        SELECT fa.attribute_code, pav.text_value, pav.number_value,
               pav.boolean_value, pav.date_value, pav.json_value
        FROM family_attributes fa
        JOIN product_attribute_values pav ON fa.attribute_code = pav.attribute_code
        WHERE fa.family_id = family_id_var
          AND fa.inherit_level_1 = true
          AND pav.product_id = parent_product_id
    LOOP
        -- Insert inherited value
        INSERT INTO product_attribute_values (
            organization_id, product_id, attribute_code,
            text_value, number_value, boolean_value, date_value, json_value,
            is_inherited, inherited_from_id
        ) VALUES (
            (SELECT organization_id FROM products WHERE id = variant_product_id),
            variant_product_id, attr_record.attribute_code,
            attr_record.text_value, attr_record.number_value,
            attr_record.boolean_value, attr_record.date_value, attr_record.json_value,
            true, parent_product_id
        ) ON CONFLICT (organization_id, product_id, attribute_code)
        DO UPDATE SET
            text_value = EXCLUDED.text_value,
            number_value = EXCLUDED.number_value,
            boolean_value = EXCLUDED.boolean_value,
            date_value = EXCLUDED.date_value,
            json_value = EXCLUDED.json_value,
            is_inherited = true,
            inherited_from_id = EXCLUDED.inherited_from_id,
            updated_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate variant matrix
CREATE OR REPLACE FUNCTION generate_variant_matrix(
    family_variant_id_param UUID
) RETURNS TABLE (
    level_1_combination JSONB,
    level_2_combination JSONB,
    suggested_sku TEXT,
    suggested_name TEXT
) AS $$
DECLARE
    variant_record RECORD;
    template_record RECORD;
BEGIN
    -- Get family variant configuration
    SELECT * INTO variant_record FROM family_variants WHERE id = family_variant_id_param;

    -- Get template if exists
    SELECT * INTO template_record
    FROM variant_templates
    WHERE family_variant_id = family_variant_id_param
    LIMIT 1;

    -- Generate combinations based on template or return empty for manual configuration
    IF template_record.id IS NOT NULL THEN
        -- Return combinations from template
        FOR level_1_combination, level_2_combination IN
            SELECT l1.value, l2.value
            FROM jsonb_array_elements(template_record.level_1_combinations) l1(value)
            CROSS JOIN jsonb_array_elements(template_record.level_2_combinations) l2(value)
        LOOP
            suggested_sku := 'AUTO_' || encode(gen_random_bytes(4), 'hex');
            suggested_name := 'Variant';
            RETURN NEXT;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE family_attributes IS 'Defines configurable attributes for product families with inheritance rules';
COMMENT ON TABLE family_variants IS 'Defines variant structure and attribute distribution (Akeneo approach)';
COMMENT ON TABLE product_attribute_values IS 'Stores actual attribute values with inheritance tracking';
COMMENT ON TABLE variant_templates IS 'Templates for quick variant generation with predefined combinations';