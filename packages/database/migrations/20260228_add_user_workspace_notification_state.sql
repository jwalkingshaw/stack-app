BEGIN;

CREATE TABLE IF NOT EXISTS user_workspace_notification_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kinde_user_id TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_workspace_notification_state_unique UNIQUE (kinde_user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_workspace_notification_state_user
ON user_workspace_notification_state(kinde_user_id);

CREATE INDEX IF NOT EXISTS idx_user_workspace_notification_state_org
ON user_workspace_notification_state(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_workspace_notification_state_user_org_last_read
ON user_workspace_notification_state(kinde_user_id, organization_id, last_read_at DESC);

DROP TRIGGER IF EXISTS set_user_workspace_notification_state_updated_at
ON user_workspace_notification_state;

CREATE TRIGGER set_user_workspace_notification_state_updated_at
    BEFORE UPDATE ON user_workspace_notification_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_workspace_notification_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_workspace_notification_state_select_policy
ON user_workspace_notification_state;
DROP POLICY IF EXISTS user_workspace_notification_state_insert_policy
ON user_workspace_notification_state;
DROP POLICY IF EXISTS user_workspace_notification_state_update_policy
ON user_workspace_notification_state;

CREATE POLICY user_workspace_notification_state_select_policy
ON user_workspace_notification_state
FOR SELECT USING (
    auth.role() = 'service_role'
    OR (
        kinde_user_id = current_setting('app.current_user_id', true)
        AND organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
        )
    )
);

CREATE POLICY user_workspace_notification_state_insert_policy
ON user_workspace_notification_state
FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
    OR (
        kinde_user_id = current_setting('app.current_user_id', true)
        AND organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
        )
    )
);

CREATE POLICY user_workspace_notification_state_update_policy
ON user_workspace_notification_state
FOR UPDATE USING (
    auth.role() = 'service_role'
    OR (
        kinde_user_id = current_setting('app.current_user_id', true)
        AND organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
        )
    )
)
WITH CHECK (
    auth.role() = 'service_role'
    OR (
        kinde_user_id = current_setting('app.current_user_id', true)
        AND organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
        )
    )
);

COMMENT ON TABLE user_workspace_notification_state IS
  'Tracks per-user per-workspace notification read cursors for unread counts and notification center state.';
COMMENT ON COLUMN user_workspace_notification_state.last_read_at IS
  'Latest timestamp the user marked notifications as read for this workspace.';

COMMIT;
