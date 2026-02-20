BEGIN;

-- Accelerate active membership lookup in authz_has_permission
CREATE INDEX IF NOT EXISTS idx_org_members_active_user_org
ON organization_members (kinde_user_id, organization_id)
WHERE status = 'active';

-- Accelerate positive role-template permission checks
CREATE INDEX IF NOT EXISTS idx_role_permission_templates_allowed_lookup
ON role_permission_templates (role, permission_key)
WHERE is_allowed = TRUE;

-- Accelerate scoped grant lookups by member/permission/scope dimensions
CREATE INDEX IF NOT EXISTS idx_member_scope_permissions_authz_lookup
ON member_scope_permissions (
  member_id,
  organization_id,
  permission_key,
  scope_type,
  market_id,
  channel_id,
  collection_id,
  expires_at
);

COMMENT ON INDEX idx_org_members_active_user_org IS
  'Optimizes active organization member lookup in authz_has_permission';
COMMENT ON INDEX idx_role_permission_templates_allowed_lookup IS
  'Optimizes role-based allow template lookup in authz_has_permission';
COMMENT ON INDEX idx_member_scope_permissions_authz_lookup IS
  'Optimizes scoped permission grant matching in authz_has_permission';

COMMIT;
