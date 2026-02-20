BEGIN;

CREATE TABLE IF NOT EXISTS product_field_markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_product_field_market UNIQUE (product_field_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_product_field_markets_field_id ON product_field_markets(product_field_id);
CREATE INDEX IF NOT EXISTS idx_product_field_markets_market_id ON product_field_markets(market_id);

ALTER TABLE product_field_markets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_field_markets'
          AND policyname = 'Users can view product field markets in their organization'
    ) THEN
        CREATE POLICY "Users can view product field markets in their organization" ON product_field_markets
            FOR SELECT USING (
                product_field_id IN (
                    SELECT pf.id
                    FROM product_fields pf
                    WHERE pf.organization_id IN (
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
          AND tablename = 'product_field_markets'
          AND policyname = 'Users can manage product field markets in their organization'
    ) THEN
        CREATE POLICY "Users can manage product field markets in their organization" ON product_field_markets
            FOR ALL USING (
                product_field_id IN (
                    SELECT pf.id
                    FROM product_fields pf
                    WHERE pf.organization_id IN (
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
