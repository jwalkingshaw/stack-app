BEGIN;

WITH legacy_sets AS (
  SELECT
    ss.id AS share_set_id,
    ss.organization_id,
    ss.created_by,
    ss.metadata ->> 'legacy_collection_id' AS legacy_collection_id
  FROM share_sets ss
  WHERE ss.module_key = 'assets'
    AND jsonb_typeof(ss.metadata) = 'object'
    AND ss.metadata ? 'legacy_collection_id'
    AND (ss.metadata ->> 'legacy_collection_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
  created_by,
  created_at,
  updated_at
)
SELECT
  ls.share_set_id,
  ls.organization_id,
  'asset',
  asset_id,
  FALSE,
  '{}'::uuid[],
  '{}'::uuid[],
  '{}'::uuid[],
  '{}'::jsonb,
  ls.created_by,
  NOW(),
  NOW()
FROM legacy_sets ls
JOIN dam_collections dc
  ON dc.id = ls.legacy_collection_id::uuid
  AND dc.organization_id = ls.organization_id
CROSS JOIN LATERAL unnest(COALESCE(dc.asset_ids, '{}'::uuid[])) AS asset_id
ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dam_collections'
      AND column_name = 'folder_ids'
  ) THEN
    EXECUTE $SQL$
      WITH legacy_sets AS (
        SELECT
          ss.id AS share_set_id,
          ss.organization_id,
          ss.created_by,
          ss.metadata ->> 'legacy_collection_id' AS legacy_collection_id
        FROM share_sets ss
        WHERE ss.module_key = 'assets'
          AND jsonb_typeof(ss.metadata) = 'object'
          AND ss.metadata ? 'legacy_collection_id'
          AND (ss.metadata ->> 'legacy_collection_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
        created_by,
        created_at,
        updated_at
      )
      SELECT
        ls.share_set_id,
        ls.organization_id,
        'folder',
        folder_id,
        TRUE,
        '{}'::uuid[],
        '{}'::uuid[],
        '{}'::uuid[],
        '{}'::jsonb,
        ls.created_by,
        NOW(),
        NOW()
      FROM legacy_sets ls
      JOIN dam_collections dc
        ON dc.id = ls.legacy_collection_id::uuid
        AND dc.organization_id = ls.organization_id
      CROSS JOIN LATERAL unnest(COALESCE(dc.folder_ids, '{}'::uuid[])) AS folder_id
      ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING
    $SQL$;
  END IF;
END
$$;

COMMIT;
