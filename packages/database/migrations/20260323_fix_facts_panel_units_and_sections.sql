-- Migration: Fix facts panel default units and add missing sections
-- Date: 2026-03-23
-- Fixes:
--   1. All measurement columns now specify default_unit 'g' so the UI
--      defaults to grams rather than the measurement family's standard unit (kg).
--   2. EU/UK nutrition templates gain a Vitamins & Minerals section with
--      common sport-supplement micronutrient defaults.
--   3. EU/UK supplement templates gain meaningful default active_ingredient rows.
--   4. US supplement template gains richer sport-supplement defaults.
--   5. All templates now explicitly set allows_custom_rows and supports_sections in meta.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: patch default_unit onto measurement-type columns
-- ─────────────────────────────────────────────────────────────────────────────

-- EU Nutrition Facts — fix measurement column default_unit + add micronutrients
UPDATE product_table_templates
SET definition = definition
  || jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(
          CASE
            WHEN (col->>'type') = 'measurement' THEN col || '{"default_unit":"g"}'::jsonb
            ELSE col
          END
        )
        FROM jsonb_array_elements(definition->'columns') AS col
      ),
      'sections', (
        definition->'sections' || jsonb_build_array(
          jsonb_build_object(
            'key', 'micronutrients',
            'label', 'Vitamins & Minerals',
            'description', 'Optional vitamins and minerals. NRV applies where listed.',
            'default_rows', jsonb_build_array(
              jsonb_build_object('key', 'vitamin_c',  'label', 'Vitamin C'),
              jsonb_build_object('key', 'vitamin_d',  'label', 'Vitamin D'),
              jsonb_build_object('key', 'vitamin_b6', 'label', 'Vitamin B6'),
              jsonb_build_object('key', 'vitamin_b12','label', 'Vitamin B12'),
              jsonb_build_object('key', 'folate',     'label', 'Folate'),
              jsonb_build_object('key', 'calcium',    'label', 'Calcium'),
              jsonb_build_object('key', 'iron',       'label', 'Iron'),
              jsonb_build_object('key', 'magnesium',  'label', 'Magnesium'),
              jsonb_build_object('key', 'zinc',       'label', 'Zinc'),
              jsonb_build_object('key', 'potassium',  'label', 'Potassium'),
              jsonb_build_object('key', 'sodium_micro','label', 'Sodium')
            )
          )
        )
      ),
      'meta', definition->'meta'
        || '{"allows_custom_rows":true,"supports_sections":true}'::jsonb
    )
WHERE organization_id IS NULL
  AND code = 'nutrition_facts_eu'
  AND version = 'v1';

-- UK Nutrition Facts — same fixes as EU
UPDATE product_table_templates
SET definition = definition
  || jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(
          CASE
            WHEN (col->>'type') = 'measurement' THEN col || '{"default_unit":"g"}'::jsonb
            ELSE col
          END
        )
        FROM jsonb_array_elements(definition->'columns') AS col
      ),
      'sections', (
        definition->'sections' || jsonb_build_array(
          jsonb_build_object(
            'key', 'micronutrients',
            'label', 'Vitamins & Minerals',
            'description', 'Optional vitamins and minerals. NRV applies where listed.',
            'default_rows', jsonb_build_array(
              jsonb_build_object('key', 'vitamin_c',  'label', 'Vitamin C'),
              jsonb_build_object('key', 'vitamin_d',  'label', 'Vitamin D'),
              jsonb_build_object('key', 'vitamin_b6', 'label', 'Vitamin B6'),
              jsonb_build_object('key', 'vitamin_b12','label', 'Vitamin B12'),
              jsonb_build_object('key', 'folate',     'label', 'Folate'),
              jsonb_build_object('key', 'calcium',    'label', 'Calcium'),
              jsonb_build_object('key', 'iron',       'label', 'Iron'),
              jsonb_build_object('key', 'magnesium',  'label', 'Magnesium'),
              jsonb_build_object('key', 'zinc',       'label', 'Zinc'),
              jsonb_build_object('key', 'potassium',  'label', 'Potassium'),
              jsonb_build_object('key', 'sodium_micro','label', 'Sodium')
            )
          )
        )
      ),
      'meta', definition->'meta'
        || '{"allows_custom_rows":true,"supports_sections":true}'::jsonb
    )
WHERE organization_id IS NULL
  AND code = 'nutrition_facts_uk'
  AND version = 'v1';

