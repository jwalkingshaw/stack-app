BEGIN;

CREATE TABLE IF NOT EXISTS permission_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('team_member', 'partner')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, subject_type, name)
);

CREATE TABLE IF NOT EXISTS permission_bundle_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_bundle_id UUID NOT NULL REFERENCES permission_bundles(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('products', 'assets', 'share_links')),
  level TEXT NOT NULL CHECK (level IN ('none', 'view', 'edit', 'admin')),
  scope_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (permission_bundle_id, module_key),
  CHECK (jsonb_typeof(scope_defaults) = 'object')
);

ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS permission_bundle_id UUID REFERENCES permission_bundles(id) ON DELETE SET NULL;

ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS invite_permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE invitations
DROP CONSTRAINT IF EXISTS invitations_invite_permissions_object;

ALTER TABLE invitations
ADD CONSTRAINT invitations_invite_permissions_object
CHECK (jsonb_typeof(invite_permissions) = 'object');

CREATE INDEX IF NOT EXISTS idx_permission_bundles_org_subject
ON permission_bundles(organization_id, subject_type);

CREATE INDEX IF NOT EXISTS idx_permission_bundle_rules_bundle
ON permission_bundle_rules(permission_bundle_id);

CREATE INDEX IF NOT EXISTS idx_invitations_permission_bundle
ON invitations(permission_bundle_id)
WHERE permission_bundle_id IS NOT NULL;

ALTER TABLE permission_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_bundle_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_bundles_select_policy ON permission_bundles;
DROP POLICY IF EXISTS permission_bundles_write_policy ON permission_bundles;
DROP POLICY IF EXISTS permission_bundle_rules_select_policy ON permission_bundle_rules;
DROP POLICY IF EXISTS permission_bundle_rules_write_policy ON permission_bundle_rules;

CREATE POLICY permission_bundles_select_policy ON permission_bundles
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY permission_bundles_write_policy ON permission_bundles
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

CREATE POLICY permission_bundle_rules_select_policy ON permission_bundle_rules
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR permission_bundle_id IN (
      SELECT id
      FROM permission_bundles
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE kinde_user_id = current_setting('app.current_user_id', true)
          AND status = 'active'
      )
    )
  );

CREATE POLICY permission_bundle_rules_write_policy ON permission_bundle_rules
  FOR ALL USING (
    auth.role() = 'service_role'
    OR permission_bundle_id IN (
      SELECT id
      FROM permission_bundles
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE kinde_user_id = current_setting('app.current_user_id', true)
          AND role IN ('owner', 'admin')
          AND status = 'active'
      )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR permission_bundle_id IN (
      SELECT id
      FROM permission_bundles
      WHERE organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE kinde_user_id = current_setting('app.current_user_id', true)
          AND role IN ('owner', 'admin')
          AND status = 'active'
      )
    )
  );

COMMENT ON TABLE permission_bundles IS
  'Reusable invite-time permission presets (module levels + optional default scope semantics)';

COMMENT ON TABLE permission_bundle_rules IS
  'Rules inside a permission bundle, keyed by module with level and optional scope defaults';

COMMENT ON COLUMN invitations.invite_permissions IS
  'Immutable invite-time permission snapshot applied atomically on invitation acceptance';

COMMIT;
