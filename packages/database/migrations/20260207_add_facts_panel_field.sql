-- Migration: Add Facts Panel product field
-- Date: 2026-02-07

BEGIN;

-- Create Facts Panel field for each organization
INSERT INTO product_fields (
    organization_id,
    code,
    name,
    description,
    field_type,
    is_required,
    sort_order,
    options
)
SELECT
    o.id,
    'facts_panel',
    'Facts Panel',
    'Container for regulatory nutrition/supplement panels by template.',
    'table',
    false,
    50,
    jsonb_build_object(
        'is_system', true,
        'table_definition', jsonb_build_object(
            'columns', jsonb_build_array(
                jsonb_build_object('key', 'panel_name', 'label', 'Panel', 'type', 'text', 'is_required', false),
                jsonb_build_object('key', 'template_id', 'label', 'Template', 'type', 'text', 'is_required', false)
            ),
            'meta', jsonb_build_object(
                'allows_custom_rows', true,
                'supports_sections', false,
                'uses_panel_instances', true
            )
        )
    )
FROM organizations o
ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

-- Assign to Compliance group when it exists
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    pf.id,
    fg.id,
    50
FROM product_fields pf
JOIN field_groups fg
  ON fg.organization_id = pf.organization_id
WHERE pf.code = 'facts_panel'
  AND fg.code = 'compliance'
ON CONFLICT (product_field_id, field_group_id) DO NOTHING;

COMMIT;
