-- Migration: Permission Model Update
-- Description: Add granular permissions and update role structure for team and partner access
-- Date: 2025-01-26

BEGIN;

-- =====================================================================================
-- STEP 1: ADD PERMISSION COLUMNS
-- =====================================================================================

-- Add permission flag columns to organization_members
ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS can_download_assets BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_edit_products BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_team BOOLEAN DEFAULT false;

-- =====================================================================================
-- STEP 2: UPDATE ROLE CONSTRAINTS
-- =====================================================================================

-- Drop existing role constraint
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;

-- Add new constraint with editor and viewer roles
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'partner'));

-- =====================================================================================
-- STEP 3: MIGRATE EXISTING DATA
-- =====================================================================================

-- Update existing 'member' roles to 'editor' (backward compatible)
UPDATE organization_members
SET role = 'editor'
WHERE role = 'member';

-- Update invitations table - convert 'member' to 'editor' in role_or_access_level
UPDATE invitations
SET role_or_access_level = 'editor'
WHERE role_or_access_level = 'member'
  AND invitation_type = 'team_member';

-- Set permission flags based on role for existing members
UPDATE organization_members SET
  can_edit_products = CASE
    WHEN role IN ('owner', 'admin', 'editor') THEN true
    ELSE false
  END,
  can_manage_team = CASE
    WHEN role IN ('owner', 'admin') THEN true
    ELSE false
  END,
  can_download_assets = CASE
    WHEN role = 'partner' THEN true  -- Partners can download per requirements
    ELSE true  -- All team members can download
  END;

-- =====================================================================================
-- STEP 4: ADD INDEXES FOR PERFORMANCE
-- =====================================================================================

-- Index for permission queries
CREATE INDEX IF NOT EXISTS idx_org_members_permissions
ON organization_members(organization_id, kinde_user_id, status)
WHERE status = 'active';

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_org_members_role
ON organization_members(role, status)
WHERE status = 'active';

-- =====================================================================================
-- STEP 5: CREATE PERMISSION HELPER FUNCTIONS
-- =====================================================================================

-- Function to get user's role in an organization
CREATE OR REPLACE FUNCTION get_user_role_in_org(
  user_id TEXT,
  org_id UUID
)
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE kinde_user_id = user_id
    AND organization_id = org_id
    AND status = 'active';

  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can download assets
