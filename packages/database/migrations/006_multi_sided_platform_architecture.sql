-- Migration: Multi-Sided Platform Architecture for TradetTool
-- Description: Enables both brands and retailers as paying customers with cross-organization collaboration
-- Date: 2025-09-01

BEGIN;

-- =====================================================================================
-- ORGANIZATION TYPES AND SUBSCRIPTION MODULES
-- =====================================================================================

-- Add organization type and subscription information
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_type TEXT CHECK (organization_type IN ('brand', 'retailer', 'distributor', 'agency')) DEFAULT 'brand';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_tier TEXT CHECK (subscription_tier IN ('starter', 'professional', 'enterprise')) DEFAULT 'starter';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status TEXT CHECK (subscription_status IN ('active', 'trial', 'suspended', 'cancelled')) DEFAULT 'trial';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Organization modules (add-ons that can be purchased)
CREATE TABLE IF NOT EXISTS organization_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    module_name TEXT NOT NULL CHECK (module_name IN (
        'marketing_calendar', 
        'joint_business_planning', 
        'asset_management_pro', 
        'analytics_premium',
        'compliance_tracking',
        'retailer_portal',
        'api_access'
    )),
    is_active BOOLEAN DEFAULT true,
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_by TEXT NOT NULL, -- Kinde user ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_modules_org_id ON organization_modules(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_modules_active ON organization_modules(organization_id, is_active) WHERE is_active = true;

-- Unique constraint: one active module per organization per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_modules_unique_active 
ON organization_modules(organization_id, module_name) 
WHERE is_active = true;

-- =====================================================================================
-- CROSS-ORGANIZATION COLLABORATION
-- =====================================================================================

-- Collaboration spaces where brands and retailers work together
CREATE TABLE IF NOT EXISTS collaboration_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_name TEXT NOT NULL,
    space_type TEXT NOT NULL CHECK (space_type IN (
        'marketing_campaign', 
        'product_launch', 
        'joint_business_plan',
        'promotional_calendar',
        'asset_sharing'
    )),
    description TEXT,
    owner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}', -- Store space-specific settings
    created_by TEXT NOT NULL, -- Kinde user ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations participating in collaboration spaces
CREATE TABLE IF NOT EXISTS collaboration_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collaboration_space_id UUID NOT NULL REFERENCES collaboration_spaces(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'collaborator', 'viewer')),
    permissions JSONB DEFAULT '{}', -- Specific permissions for this participant
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    invited_by TEXT NOT NULL, -- Kinde user ID who sent the invite
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended'))
);

