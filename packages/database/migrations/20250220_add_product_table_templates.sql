-- Migration: Product table templates and metadata support
-- Date: 2025-02-20
-- Description: Introduces reusable table templates, seeds core panels, and enriches table field metadata.

BEGIN;

-- 1. Template catalog for reusable product tables
CREATE TABLE IF NOT EXISTS product_table_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    version TEXT NOT NULL,
    kind TEXT NOT NULL, -- e.g. supplement_facts, nutrition_facts, custom
    label TEXT NOT NULL,
    description TEXT,
    region TEXT,
    regulator TEXT,
    locale TEXT,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_product_table_templates_org_code_version
        UNIQUE (organization_id, code, version)
);

-- 2. Row-Level Security for multi-tenant isolation with shared system templates
ALTER TABLE product_table_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_table_templates'
          AND policyname = 'product_table_templates_select_policy'
    ) THEN
        CREATE POLICY product_table_templates_select_policy ON product_table_templates
            FOR SELECT
            USING (
                organization_id IS NULL
                OR organization_id = COALESCE(
                    NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
                    '00000000-0000-0000-0000-000000000000'::uuid
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_table_templates'
          AND policyname = 'product_table_templates_tenant_manage_policy'
    ) THEN
        CREATE POLICY product_table_templates_tenant_manage_policy ON product_table_templates
            FOR ALL
            USING (
                organization_id = COALESCE(
                    NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
                    '00000000-0000-0000-0000-000000000000'::uuid
                )
            )
            WITH CHECK (
                organization_id = COALESCE(
                    NULLIF(current_setting('app.current_tenant_id', true), '')::uuid,
                    '00000000-0000-0000-0000-000000000000'::uuid
                )
            );
    END IF;
END $$;

-- Supporting indexes for lookup efficiency and uniqueness of global templates
CREATE INDEX IF NOT EXISTS idx_product_table_templates_org
    ON product_table_templates(organization_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_table_templates_global_code_version
    ON product_table_templates(code, version)
    WHERE organization_id IS NULL;

-- Keep updated_at in sync
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_product_table_templates_updated_at'
          AND tgrelid = 'product_table_templates'::regclass
    ) THEN
        CREATE TRIGGER set_product_table_templates_updated_at
            BEFORE UPDATE ON product_table_templates
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 3. Seed core system templates (organization_id = NULL indicates global availability)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM product_table_templates
        WHERE organization_id IS NULL
          AND code = 'supplement_facts_us'
          AND version = 'v1'
    ) THEN
        INSERT INTO product_table_templates (
            organization_id,
            code,
            version,
            kind,
            label,
            description,
            region,
            regulator,
            locale,
            definition,
            metadata
        )
        VALUES (
            NULL,
            'supplement_facts_us',
            'v1',
            'supplement_facts',
            'Supplement Facts (US FDA)',
            'Standard U.S. FDA Supplement Facts panel with Amount Per Serving and %DV columns.',
            'US',
            'FDA',
            'en-US',
            jsonb_build_object(
                'columns', jsonb_build_array(
                    jsonb_build_object(
                        'key', 'nutrient',
                        'label', '',
                        'type', 'text',
                        'is_editable', true,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'amount_per_serving',
                        'label', 'Amount Per Serving',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'precision', 1,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'percent_daily_value',
                        'label', '% Daily Value',
                        'type', 'percent',
                        'precision', 0,
                        'is_required', false
                    )
                ),
                'sections', jsonb_build_array(
                    jsonb_build_object(
                        'key', 'serving_info',
                        'label', 'Serving Information',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'serving_size', 'label', 'Serving Size'),
                            jsonb_build_object('key', 'servings_per_container', 'label', 'Servings Per Container')
                        )
                    ),
                    jsonb_build_object(
                        'key', 'active_ingredients',
                        'label', 'Active Ingredients',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'calories', 'label', 'Calories'),
                            jsonb_build_object('key', 'total_fat', 'label', 'Total Fat'),
                            jsonb_build_object('key', 'sodium', 'label', 'Sodium'),
                            jsonb_build_object('key', 'total_carbohydrate', 'label', 'Total Carbohydrate'),
                            jsonb_build_object('key', 'protein', 'label', 'Protein')
                        )
                    ),
                    jsonb_build_object(
                        'key', 'other_ingredients',
                        'label', 'Other Ingredients',
                        'default_rows', jsonb_build_array()
                    )
                ),
                'meta', jsonb_build_object(
                    'panel_type', 'supplement_facts',
                    'supports_percent_daily_value', true,
                    'default_measurement_family', 'weight'
                )
            ),
            jsonb_build_object(
                'regulatory_reference', '21 CFR 101.36',
                'notes', 'Columns align with FDA dietary supplement labeling requirements.'
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM product_table_templates
        WHERE organization_id IS NULL
          AND code = 'nutrition_facts_us'
          AND version = 'v1'
    ) THEN
        INSERT INTO product_table_templates (
            organization_id,
            code,
            version,
            kind,
            label,
            description,
            region,
            regulator,
            locale,
            definition,
            metadata
        )
        VALUES (
            NULL,
            'nutrition_facts_us',
            'v1',
            'nutrition_facts',
            'Nutrition Facts (US FDA)',
            'Standard U.S. Nutrition Facts panel with Amount Per Serving and %DV columns.',
            'US',
            'FDA',
            'en-US',
            jsonb_build_object(
                'columns', jsonb_build_array(
                    jsonb_build_object(
                        'key', 'nutrient',
                        'label', '',
                        'type', 'text',
                        'is_editable', true,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'amount_per_serving',
                        'label', 'Amount Per Serving',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'precision', 1,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'percent_daily_value',
                        'label', '% Daily Value',
                        'type', 'percent',
                        'precision', 0,
                        'is_required', false
                    )
                ),
                'sections', jsonb_build_array(
                    jsonb_build_object(
                        'key', 'serving_info',
                        'label', 'Serving Information',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'serving_size', 'label', 'Serving Size'),
                            jsonb_build_object('key', 'servings_per_container', 'label', 'Servings Per Container')
                        )
                    ),
                    jsonb_build_object(
                        'key', 'macronutrients',
                        'label', 'Macronutrients',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'calories', 'label', 'Calories'),
                            jsonb_build_object('key', 'total_fat', 'label', 'Total Fat'),
                            jsonb_build_object('key', 'saturated_fat', 'label', 'Saturated Fat', 'parent_row_key', 'total_fat'),
                            jsonb_build_object('key', 'trans_fat', 'label', 'Trans Fat', 'parent_row_key', 'total_fat'),
                            jsonb_build_object('key', 'cholesterol', 'label', 'Cholesterol'),
                            jsonb_build_object('key', 'sodium', 'label', 'Sodium'),
                            jsonb_build_object('key', 'total_carbohydrate', 'label', 'Total Carbohydrate'),
                            jsonb_build_object('key', 'dietary_fiber', 'label', 'Dietary Fiber', 'parent_row_key', 'total_carbohydrate'),
                            jsonb_build_object('key', 'total_sugars', 'label', 'Total Sugars', 'parent_row_key', 'total_carbohydrate'),
                            jsonb_build_object('key', 'added_sugars', 'label', 'Includes Added Sugars', 'parent_row_key', 'total_sugars'),
                            jsonb_build_object('key', 'protein', 'label', 'Protein')
                        )
                    ),
                    jsonb_build_object(
                        'key', 'micronutrients',
                        'label', 'Vitamins & Minerals',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'vitamin_d', 'label', 'Vitamin D'),
                            jsonb_build_object('key', 'calcium', 'label', 'Calcium'),
                            jsonb_build_object('key', 'iron', 'label', 'Iron'),
                            jsonb_build_object('key', 'potassium', 'label', 'Potassium')
                        )
                    )
                ),
                'meta', jsonb_build_object(
                    'panel_type', 'nutrition_facts',
                    'supports_percent_daily_value', true,
                    'default_measurement_family', 'weight'
                )
            ),
            jsonb_build_object(
                'regulatory_reference', '21 CFR 101.9',
                'notes', 'Aligns with FDA Nutrition Facts labeling requirements effective 2020.'
            )
        );
    END IF;
