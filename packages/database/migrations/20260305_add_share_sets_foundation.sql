BEGIN;

CREATE TABLE IF NOT EXISTS share_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('assets', 'products')),
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT share_sets_unique_name_per_module UNIQUE (organization_id, module_key, name),
  CONSTRAINT share_sets_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_sets_id_org_unique
ON share_sets(id, organization_id);

CREATE INDEX IF NOT EXISTS idx_share_sets_org_module
ON share_sets(organization_id, module_key);

CREATE INDEX IF NOT EXISTS idx_share_sets_org_updated
ON share_sets(organization_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_share_sets_updated_at ON share_sets;
CREATE TRIGGER set_share_sets_updated_at
  BEFORE UPDATE ON share_sets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS share_set_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_set_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('asset', 'folder', 'product', 'variant')),
  resource_id UUID NOT NULL,
  include_descendants BOOLEAN NOT NULL DEFAULT FALSE,
  market_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  channel_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  locale_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT share_set_items_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT share_set_items_unique_resource UNIQUE (share_set_id, resource_type, resource_id),
  CONSTRAINT share_set_items_share_set_org_fk
    FOREIGN KEY (share_set_id, organization_id)
    REFERENCES share_sets(id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_share_set_items_set
ON share_set_items(share_set_id);

CREATE INDEX IF NOT EXISTS idx_share_set_items_org_type
ON share_set_items(organization_id, resource_type);

CREATE INDEX IF NOT EXISTS idx_share_set_items_resource
ON share_set_items(resource_id);

DROP TRIGGER IF EXISTS set_share_set_items_updated_at ON share_set_items;
CREATE TRIGGER set_share_set_items_updated_at
  BEFORE UPDATE ON share_set_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS partner_share_set_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  share_set_id UUID NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'edit')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_by TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_share_set_grants_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT partner_share_set_grants_share_set_org_fk
    FOREIGN KEY (share_set_id, organization_id)
    REFERENCES share_sets(id, organization_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_share_set_grants_active_unique
ON partner_share_set_grants(organization_id, partner_organization_id, share_set_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_partner_share_set_grants_org
ON partner_share_set_grants(organization_id);

CREATE INDEX IF NOT EXISTS idx_partner_share_set_grants_partner
ON partner_share_set_grants(partner_organization_id);

CREATE INDEX IF NOT EXISTS idx_partner_share_set_grants_set
ON partner_share_set_grants(share_set_id);

DROP TRIGGER IF EXISTS set_partner_share_set_grants_updated_at ON partner_share_set_grants;
CREATE TRIGGER set_partner_share_set_grants_updated_at
  BEFORE UPDATE ON partner_share_set_grants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE share_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_share_set_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS share_sets_select_policy ON share_sets;
DROP POLICY IF EXISTS share_sets_write_policy ON share_sets;
DROP POLICY IF EXISTS share_set_items_select_policy ON share_set_items;
DROP POLICY IF EXISTS share_set_items_write_policy ON share_set_items;
DROP POLICY IF EXISTS partner_share_set_grants_select_policy ON partner_share_set_grants;
DROP POLICY IF EXISTS partner_share_set_grants_write_policy ON partner_share_set_grants;

CREATE POLICY share_sets_select_policy ON share_sets
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY share_sets_write_policy ON share_sets
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

CREATE POLICY share_set_items_select_policy ON share_set_items
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY share_set_items_write_policy ON share_set_items
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

CREATE POLICY partner_share_set_grants_select_policy ON partner_share_set_grants
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

CREATE POLICY partner_share_set_grants_write_policy ON partner_share_set_grants
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

-- Backfill DAM collections into asset Share Sets for a non-breaking migration path.
INSERT INTO share_sets (
  organization_id,
  module_key,
  name,
  description,
  metadata,
  created_by,
  created_at,
  updated_at
)
SELECT
  dc.organization_id,
  'assets',
  dc.name,
  NULL,
  jsonb_build_object('legacy_collection_id', dc.id),
  dc.created_by,
  dc.created_at,
  dc.updated_at
FROM dam_collections dc
ON CONFLICT (organization_id, module_key, name) DO NOTHING;

INSERT INTO share_set_items (
  share_set_id,
  organization_id,
  resource_type,
  resource_id,
  created_by,
  created_at,
  updated_at
)
SELECT
  ss.id,
  dc.organization_id,
  'asset',
  asset_id,
  dc.created_by,
  NOW(),
  NOW()
FROM dam_collections dc
JOIN share_sets ss
  ON ss.organization_id = dc.organization_id
  AND ss.module_key = 'assets'
  AND ss.name = dc.name
CROSS JOIN LATERAL unnest(COALESCE(dc.asset_ids, '{}'::uuid[])) AS asset_id
ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dam_collections'
      AND column_name = 'folder_ids'
  ) THEN
    EXECUTE $SQL$
      INSERT INTO share_set_items (
        share_set_id,
        organization_id,
        resource_type,
        resource_id,
        created_by,
        created_at,
        updated_at
      )
      SELECT
        ss.id,
        dc.organization_id,
        'folder',
        folder_id,
        dc.created_by,
        NOW(),
        NOW()
      FROM dam_collections dc
      JOIN share_sets ss
        ON ss.organization_id = dc.organization_id
        AND ss.module_key = 'assets'
        AND ss.name = dc.name
      CROSS JOIN LATERAL unnest(COALESCE(dc.folder_ids, '{}'::uuid[])) AS folder_id
      ON CONFLICT (share_set_id, resource_type, resource_id) DO NOTHING
    $SQL$;
  END IF;
END;
$$;

COMMENT ON TABLE share_sets IS
  'Reusable sharing containers by module (assets/products).';

COMMENT ON TABLE share_set_items IS
  'Membership of resources in a share set, optionally constrained by market/channel/locale.';

COMMENT ON TABLE partner_share_set_grants IS
  'Assignments of share sets from a brand organization to a partner organization.';

COMMIT;
