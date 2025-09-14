-- Migration: Team Member Invitations for TradetTool
-- Description: Enable organization owners to invite team members via email (Kinde managed users)
-- Date: 2025-09-01

BEGIN;

-- =====================================================================================
-- TEAM MEMBER INVITATIONS SYSTEM
-- =====================================================================================

-- Team member invitations (before user exists in Kinde)
CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('member', 'admin')) DEFAULT 'member',
    invited_by TEXT NOT NULL, -- Kinde user ID of inviter
    invitation_token UUID DEFAULT gen_random_uuid(), -- Unique token for invitation link
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- 7 day expiry
    accepted_at TIMESTAMPTZ,
    accepted_by TEXT, -- Kinde user ID when accepted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members (after user exists in Kinde and has accepted invitation)
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    kinde_user_id TEXT NOT NULL, -- Kinde user ID
    email TEXT NOT NULL, -- Stored for reference
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
    permissions JSONB DEFAULT '{}', -- Additional granular permissions
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'left')),
    invited_by TEXT, -- Kinde user ID of original inviter
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================================
-- INDEXES AND CONSTRAINTS
-- =====================================================================================

-- Team invitations indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_org ON team_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

-- Organization members indexes
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_kinde_user ON organization_members(kinde_user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON organization_members(email);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_unique_pending 
ON team_invitations(organization_id, email) 
WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_unique 
ON organization_members(organization_id, kinde_user_id)
WHERE status = 'active';

-- =====================================================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================================================

-- Enable RLS
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Team invitations: Only organization owners/admins can manage invitations
CREATE POLICY "Users can view invitations for owned/admin orgs" ON team_invitations
    FOR SELECT USING (
        organization_id IN (
            SELECT unnest(get_user_owned_org_ids())
        )
        OR organization_id IN (
            SELECT organization_id FROM organization_members 
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
                AND role IN ('owner', 'admin')
                AND status = 'active'
        )
    );

CREATE POLICY "Users can manage invitations for owned/admin orgs" ON team_invitations
    FOR ALL USING (
        organization_id IN (
            SELECT unnest(get_user_owned_org_ids())
        )
        OR organization_id IN (
            SELECT organization_id FROM organization_members 
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
                AND role IN ('owner', 'admin')
                AND status = 'active'
        )
    );

-- Organization members: Users can see members of orgs they have access to
CREATE POLICY "Users can view org members for accessible orgs" ON organization_members
    FOR SELECT USING (
        organization_id IN (
            SELECT unnest(get_user_accessible_org_ids())
        )
    );

-- Organization members: Only owners/admins can manage members
CREATE POLICY "Users can manage members for owned/admin orgs" ON organization_members
    FOR ALL USING (
        organization_id IN (
            SELECT unnest(get_user_owned_org_ids())
        )
        OR organization_id IN (
            SELECT organization_id FROM organization_members 
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
                AND role IN ('owner', 'admin')
                AND status = 'active'
        )
    );

-- =====================================================================================
-- HELPER FUNCTIONS
-- =====================================================================================

-- Function to create a team invitation
CREATE OR REPLACE FUNCTION create_team_invitation(
    org_id UUID,
    invite_email TEXT,
    invite_role TEXT DEFAULT 'member'
)
RETURNS UUID AS $$
DECLARE
    invitation_id UUID;
    current_user_id TEXT;
BEGIN
    -- Get current user
    current_user_id := current_setting('app.current_user_id', true);
    
    -- Check if user has permission to invite (owner or admin)
    IF NOT EXISTS(
        SELECT 1 FROM organization_members 
        WHERE organization_id = org_id 
            AND kinde_user_id = current_user_id
            AND role IN ('owner', 'admin')
            AND status = 'active'
    ) AND org_id NOT IN (SELECT unnest(get_user_owned_org_ids())) THEN
        RAISE EXCEPTION 'Insufficient permissions to invite team members';
    END IF;
    
    -- Check if there's already a pending invitation for this email
    IF EXISTS(
        SELECT 1 FROM team_invitations 
        WHERE organization_id = org_id 
            AND email = invite_email 
            AND status = 'pending'
            AND expires_at > NOW()
    ) THEN
        RAISE EXCEPTION 'Pending invitation already exists for this email';
    END IF;
    
    -- Check if user is already a member
    IF EXISTS(
        SELECT 1 FROM organization_members 
        WHERE organization_id = org_id 
            AND email = invite_email 
            AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'User is already a member of this organization';
    END IF;
    
    -- Create the invitation
    INSERT INTO team_invitations (
        organization_id,
        email,
        role,
        invited_by
    ) VALUES (
        org_id,
        invite_email,
        invite_role,
        current_user_id
    ) RETURNING id INTO invitation_id;
    
    RETURN invitation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept a team invitation
CREATE OR REPLACE FUNCTION accept_team_invitation(
    invitation_token_param UUID,
    kinde_user_id_param TEXT,
    user_email TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    invitation_record team_invitations%ROWTYPE;
BEGIN
    -- Get the invitation
    SELECT * INTO invitation_record
    FROM team_invitations 
    WHERE invitation_token = invitation_token_param
        AND status = 'pending'
        AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation token';
    END IF;
    
    -- Verify email matches
    IF invitation_record.email != user_email THEN
        RAISE EXCEPTION 'Email does not match invitation';
    END IF;
    
    -- Create organization member
    INSERT INTO organization_members (
        organization_id,
        kinde_user_id,
        email,
        role,
        invited_by
    ) VALUES (
        invitation_record.organization_id,
        kinde_user_id_param,
        user_email,
        invitation_record.role,
        invitation_record.invited_by
    );
    
    -- Update invitation status
    UPDATE team_invitations 
    SET status = 'accepted',
        accepted_at = NOW(),
        accepted_by = kinde_user_id_param,
        updated_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get organization members with their roles
CREATE OR REPLACE FUNCTION get_organization_team(org_id UUID)
RETURNS TABLE (
    member_id UUID,
    kinde_user_id TEXT,
    email TEXT,
    role TEXT,
    joined_at TIMESTAMPTZ,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        om.id,
        om.kinde_user_id,
        om.email,
        om.role,
        om.joined_at,
        om.status
    FROM organization_members om
    WHERE om.organization_id = org_id
        AND om.status = 'active'
    ORDER BY 
        CASE om.role 
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'member' THEN 3
            ELSE 4
        END,
        om.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- UPDATE EXISTING HELPER FUNCTIONS
-- =====================================================================================

-- Update the get_user_accessible_org_ids function to include team member access
CREATE OR REPLACE FUNCTION get_user_accessible_org_ids()
RETURNS UUID[] AS $$
DECLARE
    current_user_id TEXT;
    org_ids UUID[];
BEGIN
    current_user_id := current_setting('app.current_user_id', true);
    
    IF current_user_id IS NULL OR current_user_id = '' THEN
        RETURN '{}';
    END IF;
    
    -- Get organizations user owns (via Kinde org)
    SELECT array_agg(DISTINCT id) INTO org_ids
    FROM organizations o
    WHERE o.kinde_org_id = current_setting('app.current_org_code', true);
    
    -- Add organizations where user is a team member
    SELECT array_agg(DISTINCT organization_id) || COALESCE(org_ids, '{}') INTO org_ids
    FROM organization_members
    WHERE kinde_user_id = current_user_id
        AND status = 'active';
    
    RETURN COALESCE(org_ids, '{}');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- TRIGGERS
-- =====================================================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_team_invitations_updated_at 
    BEFORE UPDATE ON team_invitations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at 
    BEFORE UPDATE ON organization_members 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================================
-- SAMPLE DATA FOR TESTING
-- =====================================================================================

-- Add organization owner as member (for existing ACME organization)
INSERT INTO organization_members (
    organization_id,
    kinde_user_id,
    email,
    role
)
SELECT 
    o.id,
    'kp_36e03a03270742a9885e75ef4a4fbca4', -- Replace with actual owner's Kinde ID
    'owner@acme-supplements.com',
    'owner'
FROM organizations o
WHERE o.slug = 'acme-12'
ON CONFLICT (organization_id, kinde_user_id) DO NOTHING;

COMMIT;