-- ─────────────────────────────────────────────────────────────────────────────
-- EU Supplement Facts — fix default_unit + populate active_ingredients
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE product_table_templates
SET definition = definition
  || jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(
          CASE
            WHEN (col->>'type') = 'measurement' THEN col || '{"default_unit":"g"}'::jsonb
            ELSE col
          END
        )
        FROM jsonb_array_elements(definition->'columns') AS col
      ),
      'sections', jsonb_build_array(
        -- Serving info section unchanged
        (SELECT s FROM jsonb_array_elements(definition->'sections') AS s
          WHERE s->>'key' = 'serving_info'),
        -- Active ingredients with sport supplement defaults
        jsonb_build_object(
          'key', 'active_ingredients',
          'label', 'Active Ingredients',
          'description', 'List active nutrient or ingredient quantities. Add rows for your product formulation.',
          'default_rows', jsonb_build_array(
            jsonb_build_object('key', 'energy',       'label', 'Energy (kJ/kcal)'),
            jsonb_build_object('key', 'protein',      'label', 'Protein'),
            jsonb_build_object('key', 'carbohydrate', 'label', 'Carbohydrate'),
            jsonb_build_object('key', 'sugars',       'label', 'Sugars',       'parent_row_key', 'carbohydrate'),
            jsonb_build_object('key', 'fat',          'label', 'Fat'),
            jsonb_build_object('key', 'saturates',    'label', 'Saturates',    'parent_row_key', 'fat'),
            jsonb_build_object('key', 'salt',         'label', 'Salt')
          )
        ),
        -- Other / proprietary ingredients (empty — user adds as needed)
        jsonb_build_object(
          'key', 'other_ingredients',
          'label', 'Other Ingredients',
          'description', 'Additional ingredients not covered above (e.g. proprietary blends, botanicals).',
          'default_rows', jsonb_build_array()
        )
      ),
      'meta', definition->'meta'
        || '{"allows_custom_rows":true,"supports_sections":true}'::jsonb
    )
WHERE organization_id IS NULL
  AND code = 'supplement_facts_eu'
  AND version = 'v1';

-- UK Supplement Facts — same as EU
UPDATE product_table_templates
SET definition = definition
  || jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(
          CASE
            WHEN (col->>'type') = 'measurement' THEN col || '{"default_unit":"g"}'::jsonb
            ELSE col
          END
        )
        FROM jsonb_array_elements(definition->'columns') AS col
      ),
      'sections', jsonb_build_array(
        (SELECT s FROM jsonb_array_elements(definition->'sections') AS s
          WHERE s->>'key' = 'serving_info'),
        jsonb_build_object(
          'key', 'active_ingredients',
          'label', 'Active Ingredients',
          'description', 'List active nutrient or ingredient quantities.',
          'default_rows', jsonb_build_array(
            jsonb_build_object('key', 'energy',       'label', 'Energy (kJ/kcal)'),
            jsonb_build_object('key', 'protein',      'label', 'Protein'),
            jsonb_build_object('key', 'carbohydrate', 'label', 'Carbohydrate'),
            jsonb_build_object('key', 'sugars',       'label', 'Sugars',       'parent_row_key', 'carbohydrate'),
            jsonb_build_object('key', 'fat',          'label', 'Fat'),
            jsonb_build_object('key', 'saturates',    'label', 'Saturates',    'parent_row_key', 'fat'),
            jsonb_build_object('key', 'salt',         'label', 'Salt')
          )
        ),
        jsonb_build_object(
          'key', 'other_ingredients',
          'label', 'Other Ingredients',
          'description', 'Additional ingredients (e.g. proprietary blends, botanicals).',
          'default_rows', jsonb_build_array()
        )
      ),
      'meta', definition->'meta'
        || '{"allows_custom_rows":true,"supports_sections":true}'::jsonb
    )
WHERE organization_id IS NULL
  AND code = 'supplement_facts_uk'
  AND version = 'v1';

