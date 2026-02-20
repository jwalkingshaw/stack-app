-- Migration: Unified Organizations Model
-- Converts brands-only model to unified brand/partner workspace model

-- Step 1: Add type column to existing organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'brand';
ALTER TABLE organizations ADD CONSTRAINT organizations_type_check CHECK (type IN ('brand', 'partner'));

-- Step 2: Update existing organizations to be brands
UPDATE organizations SET type = 'brand' WHERE type IS NULL OR type = 'brand';

-- Step 3: Create brand-partner relationships table
CREATE TABLE IF NOT EXISTS brand_partner_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
  permissions JSONB DEFAULT '{}',
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(brand_id, partner_id),
  CHECK (brand_id != partner_id) -- Can't relate to self
);

-- Step 4: Add indexes for performance
CREATE INDEX idx_brand_partner_relationships_brand_id ON brand_partner_relationships(brand_id);
CREATE INDEX idx_brand_partner_relationships_partner_id ON brand_partner_relationships(partner_id);
CREATE INDEX idx_brand_partner_relationships_status ON brand_partner_relationships(status);
CREATE INDEX idx_organizations_type ON organizations(type);

-- Step 5: Add RLS policies for brand-partner relationships
ALTER TABLE brand_partner_relationships ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see relationships for organizations they belong to
CREATE POLICY brand_partner_relationships_select ON brand_partner_relationships 
FOR SELECT USING (
  brand_id IN (
    SELECT organization_id FROM organization_members 
    WHERE kinde_user_id = current_setting('app.current_user_id')
  )
  OR
  partner_id IN (
    SELECT organization_id FROM organization_members 
    WHERE kinde_user_id = current_setting('app.current_user_id')
  )
);

-- Policy: Only brand admins can create/update relationships
CREATE POLICY brand_partner_relationships_modify ON brand_partner_relationships 
FOR ALL USING (
  brand_id IN (
    SELECT organization_id FROM organization_members 
    WHERE kinde_user_id = current_setting('app.current_user_id')
    AND role IN ('owner', 'admin')
  )
);

-- Step 6: Update organization_members table role enum to include new roles
-- First, check if we need to update the role column constraint
DO $$
BEGIN
  -- Drop the existing check constraint if it exists
  ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
  
  -- Add new constraint with expanded roles
  ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'partner'));
END $$;

-- Step 7: Add helper functions

-- Function to get all brands a partner has access to
CREATE OR REPLACE FUNCTION get_partner_brands(partner_org_id UUID)
RETURNS TABLE(
  brand_id UUID,
  brand_name VARCHAR,
  brand_slug VARCHAR,
  relationship_status VARCHAR,
  permissions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.slug,
    bpr.status,
    bpr.permissions
  FROM organizations o
  JOIN brand_partner_relationships bpr ON o.id = bpr.brand_id
  WHERE bpr.partner_id = partner_org_id 
    AND bpr.status = 'active'
    AND o.type = 'brand';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all partners for a brand
CREATE OR REPLACE FUNCTION get_brand_partners(brand_org_id UUID)
RETURNS TABLE(
  partner_id UUID,
  partner_name VARCHAR,
  partner_slug VARCHAR,
  relationship_status VARCHAR,
  permissions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.slug,
    bpr.status,
    bpr.permissions
  FROM organizations o
  JOIN brand_partner_relationships bpr ON o.id = bpr.partner_id
  WHERE bpr.brand_id = brand_org_id 
    AND bpr.status = 'active'
    AND o.type = 'partner';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Create default partner permissions template
INSERT INTO app_settings (key, value, description) VALUES 
('default_partner_permissions', '{
  "workspace": {
    "can_view_dashboard": true,
    "can_manage_profile": true,
    "can_view_all_brands": true
  },
  "brand_access": {
    "can_view_products": true,
    "can_download_assets": true,
    "can_place_orders": false,
    "can_view_pricing": true
  }
}', 'Default permissions for new partner relationships')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Step 9: Add updated_at trigger for brand_partner_relationships
CREATE TRIGGER update_brand_partner_relationships_updated_at
  BEFORE UPDATE ON brand_partner_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE brand_partner_relationships IS 'Manages relationships between brand organizations and partner organizations';
COMMENT ON COLUMN brand_partner_relationships.permissions IS 'JSONB object defining what the partner can access from the brand';
COMMENT ON COLUMN brand_partner_relationships.status IS 'Status of the partnership: pending (invited), active, or inactive';