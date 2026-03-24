BEGIN;

-- ============================================================
-- Keep dam_assets.tags TEXT[] in sync with asset_tag_assignments.
--
-- Problem:
--   The dynamic set rules trigger reads from dam_assets.tags[] directly.
--   Tags are also stored in the normalized asset_tag_assignments join table.
--   If these two fall out of sync, rules silently misfire — assets may be
--   included in or excluded from partner sets incorrectly.
--
-- Solution:
--   Three triggers:
--   1. asset_tag_assignments INSERT/DELETE → rebuild tags[] on affected asset
--   2. asset_tags UPDATE (slug rename) → rebuild tags[] on all assets with that tag
--   3. Backfill: rebuild tags[] for all assets where it disagrees with the join table
-- ============================================================

-- ── Helper: rebuild tags[] for a single asset from the join table ────────

CREATE OR REPLACE FUNCTION rebuild_asset_tags_array(p_asset_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE dam_assets
  SET tags = COALESCE(
    (
      SELECT ARRAY_AGG(t.slug ORDER BY t.slug)
      FROM asset_tag_assignments ata
      JOIN asset_tags t ON t.id = ata.tag_id
      WHERE ata.asset_id = p_asset_id
    ),
    '{}'::TEXT[]
  )
  WHERE id = p_asset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Helper: rebuild tags[] for all assets that carry a given tag slug ────

CREATE OR REPLACE FUNCTION rebuild_asset_tags_array_for_tag(p_tag_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE dam_assets da
  SET tags = COALESCE(
    (
      SELECT ARRAY_AGG(t.slug ORDER BY t.slug)
      FROM asset_tag_assignments ata
      JOIN asset_tags t ON t.id = ata.tag_id
      WHERE ata.asset_id = da.id
    ),
    '{}'::TEXT[]
  )
  WHERE da.id IN (
    SELECT DISTINCT asset_id
    FROM asset_tag_assignments
    WHERE tag_id = p_tag_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger 1: rebuild tags[] after assignment insert or delete ──────────

CREATE OR REPLACE FUNCTION trg_sync_asset_tags_on_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM rebuild_asset_tags_array(OLD.asset_id);
  ELSE
    PERFORM rebuild_asset_tags_array(NEW.asset_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_asset_tags_on_assignment ON asset_tag_assignments;
CREATE TRIGGER sync_asset_tags_on_assignment
  AFTER INSERT OR DELETE ON asset_tag_assignments
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_asset_tags_on_assignment();

-- ── Trigger 2: rebuild tags[] when a tag's slug is renamed ──────────────

CREATE OR REPLACE FUNCTION trg_sync_asset_tags_on_slug_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when slug actually changed
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    PERFORM rebuild_asset_tags_array_for_tag(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_asset_tags_on_slug_change ON asset_tags;
CREATE TRIGGER sync_asset_tags_on_slug_change
  AFTER UPDATE OF slug ON asset_tags
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_asset_tags_on_slug_change();

-- ── Trigger 3: rebuild tags[] when a tag is deleted entirely ────────────
-- (The ON DELETE CASCADE on asset_tag_assignments handles row removal, but
--  the tags[] array on dam_assets won't update automatically.)

CREATE OR REPLACE FUNCTION trg_sync_asset_tags_on_tag_delete()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM rebuild_asset_tags_array_for_tag(OLD.id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_asset_tags_on_tag_delete ON asset_tags;
CREATE TRIGGER sync_asset_tags_on_tag_delete
  BEFORE DELETE ON asset_tags
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_asset_tags_on_tag_delete();

-- ── Backfill: fix any existing divergence ───────────────────────────────
--
-- Rebuilds tags[] for every asset whose current tags[] array does not
-- exactly match what the join table says it should be. Uses a subquery
-- to compute the expected value and only touches rows that differ.

UPDATE dam_assets da
SET tags = COALESCE(
  (
    SELECT ARRAY_AGG(t.slug ORDER BY t.slug)
    FROM asset_tag_assignments ata
    JOIN asset_tags t ON t.id = ata.tag_id
    WHERE ata.asset_id = da.id
  ),
  '{}'::TEXT[]
)
WHERE da.tags IS DISTINCT FROM COALESCE(
  (
    SELECT ARRAY_AGG(t.slug ORDER BY t.slug)
    FROM asset_tag_assignments ata
    JOIN asset_tags t ON t.id = ata.tag_id
    WHERE ata.asset_id = da.id
  ),
  '{}'::TEXT[]
);

COMMIT;
