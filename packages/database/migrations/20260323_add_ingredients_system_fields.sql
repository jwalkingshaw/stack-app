-- Migration: Add Ingredients and Other Ingredients system product fields
-- Date: 2026-03-23
-- These are label-copy fields that accompany the Facts Panel on product PDFs
-- and regulatory submissions. Assigned to the Compliance field group.

BEGIN;

WITH ensured_group AS (
    SELECT id, organization_id
    FROM field_groups
    WHERE code = 'compliance'
),
seed_rows AS (
    SELECT
        eg.organization_id,
        'ingredients'::text                                         AS code,
        'Ingredients'::text                                         AS name,
        'Full ingredient list as it appears on the product label. '
        'Include all ingredients in descending order of weight.'::text AS description,
        'textarea'::text                                            AS field_type,
        false                                                       AS is_required,
        false                                                       AS is_unique,
        true                                                        AS is_localizable,
        false                                                       AS is_channelable,
        55                                                          AS sort_order,
        '{}'::jsonb                                                 AS validation_rules,
        jsonb_build_object(
            'is_system',   true,
            'system_key',  'ingredients',
            'rows',        8
        )                                                           AS options
    FROM ensured_group eg

    UNION ALL

    SELECT
        eg.organization_id,
        'other_ingredients',
        'Other Ingredients',
        'Secondary or excipient ingredients, allergen notices, '
        'or "may contain" statements for the product label.',
        'textarea',
        false,
        false,
        true,
        false,
        60,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',   true,
            'system_key',  'other_ingredients',
            'rows',        5
        )
    FROM ensured_group eg
),
upserted_fields AS (
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
        is_active        = true,
        updated_at       = NOW()
    RETURNING id, organization_id, sort_order
)
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    uf.id,
    fg.id,
    uf.sort_order
FROM upserted_fields uf
JOIN field_groups fg
  ON fg.organization_id = uf.organization_id
 AND fg.code = 'compliance'
ON CONFLICT (product_field_id, field_group_id) DO UPDATE
SET
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

COMMIT;