END $$;

-- 4. Extend product_fields to link to templates and normalize table metadata
ALTER TABLE product_fields
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES product_table_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_fields_template_id
    ON product_fields(template_id);

-- Ensure template linkage honors tenant boundaries: template must be global or match the field's organization
CREATE OR REPLACE FUNCTION validate_product_field_template_scope(template_uuid UUID, org_uuid UUID)
RETURNS BOOLEAN AS $$
    SELECT
        template_uuid IS NULL
        OR EXISTS (
            SELECT 1
            FROM product_table_templates ptt
            WHERE ptt.id = template_uuid
              AND (
                  ptt.organization_id IS NULL
                  OR ptt.organization_id = org_uuid
              )
        );
$$ LANGUAGE sql STABLE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'product_fields_template_scope_check'
    ) THEN
        ALTER TABLE product_fields
            ADD CONSTRAINT product_fields_template_scope_check
            CHECK (validate_product_field_template_scope(template_id, organization_id));
    END IF;
END $$;

-- Ensure options is at least an empty object for all rows
UPDATE product_fields
SET options = '{}'::jsonb
WHERE options IS NULL;

-- Backfill default table definition for table fields lacking metadata
UPDATE product_fields
SET options = jsonb_set(
    COALESCE(options, '{}'::jsonb),
    '{table_definition}',
    jsonb_build_object(
        'columns', jsonb_build_array(
            jsonb_build_object(
                'key', 'value',
                'label', 'Value',
                'type', 'text',
                'is_required', false,
                'is_editable', true
            )
        ),
        'meta', jsonb_build_object(
            'allows_custom_rows', true,
            'supports_sections', false
        )
    ),
    true
),
updated_at = NOW()
WHERE field_type = 'table'
  AND (options->'table_definition') IS NULL;

-- Table-definition presence guard for future inserts/updates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'product_fields_table_definition_required'
    ) THEN
        ALTER TABLE product_fields
            ADD CONSTRAINT product_fields_table_definition_required
            CHECK (
                field_type <> 'table'
                OR (
                    options IS NOT NULL
                    AND options ? 'table_definition'
                )
            );
    END IF;
END $$;

COMMIT;
