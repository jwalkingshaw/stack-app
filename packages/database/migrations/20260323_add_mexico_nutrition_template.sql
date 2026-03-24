-- Migration: Add Mexico NOM-051 Tabla de Información Nutrimental template
-- Date: 2026-03-23
-- Description: Mexico NOM-051-SCFI/SSA1-2010 (updated 2020) requires a bilingual
--              nutrition table with per-serving AND per-100g columns, energy in
--              kcal AND kJ, and %VD (Valor Diario) instead of %DV.

BEGIN;

DO $$
BEGIN
    -- Nutrition Facts Mexico (NOM-051)
    IF NOT EXISTS (
        SELECT 1
        FROM product_table_templates
        WHERE organization_id IS NULL
          AND code = 'nutrition_facts_mx'
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
            'nutrition_facts_mx',
            'v1',
            'nutrition_facts',
            'Tabla Nutrimental (México)',
            'Mexico NOM-051 nutrition table with mandatory per-serving and per-100g columns, energy in kcal and kJ, and %VD.',
            'MX',
            'NOM-051-SCFI/SSA1-2010',
            'es-MX',
            jsonb_build_object(
                'columns', jsonb_build_array(
                    jsonb_build_object(
                        'key', 'nutrimento',
                        'label', '',
                        'type', 'text',
                        'is_editable', true,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'cantidad_por_porcion',
                        'label', 'Cant. por porción',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'default_unit', 'g',
                        'precision', 1,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'cantidad_por_100g',
                        'label', 'Cant. por 100g/ml',
                        'type', 'measurement',
                        'measurement_family_code', 'weight',
                        'default_unit', 'g',
                        'precision', 1,
                        'is_required', true
                    ),
                    jsonb_build_object(
                        'key', 'percent_vd',
                        'label', '%VD*',
                        'type', 'percent',
                        'precision', 0,
                        'is_required', false
                    )
                ),
                'sections', jsonb_build_array(
                    jsonb_build_object(
                        'key', 'serving_info',
                        'label', 'Información de porción',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'serving_size', 'label', 'Tamaño de porción'),
                            jsonb_build_object('key', 'servings_per_container', 'label', 'Porciones por envase')
                        )
                    ),
                    jsonb_build_object(
                        'key', 'macronutrients',
                        'label', 'Nutrimentos',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'energia_kcal', 'label', 'Contenido energético (kcal)'),
                            jsonb_build_object('key', 'energia_kj',   'label', 'Contenido energético (kJ)'),
                            jsonb_build_object('key', 'grasas_totales', 'label', 'Grasas totales'),
                            jsonb_build_object('key', 'grasas_saturadas', 'label', 'Grasas saturadas', 'parent_row_key', 'grasas_totales'),
                            jsonb_build_object('key', 'grasas_trans',    'label', 'Grasas trans',      'parent_row_key', 'grasas_totales'),
                            jsonb_build_object('key', 'colesterol',      'label', 'Colesterol'),
                            jsonb_build_object('key', 'sodio',           'label', 'Sodio'),
                            jsonb_build_object('key', 'carbohidratos',   'label', 'Carbohidratos totales'),
                            jsonb_build_object('key', 'fibra',           'label', 'Fibra dietética', 'parent_row_key', 'carbohidratos'),
                            jsonb_build_object('key', 'azucares_totales','label', 'Azúcares totales', 'parent_row_key', 'carbohidratos'),
                            jsonb_build_object('key', 'azucares_añadidos','label', 'Azúcares añadidos', 'parent_row_key', 'azucares_totales'),
                            jsonb_build_object('key', 'proteinas',       'label', 'Proteínas')
                        )
                    ),
                    jsonb_build_object(
                        'key', 'micronutrients',
                        'label', 'Vitaminas y Minerales',
                        'default_rows', jsonb_build_array(
                            jsonb_build_object('key', 'vitamina_d', 'label', 'Vitamina D'),
                            jsonb_build_object('key', 'calcio',     'label', 'Calcio'),
                            jsonb_build_object('key', 'hierro',     'label', 'Hierro'),
                            jsonb_build_object('key', 'potasio',    'label', 'Potasio')
                        )
                    )
                ),
                'meta', jsonb_build_object(
                    'panel_type', 'nutrition_facts',
                    'supports_percent_daily_value', false,
                    'supports_percent_vd', true,
                    'allows_custom_rows', true,
                    'supports_sections', true,
                    'default_measurement_family', 'weight'
                )
            ),
            jsonb_build_object(
                'regulatory_reference', 'NOM-051-SCFI/SSA1-2010 (2020 amendment)',
                'notes', 'Per-serving and per-100g columns are both mandatory. Energy must show kcal and kJ separately. %VD based on Mexican daily reference values. Front-of-pack octagonal warning seals (exceso en calorías, grasas, etc.) are required separately and are not part of this panel.'
            )
        );
    END IF;
END $$;

COMMIT;
