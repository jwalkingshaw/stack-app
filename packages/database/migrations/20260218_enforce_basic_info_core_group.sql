-- Migration: Enforce mandatory Basic Information group assignment for all families

BEGIN;

-- Ensure Basic Information exists and is active for every organization
INSERT INTO field_groups (organization_id, code, name, description, sort_order, is_active)
SELECT
  o.id,
  'basic_info',
  'Basic Information',
  'Essential product details and identifiers',
  1,
  true
FROM organizations o
ON CONFLICT (organization_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = LEAST(field_groups.sort_order, EXCLUDED.sort_order),
  is_active = true,
  updated_at = NOW();

-- Backfill mandatory family assignment for Basic Information
INSERT INTO product_family_field_groups (product_family_id, field_group_id, sort_order)
SELECT
  pf.id,
  fg.id,
  1
FROM product_families pf
JOIN field_groups fg
  ON fg.organization_id = pf.organization_id
 AND fg.code = 'basic_info'
ON CONFLICT (product_family_id, field_group_id) DO NOTHING;

COMMIT;
