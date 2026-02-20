BEGIN;

CREATE TABLE IF NOT EXISTS product_field_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_product_field_channel UNIQUE (product_field_id, channel_id)
);

CREATE TABLE IF NOT EXISTS product_field_locales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    locale_id UUID NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_product_field_locale UNIQUE (product_field_id, locale_id)
);

CREATE INDEX IF NOT EXISTS idx_product_field_channels_field_id ON product_field_channels(product_field_id);
CREATE INDEX IF NOT EXISTS idx_product_field_channels_channel_id ON product_field_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_product_field_locales_field_id ON product_field_locales(product_field_id);
CREATE INDEX IF NOT EXISTS idx_product_field_locales_locale_id ON product_field_locales(locale_id);

ALTER TABLE product_field_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_field_locales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_field_channels'
          AND policyname = 'Users can view product field channels in their organization'
    ) THEN
        CREATE POLICY "Users can view product field channels in their organization" ON product_field_channels
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
          AND tablename = 'product_field_channels'
          AND policyname = 'Users can manage product field channels in their organization'
    ) THEN
        CREATE POLICY "Users can manage product field channels in their organization" ON product_field_channels
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_field_locales'
          AND policyname = 'Users can view product field locales in their organization'
    ) THEN
        CREATE POLICY "Users can view product field locales in their organization" ON product_field_locales
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
          AND tablename = 'product_field_locales'
          AND policyname = 'Users can manage product field locales in their organization'
    ) THEN
        CREATE POLICY "Users can manage product field locales in their organization" ON product_field_locales
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
