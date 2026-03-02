BEGIN;

ALTER TABLE IF EXISTS share_set_dynamic_rules
  ADD COLUMN IF NOT EXISTS include_product_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS exclude_product_types TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_include_product_types
ON share_set_dynamic_rules USING GIN (include_product_types);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_exclude_product_types
ON share_set_dynamic_rules USING GIN (exclude_product_types);

ALTER TABLE share_set_dynamic_rules
  DROP CONSTRAINT IF EXISTS share_set_dynamic_rules_has_include_condition;

ALTER TABLE share_set_dynamic_rules
  ADD CONSTRAINT share_set_dynamic_rules_has_include_condition
    CHECK (
      cardinality(include_tags) > 0
      OR cardinality(include_folder_ids) > 0
      OR cardinality(include_usage_group_ids) > 0
      OR cardinality(include_product_types) > 0
    );

ALTER TABLE share_set_dynamic_rules
  DROP CONSTRAINT IF EXISTS share_set_dynamic_rules_include_product_types_valid;

ALTER TABLE share_set_dynamic_rules
  ADD CONSTRAINT share_set_dynamic_rules_include_product_types_valid
    CHECK (include_product_types <@ ARRAY['parent', 'variant', 'standalone']::text[]);

ALTER TABLE share_set_dynamic_rules
  DROP CONSTRAINT IF EXISTS share_set_dynamic_rules_exclude_product_types_valid;

ALTER TABLE share_set_dynamic_rules
  ADD CONSTRAINT share_set_dynamic_rules_exclude_product_types_valid
    CHECK (exclude_product_types <@ ARRAY['parent', 'variant', 'standalone']::text[]);

CREATE OR REPLACE FUNCTION apply_dynamic_product_set_rules_for_product()
RETURNS TRIGGER AS $$
DECLARE
  current_resource_type TEXT;
BEGIN
  IF NEW.organization_id IS NULL OR NEW.id IS NULL OR NEW.type IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND NEW.type IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  current_resource_type := CASE
    WHEN NEW.type = 'variant' THEN 'variant'
    ELSE 'product'
  END;

  WITH active_rules AS (
    SELECT
      r.id AS rule_id,
      r.share_set_id,
      COALESCE(r.include_product_types, '{}'::text[]) AS include_product_types,
      COALESCE(r.exclude_product_types, '{}'::text[]) AS exclude_product_types
    FROM share_set_dynamic_rules r
    JOIN share_sets s
      ON s.id = r.share_set_id
     AND s.organization_id = r.organization_id
    WHERE r.organization_id = NEW.organization_id
      AND r.is_active = true
      AND s.module_key = 'products'
  ),
  matched_rules AS (
    SELECT
      ar.rule_id,
      ar.share_set_id
    FROM active_rules ar
    WHERE
      NEW.type = ANY (ar.include_product_types)
      AND NOT (NEW.type = ANY (ar.exclude_product_types))
  ),
  matched_sets AS (
    SELECT
      share_set_id,
      ARRAY_AGG(rule_id ORDER BY rule_id) AS rule_ids
    FROM matched_rules
    GROUP BY share_set_id
  ),
  cleanup AS (
    DELETE FROM share_set_items i
    USING matched_sets ms
    WHERE i.organization_id = NEW.organization_id
      AND i.share_set_id = ms.share_set_id
      AND i.resource_id = NEW.id
      AND i.resource_type IN ('product', 'variant')
      AND i.resource_type <> current_resource_type
      AND COALESCE(i.metadata ->> 'source', '') = 'dynamic_rule'
    RETURNING i.id
  )
  INSERT INTO share_set_items (
    share_set_id,
    organization_id,
    resource_type,
    resource_id,
    include_descendants,
    market_ids,
    channel_ids,
    locale_ids,
    metadata,
    created_by
  )
  SELECT
    ms.share_set_id,
    NEW.organization_id,
    current_resource_type,
    NEW.id,
    false,
    '{}'::uuid[],
    '{}'::uuid[],
    '{}'::uuid[],
    jsonb_build_object(
      'source', 'dynamic_rule',
      'rule_ids', ms.rule_ids,
      'applied_at', NOW()
    ),
    COALESCE(NEW.created_by, NEW.last_modified_by)
  FROM matched_sets ms
  ON CONFLICT (share_set_id, resource_type, resource_id)
  DO UPDATE SET
    metadata = EXCLUDED.metadata,
    include_descendants = false,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apply_dynamic_product_set_rules_on_product_write ON products;
CREATE TRIGGER apply_dynamic_product_set_rules_on_product_write
  AFTER INSERT OR UPDATE OF type ON products
  FOR EACH ROW
  EXECUTE FUNCTION apply_dynamic_product_set_rules_for_product();

-- Backfill existing products/variants against active product dynamic rules.
WITH active_rules AS (
  SELECT
    r.id AS rule_id,
    r.organization_id,
    r.share_set_id,
    COALESCE(r.include_product_types, '{}'::text[]) AS include_product_types,
    COALESCE(r.exclude_product_types, '{}'::text[]) AS exclude_product_types
  FROM share_set_dynamic_rules r
  JOIN share_sets s
    ON s.id = r.share_set_id
   AND s.organization_id = r.organization_id
  WHERE r.is_active = true
    AND s.module_key = 'products'
),
matched_rules AS (
  SELECT
    p.organization_id,
    p.id AS product_id,
    CASE WHEN p.type = 'variant' THEN 'variant' ELSE 'product' END AS resource_type,
    ar.share_set_id,
    ar.rule_id,
    COALESCE(p.created_by, p.last_modified_by) AS created_by
  FROM products p
  JOIN active_rules ar
    ON ar.organization_id = p.organization_id
  WHERE
    p.type = ANY (ar.include_product_types)
    AND NOT (p.type = ANY (ar.exclude_product_types))
),
aggregated_matches AS (
  SELECT
    organization_id,
    product_id,
    resource_type,
    share_set_id,
    ARRAY_AGG(rule_id ORDER BY rule_id) AS rule_ids,
    MIN(created_by) AS created_by
  FROM matched_rules
  GROUP BY organization_id, product_id, resource_type, share_set_id
),
cleanup AS (
  DELETE FROM share_set_items i
  USING aggregated_matches am
  WHERE i.organization_id = am.organization_id
    AND i.share_set_id = am.share_set_id
    AND i.resource_id = am.product_id
    AND i.resource_type IN ('product', 'variant')
    AND i.resource_type <> am.resource_type
    AND COALESCE(i.metadata ->> 'source', '') = 'dynamic_rule'
  RETURNING i.id
)
INSERT INTO share_set_items (
  share_set_id,
  organization_id,
  resource_type,
  resource_id,
  include_descendants,
  market_ids,
  channel_ids,
  locale_ids,
  metadata,
  created_by
)
SELECT
  am.share_set_id,
  am.organization_id,
  am.resource_type,
  am.product_id,
  false,
  '{}'::uuid[],
  '{}'::uuid[],
  '{}'::uuid[],
  jsonb_build_object(
    'source', 'dynamic_rule',
    'rule_ids', am.rule_ids,
    'applied_at', NOW()
  ),
  am.created_by
FROM aggregated_matches am
ON CONFLICT (share_set_id, resource_type, resource_id)
DO UPDATE SET
  metadata = EXCLUDED.metadata,
  include_descendants = false,
  updated_at = NOW();

COMMIT;

