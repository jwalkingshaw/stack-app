BEGIN;

CREATE TABLE IF NOT EXISTS partner_update_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_update_id UUID NOT NULL,
  token TEXT NOT NULL,
  public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_update_shares_update_org_fk
    FOREIGN KEY (partner_update_id, organization_id)
    REFERENCES partner_updates(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT partner_update_shares_token_not_blank_ck
    CHECK (length(btrim(token)) >= 16),
  CONSTRAINT partner_update_shares_update_unique
    UNIQUE (partner_update_id),
  CONSTRAINT partner_update_shares_org_token_unique
    UNIQUE (organization_id, token)
);

CREATE INDEX IF NOT EXISTS idx_partner_update_shares_org_update
ON partner_update_shares(organization_id, partner_update_id);

CREATE INDEX IF NOT EXISTS idx_partner_update_shares_org_token
ON partner_update_shares(organization_id, token);

DROP TRIGGER IF EXISTS set_partner_update_shares_updated_at ON partner_update_shares;
CREATE TRIGGER set_partner_update_shares_updated_at
  BEFORE UPDATE ON partner_update_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE partner_update_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_update_shares_select_policy ON partner_update_shares;
DROP POLICY IF EXISTS partner_update_shares_write_policy ON partner_update_shares;

CREATE POLICY partner_update_shares_select_policy ON partner_update_shares
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

CREATE POLICY partner_update_shares_write_policy ON partner_update_shares
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

COMMENT ON TABLE partner_update_shares IS
  'Public/private tokenized share links for partner updates and kits.';

COMMIT;
