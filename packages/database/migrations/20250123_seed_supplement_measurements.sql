-- Migration: Seed supplement measurement families and units
-- Date: 2025-01-23
-- Description: Creates default measurement families and units for supplement products

-- Note: This is an example seeding for organizations. In production, these would be created per organization.
-- For now, we'll create system-wide defaults that can be copied to new organizations.

-- Function to seed measurement data for an organization
CREATE OR REPLACE FUNCTION seed_measurement_families_for_organization(org_id UUID)
RETURNS VOID AS $$
DECLARE
    weight_family_id UUID;
    volume_family_id UUID;
    length_family_id UUID;
    dimensions_family_id UUID;
    kg_unit_id UUID;
    l_unit_id UUID;
    m_unit_id UUID;
    cm_unit_id UUID;
BEGIN
    -- 1. WEIGHT FAMILY (Standard: Kilogram)
    WITH upserted AS (
        INSERT INTO measurement_families (
            id,
            organization_id,
            code,
            name,
            description,
            is_composite,
            component_schema,
            default_decimal_precision,
            allow_negative,
            metadata
        )
        VALUES (
            gen_random_uuid(),
            org_id,
            'weight',
            'Weight',
            'Weight measurements for supplement products',
            false,
            '[{"key": "value", "label": "Weight"}]'::jsonb,
            3,
            false,
            jsonb_build_object('conversion_note', 'Values normalize to kilograms (kg).')
        )
        ON CONFLICT (organization_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_composite = EXCLUDED.is_composite,
            component_schema = EXCLUDED.component_schema,
            default_decimal_precision = EXCLUDED.default_decimal_precision,
            allow_negative = EXCLUDED.allow_negative,
            metadata = EXCLUDED.metadata,
            is_active = true
        RETURNING id
    )
    SELECT id INTO weight_family_id FROM upserted;

    IF weight_family_id IS NULL THEN
        SELECT id INTO weight_family_id
        FROM measurement_families
        WHERE organization_id = org_id AND code = 'weight';
    END IF;

    -- Weight units
    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), weight_family_id, 'kg', 'Kilogram', 'kg', 1.0)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), weight_family_id, 'g', 'Gram', 'g', 0.001)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), weight_family_id, 'lb', 'Pound', 'lb', 0.453592)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), weight_family_id, 'oz', 'Ounce', 'oz', 0.0283495)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    -- Get kg unit ID and set as standard
    SELECT id INTO kg_unit_id FROM measurement_units
    WHERE measurement_family_id = weight_family_id AND code = 'kg';

    UPDATE measurement_families
    SET standard_unit_id = kg_unit_id
    WHERE id = weight_family_id;

    -- 2. VOLUME FAMILY (Standard: Liter)
    WITH upserted AS (
        INSERT INTO measurement_families (
            id,
            organization_id,
            code,
            name,
            description,
            is_composite,
            component_schema,
            default_decimal_precision,
            allow_negative,
            metadata
        )
        VALUES (
            gen_random_uuid(),
            org_id,
            'volume',
            'Volume',
            'Volume measurements for liquid supplements',
            false,
            '[{"key": "value", "label": "Volume"}]'::jsonb,
            3,
            false,
            jsonb_build_object('conversion_note', 'Values normalize to liters (L).')
        )
        ON CONFLICT (organization_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_composite = EXCLUDED.is_composite,
            component_schema = EXCLUDED.component_schema,
            default_decimal_precision = EXCLUDED.default_decimal_precision,
            allow_negative = EXCLUDED.allow_negative,
            metadata = EXCLUDED.metadata,
            is_active = true
        RETURNING id
    )
    SELECT id INTO volume_family_id FROM upserted;

    IF volume_family_id IS NULL THEN
        SELECT id INTO volume_family_id
        FROM measurement_families
        WHERE organization_id = org_id AND code = 'volume';
    END IF;

    -- Volume units
    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), volume_family_id, 'l', 'Liter', 'L', 1.0)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), volume_family_id, 'ml', 'Milliliter', 'ml', 0.001)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), volume_family_id, 'fl_oz', 'Fluid Ounce', 'fl oz', 0.0295735)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), volume_family_id, 'cup', 'Cup', 'cup', 0.236588)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    -- Get liter unit ID and set as standard
    SELECT id INTO l_unit_id FROM measurement_units
    WHERE measurement_family_id = volume_family_id AND code = 'l';

    UPDATE measurement_families
    SET standard_unit_id = l_unit_id
    WHERE id = volume_family_id;

    -- 3. LENGTH FAMILY (Standard: Meter) - For dimensions
    WITH upserted AS (
        INSERT INTO measurement_families (
            id,
            organization_id,
            code,
            name,
            description,
            is_composite,
            component_schema,
            default_decimal_precision,
            allow_negative,
            metadata
        )
        VALUES (
            gen_random_uuid(),
            org_id,
            'length',
            'Length',
            'Length measurements for product dimensions',
            false,
            '[{"key": "value", "label": "Length"}]'::jsonb,
            2,
            false,
            jsonb_build_object('conversion_note', 'Values normalize to meters (m).')
        )
        ON CONFLICT (organization_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_composite = EXCLUDED.is_composite,
            component_schema = EXCLUDED.component_schema,
            default_decimal_precision = EXCLUDED.default_decimal_precision,
            allow_negative = EXCLUDED.allow_negative,
            metadata = EXCLUDED.metadata,
            is_active = true
        RETURNING id
    )
    SELECT id INTO length_family_id FROM upserted;

    IF length_family_id IS NULL THEN
        SELECT id INTO length_family_id
        FROM measurement_families
        WHERE organization_id = org_id AND code = 'length';
    END IF;

    -- Length units
    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), length_family_id, 'm', 'Meter', 'm', 1.0)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), length_family_id, 'cm', 'Centimeter', 'cm', 0.01)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), length_family_id, 'mm', 'Millimeter', 'mm', 0.001)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), length_family_id, 'in', 'Inch', 'in', 0.0254)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), length_family_id, 'ft', 'Foot', 'ft', 0.3048)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    -- Get meter unit ID and set as standard
    SELECT id INTO m_unit_id FROM measurement_units
    WHERE measurement_family_id = length_family_id AND code = 'm';

    UPDATE measurement_families
    SET standard_unit_id = m_unit_id
    WHERE id = length_family_id;

    -- 4. DIMENSIONS FAMILY (Standard: Centimeter) - For L x W x H measurements
    WITH upserted AS (
        INSERT INTO measurement_families (
            id,
            organization_id,
            code,
            name,
            description,
            is_composite,
            component_schema,
            default_decimal_precision,
            allow_negative,
            metadata
        )
        VALUES (
            gen_random_uuid(),
            org_id,
            'dimensions',
            'Dimensions',
            'Length x Width x Height measurements for product dimensions',
            true,
            '[
                {"key": "length", "label": "Length"},
                {"key": "width", "label": "Width"},
                {"key": "height", "label": "Height"}
            ]'::jsonb,
            2,
            false,
            jsonb_build_object('conversion_note', 'Values normalize to centimeters (cm).')
        )
        ON CONFLICT (organization_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_composite = EXCLUDED.is_composite,
            component_schema = EXCLUDED.component_schema,
            default_decimal_precision = EXCLUDED.default_decimal_precision,
            allow_negative = EXCLUDED.allow_negative,
            metadata = EXCLUDED.metadata,
            is_active = true
        RETURNING id
    )
    SELECT id INTO dimensions_family_id FROM upserted;

    IF dimensions_family_id IS NULL THEN
        SELECT id INTO dimensions_family_id
        FROM measurement_families
        WHERE organization_id = org_id AND code = 'dimensions';
    END IF;

    -- Dimensions units (same as length units but for composite measurements)
    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), dimensions_family_id, 'cm', 'Centimeter', 'cm', 1.0)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), dimensions_family_id, 'mm', 'Millimeter', 'mm', 0.1)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), dimensions_family_id, 'm', 'Meter', 'm', 100.0)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), dimensions_family_id, 'in', 'Inch', 'in', 2.54)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    INSERT INTO measurement_units (id, measurement_family_id, code, name, symbol, conversion_factor)
    VALUES (gen_random_uuid(), dimensions_family_id, 'ft', 'Foot', 'ft', 30.48)
    ON CONFLICT (measurement_family_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        conversion_factor = EXCLUDED.conversion_factor,
        is_active = true;

    -- Get cm unit ID and set as standard for dimensions
    SELECT id INTO cm_unit_id FROM measurement_units
    WHERE measurement_family_id = dimensions_family_id AND code = 'cm';

    UPDATE measurement_families
    SET standard_unit_id = cm_unit_id
    WHERE id = dimensions_family_id;

END;
$$ LANGUAGE plpgsql;

-- Example: Seed for an organization (you'll need to replace with actual org UUID)
-- SELECT seed_measurement_families_for_organization('your-org-uuid-here');

COMMENT ON FUNCTION seed_measurement_families_for_organization(UUID) IS
'Seeds measurement families and units for supplement products for a given organization';
