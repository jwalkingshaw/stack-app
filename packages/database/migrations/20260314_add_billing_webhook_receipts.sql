BEGIN;

CREATE TABLE IF NOT EXISTS billing_webhook_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_webhook_receipts_payload_is_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT billing_webhook_receipts_provider_event_unique UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_receipts_provider_status
  ON billing_webhook_receipts(provider, status, last_attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_receipts_org_received
  ON billing_webhook_receipts(organization_id, received_at DESC);

ALTER TABLE billing_webhook_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'billing_webhook_receipts'
      AND policyname = 'Owners and admins can view billing webhook receipts'
  ) THEN
    CREATE POLICY "Owners and admins can view billing webhook receipts" ON billing_webhook_receipts
      FOR SELECT USING (
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
