-- Product Family Variant Attributes
-- Maps product fields to product families to define which fields are variant attributes
-- This allows each product family to have its own set of variant-defining attributes

CREATE TABLE product_family_variant_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_family_id UUID NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_family_variant_field UNIQUE (product_family_id, product_field_id)
);

-- Indexes for performance
CREATE INDEX idx_product_family_variant_attrs_family_id
    ON product_family_variant_attributes(product_family_id);

CREATE INDEX idx_product_family_variant_attrs_field_id
    ON product_family_variant_attributes(product_field_id);

CREATE INDEX idx_product_family_variant_attrs_sort_order
    ON product_family_variant_attributes(product_family_id, sort_order);

-- Enable RLS
ALTER TABLE product_family_variant_attributes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view family variant attributes in their organization"
    ON product_family_variant_attributes
    FOR SELECT USING (
        product_family_id IN (
            SELECT id FROM product_families
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE kinde_user_id = current_setting('app.current_user_id', true)
                AND status = 'active'
            )
        )
    );

CREATE POLICY "Users can manage family variant attributes in their organization"
    ON product_family_variant_attributes
    FOR ALL USING (
        product_family_id IN (
            SELECT id FROM product_families
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE kinde_user_id = current_setting('app.current_user_id', true)
                AND role IN ('owner', 'admin', 'member')
                AND status = 'active'
            )
        )
    );

-- Function to get variant attributes for a product family with field details
CREATE OR REPLACE FUNCTION get_family_variant_attributes(
    family_id_param UUID
) RETURNS TABLE (
    id UUID,
    product_field_id UUID,
    field_code VARCHAR,
    field_name VARCHAR,
    field_type VARCHAR,
    field_description TEXT,
    sort_order INTEGER,
    is_required BOOLEAN,
    validation_rules JSONB,
    options JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pfva.id,
        pfva.product_field_id,
        pf.code AS field_code,
        pf.name AS field_name,
        pf.field_type,
        pf.description AS field_description,
        pfva.sort_order,
        pfva.is_required,
        pf.validation_rules,
        pf.options
    FROM product_family_variant_attributes pfva
    JOIN product_fields pf ON pfva.product_field_id = pf.id
    WHERE pfva.product_family_id = family_id_param
        AND pf.is_active = true
    ORDER BY pfva.sort_order ASC, pf.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get variant attribute values for a product
CREATE OR REPLACE FUNCTION get_product_variant_attribute_values(
    product_id_param UUID
) RETURNS TABLE (
    field_code VARCHAR,
    field_name VARCHAR,
    field_type VARCHAR,
    value_text TEXT,
    value_number DECIMAL,
    value_boolean BOOLEAN,
    value_date DATE,
    value_datetime TIMESTAMP WITH TIME ZONE,
    value_json JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pf.code AS field_code,
        pf.name AS field_name,
        pf.field_type,
        pfv.value_text,
        pfv.value_number,
        pfv.value_boolean,
        pfv.value_date,
        pfv.value_datetime,
        pfv.value_json
    FROM product_field_values pfv
    JOIN product_fields pf ON pfv.product_field_id = pf.id
    JOIN products p ON pfv.product_id = p.id
    JOIN product_family_variant_attributes pfva
        ON pfva.product_field_id = pf.id
        AND pfva.product_family_id = p.family_id
    WHERE pfv.product_id = product_id_param
    ORDER BY pfva.sort_order ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_product_family_variant_attributes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_family_variant_attributes_timestamp
    BEFORE UPDATE ON product_family_variant_attributes
    FOR EACH ROW
    EXECUTE FUNCTION update_product_family_variant_attributes_updated_at();

-- Comments for documentation
COMMENT ON TABLE product_family_variant_attributes IS 'Defines which product fields serve as variant attributes for each product family';
COMMENT ON FUNCTION get_family_variant_attributes IS 'Returns all variant attributes configured for a product family with full field details';
COMMENT ON FUNCTION get_product_variant_attribute_values IS 'Returns variant attribute values for a specific product';
