-- Migration: Add parent row relationships for facts panel default rows
-- Date: 2026-02-12

BEGIN;

DO $$
DECLARE
    row_parent_map JSONB := jsonb_build_object(
        'saturated_fat', 'total_fat',
        'trans_fat', 'total_fat',
        'dietary_fiber', 'total_carbohydrate',
        'total_sugars', 'total_carbohydrate',
        'added_sugars', 'total_sugars',
        'saturates', 'fat',
        'sugars', 'carbohydrate'
    );
BEGIN
    UPDATE product_table_templates
    SET definition = jsonb_set(
        definition,
        '{sections}',
        (
            SELECT jsonb_agg(
                CASE
                    WHEN section ? 'default_rows' THEN
                        jsonb_set(
                            section,
                            '{default_rows}',
                            (
                                SELECT jsonb_agg(
                                    CASE
                                        WHEN row ? 'key'
                                             AND row_parent_map ? (row->>'key') THEN
                                            row || jsonb_build_object(
                                                'parent_row_key',
                                                row_parent_map->>(row->>'key')
                                            )
                                        ELSE row
                                    END
                                    ORDER BY ord
                                )
                                FROM jsonb_array_elements(section->'default_rows')
                                WITH ORDINALITY AS rows(row, ord)
                            ),
                            true
                        )
                    ELSE section
                END
                ORDER BY section_ord
            )
            FROM jsonb_array_elements(definition->'sections')
            WITH ORDINALITY AS sections(section, section_ord)
        ),
        true
    ),
    updated_at = NOW()
    WHERE code IN (
        'supplement_facts_us',
        'nutrition_facts_us',
        'nutrition_facts_eu',
        'nutrition_facts_uk',
        'supplement_facts_eu',
        'supplement_facts_uk'
    )
    AND definition ? 'sections'
    AND jsonb_typeof(definition->'sections') = 'array';
END $$;

COMMIT;
