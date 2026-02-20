-- Consolidate product attribute storage into product_field_values
-- Adds inheritance metadata to product_field_values, migrates existing data,
-- and removes legacy attribute tables that are no longer part of the model.

BEGIN;

-- 1. Extend product_field_values with inheritance metadata (idempotent)
ALTER TABLE product_field_values
    ADD COLUMN IF NOT EXISTS is_inherited BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS inherited_from_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_field_values_inherited_from_id
    ON product_field_values(inherited_from_id);

-- 2. Migrate data from legacy product_attribute_values if the table is present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'product_attribute_values'
    ) THEN
        INSERT INTO product_field_values (
            product_id,
            product_field_id,
            value_text,
            value_number,
            value_boolean,
            value_date,
            value_datetime,
            value_json,
            locale,
            channel,
            created_at,
            updated_at,
            is_inherited,
            inherited_from_id
        )
        SELECT
            pav.product_id,
            pf.id AS product_field_id,
            pav.text_value,
            pav.number_value,
            pav.boolean_value,
            pav.date_value,
            NULL::TIMESTAMPTZ AS value_datetime,
            pav.json_value,
            NULL::VARCHAR(10) AS locale,
            NULL::VARCHAR(50) AS channel,
            pav.created_at,
            pav.updated_at,
            pav.is_inherited,
            pav.inherited_from_id
        FROM product_attribute_values pav
        JOIN products p ON p.id = pav.product_id
        JOIN product_fields pf
            ON pf.organization_id = pav.organization_id
           AND pf.code = pav.attribute_code
        ON CONFLICT (product_id, product_field_id, locale, channel) DO UPDATE SET
            value_text = COALESCE(EXCLUDED.value_text, product_field_values.value_text),
            value_number = COALESCE(EXCLUDED.value_number, product_field_values.value_number),
            value_boolean = COALESCE(EXCLUDED.value_boolean, product_field_values.value_boolean),
            value_date = COALESCE(EXCLUDED.value_date, product_field_values.value_date),
            value_datetime = COALESCE(EXCLUDED.value_datetime, product_field_values.value_datetime),
            value_json = COALESCE(EXCLUDED.value_json, product_field_values.value_json),
            created_at = LEAST(product_field_values.created_at, EXCLUDED.created_at),
            updated_at = GREATEST(product_field_values.updated_at, EXCLUDED.updated_at),
            is_inherited = EXCLUDED.is_inherited,
            inherited_from_id = EXCLUDED.inherited_from_id;
    END IF;
END $$;

-- 3. Refresh inheritance helper to use consolidated storage
CREATE OR REPLACE FUNCTION inherit_attributes_from_parent(
    variant_product_id UUID,
    parent_product_id UUID
) RETURNS void AS $$
DECLARE
    attr_record RECORD;
    family_id_var UUID;
    org_id UUID;
BEGIN
    SELECT family_id, organization_id
    INTO family_id_var, org_id
    FROM products
    WHERE id = parent_product_id;

    IF family_id_var IS NULL THEN
        RETURN;
    END IF;

    FOR attr_record IN
        SELECT
            pf.id AS product_field_id,
            pfv.value_text,
            pfv.value_number,
            pfv.value_boolean,
            pfv.value_date,
            pfv.value_datetime,
            pfv.value_json,
            pfv.locale,
            pfv.channel
        FROM family_attributes fa
        JOIN product_fields pf
            ON pf.code = fa.attribute_code
           AND pf.organization_id = org_id
        JOIN product_field_values pfv
            ON pfv.product_field_id = pf.id
        WHERE fa.family_id = family_id_var
          AND fa.inherit_level_1 = true
          AND pfv.product_id = parent_product_id
    LOOP
        INSERT INTO product_field_values (
            product_id,
            product_field_id,
            value_text,
            value_number,
            value_boolean,
            value_date,
            value_datetime,
            value_json,
            locale,
            channel,
            is_inherited,
            inherited_from_id,
            created_at,
            updated_at
        ) VALUES (
            variant_product_id,
            attr_record.product_field_id,
            attr_record.value_text,
            attr_record.value_number,
            attr_record.value_boolean,
            attr_record.value_date,
            attr_record.value_datetime,
            attr_record.value_json,
            attr_record.locale,
            attr_record.channel,
            true,
            parent_product_id,
            NOW(),
            NOW()
        )
        ON CONFLICT (product_id, product_field_id, locale, channel) DO UPDATE SET
            value_text = COALESCE(EXCLUDED.value_text, product_field_values.value_text),
            value_number = COALESCE(EXCLUDED.value_number, product_field_values.value_number),
            value_boolean = COALESCE(EXCLUDED.value_boolean, product_field_values.value_boolean),
            value_date = COALESCE(EXCLUDED.value_date, product_field_values.value_date),
            value_datetime = COALESCE(EXCLUDED.value_datetime, product_field_values.value_datetime),
            value_json = COALESCE(EXCLUDED.value_json, product_field_values.value_json),
            is_inherited = true,
            inherited_from_id = parent_product_id,
            updated_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Retire legacy attribute tables and helpers
DROP TABLE IF EXISTS product_attribute_values;
DROP TABLE IF EXISTS variant_attribute_values;
DROP TABLE IF EXISTS variant_attribute_types;
DROP FUNCTION IF EXISTS setup_sports_nutrition_variants(UUID);

COMMIT;
