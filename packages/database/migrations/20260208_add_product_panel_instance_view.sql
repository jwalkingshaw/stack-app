-- Migration: Add view for product panel instances with template metadata
-- Date: 2026-02-08

BEGIN;

CREATE OR REPLACE VIEW product_panel_instances_with_templates AS
SELECT
    ppi.id,
    ppi.product_id,
    ppi.product_field_id,
    pf.code AS product_field_code,
    ppi.template_id,
    ptt.code AS template_code,
    ptt.version AS template_version,
    ptt.kind AS template_kind,
    ptt.label AS template_label,
    ptt.description AS template_description,
    ptt.region AS template_region,
    ptt.regulator AS template_regulator,
    ptt.locale AS template_locale,
    ptt.definition AS template_definition,
    ptt.metadata AS template_metadata,
    ppi.locale,
    ppi.channel,
    ppi.sort_order,
    ppi.data,
    ppi.created_at,
    ppi.updated_at
FROM product_panel_instances ppi
JOIN product_table_templates ptt ON ptt.id = ppi.template_id
JOIN product_fields pf ON pf.id = ppi.product_field_id;

COMMIT;
