-- Migration: Add Serving Info system field group and expand Compliance system fields
-- Date: 2026-03-27
--
-- Adds regulatory/label-required fields that every supplement product needs.
-- Governing principle: system fields = regulatory mandate (must appear on label or
-- in regulatory submission) OR universal product identity (every supplement has it,
-- standardised meaning). Operational/logistical data stays as custom fields.
--
-- New field group: serving_info (sort_order 5)
--   dose_form            select      Product delivery format — drives facts panel template selection
--   serving_size         measurement FDA 21 CFR 101.9/101.36 — required on facts panel
--   servings_per_container number    FDA 21 CFR 101.9/101.36 — required on facts panel
--   net_weight           measurement FDA 21 CFR 101.105 — required on label
--   net_volume           measurement FDA — required for liquid products
--
-- Compliance group additions (sort_order 45–68):
--   key_actives          table       Hero active ingredients (name, amount, unit)
--   directions_for_use   textarea    Regulatory — how to take the product
--   warnings             textarea    Regulatory — FDA required safety warnings
--   storage_conditions   text        Regulatory — storage requirements
--   country_of_origin    text        CBP requirement for dietary supplements

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create serving_info field group for every organisation
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO field_groups (organization_id, code, name, description, sort_order, is_active)
SELECT
    o.id,
    'serving_info',
    'Serving & Packaging',
    'Physical product attributes: dose form, serving size, and net content. '
    'All fields are regulatory label requirements or universal product identity.',
    5,
    true
FROM organizations o
ON CONFLICT (organization_id, code) DO UPDATE
SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order  = EXCLUDED.sort_order,
    is_active   = true,
    updated_at  = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed serving_info fields
-- ─────────────────────────────────────────────────────────────────────────────

WITH ensured_group AS (
    SELECT id, organization_id
    FROM field_groups
    WHERE code = 'serving_info'
),
seed_rows AS (
    -- dose_form
    SELECT
        eg.organization_id,
        'dose_form'::text                                                   AS code,
        'Dose Form'::text                                                   AS name,
        'Product delivery format (Powder, Capsule, Tablet, etc.). '
        'Determines which Facts Panel template applies.'::text              AS description,
        'select'::text                                                      AS field_type,
        false                                                               AS is_required,
        false                                                               AS is_unique,
        false                                                               AS is_localizable,
        false                                                               AS is_channelable,
        10                                                                  AS sort_order,
        '{}'::jsonb                                                         AS validation_rules,
        jsonb_build_object(
            'is_system',  true,
            'system_key', 'dose_form',
            'options', jsonb_build_array(
                jsonb_build_object('value', 'Powder',  'label', 'Powder'),
                jsonb_build_object('value', 'Capsule', 'label', 'Capsule'),
                jsonb_build_object('value', 'RTD',     'label', 'RTD (Ready to Drink)'),
                jsonb_build_object('value', 'Tablet',  'label', 'Tablet'),
                jsonb_build_object('value', 'Gummy',   'label', 'Gummy'),
                jsonb_build_object('value', 'Softgel', 'label', 'Softgel'),
                jsonb_build_object('value', 'Liquid',  'label', 'Liquid'),
                jsonb_build_object('value', 'Bar',     'label', 'Bar'),
                jsonb_build_object('value', 'Other',   'label', 'Other')
            )
        )                                                                   AS options
    FROM ensured_group eg

    UNION ALL

    -- serving_size
    SELECT
        eg.organization_id,
        'serving_size',
        'Serving Size',
        'Amount per single serving (e.g. 32 g, 2 capsules). '
        'Required on the Supplement/Nutrition Facts panel (FDA 21 CFR 101.9).',
        'measurement',
        false, false, false, false,
        20,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',               true,
            'system_key',              'serving_size',
            'measurement_family_code', 'weight'
        )
    FROM ensured_group eg

    UNION ALL

    -- servings_per_container
    SELECT
        eg.organization_id,
        'servings_per_container',
        'Servings Per Container',
        'Number of servings in the container. '
        'Required on the Supplement/Nutrition Facts panel (FDA 21 CFR 101.9).',
        'number',
        false, false, false, false,
        30,
        jsonb_build_object('min', 1, 'integer_only', true),
        jsonb_build_object(
            'is_system',  true,
            'system_key', 'servings_per_container'
        )
    FROM ensured_group eg

    UNION ALL

    -- net_weight
    SELECT
        eg.organization_id,
        'net_weight',
        'Net Weight',
        'Total net weight of the product (e.g. 1000 g, 2.2 lb). '
        'Required on the product label (FDA 21 CFR 101.105).',
        'measurement',
        false, false, false, false,
        40,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',               true,
            'system_key',              'net_weight',
            'measurement_family_code', 'weight'
        )
    FROM ensured_group eg

    UNION ALL

    -- net_volume
    SELECT
        eg.organization_id,
        'net_volume',
        'Net Volume',
        'Total net volume — use for liquid or RTD products (e.g. 500 ml, 16 fl oz). '
        'Required on the label for liquid products (FDA 21 CFR 101.105).',
        'measurement',
        false, false, false, false,
        50,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',               true,
            'system_key',              'net_volume',
            'measurement_family_code', 'volume'
        )
    FROM ensured_group eg
),
upserted_serving_fields AS (
    INSERT INTO product_fields (
        organization_id,
        code,
        name,
        description,
        field_type,
        is_required,
        is_unique,
        is_localizable,
        is_channelable,
        sort_order,
        validation_rules,
        options,
        is_active
    )
    SELECT
        sr.organization_id,
        sr.code,
        sr.name,
        sr.description,
        sr.field_type,
        sr.is_required,
        sr.is_unique,
        sr.is_localizable,
        sr.is_channelable,
        sr.sort_order,
        sr.validation_rules,
        sr.options,
        true
    FROM seed_rows sr
    ON CONFLICT (organization_id, code) DO UPDATE
    SET
        name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        field_type       = EXCLUDED.field_type,
        is_localizable   = EXCLUDED.is_localizable,
        sort_order       = EXCLUDED.sort_order,
        options          = EXCLUDED.options,
        validation_rules = EXCLUDED.validation_rules,
        is_active        = true,
        updated_at       = NOW()
    RETURNING id, organization_id, sort_order
)
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    usf.id,
    fg.id,
    usf.sort_order
