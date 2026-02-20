-- Migration: Seed core Basic Information system attributes (Title, SCIN, SKU, Barcode)

BEGIN;

WITH ensured_group AS (
  SELECT id, organization_id
  FROM field_groups
  WHERE code = 'basic_info'
),
seed_rows AS (
  SELECT
    eg.organization_id,
    'title'::text AS code,
    'Title'::text AS name,
    'Primary product title.'::text AS description,
    'text'::text AS field_type,
    true AS is_required,
    false AS is_unique,
    1 AS sort_order,
    '{}'::jsonb AS validation_rules,
    jsonb_build_object('is_system', true, 'system_key', 'title', 'max_length', 255) AS options
  FROM ensured_group eg
  UNION ALL
  SELECT
    eg.organization_id,
    'scin',
    'SCIN',
    'System-created immutable identifier.',
    'identifier',
    true,
    true,
    2,
    '{}'::jsonb,
    jsonb_build_object('is_system', true, 'system_key', 'scin', 'identifier_kind', 'scin', 'max_length', 8)
  FROM ensured_group eg
  UNION ALL
  SELECT
    eg.organization_id,
    'sku',
    'SKU',
    'Business SKU identifier.',
    'identifier',
    false,
    true,
    3,
    '{}'::jsonb,
    jsonb_build_object('is_system', true, 'system_key', 'sku', 'identifier_kind', 'sku', 'max_length', 50)
  FROM ensured_group eg
  UNION ALL
  SELECT
    eg.organization_id,
    'barcode',
    'Barcode',
    'Barcode identifier (GTIN/UPC/EAN).',
    'identifier',
    false,
    true,
    4,
    jsonb_build_object('allowed_lengths', jsonb_build_array(8, 12, 13, 14), 'numeric_only', true),
    jsonb_build_object(
      'is_system', true,
      'system_key', 'barcode',
      'identifier_kind', 'barcode',
      'allowed_formats', jsonb_build_array('GTIN', 'UPC', 'EAN'),
      'max_length', 14
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
    false,
    false,
    sr.sort_order,
    sr.validation_rules,
    sr.options,
    true
  FROM seed_rows sr
  ON CONFLICT (organization_id, code) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    field_type = EXCLUDED.field_type,
    is_required = EXCLUDED.is_required,
    is_unique = EXCLUDED.is_unique,
    is_localizable = false,
    is_channelable = false,
    sort_order = EXCLUDED.sort_order,
    validation_rules = EXCLUDED.validation_rules,
    options = EXCLUDED.options,
    is_active = true,
    updated_at = NOW()
  RETURNING id, organization_id, code, sort_order
)
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
  uf.id,
  fg.id,
  uf.sort_order
FROM upserted_fields uf
JOIN field_groups fg
  ON fg.organization_id = uf.organization_id
 AND fg.code = 'basic_info'
ON CONFLICT (product_field_id, field_group_id) DO UPDATE
SET
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

COMMIT;
