BEGIN;

ALTER TABLE IF EXISTS share_set_dynamic_rules
  ADD COLUMN IF NOT EXISTS include_product_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS exclude_product_types TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS include_product_family_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS exclude_product_family_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS include_product_name_contains TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS exclude_product_name_contains TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_include_product_family_ids
ON share_set_dynamic_rules USING GIN (include_product_family_ids);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_exclude_product_family_ids
ON share_set_dynamic_rules USING GIN (exclude_product_family_ids);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_include_product_name_contains
ON share_set_dynamic_rules USING GIN (include_product_name_contains);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_exclude_product_name_contains
ON share_set_dynamic_rules USING GIN (exclude_product_name_contains);

ALTER TABLE share_set_dynamic_rules
  DROP CONSTRAINT IF EXISTS share_set_dynamic_rules_has_include_condition;

ALTER TABLE share_set_dynamic_rules
  ADD CONSTRAINT share_set_dynamic_rules_has_include_condition
    CHECK (
      cardinality(include_tags) > 0
      OR cardinality(include_folder_ids) > 0
      OR cardinality(include_usage_group_ids) > 0
      OR cardinality(include_product_types) > 0
      OR cardinality(include_product_family_ids) > 0
      OR cardinality(include_product_name_contains) > 0
    );

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
     AND NEW.type IS NOT DISTINCT FROM OLD.type
     AND NEW.family_id IS NOT DISTINCT FROM OLD.family_id
     AND NEW.product_name IS NOT DISTINCT FROM OLD.product_name THEN
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
      COALESCE(r.exclude_product_types, '{}'::text[]) AS exclude_product_types,
      COALESCE(r.include_product_family_ids, '{}'::uuid[]) AS include_product_family_ids,
      COALESCE(r.exclude_product_family_ids, '{}'::uuid[]) AS exclude_product_family_ids,
      COALESCE(r.include_product_name_contains, '{}'::text[]) AS include_product_name_contains,
      COALESCE(r.exclude_product_name_contains, '{}'::text[]) AS exclude_product_name_contains
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
    WHERE (
        (cardinality(ar.include_product_types) > 0 AND NEW.type = ANY (ar.include_product_types))
        OR (
          cardinality(ar.include_product_family_ids) > 0
          AND NEW.family_id IS NOT NULL
          AND NEW.family_id = ANY (ar.include_product_family_ids)
        )
        OR (
          cardinality(ar.include_product_name_contains) > 0
          AND EXISTS (
            SELECT 1
            FROM unnest(ar.include_product_name_contains) AS include_token(token)
            WHERE token <> ''
              AND POSITION(LOWER(token) IN LOWER(COALESCE(NEW.product_name, ''))) > 0
          )
        )
      )
      AND NOT (
        (cardinality(ar.exclude_product_types) > 0 AND NEW.type = ANY (ar.exclude_product_types))
        OR (
          cardinality(ar.exclude_product_family_ids) > 0
          AND NEW.family_id IS NOT NULL
          AND NEW.family_id = ANY (ar.exclude_product_family_ids)
        )
        OR (
          cardinality(ar.exclude_product_name_contains) > 0
          AND EXISTS (
            SELECT 1
            FROM unnest(ar.exclude_product_name_contains) AS exclude_token(token)
            WHERE token <> ''
              AND POSITION(LOWER(token) IN LOWER(COALESCE(NEW.product_name, ''))) > 0
          )
        )
      )
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
    WHERE i.organization_id = NEW.organization_id
      AND i.resource_id = NEW.id
      AND i.resource_type IN ('product', 'variant')
      AND COALESCE(i.metadata ->> 'source', '') = 'dynamic_rule'
      AND (
        i.resource_type <> current_resource_type
        OR NOT EXISTS (
          SELECT 1
          FROM matched_sets ms
          WHERE ms.share_set_id = i.share_set_id
        )
      )
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
  AFTER INSERT OR UPDATE OF type, family_id, product_name ON products
  FOR EACH ROW
  EXECUTE FUNCTION apply_dynamic_product_set_rules_for_product();

-- Backfill existing products/variants against active product dynamic rules.
WITH active_rules AS (
  SELECT
    r.id AS rule_id,
    r.organization_id,
    r.share_set_id,
    COALESCE(r.include_product_types, '{}'::text[]) AS include_product_types,
    COALESCE(r.exclude_product_types, '{}'::text[]) AS exclude_product_types,
    COALESCE(r.include_product_family_ids, '{}'::uuid[]) AS include_product_family_ids,
    COALESCE(r.exclude_product_family_ids, '{}'::uuid[]) AS exclude_product_family_ids,
    COALESCE(r.include_product_name_contains, '{}'::text[]) AS include_product_name_contains,
    COALESCE(r.exclude_product_name_contains, '{}'::text[]) AS exclude_product_name_contains
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
  WHERE (
      (cardinality(ar.include_product_types) > 0 AND p.type = ANY (ar.include_product_types))
      OR (
        cardinality(ar.include_product_family_ids) > 0
        AND p.family_id IS NOT NULL
        AND p.family_id = ANY (ar.include_product_family_ids)
      )
      OR (
        cardinality(ar.include_product_name_contains) > 0
        AND EXISTS (
          SELECT 1
          FROM unnest(ar.include_product_name_contains) AS include_token(token)
          WHERE token <> ''
            AND POSITION(LOWER(token) IN LOWER(COALESCE(p.product_name, ''))) > 0
        )
      )
    )
    AND NOT (
      (cardinality(ar.exclude_product_types) > 0 AND p.type = ANY (ar.exclude_product_types))
      OR (
        cardinality(ar.exclude_product_family_ids) > 0
        AND p.family_id IS NOT NULL
        AND p.family_id = ANY (ar.exclude_product_family_ids)
      )
      OR (
        cardinality(ar.exclude_product_name_contains) > 0
        AND EXISTS (
          SELECT 1
          FROM unnest(ar.exclude_product_name_contains) AS exclude_token(token)
          WHERE token <> ''
            AND POSITION(LOWER(token) IN LOWER(COALESCE(p.product_name, ''))) > 0
        )
      )
    )
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
  USING share_sets s
  WHERE i.share_set_id = s.id
    AND i.organization_id = s.organization_id
    AND s.module_key = 'products'
    AND COALESCE(i.metadata ->> 'source', '') = 'dynamic_rule'
    AND i.resource_type IN ('product', 'variant')
    AND NOT EXISTS (
      SELECT 1
      FROM aggregated_matches am
      WHERE am.organization_id = i.organization_id
        AND am.share_set_id = i.share_set_id
        AND am.product_id = i.resource_id
        AND am.resource_type = i.resource_type
    )
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