FROM upserted_serving_fields usf
JOIN field_groups fg
  ON fg.organization_id = usf.organization_id
 AND fg.code = 'serving_info'
ON CONFLICT (product_field_id, field_group_id) DO UPDATE
SET
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add compliance expansion fields to the existing compliance group
-- ─────────────────────────────────────────────────────────────────────────────

WITH ensured_compliance AS (
    SELECT id, organization_id
    FROM field_groups
    WHERE code = 'compliance'
),
compliance_rows AS (
    -- key_actives — hero active ingredients as structured rows
    SELECT
        ec.organization_id,
        'key_actives'::text                                                 AS code,
        'Key Actives'::text                                                 AS name,
        'Primary active ingredients with dose and unit. '
        'Used for marketing claims, sell sheets, and channel output. '
        'Separate from the full ingredient list on the label.'::text        AS description,
        'table'::text                                                       AS field_type,
        false                                                               AS is_required,
        false                                                               AS is_unique,
        false                                                               AS is_localizable,
        false                                                               AS is_channelable,
        45                                                                  AS sort_order,
        '{}'::jsonb                                                         AS validation_rules,
        jsonb_build_object(
            'is_system',       true,
            'system_key',      'key_actives',
            'table_definition', jsonb_build_object(
                'columns', jsonb_build_array(
                    jsonb_build_object(
                        'key',         'ingredient',
                        'label',       'Ingredient',
                        'type',        'text',
                        'is_editable', true,
                        'is_required', true,
                        'placeholder', 'e.g. Creatine Monohydrate'
                    ),
                    jsonb_build_object(
                        'key',         'amount',
                        'label',       'Amount',
                        'type',        'number',
                        'is_editable', true,
                        'is_required', false,
                        'placeholder', 'e.g. 3'
                    ),
                    jsonb_build_object(
                        'key',         'unit',
                        'label',       'Unit',
                        'type',        'text',
                        'is_editable', true,
                        'is_required', false,
                        'placeholder', 'e.g. g, mg, IU'
                    )
                ),
                'meta', jsonb_build_object(
                    'allows_custom_rows', true,
                    'supports_sections',  false
                )
            )
        )                                                                   AS options
    FROM ensured_compliance ec

    UNION ALL

    -- directions_for_use
    SELECT
        ec.organization_id,
        'directions_for_use',
        'Directions for Use',
        'How to take the product. Required on supplement labels. Localise per market language.',
        'textarea',
        false, false, true, false,
        65,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',  true,
            'system_key', 'directions_for_use',
            'rows',       5
        )
    FROM ensured_compliance ec

    UNION ALL

    -- warnings
    SELECT
        ec.organization_id,
        'warnings',
        'Warnings',
        'Safety warnings required by FDA and other regulatory bodies. '
        'Localise per market language.',
        'textarea',
        false, false, true, false,
        66,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',  true,
            'system_key', 'warnings',
            'rows',       4
        )
    FROM ensured_compliance ec

    UNION ALL

    -- storage_conditions
    SELECT
        ec.organization_id,
        'storage_conditions',
        'Storage Conditions',
        'How the product should be stored (e.g. "Store in a cool, dry place"). '
        'Required in some markets. Localise per market language.',
        'text',
        false, false, true, false,
        67,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',  true,
            'system_key', 'storage_conditions'
        )
    FROM ensured_compliance ec

    UNION ALL

    -- country_of_origin
    SELECT
        ec.organization_id,
        'country_of_origin',
        'Country of Origin',
        'Country where the product is manufactured or substantially transformed. '
        'Required by US CBP for dietary supplements.',
        'text',
        false, false, false, false,
        68,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',  true,
            'system_key', 'country_of_origin'
        )
    FROM ensured_compliance ec
),
upserted_compliance_fields AS (
    INSERT INTO product_fields (
        organization_id,
        code,
        name,
        description,
        field_type,
        is_required,
        is_unique,
        is_localizable,
        is_channelable,
        sort_order,
        validation_rules,
        options,
        is_active
    )
    SELECT
        cr.organization_id,
        cr.code,
        cr.name,
        cr.description,
        cr.field_type,
        cr.is_required,
        cr.is_unique,
        cr.is_localizable,
        cr.is_channelable,
        cr.sort_order,
        cr.validation_rules,
        cr.options,
        true
    FROM compliance_rows cr
    ON CONFLICT (organization_id, code) DO UPDATE
    SET
        name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        field_type       = EXCLUDED.field_type,
        is_localizable   = EXCLUDED.is_localizable,
        sort_order       = EXCLUDED.sort_order,
        options          = EXCLUDED.options,
        validation_rules = EXCLUDED.validation_rules,
        is_active        = true,
        updated_at       = NOW()
    RETURNING id, organization_id, sort_order
)
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    ucf.id,
    fg.id,
    ucf.sort_order
FROM upserted_compliance_fields ucf
JOIN field_groups fg
  ON fg.organization_id = ucf.organization_id
 AND fg.code = 'compliance'
ON CONFLICT (product_field_id, field_group_id) DO UPDATE
SET
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

COMMIT;
