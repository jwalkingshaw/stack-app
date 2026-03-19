BEGIN;

CREATE TABLE IF NOT EXISTS partner_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'archived', 'canceled')),
  event_label TEXT,
  labels TEXT[] NOT NULL DEFAULT '{}'::text[],
  message_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_updates_message_json_is_object CHECK (jsonb_typeof(message_json) = 'object'),
  CONSTRAINT partner_updates_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_updates_id_org_unique
ON partner_updates(id, organization_id);

CREATE INDEX IF NOT EXISTS idx_partner_updates_org_status_published
ON partner_updates(organization_id, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_updates_org_urgency_due
ON partner_updates(organization_id, urgency, due_at);

CREATE INDEX IF NOT EXISTS idx_partner_updates_org_updated
ON partner_updates(organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_updates_labels_gin
ON partner_updates USING GIN(labels);

DROP TRIGGER IF EXISTS set_partner_updates_updated_at ON partner_updates;
CREATE TRIGGER set_partner_updates_updated_at
  BEFORE UPDATE ON partner_updates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS partner_update_kit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_update_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'asset', 'url', 'text')),
  product_id UUID REFERENCES products(id),
  asset_id UUID REFERENCES dam_assets(id),
  url TEXT,
  title TEXT,
  description TEXT,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 100,
  market_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  channel_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  locale_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_update_kit_items_content_json_is_object CHECK (jsonb_typeof(content_json) = 'object'),
  CONSTRAINT partner_update_kit_items_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT partner_update_kit_items_update_org_fk
    FOREIGN KEY (partner_update_id, organization_id)
    REFERENCES partner_updates(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT partner_update_kit_items_type_payload_ck CHECK (
    (item_type = 'product' AND product_id IS NOT NULL AND asset_id IS NULL AND url IS NULL)
    OR (item_type = 'asset' AND asset_id IS NOT NULL AND product_id IS NULL AND url IS NULL)
    OR (item_type = 'url' AND url IS NOT NULL AND length(btrim(url)) > 0 AND product_id IS NULL AND asset_id IS NULL)
    OR (item_type = 'text' AND product_id IS NULL AND asset_id IS NULL AND url IS NULL AND content_json <> '{}'::jsonb)
  )
);

CREATE INDEX IF NOT EXISTS idx_partner_update_kit_items_update_sort
ON partner_update_kit_items(organization_id, partner_update_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_partner_update_kit_items_product
ON partner_update_kit_items(organization_id, product_id)
WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_update_kit_items_asset
ON partner_update_kit_items(organization_id, asset_id)
WHERE asset_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_partner_update_kit_items_updated_at ON partner_update_kit_items;
CREATE TRIGGER set_partner_update_kit_items_updated_at
  BEFORE UPDATE ON partner_update_kit_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS partner_update_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_update_id UUID NOT NULL,
  partner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delivery_channels TEXT[] NOT NULL DEFAULT '{in_app,email}'::text[],
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'notified', 'opened', 'acknowledged', 'activated', 'failed', 'muted')),
  first_notified_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_update_recipients_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT partner_update_recipients_update_org_fk
    FOREIGN KEY (partner_update_id, organization_id)
    REFERENCES partner_updates(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT partner_update_recipients_unique_partner UNIQUE (partner_update_id, partner_organization_id),
  CONSTRAINT partner_update_recipients_channels_ck
    CHECK (
      cardinality(delivery_channels) > 0
      AND delivery_channels <@ ARRAY['in_app', 'email', 'sms']::text[]
    )
);

CREATE INDEX IF NOT EXISTS idx_partner_update_recipients_update_status
ON partner_update_recipients(organization_id, partner_update_id, status);

