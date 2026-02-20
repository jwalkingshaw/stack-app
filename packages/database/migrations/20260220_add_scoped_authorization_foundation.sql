BEGIN;

-- Canonical permission registry used across DAM/PIM/team modules.
CREATE TABLE IF NOT EXISTS permission_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key TEXT NOT NULL UNIQUE,
    module TEXT NOT NULL CHECK (module IN ('dam', 'pim', 'team', 'system')),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role templates provide default permission baselines by organization member role.
CREATE TABLE IF NOT EXISTS role_permission_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'partner')),
    permission_key TEXT NOT NULL REFERENCES permission_registry(permission_key) ON DELETE CASCADE,
    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_role_permission_template UNIQUE (role, permission_key)
);

-- Explicit scoped grants for members at organization, market, channel, or collection scope.
CREATE TABLE IF NOT EXISTS member_scope_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permission_registry(permission_key) ON DELETE CASCADE,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'market', 'channel', 'collection')),
    market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES dam_collections(id) ON DELETE CASCADE,
    granted_by TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT member_scope_permissions_scope_consistency CHECK (
        (scope_type = 'organization' AND market_id IS NULL AND channel_id IS NULL AND collection_id IS NULL)
        OR (scope_type = 'market' AND market_id IS NOT NULL AND channel_id IS NULL AND collection_id IS NULL)
        OR (scope_type = 'channel' AND market_id IS NULL AND channel_id IS NOT NULL AND collection_id IS NULL)
        OR (scope_type = 'collection' AND market_id IS NULL AND channel_id IS NULL AND collection_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_member_scope_permission
ON member_scope_permissions (
    member_id,
    permission_key,
    scope_type,
    COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(collection_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_permission_registry_module
ON permission_registry(module);

CREATE INDEX IF NOT EXISTS idx_role_permission_templates_role
ON role_permission_templates(role);

CREATE INDEX IF NOT EXISTS idx_member_scope_permissions_org_member
ON member_scope_permissions(organization_id, member_id);

CREATE INDEX IF NOT EXISTS idx_member_scope_permissions_permission
ON member_scope_permissions(permission_key);

CREATE INDEX IF NOT EXISTS idx_member_scope_permissions_expiry
ON member_scope_permissions(expires_at);

DROP TRIGGER IF EXISTS set_member_scope_permissions_updated_at ON member_scope_permissions;
CREATE TRIGGER set_member_scope_permissions_updated_at
    BEFORE UPDATE ON member_scope_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE permission_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_scope_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_registry_select_policy ON permission_registry;
DROP POLICY IF EXISTS permission_registry_manage_policy ON permission_registry;
DROP POLICY IF EXISTS role_permission_templates_select_policy ON role_permission_templates;
DROP POLICY IF EXISTS role_permission_templates_manage_policy ON role_permission_templates;
DROP POLICY IF EXISTS member_scope_permissions_select_policy ON member_scope_permissions;
DROP POLICY IF EXISTS member_scope_permissions_manage_policy ON member_scope_permissions;

CREATE POLICY permission_registry_select_policy ON permission_registry
    FOR SELECT USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY permission_registry_manage_policy ON permission_registry
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY role_permission_templates_select_policy ON role_permission_templates
    FOR SELECT USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY role_permission_templates_manage_policy ON role_permission_templates
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY member_scope_permissions_select_policy ON member_scope_permissions
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
        )
    );

CREATE POLICY member_scope_permissions_manage_policy ON member_scope_permissions
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

-- Permission evaluator:
-- 1) owner always allowed
-- 2) role template grants global baseline
-- 3) scoped member grants authorize market/channel/collection actions
CREATE OR REPLACE FUNCTION authz_has_permission(
    user_id_param TEXT,
    organization_id_param UUID,
    permission_key_param TEXT,
    market_id_param UUID DEFAULT NULL,
    channel_id_param UUID DEFAULT NULL,
    collection_id_param UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    member_record organization_members%ROWTYPE;
    has_role_permission BOOLEAN := FALSE;
    has_scoped_permission BOOLEAN := FALSE;
BEGIN
    SELECT * INTO member_record
    FROM organization_members
    WHERE kinde_user_id = user_id_param
      AND organization_id = organization_id_param
      AND status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF member_record.role = 'owner' THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS(
        SELECT 1
        FROM role_permission_templates rpt
        WHERE rpt.role = member_record.role
          AND rpt.permission_key = permission_key_param
          AND rpt.is_allowed = TRUE
    ) INTO has_role_permission;

    SELECT EXISTS(
        SELECT 1
        FROM member_scope_permissions msp
        WHERE msp.member_id = member_record.id
          AND msp.organization_id = organization_id_param
          AND msp.permission_key = permission_key_param
          AND (msp.expires_at IS NULL OR msp.expires_at > NOW())
          AND (
              msp.scope_type = 'organization'
              OR (msp.scope_type = 'market' AND market_id_param IS NOT NULL AND msp.market_id = market_id_param)
              OR (msp.scope_type = 'channel' AND channel_id_param IS NOT NULL AND msp.channel_id = channel_id_param)
              OR (msp.scope_type = 'collection' AND collection_id_param IS NOT NULL AND msp.collection_id = collection_id_param)
          )
    ) INTO has_scoped_permission;

    RETURN has_role_permission OR has_scoped_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION authz_has_permission(TEXT, UUID, TEXT, UUID, UUID, UUID) TO authenticated;

INSERT INTO permission_registry (permission_key, module, description)
VALUES
    ('asset.upload', 'dam', 'Upload DAM assets'),
    ('asset.metadata.edit', 'dam', 'Edit DAM asset metadata'),
    ('asset.download.original', 'dam', 'Download original DAM assets'),
    ('asset.download.derivative', 'dam', 'Download derivative DAM assets'),
    ('asset.version.manage', 'dam', 'Manage DAM asset versions'),
    ('product.attribute.edit', 'pim', 'Edit product attributes'),
    ('product.media.map', 'pim', 'Map DAM assets to products'),
    ('product.market.scope.read', 'pim', 'Read market-scoped product content'),
    ('product.market.scope.edit', 'pim', 'Edit market-scoped product content'),
    ('product.publish.state', 'pim', 'Change product publish state'),
    ('invite.send', 'team', 'Send invitations'),
    ('invite.revoke', 'team', 'Revoke invitations'),
    ('member.role.assign', 'team', 'Assign member roles'),
    ('container.share.manage', 'team', 'Manage channel/collection sharing'),
    ('audit.read', 'system', 'Read security and authorization audit logs')
ON CONFLICT (permission_key) DO UPDATE
SET
    module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permission_templates (role, permission_key, is_allowed)
VALUES
    -- admin
    ('admin', 'asset.upload', TRUE),
    ('admin', 'asset.metadata.edit', TRUE),
    ('admin', 'asset.download.original', TRUE),
    ('admin', 'asset.download.derivative', TRUE),
    ('admin', 'asset.version.manage', TRUE),
    ('admin', 'product.attribute.edit', TRUE),
    ('admin', 'product.media.map', TRUE),
    ('admin', 'product.market.scope.read', TRUE),
    ('admin', 'product.market.scope.edit', TRUE),
    ('admin', 'product.publish.state', TRUE),
    ('admin', 'invite.send', TRUE),
    ('admin', 'invite.revoke', TRUE),
    ('admin', 'member.role.assign', TRUE),
    ('admin', 'container.share.manage', TRUE),
    ('admin', 'audit.read', TRUE),

    -- editor
    ('editor', 'asset.upload', TRUE),
    ('editor', 'asset.metadata.edit', TRUE),
    ('editor', 'asset.download.derivative', TRUE),
    ('editor', 'product.attribute.edit', TRUE),
    ('editor', 'product.media.map', TRUE),
    ('editor', 'product.market.scope.read', TRUE),

    -- viewer
    ('viewer', 'asset.download.derivative', TRUE),
    ('viewer', 'product.market.scope.read', TRUE),

    -- partner (default least privilege; usually extended via scoped grants)
    ('partner', 'asset.download.derivative', TRUE),
    ('partner', 'product.market.scope.read', TRUE)
ON CONFLICT (role, permission_key) DO UPDATE
SET is_allowed = EXCLUDED.is_allowed;

COMMENT ON TABLE permission_registry IS 'Canonical permissions for DAM/PIM/team/system modules';
COMMENT ON TABLE role_permission_templates IS 'Default role-to-permission allow mappings';
COMMENT ON TABLE member_scope_permissions IS 'Scoped permission grants (organization/market/channel/collection) for organization members';
COMMENT ON FUNCTION authz_has_permission IS 'Checks whether a user has a permission in a given organization and optional market/channel/collection scope';

COMMIT;
