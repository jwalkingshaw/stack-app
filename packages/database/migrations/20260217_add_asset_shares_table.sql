BEGIN;

CREATE TABLE IF NOT EXISTS asset_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    allow_downloads BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT asset_shares_asset_unique UNIQUE (asset_id),
    CONSTRAINT asset_shares_org_token_unique UNIQUE (organization_id, token)
);

CREATE INDEX IF NOT EXISTS idx_asset_shares_org_token
    ON asset_shares (organization_id, token);

CREATE INDEX IF NOT EXISTS idx_asset_shares_asset_id
    ON asset_shares (asset_id);

DROP TRIGGER IF EXISTS set_asset_shares_updated_at ON asset_shares;
CREATE TRIGGER set_asset_shares_updated_at
    BEFORE UPDATE ON asset_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE asset_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_shares_select_policy ON asset_shares;
DROP POLICY IF EXISTS asset_shares_manage_policy ON asset_shares;
DROP POLICY IF EXISTS asset_shares_service_role_policy ON asset_shares;

CREATE POLICY asset_shares_select_policy ON asset_shares
    FOR SELECT USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

CREATE POLICY asset_shares_manage_policy ON asset_shares
    FOR ALL USING (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR organization_id = ANY (get_user_accessible_org_ids())
    );

-- Backfill existing share metadata into normalized table.
INSERT INTO asset_shares (
    organization_id,
    asset_id,
    token,
    public_enabled,
    allow_downloads,
    expires_at,
    created_at,
    updated_at
)
SELECT
    da.organization_id,
    da.id,
    da.metadata -> 'share' ->> 'token',
    COALESCE((da.metadata -> 'share' ->> 'publicEnabled')::boolean, FALSE),
    COALESCE((da.metadata -> 'share' ->> 'allowDownloads')::boolean, FALSE),
    COALESCE(
        NULLIF(da.metadata -> 'share' ->> 'expiresAt', '')::timestamptz,
        NOW() + INTERVAL '7 days'
    ),
    NOW(),
    NOW()
FROM dam_assets da
WHERE da.metadata IS NOT NULL
  AND (da.metadata -> 'share' ->> 'token') IS NOT NULL
  AND (da.metadata -> 'share' ->> 'token') <> ''
ON CONFLICT (asset_id) DO NOTHING;

COMMIT;
