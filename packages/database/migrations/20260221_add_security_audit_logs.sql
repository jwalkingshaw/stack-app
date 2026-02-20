BEGIN;

CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_org_created
ON security_audit_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_actor_created
ON security_audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_action_created
ON security_audit_logs(action, created_at DESC);

ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_audit_logs_select_policy ON security_audit_logs;
DROP POLICY IF EXISTS security_audit_logs_insert_policy ON security_audit_logs;

CREATE POLICY security_audit_logs_select_policy ON security_audit_logs
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

CREATE POLICY security_audit_logs_insert_policy ON security_audit_logs
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
        )
    );

CREATE OR REPLACE FUNCTION log_security_event(
    organization_id_param UUID,
    actor_user_id_param TEXT,
    action_param TEXT,
    resource_type_param TEXT,
    resource_id_param TEXT DEFAULT NULL,
    ip_address_param INET DEFAULT NULL,
    user_agent_param TEXT DEFAULT NULL,
    metadata_param JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO security_audit_logs (
        organization_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        metadata
    ) VALUES (
        organization_id_param,
        actor_user_id_param,
        action_param,
        resource_type_param,
        resource_id_param,
        ip_address_param,
        user_agent_param,
        COALESCE(metadata_param, '{}'::jsonb)
    )
    RETURNING id INTO event_id;

    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION log_security_event(UUID, TEXT, TEXT, TEXT, TEXT, INET, TEXT, JSONB) TO authenticated;

COMMENT ON TABLE security_audit_logs IS 'Security-sensitive audit trail for authorization, invites, and access actions';
COMMENT ON FUNCTION log_security_event IS 'Writes a security audit event row';

COMMIT;
