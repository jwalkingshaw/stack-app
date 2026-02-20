BEGIN;

-- Normalize inconsistent historical rows before enforcing constraint.
UPDATE invitations
SET
  declined_at = NULL,
  revoked_at = NULL
WHERE accepted_at IS NOT NULL
  AND (declined_at IS NOT NULL OR revoked_at IS NOT NULL);

UPDATE invitations
SET revoked_at = NULL
WHERE declined_at IS NOT NULL
  AND revoked_at IS NOT NULL;

ALTER TABLE invitations
DROP CONSTRAINT IF EXISTS invitations_terminal_state_exclusive;

ALTER TABLE invitations
ADD CONSTRAINT invitations_terminal_state_exclusive
CHECK (num_nonnulls(accepted_at, declined_at, revoked_at) <= 1);

CREATE OR REPLACE VIEW invitation_status_view AS
SELECT
  i.*,
  CASE
    WHEN i.revoked_at IS NOT NULL THEN 'revoked'
    WHEN i.declined_at IS NOT NULL THEN 'declined'
    WHEN i.accepted_at IS NOT NULL THEN 'accepted'
    WHEN i.expires_at <= NOW() THEN 'expired'
    ELSE 'pending'
  END AS invitation_status
FROM invitations i;

COMMENT ON VIEW invitation_status_view IS
  'Canonical derived status for invitation lifecycle: pending, accepted, declined, revoked, expired.';

COMMIT;

