-- Migration: Add product_certifications system field to the compliance group
-- Date: 2026-03-27
--
-- Adds a structured certifications table field to the compliance group.
-- Certifications are first-class product data — not asset metadata — because
-- they directly drive channel-readiness for Amazon US (NSF/ANSI 173-2023 cGMP
-- enforcement is mandatory as of March 31, 2026), Amazon Mexico, and major
-- retailer portals.
--
-- Field: certifications (table)
--   cert_name      text    Certificate name (e.g. "NSF/ANSI 173-2023")
--   certifying_body text   Certifying organisation (e.g. "NSF International")
--   cert_number    text    Certificate number / registration ID (optional)
--   expiry_date    text    Expiry date as ISO string YYYY-MM-DD (optional)

BEGIN;

WITH ensured_compliance AS (
    SELECT id, organization_id
    FROM field_groups
    WHERE code = 'compliance'
),
upserted_field AS (
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
        ec.organization_id,
        'certifications',
        'Certifications',
        'Third-party certifications held by this product (e.g. NSF/ANSI 173-2023, Informed Sport, USDA Organic). '
        'Required for Amazon US channel listing as of March 2026 cGMP enforcement.',
        'table',
        false,
        false,
        false,
        false,
        70,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system',       true,
            'system_key',      'certifications',
            'table_definition', jsonb_build_object(
                'columns', jsonb_build_array(
                    jsonb_build_object(
                        'key',         'cert_name',
                        'label',       'Certification',
                        'type',        'text',
                        'is_editable', true,
                        'is_required', true,
                        'placeholder', 'e.g. NSF/ANSI 173-2023'
                    ),
                    jsonb_build_object(
                        'key',         'certifying_body',
                        'label',       'Certifying Body',
                        'type',        'text',
                        'is_editable', true,
                        'is_required', true,
                        'placeholder', 'e.g. NSF International'
                    ),
                    jsonb_build_object(
                        'key',         'cert_number',
                        'label',       'Certificate No.',
                        'type',        'text',
                        'is_editable', true,
                        'is_required', false,
                        'placeholder', 'e.g. C12345'
                    ),
                    jsonb_build_object(
                        'key',         'expiry_date',
                        'label',       'Expiry Date',
                        'type',        'text',
                        'is_editable', true,
                        'is_required', false,
                        'placeholder', 'YYYY-MM-DD'
                    )
                ),
                'meta', jsonb_build_object(
                    'allows_custom_rows', true,
                    'supports_sections',  false
                )
            )
        ),
        true
    FROM ensured_compliance ec
    ON CONFLICT (organization_id, code) DO UPDATE
    SET
        name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        field_type       = EXCLUDED.field_type,
        sort_order       = EXCLUDED.sort_order,
        options          = EXCLUDED.options,
        validation_rules = EXCLUDED.validation_rules,
        is_active        = true,
        updated_at       = NOW()
    RETURNING id, organization_id, sort_order
)
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    uf.id,
    fg.id,
    uf.sort_order
FROM upserted_field uf
JOIN field_groups fg
  ON fg.organization_id = uf.organization_id
 AND fg.code = 'compliance'
ON CONFLICT (product_field_id, field_group_id) DO UPDATE
SET
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

COMMIT;