-- ─────────────────────────────────────────────────────────────────────────────
-- US Supplement Facts — fix default_unit + enrich active_ingredients for
-- sport supplement categories (protein, pre-workout, creatine, hydration)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE product_table_templates
SET definition = definition
  || jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(
          CASE
            WHEN (col->>'type') = 'measurement' THEN col || '{"default_unit":"g"}'::jsonb
            ELSE col
          END
        )
        FROM jsonb_array_elements(definition->'columns') AS col
      ),
      'sections', jsonb_build_array(
        (SELECT s FROM jsonb_array_elements(definition->'sections') AS s
          WHERE s->>'key' = 'serving_info'),
        jsonb_build_object(
          'key', 'active_ingredients',
          'label', 'Active Ingredients',
          'description', 'Required and voluntary nutrients per FDA 21 CFR 101.36.',
          'default_rows', jsonb_build_array(
            jsonb_build_object('key', 'calories',           'label', 'Calories'),
            jsonb_build_object('key', 'total_fat',          'label', 'Total Fat'),
            jsonb_build_object('key', 'saturated_fat',      'label', 'Saturated Fat',      'parent_row_key', 'total_fat'),
            jsonb_build_object('key', 'trans_fat',          'label', 'Trans Fat',           'parent_row_key', 'total_fat'),
            jsonb_build_object('key', 'cholesterol',        'label', 'Cholesterol'),
            jsonb_build_object('key', 'sodium',             'label', 'Sodium'),
            jsonb_build_object('key', 'total_carbohydrate', 'label', 'Total Carbohydrate'),
            jsonb_build_object('key', 'dietary_fiber',      'label', 'Dietary Fiber',       'parent_row_key', 'total_carbohydrate'),
            jsonb_build_object('key', 'total_sugars',       'label', 'Total Sugars',        'parent_row_key', 'total_carbohydrate'),
            jsonb_build_object('key', 'added_sugars',       'label', 'Added Sugars',        'parent_row_key', 'total_sugars'),
            jsonb_build_object('key', 'protein',            'label', 'Protein'),
            -- Sport supplement specifics
            jsonb_build_object('key', 'creatine',           'label', 'Creatine Monohydrate'),
            jsonb_build_object('key', 'caffeine',           'label', 'Caffeine'),
            jsonb_build_object('key', 'beta_alanine',       'label', 'Beta-Alanine'),
            jsonb_build_object('key', 'citrulline',         'label', 'L-Citrulline'),
            jsonb_build_object('key', 'bcaa_total',         'label', 'BCAAs (Total)'),
            jsonb_build_object('key', 'leucine',            'label', 'L-Leucine',           'parent_row_key', 'bcaa_total'),
            jsonb_build_object('key', 'isoleucine',         'label', 'L-Isoleucine',        'parent_row_key', 'bcaa_total'),
            jsonb_build_object('key', 'valine',             'label', 'L-Valine',            'parent_row_key', 'bcaa_total')
          )
        ),
        jsonb_build_object(
          'key', 'vitamins_minerals',
          'label', 'Vitamins & Minerals',
          'description', 'List vitamins and minerals with %DV where available.',
          'default_rows', jsonb_build_array(
            jsonb_build_object('key', 'vitamin_c',  'label', 'Vitamin C'),
            jsonb_build_object('key', 'vitamin_d',  'label', 'Vitamin D'),
            jsonb_build_object('key', 'vitamin_b6', 'label', 'Vitamin B6'),
            jsonb_build_object('key', 'vitamin_b12','label', 'Vitamin B12'),
            jsonb_build_object('key', 'calcium',    'label', 'Calcium'),
            jsonb_build_object('key', 'iron',       'label', 'Iron'),
            jsonb_build_object('key', 'magnesium',  'label', 'Magnesium'),
            jsonb_build_object('key', 'zinc',       'label', 'Zinc'),
            jsonb_build_object('key', 'potassium',  'label', 'Potassium')
          )
        ),
        jsonb_build_object(
          'key', 'other_ingredients',
          'label', 'Other Ingredients',
          'description', 'Proprietary blends or ingredients not listed above.',
          'default_rows', jsonb_build_array()
        )
      ),
      'meta', definition->'meta'
        || '{"allows_custom_rows":true,"supports_sections":true}'::jsonb
    )
WHERE organization_id IS NULL
  AND code = 'supplement_facts_us'
  AND version = 'v1';

-- ─────────────────────────────────────────────────────────────────────────────
-- US Nutrition Facts — fix default_unit only (sections already complete)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE product_table_templates
SET definition = definition
  || jsonb_build_object(
      'columns', (
        SELECT jsonb_agg(
          CASE
            WHEN (col->>'type') = 'measurement' THEN col || '{"default_unit":"g"}'::jsonb
            ELSE col
          END
        )
        FROM jsonb_array_elements(definition->'columns') AS col
      ),
      'meta', definition->'meta'
        || '{"allows_custom_rows":true,"supports_sections":true}'::jsonb
    )
WHERE organization_id IS NULL
  AND code = 'nutrition_facts_us'
  AND version = 'v1';

COMMIT;
