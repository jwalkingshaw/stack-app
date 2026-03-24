BEGIN;

-- ============================================================
-- 1. catalog_visibility on products
--    Controls whether a product/variant participates in
--    automatic set expansion (include_descendants) and
--    dynamic rule auto-inclusion.
--
--    standard         — default; included everywhere
--    partner_exclusive — excluded from auto-expansion and
--                        dynamic rules; must be explicitly
--                        added to a set
--    restricted        — brand-internal; never visible to
--                        any partner regardless of set membership
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS catalog_visibility TEXT NOT NULL DEFAULT 'standard'
  CONSTRAINT products_catalog_visibility_check
    CHECK (catalog_visibility IN ('standard', 'partner_exclusive', 'restricted'));

CREATE INDEX IF NOT EXISTS idx_products_catalog_visibility
  ON products(organization_id, catalog_visibility)
  WHERE catalog_visibility <> 'standard';

-- ============================================================
-- 2. valid_from on partner_share_set_grants
--    Allows staged / time-gated exclusivity launches.
--    NULL means the grant is effective immediately.
--    A future timestamp means the grant is not effective
--    until valid_from <= now().
-- ============================================================

ALTER TABLE partner_share_set_grants
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;

-- ============================================================
-- 3. partner_market_assignments
--    Links a partner organisation to a market.
--    Partners assigned to a market automatically inherit
--    the full catalog (all active market_set_assignments)
--    for that market.
--
--    valid_from: NULL = active immediately; future date =
--    assignment does not take effect until that date.
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_market_assignments (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  market_id               UUID        NOT NULL REFERENCES markets(id)       ON DELETE CASCADE,
  partner_organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  valid_from              TIMESTAMPTZ,
  assigned_by             TEXT,
  metadata                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_market_assignments_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT partner_market_assignments_unique
    UNIQUE (organization_id, market_id, partner_organization_id)
);

CREATE INDEX IF NOT EXISTS idx_pma_org_market
  ON partner_market_assignments(organization_id, market_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_pma_org_partner
  ON partner_market_assignments(organization_id, partner_organization_id)
  WHERE is_active;

DROP TRIGGER IF EXISTS set_partner_market_assignments_updated_at ON partner_market_assignments;
CREATE TRIGGER set_partner_market_assignments_updated_at
  BEFORE UPDATE ON partner_market_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. RLS for partner_market_assignments
--    Brand members (owner/admin) can manage their org's rows.
--    Partner members can read rows where they are the partner.
--    service_role bypasses all policies.
-- ============================================================

ALTER TABLE partner_market_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_market_assignments_select_policy ON partner_market_assignments;
DROP POLICY IF EXISTS partner_market_assignments_write_policy  ON partner_market_assignments;

-- Brand members and the partner itself can select
CREATE POLICY partner_market_assignments_select_policy
  ON partner_market_assignments
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
    OR partner_organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

-- Only brand owners/admins can write
CREATE POLICY partner_market_assignments_write_policy
  ON partner_market_assignments
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

COMMIT;