CREATE OR REPLACE FUNCTION can_user_download_assets(
  user_id TEXT,
  org_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  has_permission BOOLEAN;
BEGIN
  SELECT can_download_assets INTO has_permission
  FROM organization_members
  WHERE kinde_user_id = user_id
    AND organization_id = org_id
    AND status = 'active';

  RETURN COALESCE(has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can edit products
CREATE OR REPLACE FUNCTION can_user_edit_products(
  user_id TEXT,
  org_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  has_permission BOOLEAN;
BEGIN
  SELECT can_edit_products INTO has_permission
  FROM organization_members
  WHERE kinde_user_id = user_id
    AND organization_id = org_id
    AND status = 'active';

  RETURN COALESCE(has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can manage team
CREATE OR REPLACE FUNCTION can_user_manage_team(
  user_id TEXT,
  org_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  has_permission BOOLEAN;
BEGIN
  SELECT can_manage_team INTO has_permission
  FROM organization_members
  WHERE kinde_user_id = user_id
    AND organization_id = org_id
    AND status = 'active';

  RETURN COALESCE(has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all user permissions at once (efficient)
CREATE OR REPLACE FUNCTION get_user_permissions(
  user_id TEXT,
  org_id UUID
)
RETURNS JSONB AS $$
DECLARE
  permissions JSONB;
BEGIN
  SELECT jsonb_build_object(
    'role', role,
    'can_download_assets', can_download_assets,
    'can_edit_products', can_edit_products,
    'can_manage_team', can_manage_team,
    'is_owner', role = 'owner',
    'is_admin', role IN ('owner', 'admin'),
    'is_partner', role = 'partner'
  ) INTO permissions
  FROM organization_members
  WHERE kinde_user_id = user_id
    AND organization_id = org_id
    AND status = 'active';

  RETURN COALESCE(permissions, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has any access to organization
CREATE OR REPLACE FUNCTION user_has_org_access(
  user_id TEXT,
  org_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1
    FROM organization_members
    WHERE kinde_user_id = user_id
      AND organization_id = org_id
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- STEP 6: CREATE INVITATION ACCEPTANCE FUNCTION
-- =====================================================================================

-- Function to accept invitation and create organization member
CREATE OR REPLACE FUNCTION accept_invitation(
    invitation_token_param TEXT,
    kinde_user_id_param TEXT,
    user_email TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    invitation_record invitations%ROWTYPE;
    new_can_edit_products BOOLEAN;
    new_can_manage_team BOOLEAN;
    new_can_download_assets BOOLEAN;
BEGIN
    -- Get the invitation
    SELECT * INTO invitation_record
    FROM invitations
    WHERE token = invitation_token_param
      AND expires_at > NOW()
      AND accepted_at IS NULL
      AND declined_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation token';
    END IF;

    -- Verify email matches
    IF invitation_record.email != user_email THEN
        RAISE EXCEPTION 'Email does not match invitation';
    END IF;

    -- Set permissions based on role
    new_can_edit_products := invitation_record.role_or_access_level IN ('admin', 'editor');
    new_can_manage_team := invitation_record.role_or_access_level IN ('admin');
    new_can_download_assets := true; -- All invited users can download

    -- Create organization member with permissions
    INSERT INTO organization_members (
        organization_id,
        kinde_user_id,
        email,
        role,
        invited_by,
        can_download_assets,
        can_edit_products,
        can_manage_team
    ) VALUES (
        invitation_record.organization_id,
        kinde_user_id_param,
        user_email,
        invitation_record.role_or_access_level,
        invitation_record.invited_by,
        new_can_download_assets,
        new_can_edit_products,
        new_can_manage_team
    )
    ON CONFLICT (organization_id, kinde_user_id)
    WHERE status = 'active'
    DO UPDATE SET
        role = EXCLUDED.role,
        can_download_assets = EXCLUDED.can_download_assets,
        can_edit_products = EXCLUDED.can_edit_products,
        can_manage_team = EXCLUDED.can_manage_team,
        status = 'active';

    -- Update invitation status
    UPDATE invitations
    SET accepted_at = NOW()
    WHERE id = invitation_record.id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- STEP 7: GRANT PERMISSIONS
-- =====================================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_role_in_org(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_download_assets(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_edit_products(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_manage_team(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_permissions(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_org_access(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT, TEXT, TEXT) TO authenticated;

-- =====================================================================================
-- STEP 8: ADD COMMENTS FOR DOCUMENTATION
-- =====================================================================================

COMMENT ON COLUMN organization_members.can_download_assets IS 'Permission to download assets from the DAM';
COMMENT ON COLUMN organization_members.can_edit_products IS 'Permission to create and edit products';
COMMENT ON COLUMN organization_members.can_manage_team IS 'Permission to invite and manage team members';

COMMENT ON FUNCTION get_user_role_in_org IS 'Returns the role of a user in an organization';
COMMENT ON FUNCTION can_user_download_assets IS 'Checks if user has permission to download assets';
COMMENT ON FUNCTION can_user_edit_products IS 'Checks if user has permission to edit products';
COMMENT ON FUNCTION can_user_manage_team IS 'Checks if user has permission to manage team members';
COMMENT ON FUNCTION get_user_permissions IS 'Returns all permissions for a user in an organization as JSONB';
COMMENT ON FUNCTION user_has_org_access IS 'Checks if user has any active access to an organization';
COMMENT ON FUNCTION accept_invitation IS 'Accepts an invitation and creates organization member with appropriate permissions';

COMMIT;
