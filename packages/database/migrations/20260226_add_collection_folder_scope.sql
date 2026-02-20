BEGIN;

ALTER TABLE dam_collections
ADD COLUMN IF NOT EXISTS folder_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN dam_collections.folder_ids IS
  'Optional list of DAM folder IDs included in this collection scope. Assets in these folders (and descendants) are included in collection visibility.';

COMMIT;
