-- Migration: Add EU/UK product table templates for nutrition and supplements
-- Date: 2026-02-04

BEGIN;

DO $$
BEGIN
    -- EU Nutrition Facts (EU 1169/2011)
    IF NOT EXISTS (
        SELECT 1
        FROM product_table_templates
        WHERE organization_id IS NULL
          AND code = 'nutrition_facts_eu'
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
            'nutrition_facts_eu',
            'v1',
            'nutrition_facts',
            'Nutrition Declaration (EU)',
            'Standard EU nutrition declaration with per 100g/ml and optional per serving columns.',
            'EU',
            'EU 1169/2011',
            'en-GB',
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
                        'key', 'amount_per_100g',
                        'label', 'Per 100g/ml',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'precision', 1,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'amount_per_serving',
                        'label', 'Per Serving',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'precision', 1,
                        'is_required', false
                    ),
                    jsonb_build_object(
                        'key', 'percent_reference_intake',
                        'label', '% RI',
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
                            jsonb_build_object('key', 'energy', 'label', 'Energy (kJ/kcal)'),
                            jsonb_build_object('key', 'fat', 'label', 'Fat'),
                            jsonb_build_object('key', 'saturates', 'label', 'Saturates', 'parent_row_key', 'fat'),
                            jsonb_build_object('key', 'carbohydrate', 'label', 'Carbohydrate'),
                            jsonb_build_object('key', 'sugars', 'label', 'Sugars', 'parent_row_key', 'carbohydrate'),
                            jsonb_build_object('key', 'protein', 'label', 'Protein'),
                            jsonb_build_object('key', 'salt', 'label', 'Salt')
                        )
                    )
                ),
                'meta', jsonb_build_object(
                    'panel_type', 'nutrition_facts',
                    'supports_percent_daily_value', false,
                    'supports_percent_reference_intake', true,
                    'default_measurement_family', 'weight'
                )
            ),
            jsonb_build_object(
                'regulatory_reference', 'EU 1169/2011',
                'notes', 'Per 100g/ml is required; per serving and % RI are optional. Use volume units for beverages.'
            )
        );
    END IF;

    -- UK Nutrition Facts (retained EU 1169/2011 framework)
    IF NOT EXISTS (
        SELECT 1
        FROM product_table_templates
        WHERE organization_id IS NULL
          AND code = 'nutrition_facts_uk'
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
            'nutrition_facts_uk',
            'v1',
            'nutrition_facts',
            'Nutrition Declaration (UK)',
            'UK nutrition declaration with per 100g/ml and optional per serving columns.',
            'UK',
            'UK FSA',
            'en-GB',
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
                        'key', 'amount_per_100g',
                        'label', 'Per 100g/ml',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'precision', 1,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'amount_per_serving',
                        'label', 'Per Serving',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'precision', 1,
                        'is_required', false
                    ),
                    jsonb_build_object(
                        'key', 'percent_reference_intake',
                        'label', '% RI',
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
                            jsonb_build_object('key', 'energy', 'label', 'Energy (kJ/kcal)'),
                            jsonb_build_object('key', 'fat', 'label', 'Fat'),
                            jsonb_build_object('key', 'saturates', 'label', 'Saturates', 'parent_row_key', 'fat'),
                            jsonb_build_object('key', 'carbohydrate', 'label', 'Carbohydrate'),
                            jsonb_build_object('key', 'sugars', 'label', 'Sugars', 'parent_row_key', 'carbohydrate'),
                            jsonb_build_object('key', 'protein', 'label', 'Protein'),
                            jsonb_build_object('key', 'salt', 'label', 'Salt')
                        )
                    )
                ),
                'meta', jsonb_build_object(
                    'panel_type', 'nutrition_facts',
                    'supports_percent_daily_value', false,
                    'supports_percent_reference_intake', true,
                    'default_measurement_family', 'weight'
                )
            ),
            jsonb_build_object(
                'regulatory_reference', 'UK retained EU 1169/2011',
                'notes', 'Per 100g/ml is required; per serving and % RI are optional. Use volume units for beverages.'
            )
        );
    END IF;

    -- EU Supplement Facts (Food Supplements Directive)
    IF NOT EXISTS (
        SELECT 1
        FROM product_table_templates
        WHERE organization_id IS NULL
          AND code = 'supplement_facts_eu'
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
            'supplement_facts_eu',
            'v1',
            'supplement_facts',
            'Supplement Facts (EU)',
            'EU food supplement nutrition information with Amount Per Serving and %NRV columns.',
            'EU',
            'EU 2002/46/EC',
            'en-GB',
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
                        'key', 'percent_nrv',
                        'label', '% NRV',
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
                        'default_rows', jsonb_build_array()
                    )
                ),
                'meta', jsonb_build_object(
                    'panel_type', 'supplement_facts',
                    'supports_percent_daily_value', false,
                    'supports_percent_nrv', true,
                    'default_measurement_family', 'weight'
                )
            ),
            jsonb_build_object(
                'regulatory_reference', 'EU 2002/46/EC',
                'notes', 'NRV applies to vitamins and minerals listed in Annex I.'
            )
        );
    END IF;

    -- UK Supplement Facts (retained EU framework)
    IF NOT EXISTS (
        SELECT 1
        FROM product_table_templates
        WHERE organization_id IS NULL
          AND code = 'supplement_facts_uk'
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
            'supplement_facts_uk',
            'v1',
            'supplement_facts',
            'Supplement Facts (UK)',
            'UK food supplement nutrition information with Amount Per Serving and %NRV columns.',
            'UK',
            'UK FSA',
            'en-GB',
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
                        'key', 'percent_nrv',
                        'label', '% NRV',
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
                        'default_rows', jsonb_build_array()
                    )
                ),
                'meta', jsonb_build_object(
                    'panel_type', 'supplement_facts',
                    'supports_percent_daily_value', false,
                    'supports_percent_nrv', true,
                    'default_measurement_family', 'weight'
                )
            ),
            jsonb_build_object(
                'regulatory_reference', 'UK retained EU 2002/46/EC',
                'notes', 'NRV applies to vitamins and minerals listed in Annex I.'
            )
        );
    END IF;
END $$;

COMMIT;
