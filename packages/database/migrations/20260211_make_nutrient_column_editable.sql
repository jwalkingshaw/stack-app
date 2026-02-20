-- Migration: Make nutrient column editable in facts panel templates
-- Date: 2026-02-11

BEGIN;

UPDATE product_table_templates
SET definition = jsonb_set(
    definition,
    '{columns,0,is_editable}',
    'true'::jsonb,
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
AND definition ? 'columns'
AND jsonb_typeof(definition->'columns') = 'array'
AND (definition->'columns')->0 ? 'key'
AND (definition->'columns'->0->>'key') = 'nutrient';

COMMIT;
