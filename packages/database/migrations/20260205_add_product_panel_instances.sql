-- Migration: Add product panel instances for multi-template facts panels
-- Date: 2026-02-05

BEGIN;

-- Stores panel instances (template + data) under a single product field
CREATE TABLE IF NOT EXISTS product_panel_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES product_table_templates(id) ON DELETE RESTRICT,
    locale VARCHAR(10),
    channel VARCHAR(50),
    sort_order INTEGER NOT NULL DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_product_panel_instance UNIQUE (product_id, product_field_id, template_id, locale, channel)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_product_panel_instances_product_id
    ON product_panel_instances(product_id);
CREATE INDEX IF NOT EXISTS idx_product_panel_instances_field_id
    ON product_panel_instances(product_field_id);
CREATE INDEX IF NOT EXISTS idx_product_panel_instances_template_id
    ON product_panel_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_product_panel_instances_locale
    ON product_panel_instances(locale);
CREATE INDEX IF NOT EXISTS idx_product_panel_instances_channel
    ON product_panel_instances(channel);

-- Keep updated_at in sync
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_product_panel_instances_updated_at'
          AND tgrelid = 'product_panel_instances'::regclass
    ) THEN
        CREATE TRIGGER set_product_panel_instances_updated_at
            BEFORE UPDATE ON product_panel_instances
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- RLS
ALTER TABLE product_panel_instances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_panel_instances'
          AND policyname = 'Users can view product panel instances in their organization'
    ) THEN
        CREATE POLICY "Users can view product panel instances in their organization"
            ON product_panel_instances
            FOR SELECT USING (
                product_id IN (
                    SELECT id FROM products
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
          AND tablename = 'product_panel_instances'
          AND policyname = 'Users can manage product panel instances in their organization'
    ) THEN
        CREATE POLICY "Users can manage product panel instances in their organization"
            ON product_panel_instances
            FOR ALL USING (
                product_id IN (
                    SELECT id FROM products
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
