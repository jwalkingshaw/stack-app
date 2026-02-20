BEGIN;

CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(2) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_market_code_per_org UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS market_locales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_market_locale UNIQUE (market_id, locale_id)
);

CREATE INDEX IF NOT EXISTS idx_markets_org_id ON markets(organization_id);
CREATE INDEX IF NOT EXISTS idx_markets_code ON markets(code);
CREATE INDEX IF NOT EXISTS idx_market_locales_market_id ON market_locales(market_id);
CREATE INDEX IF NOT EXISTS idx_market_locales_locale_id ON market_locales(locale_id);

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_locales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'markets'
          AND policyname = 'Users can view markets in their organization'
    ) THEN
        CREATE POLICY "Users can view markets in their organization" ON markets
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
          AND tablename = 'markets'
          AND policyname = 'Users can manage markets in their organization'
    ) THEN
        CREATE POLICY "Users can manage markets in their organization" ON markets
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
          AND tablename = 'market_locales'
          AND policyname = 'Users can view market locales in their organization'
    ) THEN
        CREATE POLICY "Users can view market locales in their organization" ON market_locales
            FOR SELECT USING (
                market_id IN (
                    SELECT id FROM markets
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
          AND tablename = 'market_locales'
          AND policyname = 'Users can manage market locales in their organization'
    ) THEN
        CREATE POLICY "Users can manage market locales in their organization" ON market_locales
            FOR ALL USING (
                market_id IN (
                    SELECT id FROM markets
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

COMMIT;
