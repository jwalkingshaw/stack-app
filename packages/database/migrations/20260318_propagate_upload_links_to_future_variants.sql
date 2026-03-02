BEGIN;

CREATE OR REPLACE FUNCTION propagate_upload_links_to_new_variant()
RETURNS TRIGGER AS $$
DECLARE
  target_parent_id UUID;
BEGIN
  target_parent_id := NEW.parent_id;

  IF target_parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  WITH source_links AS (
    SELECT
      pal.organization_id,
      NEW.id AS product_id,
      pal.asset_id,
      pal.asset_type,
      pal.link_context,
      pal.link_type,
      pal.confidence,
      CASE
        WHEN COALESCE(pal.match_reason, '') = '' THEN 'Inherited from parent product link'
        ELSE pal.match_reason || ' (inherited to child variant)'
      END AS match_reason,
      pal.created_by
    FROM product_asset_links pal
    JOIN dam_assets da
      ON da.id = pal.asset_id
     AND da.organization_id = pal.organization_id
    WHERE pal.organization_id = NEW.organization_id
      AND pal.product_id = target_parent_id
      AND pal.link_context = 'upload'
      AND pal.is_active = true
      AND COALESCE((da.metadata ->> 'appliesToChildren')::boolean, true) = true
  ),
  upserted_links AS (
    INSERT INTO product_asset_links (
      organization_id,
      product_id,
      asset_id,
      asset_type,
      link_context,
      link_type,
      confidence,
      match_reason,
      is_active,
      created_by
    )
    SELECT
      organization_id,
      product_id,
      asset_id,
      asset_type,
      link_context,
      link_type,
      confidence,
      match_reason,
      true,
      created_by
    FROM source_links
    ON CONFLICT (organization_id, product_id, asset_id, link_context)
    DO UPDATE SET
      is_active = true,
      confidence = EXCLUDED.confidence,
      match_reason = EXCLUDED.match_reason,
      updated_at = NOW()
    RETURNING asset_id
  ),
  affected_assets AS (
    SELECT DISTINCT asset_id
    FROM upserted_links
  ),
  recalculated_identifiers AS (
    SELECT
      pal.asset_id,
      ARRAY_REMOVE(
        ARRAY_AGG(DISTINCT id_values.identifier),
        NULL
      ) AS identifiers
    FROM product_asset_links pal
    JOIN products p
      ON p.id = pal.product_id
     AND p.organization_id = pal.organization_id
    LEFT JOIN LATERAL (
      VALUES
        (NULLIF(BTRIM(p.sku), '')),
        (NULLIF(BTRIM(p.scin), ''))
    ) AS id_values(identifier) ON true
    WHERE pal.organization_id = NEW.organization_id
      AND pal.is_active = true
      AND pal.asset_id IN (SELECT asset_id FROM affected_assets)
    GROUP BY pal.asset_id
  )
  UPDATE dam_assets da
  SET product_identifiers = COALESCE(ri.identifiers, '{}'::text[])
  FROM recalculated_identifiers ri
  WHERE da.id = ri.asset_id
    AND da.organization_id = NEW.organization_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS propagate_upload_links_to_new_variant_on_products ON products;
CREATE TRIGGER propagate_upload_links_to_new_variant_on_products
  AFTER INSERT OR UPDATE OF parent_id ON products
  FOR EACH ROW
  WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION propagate_upload_links_to_new_variant();

-- Backfill: ensure existing variants inherit qualifying upload links from parents.
WITH source_links AS (
  SELECT
    pal.organization_id,
    child.id AS product_id,
    pal.asset_id,
    pal.asset_type,
    pal.link_context,
    pal.link_type,
    pal.confidence,
    CASE
      WHEN COALESCE(pal.match_reason, '') = '' THEN 'Inherited from parent product link'
      ELSE pal.match_reason || ' (inherited to child variant)'
    END AS match_reason,
    pal.created_by
  FROM products child
  JOIN product_asset_links pal
    ON pal.organization_id = child.organization_id
   AND pal.product_id = child.parent_id
  JOIN dam_assets da
    ON da.id = pal.asset_id
   AND da.organization_id = pal.organization_id
  WHERE child.parent_id IS NOT NULL
    AND pal.link_context = 'upload'
    AND pal.is_active = true
    AND COALESCE((da.metadata ->> 'appliesToChildren')::boolean, true) = true
),
upserted_links AS (
  INSERT INTO product_asset_links (
    organization_id,
    product_id,
    asset_id,
    asset_type,
    link_context,
    link_type,
    confidence,
    match_reason,
    is_active,
    created_by
  )
  SELECT
    organization_id,
    product_id,
    asset_id,
    asset_type,
    link_context,
    link_type,
    confidence,
    match_reason,
    true,
    created_by
  FROM source_links
  ON CONFLICT (organization_id, product_id, asset_id, link_context)
  DO UPDATE SET
    is_active = true,
    confidence = EXCLUDED.confidence,
    match_reason = EXCLUDED.match_reason,
    updated_at = NOW()
  RETURNING organization_id, asset_id
),
affected_assets AS (
  SELECT DISTINCT organization_id, asset_id
  FROM upserted_links
),
recalculated_identifiers AS (
  SELECT
    pal.organization_id,
    pal.asset_id,
    ARRAY_REMOVE(
      ARRAY_AGG(DISTINCT id_values.identifier),
      NULL
    ) AS identifiers
  FROM product_asset_links pal
  JOIN products p
    ON p.id = pal.product_id
   AND p.organization_id = pal.organization_id
  LEFT JOIN LATERAL (
    VALUES
      (NULLIF(BTRIM(p.sku), '')),
      (NULLIF(BTRIM(p.scin), ''))
  ) AS id_values(identifier) ON true
  WHERE pal.is_active = true
    AND (pal.organization_id, pal.asset_id) IN (
      SELECT organization_id, asset_id
      FROM affected_assets
    )
  GROUP BY pal.organization_id, pal.asset_id
)
UPDATE dam_assets da
SET product_identifiers = COALESCE(ri.identifiers, '{}'::text[])
FROM recalculated_identifiers ri
WHERE da.organization_id = ri.organization_id
  AND da.id = ri.asset_id;

COMMIT;

