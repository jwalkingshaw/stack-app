BEGIN;

CREATE OR REPLACE FUNCTION enforce_brand_managed_invitations()
RETURNS TRIGGER AS $$
DECLARE
  source_org_type TEXT;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.invitation_type IS DISTINCT FROM OLD.invitation_type THEN
    SELECT organization_type INTO source_org_type
    FROM organizations
    WHERE id = NEW.organization_id;

    IF source_org_type IS NULL THEN
      RAISE EXCEPTION 'Invitation organization not found';
    END IF;

    IF source_org_type = 'brand' THEN
      RETURN NEW;
    END IF;

    IF source_org_type = 'partner' THEN
      IF NEW.invitation_type IS DISTINCT FROM 'team_member' THEN
        RAISE EXCEPTION 'Partner organizations may only create team_member invitations';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Only brand or partner organizations may create invitations';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_brand_managed_invitations IS
  'Allows brand organizations to create all invitation types and partner organizations to create team_member invitations only.';

COMMIT;
