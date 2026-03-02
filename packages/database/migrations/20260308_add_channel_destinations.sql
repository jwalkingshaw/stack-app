BEGIN;

CREATE TABLE IF NOT EXISTS channel_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_channel_destination_code_per_org UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_channel_destinations_org_id
    ON channel_destinations(organization_id);
CREATE INDEX IF NOT EXISTS idx_channel_destinations_channel_id
    ON channel_destinations(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_destinations_market_id
    ON channel_destinations(market_id);
CREATE INDEX IF NOT EXISTS idx_channel_destinations_code
    ON channel_destinations(code);

ALTER TABLE channel_destinations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'channel_destinations'
          AND policyname = 'Users can view channel destinations in their organization'
    ) THEN
        CREATE POLICY "Users can view channel destinations in their organization" ON channel_destinations
            FOR SELECT USING (
                organization_id IN (
                    SELECT organization_id FROM organization_members
                    WHERE kinde_user_id = current_setting('app.current_user_id', true)
                      AND status = 'active'
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'channel_destinations'
          AND policyname = 'Users can manage channel destinations in their organization'
    ) THEN
        CREATE POLICY "Users can manage channel destinations in their organization" ON channel_destinations
            FOR ALL USING (
                organization_id IN (
                    SELECT organization_id FROM organization_members
                    WHERE kinde_user_id = current_setting('app.current_user_id', true)
                      AND role IN ('owner', 'admin', 'member')
                      AND status = 'active'
                )
            );
    END IF;
END $$;

-- Seed one destination per channel for backward compatibility.
INSERT INTO channel_destinations (
    organization_id,
    channel_id,
    code,
    name,
    description,
    sort_order
)
SELECT
    c.organization_id,
    c.id,
    c.code,
    c.name,
    'Seeded from existing channel',
    0
FROM channels c
ON CONFLICT ON CONSTRAINT unique_channel_destination_code_per_org DO NOTHING;

COMMIT;
