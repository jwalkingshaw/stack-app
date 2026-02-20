-- Migration: Add Partner Organization Support
-- This enables brands to invite partners (retailers, distributors, agencies)
-- Partners can view content from multiple brands in a unified dashboard

BEGIN;

-- ============================================================================
-- 1. Add organization_type to organizations table
-- ============================================================================

-- Add organization_type column to distinguish brands from partners
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS organization_type VARCHAR(20) DEFAULT 'brand' NOT NULL
CHECK (organization_type IN ('brand', 'partner'));

COMMENT ON COLUMN organizations.organization_type IS
  'Type of organization: "brand" (content owner) or "partner" (content viewer like retailer/distributor)';

-- Set existing organizations to 'brand' type
UPDATE organizations
SET organization_type = 'brand'
WHERE organization_type IS NULL;

-- Create index for filtering by organization type
CREATE INDEX IF NOT EXISTS idx_organizations_type
ON organizations(organization_type);

-- ============================================================================
-- 2. Create brand_partner_relationships table
-- ============================================================================

-- Tracks which partners have access to which brands' content
CREATE TABLE IF NOT EXISTS brand_partner_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The brand organization sharing content
  brand_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- The partner organization receiving access
  partner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Access level: 'view' (read-only) or 'edit' (can modify shared content)
  access_level VARCHAR(20) DEFAULT 'view' NOT NULL CHECK (access_level IN ('view', 'edit')),

  -- Who created this relationship (user from brand organization)
  invited_by TEXT NOT NULL,

  -- When relationship was established
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Status: 'active', 'suspended', 'revoked'
  status VARCHAR(20) DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),

  -- When status last changed
  status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Optional: Custom permissions/settings per relationship (JSON)
  settings JSONB DEFAULT '{}'::jsonb,

  -- Ensure unique active relationships
  CONSTRAINT unique_active_brand_partner
    UNIQUE (brand_organization_id, partner_organization_id, status)
);

-- Prevent brand from being its own partner
ALTER TABLE brand_partner_relationships
ADD CONSTRAINT prevent_self_partnership
  CHECK (brand_organization_id != partner_organization_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_brand_partner_brand
ON brand_partner_relationships(brand_organization_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_brand_partner_partner
ON brand_partner_relationships(partner_organization_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_brand_partner_status
ON brand_partner_relationships(status);

-- Comments
COMMENT ON TABLE brand_partner_relationships IS
  'Manages relationships between brands and their partners (retailers, distributors, agencies)';

COMMENT ON COLUMN brand_partner_relationships.access_level IS
  'Access level: "view" (read-only) or "edit" (can modify products/assets)';

COMMENT ON COLUMN brand_partner_relationships.status IS
  'Status: "active" (can access), "suspended" (temporarily blocked), "revoked" (permanently removed)';

-- ============================================================================
-- 3. Update invitations table for partner invites
-- ============================================================================

-- Add columns for partner invitation flow
ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS partner_organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS requires_onboarding BOOLEAN DEFAULT false NOT NULL;

-- Index for looking up partner invitations
CREATE INDEX IF NOT EXISTS idx_invitations_partner_org
ON invitations(partner_organization_id)
WHERE partner_organization_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN invitations.partner_organization_id IS
  'For partner invites: the partner organization that will receive access (NULL if partner needs onboarding)';

COMMENT ON COLUMN invitations.requires_onboarding IS
  'TRUE if invitee needs to create a partner organization, FALSE if they have an existing partner org';

-- ============================================================================
-- 4. Create helper function to get partner's accessible brands
-- ============================================================================

CREATE OR REPLACE FUNCTION get_partner_brands(partner_org_id UUID)
RETURNS TABLE (
  brand_id UUID,
  brand_name VARCHAR,
  brand_slug VARCHAR,
  access_level VARCHAR,
  relationship_created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    bpr.access_level,
    bpr.created_at
  FROM brand_partner_relationships bpr
  JOIN organizations o ON o.id = bpr.brand_organization_id
  WHERE bpr.partner_organization_id = partner_org_id
    AND bpr.status = 'active'
    AND o.organization_type = 'brand'
  ORDER BY bpr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_partner_brands IS
  'Returns all brands that a partner organization has access to';

-- ============================================================================
-- 5. Create helper function to get brand's partners
-- ============================================================================

CREATE OR REPLACE FUNCTION get_brand_partners(brand_org_id UUID)
RETURNS TABLE (
  partner_id UUID,
  partner_name VARCHAR,
  partner_slug VARCHAR,
  access_level VARCHAR,
  relationship_created_at TIMESTAMP WITH TIME ZONE,
  invited_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    bpr.access_level,
    bpr.created_at,
    bpr.invited_by
  FROM brand_partner_relationships bpr
  JOIN organizations o ON o.id = bpr.partner_organization_id
  WHERE bpr.brand_organization_id = brand_org_id
    AND bpr.status = 'active'
    AND o.organization_type = 'partner'
  ORDER BY bpr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_brand_partners IS
  'Returns all partners that have access to a brand organization';

-- ============================================================================
-- 6. Update accept_invitation function for partner flow
-- ============================================================================

-- This will be implemented in a follow-up migration after testing the schema
-- The function needs to:
-- 1. Check if invitation is for partner (invitation_type = 'partner')
-- 2. If requires_onboarding = true, redirect to partner onboarding
-- 3. If requires_onboarding = false, create brand_partner_relationship
-- 4. Handle both new and existing partner organizations

COMMIT;