-- Unique constraint: one participation record per space per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_collab_participants_unique 
ON collaboration_participants(collaboration_space_id, organization_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collab_spaces_owner ON collaboration_spaces(owner_organization_id);
CREATE INDEX IF NOT EXISTS idx_collab_participants_space ON collaboration_participants(collaboration_space_id);
CREATE INDEX IF NOT EXISTS idx_collab_participants_org ON collaboration_participants(organization_id);

-- =====================================================================================
-- MARKETING CALENDAR SYSTEM
-- =====================================================================================

-- Marketing campaigns that can span multiple organizations
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_name TEXT NOT NULL,
    campaign_type TEXT NOT NULL CHECK (campaign_type IN (
        'product_launch', 
        'seasonal_promotion', 
        'flash_sale',
        'brand_awareness',
        'joint_promotion',
        'trade_show'
    )),
    description TEXT,
    owner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    collaboration_space_id UUID REFERENCES collaboration_spaces(id) ON DELETE SET NULL,
    
    -- Campaign timing
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    launch_date DATE,
    
    -- Campaign details
    budget_allocated DECIMAL(10,2),
    expected_roi DECIMAL(5,2),
    target_audience TEXT,
    channels JSONB DEFAULT '[]', -- Array of marketing channels
    
    -- Status and tracking
    status TEXT DEFAULT 'planning' CHECK (status IN (
        'planning', 'approved', 'active', 'completed', 'cancelled'
    )),
    
    -- Metadata
    created_by TEXT NOT NULL, -- Kinde user ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products associated with campaigns
CREATE TABLE IF NOT EXISTS campaign_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    promotional_price DECIMAL(10,2),
    discount_percentage DECIMAL(5,2),
    inventory_allocated INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign collaboration - which organizations can see/edit campaigns
CREATE TABLE IF NOT EXISTS campaign_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL CHECK (access_level IN ('view', 'comment', 'edit', 'admin')),
    invited_by TEXT NOT NULL, -- Kinde user ID
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'declined'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON marketing_campaigns(owner_organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON marketing_campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_products_campaign ON campaign_products(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_collaborators_campaign ON campaign_collaborators(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_collaborators_org ON campaign_collaborators(organization_id);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_products_unique 
ON campaign_products(campaign_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_collaborators_unique 
ON campaign_collaborators(campaign_id, organization_id);

-- =====================================================================================
-- CROSS-TENANT DATA ACCESS VIEWS
-- =====================================================================================

-- View for retailers to see all campaigns they're involved in across brands
CREATE OR REPLACE VIEW retailer_campaign_calendar AS
SELECT 
    c.id as campaign_id,
    c.campaign_name,
    c.campaign_type,
    c.start_date,
    c.end_date,
    c.launch_date,
    c.status,
    c.channels,
    owner_org.name as brand_name,
    owner_org.slug as brand_slug,
    cc.access_level,
    cc.organization_id as retailer_organization_id
FROM marketing_campaigns c
JOIN organizations owner_org ON c.owner_organization_id = owner_org.id
JOIN campaign_collaborators cc ON c.id = cc.campaign_id
WHERE cc.status = 'active'
    AND c.status IN ('approved', 'active')
ORDER BY c.start_date ASC;

-- View for brands to see their collaboration spaces and participants
CREATE OR REPLACE VIEW brand_collaboration_overview AS
SELECT 
    cs.id as space_id,
    cs.space_name,
    cs.space_type,
    cs.owner_organization_id,
    owner_org.name as owner_organization_name,
    array_agg(
        jsonb_build_object(
            'org_id', participant_org.id,
            'org_name', participant_org.name,
            'org_type', participant_org.organization_type,
            'role', cp.role,
            'status', cp.status
        )
    ) as participants
FROM collaboration_spaces cs
JOIN organizations owner_org ON cs.owner_organization_id = owner_org.id
LEFT JOIN collaboration_participants cp ON cs.id = cp.collaboration_space_id
LEFT JOIN organizations participant_org ON cp.organization_id = participant_org.id
WHERE cs.is_active = true
GROUP BY cs.id, cs.space_name, cs.space_type, cs.owner_organization_id, owner_org.name
ORDER BY cs.created_at DESC;

-- =====================================================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================================================

-- Enable RLS on new tables
ALTER TABLE organization_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_collaborators ENABLE ROW LEVEL SECURITY;

-- Organization modules: Users can only see modules for organizations they have access to
CREATE POLICY "Users can view organization modules for accessible orgs" ON organization_modules
    FOR SELECT USING (
        organization_id IN (
            SELECT unnest(get_user_accessible_org_ids())
        )
    );

CREATE POLICY "Users can manage organization modules for owned orgs" ON organization_modules
    FOR ALL USING (
        organization_id IN (
            SELECT unnest(get_user_owned_org_ids())
        )
    );

-- Collaboration spaces: Users can see spaces they own or participate in
CREATE POLICY "Users can view collaboration spaces" ON collaboration_spaces
    FOR SELECT USING (
        owner_organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
        OR id IN (
            SELECT collaboration_space_id 
            FROM collaboration_participants 
            WHERE organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
                AND status = 'active'
        )
    );

CREATE POLICY "Users can manage owned collaboration spaces" ON collaboration_spaces
    FOR ALL USING (
        owner_organization_id IN (SELECT unnest(get_user_owned_org_ids()))
    );

-- Collaboration participants: Users can see participants in spaces they have access to
CREATE POLICY "Users can view collaboration participants" ON collaboration_participants
    FOR SELECT USING (
        collaboration_space_id IN (
            SELECT id FROM collaboration_spaces 
            WHERE owner_organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
        )
        OR organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
    );

-- Marketing campaigns: Users can see campaigns they own or are invited to
CREATE POLICY "Users can view marketing campaigns" ON marketing_campaigns
    FOR SELECT USING (
        owner_organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
        OR id IN (
            SELECT campaign_id 
            FROM campaign_collaborators 
            WHERE organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
                AND status = 'active'
        )
    );

CREATE POLICY "Users can manage owned marketing campaigns" ON marketing_campaigns
    FOR ALL USING (
        owner_organization_id IN (SELECT unnest(get_user_owned_org_ids()))
    );

-- Campaign collaborators: Users can see collaborators for campaigns they have access to
CREATE POLICY "Users can view campaign collaborators" ON campaign_collaborators
    FOR SELECT USING (
        campaign_id IN (
            SELECT id FROM marketing_campaigns 
            WHERE owner_organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
        )
        OR organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
    );

-- Campaign products: Users can see products for campaigns they have access to
CREATE POLICY "Users can view campaign products" ON campaign_products
    FOR SELECT USING (
        campaign_id IN (
            SELECT id FROM marketing_campaigns 
            WHERE owner_organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
                OR id IN (
                    SELECT campaign_id 
                    FROM campaign_collaborators 
                    WHERE organization_id IN (SELECT unnest(get_user_accessible_org_ids()))
                        AND status = 'active'
                )
        )
    );

-- =====================================================================================
-- HELPER FUNCTIONS
-- =====================================================================================

-- Function to check if an organization has a specific module active
CREATE OR REPLACE FUNCTION has_organization_module(org_id UUID, module_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM organization_modules 
        WHERE organization_id = org_id 
            AND module_name = has_organization_module.module_name
            AND is_active = true
            AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all campaigns visible to a retailer organization
CREATE OR REPLACE FUNCTION get_retailer_campaigns(retailer_org_id UUID)
RETURNS TABLE (
    campaign_id UUID,
    campaign_name TEXT,
    brand_name TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.campaign_name,
        owner_org.name,
        c.start_date,
        c.end_date,
        c.status
    FROM marketing_campaigns c
    JOIN organizations owner_org ON c.owner_organization_id = owner_org.id
    JOIN campaign_collaborators cc ON c.id = cc.campaign_id
    WHERE cc.organization_id = retailer_org_id
        AND cc.status = 'active'
        AND c.status IN ('approved', 'active')
    ORDER BY c.start_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- AUDIT LOGGING TRIGGERS
-- =====================================================================================

-- Trigger for collaboration space changes
CREATE OR REPLACE FUNCTION audit_collaboration_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        organization_id
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        current_setting('app.current_user_id', true),
        COALESCE(NEW.owner_organization_id, OLD.owner_organization_id)
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers
CREATE TRIGGER collaboration_spaces_audit 
    AFTER INSERT OR UPDATE OR DELETE ON collaboration_spaces
    FOR EACH ROW EXECUTE FUNCTION audit_collaboration_changes();

CREATE TRIGGER marketing_campaigns_audit 
    AFTER INSERT OR UPDATE OR DELETE ON marketing_campaigns
    FOR EACH ROW EXECUTE FUNCTION audit_collaboration_changes();

-- =====================================================================================
-- SAMPLE DATA FOR TESTING
-- =====================================================================================

-- Update existing organizations with types
UPDATE organizations 
SET organization_type = 'brand', 
    subscription_tier = 'professional',
    subscription_status = 'active'
WHERE name LIKE '%ACME%';

-- Insert sample retailer organization
INSERT INTO organizations (
    name, 
    slug, 
    kinde_org_id, 
    organization_type, 
    subscription_tier, 
    subscription_status,
    billing_email
) VALUES (
    'Supplement Superstore', 
    'supplement-superstore', 
    'retailer_001', 
    'retailer', 
    'professional', 
    'active',
    'billing@supplementsuperstore.com'
) ON CONFLICT (slug) DO NOTHING;

-- Add marketing calendar module to both organizations
INSERT INTO organization_modules (organization_id, module_name, created_by)
SELECT id, 'marketing_calendar', 'system'
FROM organizations 
WHERE organization_type IN ('brand', 'retailer')
ON CONFLICT DO NOTHING;

COMMIT;