CREATE INDEX IF NOT EXISTS idx_partner_update_recipients_partner_updated
ON partner_update_recipients(organization_id, partner_organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_update_recipients_due_status
ON partner_update_recipients(organization_id, due_at, status);

DROP TRIGGER IF EXISTS set_partner_update_recipients_updated_at ON partner_update_recipients;
CREATE TRIGGER set_partner_update_recipients_updated_at
  BEFORE UPDATE ON partner_update_recipients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS partner_update_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_update_id UUID NOT NULL,
  partner_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_update_activity_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT partner_update_activity_update_org_fk
    FOREIGN KEY (partner_update_id, organization_id)
    REFERENCES partner_updates(id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_partner_update_activity_update_event_at
ON partner_update_activity(organization_id, partner_update_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_update_activity_partner_event_at
ON partner_update_activity(organization_id, partner_organization_id, event_at DESC)
WHERE partner_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_update_activity_event_type_event_at
ON partner_update_activity(organization_id, event_type, event_at DESC);

CREATE TABLE IF NOT EXISTS partner_message_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'brand')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  status TEXT NOT NULL CHECK (status IN ('opted_in', 'opted_out')),
  consent_source TEXT NOT NULL CHECK (consent_source IN ('onboarding', 'settings', 'support')),
  consent_text_version TEXT,
  consented_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_message_preferences_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT partner_message_preferences_scope_ck CHECK (
    (scope_type = 'global' AND brand_organization_id IS NULL)
    OR (scope_type = 'brand' AND brand_organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_message_preferences_global_unique
ON partner_message_preferences(partner_organization_id, channel)
WHERE scope_type = 'global' AND brand_organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_message_preferences_brand_unique
ON partner_message_preferences(partner_organization_id, brand_organization_id, channel)
WHERE scope_type = 'brand' AND brand_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_message_preferences_partner_scope
ON partner_message_preferences(partner_organization_id, scope_type, channel);

CREATE INDEX IF NOT EXISTS idx_partner_message_preferences_brand_scope
ON partner_message_preferences(brand_organization_id, channel)
WHERE brand_organization_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_partner_message_preferences_updated_at ON partner_message_preferences;
CREATE TRIGGER set_partner_message_preferences_updated_at
  BEFORE UPDATE ON partner_message_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE partner_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_update_kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_update_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_update_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_message_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_updates_select_policy ON partner_updates;
DROP POLICY IF EXISTS partner_updates_write_policy ON partner_updates;
DROP POLICY IF EXISTS partner_update_kit_items_select_policy ON partner_update_kit_items;
DROP POLICY IF EXISTS partner_update_kit_items_write_policy ON partner_update_kit_items;
DROP POLICY IF EXISTS partner_update_recipients_select_policy ON partner_update_recipients;
DROP POLICY IF EXISTS partner_update_recipients_write_policy ON partner_update_recipients;
DROP POLICY IF EXISTS partner_update_activity_select_policy ON partner_update_activity;
DROP POLICY IF EXISTS partner_update_activity_write_policy ON partner_update_activity;
DROP POLICY IF EXISTS partner_message_preferences_select_policy ON partner_message_preferences;
DROP POLICY IF EXISTS partner_message_preferences_write_policy ON partner_message_preferences;

CREATE POLICY partner_updates_select_policy ON partner_updates
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY partner_updates_write_policy ON partner_updates
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

CREATE POLICY partner_update_kit_items_select_policy ON partner_update_kit_items
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
  );

CREATE POLICY partner_update_kit_items_write_policy ON partner_update_kit_items
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

CREATE POLICY partner_update_recipients_select_policy ON partner_update_recipients
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

CREATE POLICY partner_update_recipients_write_policy ON partner_update_recipients
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

CREATE POLICY partner_update_activity_select_policy ON partner_update_activity
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

CREATE POLICY partner_update_activity_write_policy ON partner_update_activity
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

CREATE POLICY partner_message_preferences_select_policy ON partner_message_preferences
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR partner_organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND status = 'active'
    )
    OR (
      brand_organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE kinde_user_id = current_setting('app.current_user_id', true)
          AND status = 'active'
      )
      AND scope_type = 'brand'
    )
  );

CREATE POLICY partner_message_preferences_write_policy ON partner_message_preferences
  FOR ALL USING (
    auth.role() = 'service_role'
    OR partner_organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR partner_organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE kinde_user_id = current_setting('app.current_user_id', true)
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

COMMENT ON TABLE partner_updates IS
  'Brand-authored updates shared to partners. Supports announcement-only and kit-backed updates.';

COMMENT ON TABLE partner_update_kit_items IS
  'Kit content references for an update. References existing product/asset records, no duplicated files.';

COMMENT ON TABLE partner_update_recipients IS
  'Resolved partner recipients and delivery/action state for each published update.';

COMMENT ON TABLE partner_update_activity IS
  'Append-only activity events for partner update delivery, engagement, and activation.';

COMMENT ON TABLE partner_message_preferences IS
  'Partner messaging consent preferences by channel, globally and per brand.';

COMMIT;
