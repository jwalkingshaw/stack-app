BEGIN;

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL CHECK (monthly_price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  is_custom BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_plans_limits_is_object CHECK (jsonb_typeof(limits) = 'object')
);

CREATE TABLE IF NOT EXISTS billing_addons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL CHECK (monthly_price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  increments JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_addons_increments_is_object CHECK (jsonb_typeof(increments) = 'object')
);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  status TEXT NOT NULL CHECK (
    status IN (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired'
    )
  ),
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  provider TEXT NOT NULL DEFAULT 'kinde',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_subscription_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES organization_subscriptions(id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL REFERENCES billing_addons(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled_cancel', 'canceled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_usage_daily (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  active_sku_peak INTEGER NOT NULL DEFAULT 0 CHECK (active_sku_peak >= 0),
  total_sku_count INTEGER NOT NULL DEFAULT 0 CHECK (total_sku_count >= 0),
  storage_gb NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (storage_gb >= 0),
  delivery_bandwidth_gb NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (delivery_bandwidth_gb >= 0),
  internal_user_count INTEGER NOT NULL DEFAULT 0 CHECK (internal_user_count >= 0),
  external_partner_invite_count INTEGER NOT NULL DEFAULT 0 CHECK (external_partner_invite_count >= 0),
  source TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, usage_date)
);

CREATE TABLE IF NOT EXISTS organization_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_billing_events_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_status
  ON organization_subscriptions(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_provider_sub_id
  ON organization_subscriptions(provider, provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_subscription_addons_org_status
  ON organization_subscription_addons(organization_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_subscription_addons_active_unique
  ON organization_subscription_addons(organization_id, subscription_id, addon_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_org_usage_daily_date
  ON organization_usage_daily(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_org_billing_events_org_occurred
  ON organization_billing_events(organization_id, occurred_at DESC);

INSERT INTO billing_plans (id, name, monthly_price_cents, currency, is_custom, sort_order, limits)
VALUES
  (
    'free',
    'Free (Sandbox)',
    0,
    'USD',
    false,
    5,
    jsonb_build_object(
      'activeSkuCount', 10,
      'storageGb', 2,
      'deliveryBandwidthGb', 4,
      'internalUserCount', 1,
      'partnerInviteCount', 2,
      'deeplTotalCharCount', 0
    )
  ),
  (
    'starter',
    'Starter',
    4900,
    'USD',
    false,
    10,
    jsonb_build_object(
      'activeSkuCount', 50,
      'storageGb', 15,
      'deliveryBandwidthGb', 25,
      'internalUserCount', 2,
      'partnerInviteCount', 10,
      'deeplTotalCharCount', 750000
    )
  ),
  (
    'growth',
    'Growth',
    12900,
    'USD',
    false,
    20,
    jsonb_build_object(
      'activeSkuCount', 500,
      'storageGb', 100,
      'deliveryBandwidthGb', 200,
      'internalUserCount', 8,
      'partnerInviteCount', 100,
      'deeplTotalCharCount', 3000000
    )
  ),
  (
    'scale',
    'Scale',
    29900,
    'USD',
    false,
    30,
    jsonb_build_object(
      'activeSkuCount', 2500,
      'storageGb', 500,
      'deliveryBandwidthGb', 1000,
      'internalUserCount', 2147483647,
      'partnerInviteCount', 2147483647,
      'deeplTotalCharCount', 12000000
    )
  ),
  (
    'enterprise',
    'Enterprise',
    0,
    'USD',
    true,
    40,
    jsonb_build_object(
      'activeSkuCount', 2147483647,
      'storageGb', 2147483647,
      'deliveryBandwidthGb', 2147483647,
      'internalUserCount', 2147483647,
      'partnerInviteCount', 2147483647,
      'deeplTotalCharCount', 2147483647
    )
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  is_custom = EXCLUDED.is_custom,
  sort_order = EXCLUDED.sort_order,
  limits = EXCLUDED.limits,
  is_active = true,
  updated_at = NOW();

INSERT INTO billing_addons (id, name, monthly_price_cents, currency, increments)
VALUES
  (
    'sku_pack_3000',
    'SKU Pack (+3,000 active SKUs)',
    4900,
    'USD',
    jsonb_build_object('activeSkuCount', 3000)
  ),
  (
    'storage_pack_100gb',
    'Storage Pack (+100 GB)',
    1500,
    'USD',
    jsonb_build_object('storageGb', 100)
  ),
  (
    'delivery_pack_500gb',
    'Delivery Pack (+500 GB)',
    7900,
    'USD',
    jsonb_build_object('deliveryBandwidthGb', 500)
  ),
  (
    'seat_pack_5',
    'Seat Pack (+5 internal users)',
    2000,
    'USD',
    jsonb_build_object('internalUserCount', 5)
  ),
  (
    'partner_invite_pack_100',
    'Partner Invite Pack (+100)',
    1500,
    'USD',
    jsonb_build_object('partnerInviteCount', 100)
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  currency = EXCLUDED.currency,
  increments = EXCLUDED.increments,
  is_active = true,
  updated_at = NOW();

ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS discontinued_at TIMESTAMPTZ;

UPDATE products
SET discontinued_at = COALESCE(discontinued_at, updated_at, created_at, NOW())
WHERE status = 'Discontinued'
  AND discontinued_at IS NULL;

CREATE OR REPLACE FUNCTION sync_products_discontinued_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Discontinued' AND COALESCE(OLD.status, '') <> 'Discontinued' THEN
    IF NEW.discontinued_at IS NULL THEN
      NEW.discontinued_at := NOW();
    END IF;
  ELSIF NEW.status <> 'Discontinued' AND COALESCE(OLD.status, '') = 'Discontinued' THEN
    NEW.discontinued_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_products_discontinued_at ON products;
CREATE TRIGGER set_products_discontinued_at
  BEFORE INSERT OR UPDATE OF status ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_products_discontinued_at();

ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscription_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_billing_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_subscriptions'
      AND policyname = 'Users can view subscriptions in their organization'
  ) THEN
    CREATE POLICY "Users can view subscriptions in their organization" ON organization_subscriptions
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
      AND tablename = 'organization_subscriptions'
      AND policyname = 'Owners and admins can manage subscriptions'
  ) THEN
    CREATE POLICY "Owners and admins can manage subscriptions" ON organization_subscriptions
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_subscription_addons'
      AND policyname = 'Users can view add-ons in their organization'
  ) THEN
    CREATE POLICY "Users can view add-ons in their organization" ON organization_subscription_addons
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
      AND tablename = 'organization_subscription_addons'
      AND policyname = 'Owners and admins can manage add-ons'
  ) THEN
    CREATE POLICY "Owners and admins can manage add-ons" ON organization_subscription_addons
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_usage_daily'
      AND policyname = 'Users can view usage in their organization'
  ) THEN
    CREATE POLICY "Users can view usage in their organization" ON organization_usage_daily
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
      AND tablename = 'organization_usage_daily'
      AND policyname = 'Owners and admins can manage usage'
  ) THEN
    CREATE POLICY "Owners and admins can manage usage" ON organization_usage_daily
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_billing_events'
      AND policyname = 'Users can view billing events in their organization'
  ) THEN
    CREATE POLICY "Users can view billing events in their organization" ON organization_billing_events
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
      AND tablename = 'organization_billing_events'
      AND policyname = 'Owners and admins can manage billing events'
  ) THEN
    CREATE POLICY "Owners and admins can manage billing events" ON organization_billing_events
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
