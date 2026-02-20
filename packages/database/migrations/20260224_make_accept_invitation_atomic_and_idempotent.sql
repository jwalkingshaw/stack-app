BEGIN;

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
    normalized_user_email TEXT;
    rows_updated INTEGER := 0;
BEGIN
    normalized_user_email := LOWER(TRIM(user_email));

    SELECT * INTO invitation_record
    FROM invitations
    WHERE token = invitation_token_param
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation token';
    END IF;

    IF invitation_record.declined_at IS NOT NULL
       OR invitation_record.revoked_at IS NOT NULL
       OR invitation_record.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Invalid or expired invitation token';
    END IF;

    IF LOWER(TRIM(invitation_record.email)) != normalized_user_email THEN
        RAISE EXCEPTION 'Email does not match invitation';
    END IF;

    -- Idempotent replay handling: if already accepted and access exists for this user, return success.
    IF invitation_record.accepted_at IS NOT NULL THEN
        IF invitation_record.invitation_type = 'team_member' THEN
            PERFORM 1
            FROM organization_members
            WHERE organization_id = invitation_record.organization_id
              AND kinde_user_id = kinde_user_id_param
              AND status = 'active';

            IF FOUND THEN
                RETURN jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'invitation_type', 'team_member',
                    'organization_id', invitation_record.organization_id,
                    'invitation_id', invitation_record.id,
                    'invitation_token', invitation_token_param
                );
            END IF;
        ELSIF invitation_record.invitation_type = 'partner' THEN
            IF invitation_record.requires_onboarding THEN
                RETURN jsonb_build_object(
                    'success', true,
                    'idempotent', true,
                    'invitation_type', 'partner',
                    'requires_onboarding', true,
                    'brand_organization_id', invitation_record.organization_id,
                    'access_level', invitation_record.role_or_access_level,
                    'invitation_id', invitation_record.id,
                    'invitation_token', invitation_token_param
                );
            END IF;

            IF invitation_record.partner_organization_id IS NOT NULL THEN
                PERFORM 1
                FROM brand_partner_relationships bpr
                JOIN organization_members om
                  ON om.organization_id = bpr.partner_organization_id
                 AND om.kinde_user_id = kinde_user_id_param
                 AND om.status = 'active'
                WHERE bpr.brand_organization_id = invitation_record.organization_id
                  AND bpr.partner_organization_id = invitation_record.partner_organization_id
                  AND bpr.status = 'active';

                IF FOUND THEN
                    RETURN jsonb_build_object(
                        'success', true,
                        'idempotent', true,
                        'invitation_type', 'partner',
                        'requires_onboarding', false,
                        'partner_organization_id', invitation_record.partner_organization_id,
                        'brand_organization_id', invitation_record.organization_id,
                        'access_level', invitation_record.role_or_access_level,
                        'invitation_id', invitation_record.id,
                        'invitation_token', invitation_token_param
                    );
                END IF;
            END IF;
        END IF;

        RAISE EXCEPTION 'Invalid or expired invitation token';
    END IF;

    IF invitation_record.invitation_type = 'team_member' THEN
        new_can_edit_products := invitation_record.role_or_access_level IN ('admin', 'editor');
        new_can_manage_team := invitation_record.role_or_access_level IN ('admin');
        new_can_download_assets := true;

        SELECT id INTO existing_member_id
        FROM organization_members
        WHERE organization_id = invitation_record.organization_id
          AND kinde_user_id = kinde_user_id_param
        ORDER BY (status = 'active') DESC, joined_at DESC NULLS LAST
        LIMIT 1;

        IF existing_member_id IS NOT NULL THEN
            UPDATE organization_members
            SET
                role = invitation_record.role_or_access_level,
                can_download_assets = new_can_download_assets,
                can_edit_products = new_can_edit_products,
                can_manage_team = new_can_manage_team,
                status = 'active',
                email = normalized_user_email
            WHERE id = existing_member_id;
        ELSE
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
                normalized_user_email,
                invitation_record.role_or_access_level,
                invitation_record.invited_by,
                new_can_download_assets,
                new_can_edit_products,
                new_can_manage_team,
                'active'
            );
        END IF;

        UPDATE invitations
        SET accepted_at = NOW()
        WHERE id = invitation_record.id
          AND accepted_at IS NULL
          AND declined_at IS NULL
          AND revoked_at IS NULL;

        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        IF rows_updated = 0 THEN
            RAISE EXCEPTION 'Invalid or expired invitation token';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent', false,
            'invitation_type', 'team_member',
            'organization_id', invitation_record.organization_id,
            'invitation_id', invitation_record.id,
            'invitation_token', invitation_token_param
        );
    ELSIF invitation_record.invitation_type = 'partner' THEN
        IF invitation_record.requires_onboarding THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', false,
                'invitation_type', 'partner',
                'requires_onboarding', true,
                'brand_organization_id', invitation_record.organization_id,
                'access_level', invitation_record.role_or_access_level,
                'invitation_id', invitation_record.id,
                'invitation_token', invitation_token_param
            );
        END IF;

        IF invitation_record.partner_organization_id IS NULL THEN
            RAISE EXCEPTION 'Partner organization ID is missing';
        END IF;

        SELECT organization_type INTO partner_org_type
        FROM organizations
        WHERE id = invitation_record.partner_organization_id;

        IF partner_org_type IS NULL THEN
            RAISE EXCEPTION 'Partner organization not found';
        ELSIF partner_org_type != 'partner' THEN
            RAISE EXCEPTION 'Partner organization must have organization_type = partner';
        END IF;

        SELECT id INTO existing_member_id
        FROM organization_members
        WHERE organization_id = invitation_record.partner_organization_id
          AND kinde_user_id = kinde_user_id_param
          AND status = 'active';

        IF existing_member_id IS NULL THEN
            RAISE EXCEPTION 'User is not a member of the partner organization';
        END IF;

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
            access_level = EXCLUDED.access_level,
            status_updated_at = NOW();

        UPDATE invitations
        SET accepted_at = NOW()
        WHERE id = invitation_record.id
          AND accepted_at IS NULL
          AND declined_at IS NULL
          AND revoked_at IS NULL;

        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        IF rows_updated = 0 THEN
            RAISE EXCEPTION 'Invalid or expired invitation token';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent', false,
            'invitation_type', 'partner',
            'requires_onboarding', false,
            'partner_organization_id', invitation_record.partner_organization_id,
            'brand_organization_id', invitation_record.organization_id,
            'access_level', invitation_record.role_or_access_level,
            'invitation_id', invitation_record.id,
            'invitation_token', invitation_token_param
        );
    ELSE
        RAISE EXCEPTION 'Unknown invitation type: %', invitation_record.invitation_type;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION accept_invitation IS
  'Accepts invitations atomically with replay-safe idempotency and revoked/declined guards.';

COMMIT;

