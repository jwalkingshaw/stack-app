BEGIN;

CREATE TABLE IF NOT EXISTS share_set_dynamic_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  share_set_id UUID NOT NULL,
  name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  include_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  include_folder_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  include_usage_group_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  exclude_tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  exclude_folder_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT share_set_dynamic_rules_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT share_set_dynamic_rules_has_include_condition
    CHECK (
      cardinality(include_tags) > 0
      OR cardinality(include_folder_ids) > 0
      OR cardinality(include_usage_group_ids) > 0
    ),
  CONSTRAINT share_set_dynamic_rules_share_set_org_fk
    FOREIGN KEY (share_set_id, organization_id)
    REFERENCES share_sets(id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_org_active_priority
ON share_set_dynamic_rules(organization_id, is_active, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_share_set
ON share_set_dynamic_rules(share_set_id);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_include_tags
ON share_set_dynamic_rules USING GIN (include_tags);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_include_folder_ids
ON share_set_dynamic_rules USING GIN (include_folder_ids);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_include_usage_group_ids
ON share_set_dynamic_rules USING GIN (include_usage_group_ids);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_exclude_tags
ON share_set_dynamic_rules USING GIN (exclude_tags);

CREATE INDEX IF NOT EXISTS idx_share_set_dynamic_rules_exclude_folder_ids
ON share_set_dynamic_rules USING GIN (exclude_folder_ids);

DROP TRIGGER IF EXISTS set_share_set_dynamic_rules_updated_at ON share_set_dynamic_rules;
CREATE TRIGGER set_share_set_dynamic_rules_updated_at
  BEFORE UPDATE ON share_set_dynamic_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE share_set_dynamic_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS share_set_dynamic_rules_select_policy ON share_set_dynamic_rules;
DROP POLICY IF EXISTS share_set_dynamic_rules_write_policy ON share_set_dynamic_rules;

CREATE POLICY share_set_dynamic_rules_select_policy ON share_set_dynamic_rules
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY share_set_dynamic_rules_write_policy ON share_set_dynamic_rules
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

COMMENT ON TABLE share_set_dynamic_rules IS
  'Dynamic include/exclude rules that auto-assign uploaded assets to share sets.';

COMMIT;

