BEGIN;

-- Channels (market destinations)
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_channel_code_per_org UNIQUE (organization_id, code)
);

-- Locales (market languages)
CREATE TABLE IF NOT EXISTS locales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_locale_code_per_org UNIQUE (organization_id, code)
);

-- Channel-Locales availability
CREATE TABLE IF NOT EXISTS channel_locales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_channel_locale UNIQUE (channel_id, locale_id)
);

CREATE INDEX IF NOT EXISTS idx_channels_org_id ON channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_channels_code ON channels(code);
CREATE INDEX IF NOT EXISTS idx_locales_org_id ON locales(organization_id);
CREATE INDEX IF NOT EXISTS idx_locales_code ON locales(code);
CREATE INDEX IF NOT EXISTS idx_channel_locales_channel_id ON channel_locales(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_locales_locale_id ON channel_locales(locale_id);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_locales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'channels'
          AND policyname = 'Users can view channels in their organization'
    ) THEN
        CREATE POLICY "Users can view channels in their organization" ON channels
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
          AND tablename = 'channels'
          AND policyname = 'Users can manage channels in their organization'
    ) THEN
        CREATE POLICY "Users can manage channels in their organization" ON channels
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'locales'
          AND policyname = 'Users can view locales in their organization'
    ) THEN
        CREATE POLICY "Users can view locales in their organization" ON locales
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
          AND tablename = 'locales'
          AND policyname = 'Users can manage locales in their organization'
    ) THEN
        CREATE POLICY "Users can manage locales in their organization" ON locales
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'channel_locales'
          AND policyname = 'Users can view channel locales in their organization'
    ) THEN
        CREATE POLICY "Users can view channel locales in their organization" ON channel_locales
            FOR SELECT USING (
                channel_id IN (
                    SELECT id FROM channels
                    WHERE organization_id IN (
                        SELECT organization_id FROM organization_members
                        WHERE kinde_user_id = current_setting('app.current_user_id', true)
                        AND status = 'active'
                    )
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'channel_locales'
          AND policyname = 'Users can manage channel locales in their organization'
    ) THEN
        CREATE POLICY "Users can manage channel locales in their organization" ON channel_locales
            FOR ALL USING (
                channel_id IN (
                    SELECT id FROM channels
                    WHERE organization_id IN (
                        SELECT organization_id FROM organization_members
                        WHERE kinde_user_id = current_setting('app.current_user_id', true)
                        AND role IN ('owner', 'admin', 'member')
                        AND status = 'active'
                    )
                )
            );
    END IF;
END $$;

-- Seed default channels
INSERT INTO channels (organization_id, code, name)
SELECT
    id AS organization_id,
    'ecommerce' AS code,
    'Ecommerce' AS name
FROM organizations
ON CONFLICT ON CONSTRAINT unique_channel_code_per_org DO NOTHING;

INSERT INTO channels (organization_id, code, name)
SELECT
    id AS organization_id,
    'mobile' AS code,
    'Mobile' AS name
FROM organizations
ON CONFLICT ON CONSTRAINT unique_channel_code_per_org DO NOTHING;

INSERT INTO channels (organization_id, code, name)
SELECT
    id AS organization_id,
    'print' AS code,
    'Print' AS name
FROM organizations
ON CONFLICT ON CONSTRAINT unique_channel_code_per_org DO NOTHING;

INSERT INTO channels (organization_id, code, name)
SELECT
    id AS organization_id,
    'amazon' AS code,
    'Amazon' AS name
FROM organizations
ON CONFLICT ON CONSTRAINT unique_channel_code_per_org DO NOTHING;

-- Locales are intentionally not seeded.
-- Use the Markets settings UI to add locales and assign them to channels.

COMMIT;
