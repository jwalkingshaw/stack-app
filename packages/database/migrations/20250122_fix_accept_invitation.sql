-- Fix accept_invitation function to properly handle conflicts
-- The issue is that ON CONFLICT requires a unique constraint, not just an index

BEGIN;

-- Create a unique constraint on (organization_id, kinde_user_id, status)
-- This allows the same user to have multiple memberships with different statuses
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_unique_active
ON organization_members(organization_id, kinde_user_id)
WHERE status = 'active';

-- Recreate the accept_invitation function with better error handling
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
    existing_member_id UUID;
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

    -- Check if user already has a membership (any status)
    SELECT id INTO existing_member_id
    FROM organization_members
    WHERE organization_id = invitation_record.organization_id
      AND kinde_user_id = kinde_user_id_param;

    IF existing_member_id IS NOT NULL THEN
        -- Update existing membership
        UPDATE organization_members
        SET
            role = invitation_record.role_or_access_level,
            can_download_assets = new_can_download_assets,
            can_edit_products = new_can_edit_products,
            can_manage_team = new_can_manage_team,
            status = 'active',
            email = user_email
        WHERE id = existing_member_id;
    ELSE
        -- Create new organization member
        INSERT INTO organization_members (
            organization_id,
            kinde_user_id,
            email,
            role,
            invited_by,
            can_download_assets,
            can_edit_products,
            can_manage_team,
            status
        ) VALUES (
            invitation_record.organization_id,
            kinde_user_id_param,
            user_email,
            invitation_record.role_or_access_level,
            invitation_record.invited_by,
            new_can_download_assets,
            new_can_edit_products,
            new_can_manage_team,
            'active'
        );
    END IF;

    -- Update invitation status
    UPDATE invitations
    SET accepted_at = NOW()
    WHERE id = invitation_record.id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
