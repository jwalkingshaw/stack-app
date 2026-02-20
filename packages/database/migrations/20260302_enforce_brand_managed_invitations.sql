BEGIN;

-- Remove pending invitations created by non-brand organizations prior to enforcement.
UPDATE invitations i
SET revoked_at = NOW()
FROM organizations o
WHERE i.organization_id = o.id
  AND i.accepted_at IS NULL
  AND i.declined_at IS NULL
  AND i.revoked_at IS NULL
  AND o.organization_type <> 'brand';

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

    IF source_org_type IS DISTINCT FROM 'brand' THEN
      RAISE EXCEPTION 'Only brand organizations may create invitations';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invitations_enforce_brand_managed ON invitations;
CREATE TRIGGER trg_invitations_enforce_brand_managed
BEFORE INSERT OR UPDATE ON invitations
FOR EACH ROW
EXECUTE FUNCTION enforce_brand_managed_invitations();

COMMENT ON FUNCTION enforce_brand_managed_invitations IS
  'Prevents non-brand organizations from creating invitations.';

COMMIT;
