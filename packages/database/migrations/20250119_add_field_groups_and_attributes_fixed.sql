-- Field Groups (Akeneo-style attribute groups)
CREATE TABLE IF NOT EXISTS field_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_field_group_code_per_org UNIQUE (organization_id, code)
);

-- Product Fields/Attributes (following Akeneo's attribute structure)
CREATE TABLE IF NOT EXISTS product_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    field_group_id UUID REFERENCES field_groups(id) ON DELETE SET NULL,
    code VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    field_type VARCHAR(50) NOT NULL CHECK (field_type IN (
        'text', 'textarea', 'number', 'decimal', 'boolean', 'date', 'datetime',
        'select', 'multiselect', 'file', 'image', 'url', 'price', 'measurement', 'table'
    )),
    is_required BOOLEAN NOT NULL DEFAULT false,
    is_unique BOOLEAN NOT NULL DEFAULT false,
    is_localizable BOOLEAN NOT NULL DEFAULT false,
    is_channelable BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 1,
    default_value TEXT,
    validation_rules JSONB DEFAULT '{}',
    options JSONB DEFAULT '{}', -- For select/multiselect options
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_field_code_per_org UNIQUE (organization_id, code)
);

-- Product Family Field Groups (many-to-many relationship)
CREATE TABLE IF NOT EXISTS product_family_field_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_family_id UUID NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
    field_group_id UUID NOT NULL REFERENCES field_groups(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_family_field_group UNIQUE (product_family_id, field_group_id)
);

-- Product Field Values (stores actual field values for products)
CREATE TABLE IF NOT EXISTS product_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_field_id UUID NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    value_text TEXT,
    value_number DECIMAL,
    value_boolean BOOLEAN,
    value_date DATE,
    value_datetime TIMESTAMP WITH TIME ZONE,
    value_json JSONB, -- For complex values like arrays, objects
    locale VARCHAR(10), -- For localizable fields
    channel VARCHAR(50), -- For channel-specific fields (channel, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_product_field_locale_channel UNIQUE (product_id, product_field_id, locale, channel)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_field_groups_organization_id ON field_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_field_groups_code ON field_groups(code);
CREATE INDEX IF NOT EXISTS idx_field_groups_sort_order ON field_groups(sort_order);

CREATE INDEX IF NOT EXISTS idx_product_fields_organization_id ON product_fields(organization_id);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_fields'
          AND column_name = 'field_group_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_product_fields_field_group_id ON product_fields(field_group_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_product_fields_code ON product_fields(code);
CREATE INDEX IF NOT EXISTS idx_product_fields_type ON product_fields(field_type);

CREATE INDEX IF NOT EXISTS idx_product_family_field_groups_family_id ON product_family_field_groups(product_family_id);
CREATE INDEX IF NOT EXISTS idx_product_family_field_groups_field_group_id ON product_family_field_groups(field_group_id);

CREATE INDEX IF NOT EXISTS idx_product_field_values_product_id ON product_field_values(product_id);
CREATE INDEX IF NOT EXISTS idx_product_field_values_field_id ON product_field_values(product_field_id);
CREATE INDEX IF NOT EXISTS idx_product_field_values_locale ON product_field_values(locale);
CREATE INDEX IF NOT EXISTS idx_product_field_values_channel ON product_field_values(channel);

-- RLS Policies
ALTER TABLE field_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_family_field_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_field_values ENABLE ROW LEVEL SECURITY;

-- Field Groups RLS (using organization_members instead of user_organizations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'field_groups'
          AND policyname = 'Users can view field groups in their organization'
    ) THEN
        CREATE POLICY "Users can view field groups in their organization" ON field_groups
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
          AND tablename = 'field_groups'
          AND policyname = 'Users can create field groups in their organization'
    ) THEN
        CREATE POLICY "Users can create field groups in their organization" ON field_groups
            FOR INSERT WITH CHECK (
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
          AND tablename = 'field_groups'
          AND policyname = 'Users can update field groups in their organization'
    ) THEN
        CREATE POLICY "Users can update field groups in their organization" ON field_groups
            FOR UPDATE USING (
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
          AND tablename = 'field_groups'
          AND policyname = 'Users can delete field groups in their organization'
    ) THEN
        CREATE POLICY "Users can delete field groups in their organization" ON field_groups
            FOR DELETE USING (
                organization_id IN (
                    SELECT organization_id FROM organization_members
                    WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND role IN ('owner', 'admin')
                    AND status = 'active'
                )
            );
    END IF;
END $$;

-- Product Fields RLS (using organization_members instead of user_organizations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_fields'
          AND policyname = 'Users can view product fields in their organization'
    ) THEN
        CREATE POLICY "Users can view product fields in their organization" ON product_fields
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
          AND tablename = 'product_fields'
          AND policyname = 'Users can create product fields in their organization'
    ) THEN
        CREATE POLICY "Users can create product fields in their organization" ON product_fields
            FOR INSERT WITH CHECK (
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
          AND tablename = 'product_fields'
          AND policyname = 'Users can update product fields in their organization'
    ) THEN
        CREATE POLICY "Users can update product fields in their organization" ON product_fields
            FOR UPDATE USING (
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
          AND tablename = 'product_fields'
          AND policyname = 'Users can delete product fields in their organization'
    ) THEN
        CREATE POLICY "Users can delete product fields in their organization" ON product_fields
            FOR DELETE USING (
                organization_id IN (
                    SELECT organization_id FROM organization_members
                    WHERE kinde_user_id = current_setting('app.current_user_id', true)
                    AND role IN ('owner', 'admin')
                    AND status = 'active'
                )
            );
    END IF;
END $$;

