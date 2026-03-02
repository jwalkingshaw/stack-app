BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Documentation requirement rules per family and optional distribution scope
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_family_document_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_family_id UUID NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    destination_id UUID REFERENCES channel_destinations(id) ON DELETE SET NULL,
    locale_id UUID REFERENCES locales(id) ON DELETE SET NULL,
    enforcement_level VARCHAR(20) NOT NULL DEFAULT 'recommended'
        CHECK (enforcement_level IN ('none', 'recommended', 'required')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_product_family_document_rule_scope
    ON product_family_document_rules (
        organization_id,
        product_family_id,
        product_field_id,
        COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(destination_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(locale_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE INDEX IF NOT EXISTS idx_product_family_document_rules_org_family
    ON product_family_document_rules(organization_id, product_family_id);
CREATE INDEX IF NOT EXISTS idx_product_family_document_rules_field
    ON product_family_document_rules(product_field_id);
CREATE INDEX IF NOT EXISTS idx_product_family_document_rules_scope
    ON product_family_document_rules(channel_id, market_id, destination_id, locale_id);
CREATE INDEX IF NOT EXISTS idx_product_family_document_rules_enforcement
    ON product_family_document_rules(enforcement_level, is_active);

DROP TRIGGER IF EXISTS set_product_family_document_rules_updated_at ON product_family_document_rules;
CREATE TRIGGER set_product_family_document_rules_updated_at
    BEFORE UPDATE ON product_family_document_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE product_family_document_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_family_document_rules'
          AND policyname = 'Users can view document rules in their organization'
    ) THEN
        CREATE POLICY "Users can view document rules in their organization" ON product_family_document_rules
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
          AND tablename = 'product_family_document_rules'
          AND policyname = 'Users can manage document rules in their organization'
    ) THEN
        CREATE POLICY "Users can manage document rules in their organization" ON product_family_document_rules
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

-- -----------------------------------------------------------------------------
-- 2) Extend product_asset_links for document-slot and scoped linking
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS product_asset_links
    ADD COLUMN IF NOT EXISTS product_field_id UUID REFERENCES product_fields(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES channel_destinations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS locale_id UUID REFERENCES locales(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS document_slot_code VARCHAR(64),
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS document_expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_product_asset_links_scope
    ON product_asset_links(channel_id, market_id, destination_id, locale_id);
CREATE INDEX IF NOT EXISTS idx_product_asset_links_product_field_id
    ON product_asset_links(product_field_id);
CREATE INDEX IF NOT EXISTS idx_product_asset_links_document_slot_code
    ON product_asset_links(document_slot_code);
CREATE INDEX IF NOT EXISTS idx_product_asset_links_document_expiry_date
    ON product_asset_links(document_expiry_date);

-- -----------------------------------------------------------------------------
-- 3) Seed a system Documentation field group + system document fields
-- -----------------------------------------------------------------------------
INSERT INTO field_groups (organization_id, code, name, description, sort_order, is_active)
SELECT
    o.id,
    'documentation',
    'Documentation',
    'Compliance, legal, and supporting product files',
    60,
    true
FROM organizations o
ON CONFLICT (organization_id, code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = NOW();

WITH ensured_group AS (
    SELECT id, organization_id
    FROM field_groups
    WHERE code = 'documentation'
),
seed_rows AS (
    SELECT
        eg.organization_id,
        'coa_documents'::text AS code,
        'COA Documents'::text AS name,
        'Certificates of Analysis linked from DAM assets.'::text AS description,
        'file'::text AS field_type,
        false AS is_required,
        false AS is_unique,
        false AS is_localizable,
        false AS is_channelable,
        1 AS sort_order,
        '{}'::jsonb AS validation_rules,
        jsonb_build_object(
            'is_system', true,
            'system_key', 'coa_documents',
            'document_slot', 'coa',
            'allow_multiple', true,
            'allowed_mime_groups', jsonb_build_array('pdf', 'document', 'image'),
            'max_size_mb', 50
        ) AS options
    FROM ensured_group eg
    UNION ALL
    SELECT
        eg.organization_id,
        'legal_documents',
        'Legal Documents',
        'Regulatory and legal support documents linked from DAM assets.',
        'file',
        false,
        false,
        false,
        false,
        2,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system', true,
            'system_key', 'legal_documents',
            'document_slot', 'legal',
            'allow_multiple', true,
            'allowed_mime_groups', jsonb_build_array('pdf', 'document', 'image'),
            'max_size_mb', 50
        )
    FROM ensured_group eg
    UNION ALL
    SELECT
        eg.organization_id,
        'sfp_documents',
        'SFP Documents',
        'Supporting formulation and product files linked from DAM assets.',
        'file',
        false,
        false,
        false,
        false,
        3,
        '{}'::jsonb,
        jsonb_build_object(
            'is_system', true,
            'system_key', 'sfp_documents',
            'document_slot', 'sfp',
            'allow_multiple', true,
            'allowed_mime_groups', jsonb_build_array('pdf', 'document', 'image'),
            'max_size_mb', 50
        )
    FROM ensured_group eg
),
upserted_fields AS (
    INSERT INTO product_fields (
        organization_id,
        code,
        name,
        description,
        field_type,
        is_required,
        is_unique,
        is_localizable,
        is_channelable,
        sort_order,
        validation_rules,
        options,
        is_active
    )
    SELECT
        sr.organization_id,
        sr.code,
        sr.name,
        sr.description,
        sr.field_type,
        sr.is_required,
        sr.is_unique,
        sr.is_localizable,
        sr.is_channelable,
        sr.sort_order,
        sr.validation_rules,
        sr.options,
        true
    FROM seed_rows sr
    ON CONFLICT (organization_id, code) DO UPDATE
    SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        field_type = EXCLUDED.field_type,
        is_required = EXCLUDED.is_required,
        is_unique = EXCLUDED.is_unique,
        is_localizable = EXCLUDED.is_localizable,
        is_channelable = EXCLUDED.is_channelable,
        sort_order = EXCLUDED.sort_order,
        validation_rules = EXCLUDED.validation_rules,
        options = EXCLUDED.options,
        is_active = true,
        updated_at = NOW()
    RETURNING id, organization_id, sort_order
)
INSERT INTO product_field_group_assignments (product_field_id, field_group_id, sort_order)
SELECT
    uf.id,
    fg.id,
    uf.sort_order
FROM upserted_fields uf
JOIN field_groups fg
  ON fg.organization_id = uf.organization_id
 AND fg.code = 'documentation'
ON CONFLICT (product_field_id, field_group_id) DO UPDATE
SET
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

COMMIT;
