-- Ensure product_family_variant_attributes cannot link records across organizations.

BEGIN;

-- Add computed organization column to simplify constraints
ALTER TABLE product_family_variant_attributes
    ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Populate organization_id from product families
UPDATE product_family_variant_attributes pfva
SET organization_id = pf.organization_id
FROM product_families pf
WHERE pfva.organization_id IS NULL
  AND pfva.product_family_id = pf.id;

-- Keep organization_id in sync on new inserts/updates
CREATE OR REPLACE FUNCTION set_pfva_organization_id()
RETURNS TRIGGER AS $$
BEGIN
    SELECT organization_id INTO NEW.organization_id
    FROM product_families
    WHERE id = NEW.product_family_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pfva_org_id_before_insert ON product_family_variant_attributes;
CREATE TRIGGER set_pfva_org_id_before_insert
    BEFORE INSERT OR UPDATE OF product_family_id
    ON product_family_variant_attributes
    FOR EACH ROW
    EXECUTE FUNCTION set_pfva_organization_id();

-- Enforce organization consistency between family and field
ALTER TABLE product_family_variant_attributes
    ADD CONSTRAINT fk_pfva_field_same_org
    FOREIGN KEY (organization_id, product_field_id)
    REFERENCES product_fields (organization_id, id)
    ON DELETE CASCADE;

ALTER TABLE product_family_variant_attributes
    ADD CONSTRAINT fk_pfva_family_same_org
    FOREIGN KEY (organization_id, product_family_id)
    REFERENCES product_families (organization_id, id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pfva_organization_id
    ON product_family_variant_attributes(organization_id);

COMMIT;