-- Product Family Field Groups RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_family_field_groups'
          AND policyname = 'Users can view family field groups in their organization'
    ) THEN
        CREATE POLICY "Users can view family field groups in their organization" ON product_family_field_groups
            FOR SELECT USING (
                product_family_id IN (
                    SELECT id FROM product_families
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
          AND tablename = 'product_family_field_groups'
          AND policyname = 'Users can manage family field groups in their organization'
    ) THEN
        CREATE POLICY "Users can manage family field groups in their organization" ON product_family_field_groups
            FOR ALL USING (
                product_family_id IN (
                    SELECT id FROM product_families
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

-- Product Field Values RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_field_values'
          AND policyname = 'Users can view product field values in their organization'
    ) THEN
        CREATE POLICY "Users can view product field values in their organization" ON product_field_values
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
          AND tablename = 'product_field_values'
          AND policyname = 'Users can manage product field values in their organization'
    ) THEN
        CREATE POLICY "Users can manage product field values in their organization" ON product_field_values
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

-- Insert some default field groups for organizations
INSERT INTO field_groups (organization_id, code, name, description, sort_order)
SELECT
    id as organization_id,
    'basic_info' as code,
    'Basic Information' as name,
    'Essential product details and identifiers' as description,
    1 as sort_order
FROM organizations
ON CONFLICT ON CONSTRAINT unique_field_group_code_per_org DO NOTHING;

INSERT INTO field_groups (organization_id, code, name, description, sort_order)
SELECT
    id as organization_id,
    'marketing' as code,
    'Marketing' as name,
    'Marketing and promotional content' as description,
    2 as sort_order
FROM organizations
ON CONFLICT ON CONSTRAINT unique_field_group_code_per_org DO NOTHING;

INSERT INTO field_groups (organization_id, code, name, description, sort_order)
SELECT
    id as organization_id,
    'technical' as code,
    'Technical Specifications' as name,
    'Technical details and specifications' as description,
    3 as sort_order
FROM organizations
ON CONFLICT ON CONSTRAINT unique_field_group_code_per_org DO NOTHING;

INSERT INTO field_groups (organization_id, code, name, description, sort_order)
SELECT
    id as organization_id,
    'compliance' as code,
    'Compliance' as name,
    'Legal and regulatory information' as description,
    4 as sort_order
FROM organizations
ON CONFLICT ON CONSTRAINT unique_field_group_code_per_org DO NOTHING;

-- Insert some default product fields
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_fields'
          AND column_name = 'field_group_id'
    ) THEN
        INSERT INTO product_fields (organization_id, field_group_id, code, name, field_type, is_required, sort_order)
        SELECT
            fg.organization_id,
            fg.id as field_group_id,
            'ean' as code,
            'EAN' as name,
            'text' as field_type,
            false as is_required,
            1 as sort_order
        FROM field_groups fg
        WHERE fg.code = 'basic_info'
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, field_group_id, code, name, field_type, is_required, sort_order)
        SELECT
            fg.organization_id,
            fg.id as field_group_id,
            'mpn' as code,
            'Manufacturer Part Number' as name,
            'text' as field_type,
            false as is_required,
            2 as sort_order
        FROM field_groups fg
        WHERE fg.code = 'basic_info'
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, field_group_id, code, name, field_type, is_required, sort_order)
        SELECT
            fg.organization_id,
            fg.id as field_group_id,
            'brand' as code,
            'Brand' as name,
            'text' as field_type,
            true as is_required,
            3 as sort_order
        FROM field_groups fg
        WHERE fg.code = 'basic_info'
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, field_group_id, code, name, field_type, is_required, sort_order)
        SELECT
            fg.organization_id,
            fg.id as field_group_id,
            'weight' as code,
            'Weight (kg)' as name,
            'decimal' as field_type,
            false as is_required,
            1 as sort_order
        FROM field_groups fg
        WHERE fg.code = 'technical'
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, field_group_id, code, name, field_type, is_required, sort_order)
        SELECT
            fg.organization_id,
            fg.id as field_group_id,
            'dimensions' as code,
            'Dimensions (L x W x H)' as name,
            'text' as field_type,
            false as is_required,
            2 as sort_order
        FROM field_groups fg
        WHERE fg.code = 'technical'
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;
    ELSE
        INSERT INTO product_fields (organization_id, code, name, field_type, is_required, sort_order)
        SELECT
            o.id as organization_id,
            'ean' as code,
            'EAN' as name,
            'text' as field_type,
            false as is_required,
            1 as sort_order
        FROM organizations o
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, code, name, field_type, is_required, sort_order)
        SELECT
            o.id as organization_id,
            'mpn' as code,
            'Manufacturer Part Number' as name,
            'text' as field_type,
            false as is_required,
            2 as sort_order
        FROM organizations o
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, code, name, field_type, is_required, sort_order)
        SELECT
            o.id as organization_id,
            'brand' as code,
            'Brand' as name,
            'text' as field_type,
            true as is_required,
            3 as sort_order
        FROM organizations o
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, code, name, field_type, is_required, sort_order)
        SELECT
            o.id as organization_id,
            'weight' as code,
            'Weight (kg)' as name,
            'decimal' as field_type,
            false as is_required,
            1 as sort_order
        FROM organizations o
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;

        INSERT INTO product_fields (organization_id, code, name, field_type, is_required, sort_order)
        SELECT
            o.id as organization_id,
            'dimensions' as code,
            'Dimensions (L x W x H)' as name,
            'text' as field_type,
            false as is_required,
            2 as sort_order
        FROM organizations o
        ON CONFLICT ON CONSTRAINT unique_field_code_per_org DO NOTHING;
    END IF;
END $$;
