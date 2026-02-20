BEGIN;

CREATE TABLE IF NOT EXISTS invitation_share_set_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  share_set_id UUID NOT NULL,
  created_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invitation_share_set_assignments_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT invitation_share_set_assignments_unique_invite_set
    UNIQUE (invitation_id, share_set_id),
  CONSTRAINT invitation_share_set_assignments_share_set_org_fk
    FOREIGN KEY (share_set_id, organization_id)
    REFERENCES share_sets(id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invitation_share_set_assignments_org
ON invitation_share_set_assignments(organization_id);

CREATE INDEX IF NOT EXISTS idx_invitation_share_set_assignments_invitation
ON invitation_share_set_assignments(invitation_id);

CREATE INDEX IF NOT EXISTS idx_invitation_share_set_assignments_share_set
ON invitation_share_set_assignments(share_set_id);

ALTER TABLE invitation_share_set_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitation_share_set_assignments_select_policy
ON invitation_share_set_assignments;
DROP POLICY IF EXISTS invitation_share_set_assignments_write_policy
ON invitation_share_set_assignments;

CREATE POLICY invitation_share_set_assignments_select_policy
ON invitation_share_set_assignments
FOR SELECT USING (
  auth.role() = 'service_role'
  OR organization_id IN (
    SELECT organization_id
    FROM organization_members
    WHERE kinde_user_id = current_setting('app.current_user_id', true)
      AND status = 'active'
  )
);

CREATE POLICY invitation_share_set_assignments_write_policy
ON invitation_share_set_assignments
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

COMMENT ON TABLE invitation_share_set_assignments IS
  'Snapshot of share set assignments selected at invite time.';

COMMIT;
