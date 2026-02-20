-- Create junction table for product field to field group assignments
-- This enables many-to-many relationships between product fields and field groups

CREATE TABLE product_field_group_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    field_group_id UUID NOT NULL REFERENCES field_groups(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_field_group_assignment UNIQUE (product_field_id, field_group_id)
);

-- Add hidden fields configuration to product_family_field_groups
-- This allows families to selectively hide specific fields from a field group
ALTER TABLE product_family_field_groups
ADD COLUMN hidden_fields JSONB DEFAULT '[]';

-- Indexes for performance
CREATE INDEX idx_product_field_group_assignments_field_id ON product_field_group_assignments(product_field_id);
CREATE INDEX idx_product_field_group_assignments_group_id ON product_field_group_assignments(field_group_id);
CREATE INDEX idx_product_field_group_assignments_sort_order ON product_field_group_assignments(sort_order);

-- RLS Policies for product_field_group_assignments
ALTER TABLE product_field_group_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view field group assignments in their organization" ON product_field_group_assignments
    FOR SELECT USING (
        product_field_id IN (
            SELECT id FROM product_fields
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE kinde_user_id = current_setting('app.current_user_id', true)
                AND status = 'active'
            )
        )
    );

CREATE POLICY "Users can manage field group assignments in their organization" ON product_field_group_assignments
    FOR ALL USING (
        product_field_id IN (
            SELECT id FROM product_fields
            WHERE organization_id IN (
                SELECT organization_id FROM organization_members
                WHERE kinde_user_id = current_setting('app.current_user_id', true)
                AND role IN ('owner', 'admin', 'member')
                AND status = 'active'
            )
        )
    );

-- Migrate existing field-to-group relationships from the seed data
-- Assign EAN, MPN, Brand to Basic Info group
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    pf.id as product_field_id,
    fg.id as field_group_id,
    pf.sort_order
FROM product_fields pf
JOIN field_groups fg ON fg.organization_id = pf.organization_id
WHERE pf.code IN ('ean', 'mpn', 'brand')
AND fg.code = 'basic_info'
ON CONFLICT (product_field_id, field_group_id) DO NOTHING;

-- Assign Weight and Dimensions to Technical group
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    pf.id as product_field_id,
    fg.id as field_group_id,
    pf.sort_order
FROM product_fields pf
JOIN field_groups fg ON fg.organization_id = pf.organization_id
WHERE pf.code IN ('weight', 'dimensions')
AND fg.code = 'technical'
ON CONFLICT (product_field_id, field_group_id) DO NOTHING;