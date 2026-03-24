BEGIN;

ALTER TABLE share_set_items
  ADD COLUMN IF NOT EXISTS destination_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_share_set_items_destination_ids
  ON share_set_items USING GIN (destination_ids);

CREATE TABLE IF NOT EXISTS market_set_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  share_set_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_set_assignments_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT market_set_assignments_unique
    UNIQUE (organization_id, market_id, share_set_id),
  CONSTRAINT market_set_assignments_share_set_org_fk
    FOREIGN KEY (share_set_id, organization_id)
    REFERENCES share_sets(id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_set_assignments_org_market_active
  ON market_set_assignments (organization_id, market_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_set_assignments_org_set_active
  ON market_set_assignments (organization_id, share_set_id, is_active, updated_at DESC);

DROP TRIGGER IF EXISTS set_market_set_assignments_updated_at ON market_set_assignments;
CREATE TRIGGER set_market_set_assignments_updated_at
  BEFORE UPDATE ON market_set_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE market_set_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_set_assignments_select_policy ON market_set_assignments;
DROP POLICY IF EXISTS market_set_assignments_write_policy ON market_set_assignments;

CREATE POLICY market_set_assignments_select_policy ON market_set_assignments
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY market_set_assignments_write_policy ON market_set_assignments
  FOR ALL USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

INSERT INTO share_sets (
  organization_id,
  module_key,
  name,
  description,
  metadata,
  created_by
)
SELECT
  o.id,
  'products',
  'Global Products',
  'System-managed catalog set for broadly eligible products.',
  jsonb_build_object(
    'system', true,
    'global', true,
    'eligibility', jsonb_build_object('status', jsonb_build_array('Active'))
  ),
  'system'
FROM organizations o
ON CONFLICT (organization_id, module_key, name) DO NOTHING;

INSERT INTO share_sets (
  organization_id,
  module_key,
  name,
  description,
  metadata,
  created_by
)
SELECT
  o.id,
  'assets',
  'Global Assets',
  'System-managed catalog set for broadly eligible assets.',
  jsonb_build_object(
    'system', true,
    'global', true,
    'eligibility', jsonb_build_object(
      'asset_scope', jsonb_build_array('shared', 'public'),
      'version_window', 'valid_now'
    )
  ),
  'system'
FROM organizations o
ON CONFLICT (organization_id, module_key, name) DO NOTHING;

COMMENT ON TABLE market_set_assignments IS
  'Assignments of share sets to markets to define explicit market catalogs.';

COMMIT;
