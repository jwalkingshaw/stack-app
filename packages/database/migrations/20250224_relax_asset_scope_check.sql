-- Migration: Relax asset_scope check constraint to support new upload flows
-- Date: 2025-02-24

BEGIN;

-- Update dam_assets.asset_scope check to include internal scope used by uploads
ALTER TABLE dam_assets
  DROP CONSTRAINT IF EXISTS dam_assets_asset_scope_check;

ALTER TABLE dam_assets
  ADD CONSTRAINT dam_assets_asset_scope_check
  CHECK (asset_scope IN ('internal', 'shared', 'public', 'restricted', 'external'));

COMMIT;
