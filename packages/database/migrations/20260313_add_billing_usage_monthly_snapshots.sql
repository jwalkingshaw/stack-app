BEGIN;

CREATE TABLE IF NOT EXISTS organization_usage_monthly_snapshots (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  active_sku_peak INTEGER NOT NULL DEFAULT 0 CHECK (active_sku_peak >= 0),
  total_sku_count_peak INTEGER NOT NULL DEFAULT 0 CHECK (total_sku_count_peak >= 0),
  storage_gb_peak NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (storage_gb_peak >= 0),
  delivery_bandwidth_gb_total NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (delivery_bandwidth_gb_total >= 0),
  internal_user_peak INTEGER NOT NULL DEFAULT 0 CHECK (internal_user_peak >= 0),
  external_partner_invite_peak INTEGER NOT NULL DEFAULT 0 CHECK (external_partner_invite_peak >= 0),
  source TEXT NOT NULL DEFAULT 'system',
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, period_start),
  CONSTRAINT organization_usage_monthly_snapshots_period_window_check
    CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_org_usage_monthly_period_start
  ON organization_usage_monthly_snapshots(period_start DESC);

ALTER TABLE organization_usage_monthly_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_usage_monthly_snapshots'
      AND policyname = 'Users can view monthly usage snapshots in their organization'
  ) THEN
    CREATE POLICY "Users can view monthly usage snapshots in their organization" ON organization_usage_monthly_snapshots
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id
          FROM organization_members
          WHERE kinde_user_id = current_setting('app.current_user_id', true)
            AND status = 'active'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_usage_monthly_snapshots'
      AND policyname = 'Owners and admins can manage monthly usage snapshots'
  ) THEN
    CREATE POLICY "Owners and admins can manage monthly usage snapshots" ON organization_usage_monthly_snapshots
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id
          FROM organization_members
          WHERE kinde_user_id = current_setting('app.current_user_id', true)
            AND role IN ('owner', 'admin')
            AND status = 'active'
        )
      );
  END IF;
END $$;

COMMIT;
