-- Migration: Update accept_invitation function to handle partner invitations
-- This enables partner invites to create brand-partner relationships

BEGIN;

-- ============================================================================
-- Update accept_invitation function to handle partner invitations
-- ============================================================================

-- The function's return type changes from BOOLEAN to JSONB, so drop old version first
DROP FUNCTION IF EXISTS accept_invitation(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION accept_invitation(
    invitation_token_param TEXT,
    kinde_user_id_param TEXT,
    user_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    invitation_record invitations%ROWTYPE;
    new_can_edit_products BOOLEAN;
    new_can_manage_team BOOLEAN;
    new_can_download_assets BOOLEAN;
    existing_member_id UUID;
    result JSONB;
    partner_org_type TEXT;
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

    -- ========================================================================
    -- TEAM MEMBER INVITATION
    -- ========================================================================
    IF invitation_record.invitation_type = 'team_member' THEN
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

        -- Mark invitation as accepted
        UPDATE invitations
        SET accepted_at = NOW()
        WHERE id = invitation_record.id;

        -- Return success for team member
        result := jsonb_build_object(
            'success', true,
            'invitation_type', 'team_member',
            'organization_id', invitation_record.organization_id,
            'invitation_id', invitation_record.id,
            'invitation_token', invitation_token_param
        );

        RETURN result;

    -- ========================================================================
    -- PARTNER INVITATION
    -- ========================================================================
    ELSIF invitation_record.invitation_type = 'partner' THEN
        -- Check if partner needs onboarding (create new org)
        IF invitation_record.requires_onboarding THEN
            -- Invitation remains pending so user can resume onboarding if they drop out
            -- Return with requires_onboarding flag
            result := jsonb_build_object(
                'success', true,
                'invitation_type', 'partner',
                'requires_onboarding', true,
                'brand_organization_id', invitation_record.organization_id,
                'access_level', invitation_record.role_or_access_level,
                'invitation_id', invitation_record.id,
                'invitation_token', invitation_token_param
            );

            RETURN result;
        ELSE
            -- Partner has existing org - create brand-partner relationship
            IF invitation_record.partner_organization_id IS NULL THEN
                RAISE EXCEPTION 'Partner organization ID is missing';
            END IF;

            -- Ensure the referenced organization exists and is marked as a partner
            SELECT organization_type INTO partner_org_type
            FROM organizations
            WHERE id = invitation_record.partner_organization_id;

            IF partner_org_type IS NULL THEN
                RAISE EXCEPTION 'Partner organization not found';
            ELSIF partner_org_type != 'partner' THEN
                RAISE EXCEPTION 'Partner organization must have organization_type = partner';
            END IF;

            -- Verify user is a member of the partner organization
            SELECT id INTO existing_member_id
            FROM organization_members
            WHERE organization_id = invitation_record.partner_organization_id
              AND kinde_user_id = kinde_user_id_param
              AND status = 'active';

            IF existing_member_id IS NULL THEN
                RAISE EXCEPTION 'User is not a member of the partner organization';
            END IF;

            -- Create brand-partner relationship
            INSERT INTO brand_partner_relationships (
                brand_organization_id,
                partner_organization_id,
                access_level,
                invited_by,
                status
            ) VALUES (
                invitation_record.organization_id,
                invitation_record.partner_organization_id,
                invitation_record.role_or_access_level,
                invitation_record.invited_by,
                'active'
            )
            ON CONFLICT (brand_organization_id, partner_organization_id, status)
            DO UPDATE SET
                access_level = invitation_record.role_or_access_level,
                status_updated_at = NOW();

            -- Mark invitation as accepted
            UPDATE invitations
            SET accepted_at = NOW()
            WHERE id = invitation_record.id;

            -- Return success with partner org info
            result := jsonb_build_object(
                'success', true,
                'invitation_type', 'partner',
                'requires_onboarding', false,
                'partner_organization_id', invitation_record.partner_organization_id,
                'brand_organization_id', invitation_record.organization_id,
                'access_level', invitation_record.role_or_access_level,
                'invitation_id', invitation_record.id,
                'invitation_token', invitation_token_param
            );

            RETURN result;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unknown invitation type: %', invitation_record.invitation_type;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION accept_invitation IS
  'Accepts team member or partner invitations. Returns JSONB with invitation type and relevant organization IDs.';

COMMIT;
