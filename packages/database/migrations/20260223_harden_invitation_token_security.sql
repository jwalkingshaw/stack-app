BEGIN;

ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Keep only the most recent pending invite per org/email/type before adding uniqueness.
WITH ranked_pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, LOWER(email), invitation_type
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM invitations
  WHERE accepted_at IS NULL
    AND declined_at IS NULL
    AND revoked_at IS NULL
)
UPDATE invitations i
SET revoked_at = NOW()
FROM ranked_pending rp
WHERE i.id = rp.id
  AND rp.rn > 1
  AND i.revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending_unique_email
ON invitations (organization_id, LOWER(email), invitation_type)
WHERE accepted_at IS NULL
  AND declined_at IS NULL
  AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_pending_token
ON invitations (token)
WHERE accepted_at IS NULL
  AND declined_at IS NULL
  AND revoked_at IS NULL;

COMMENT ON COLUMN invitations.revoked_at IS 'Timestamp when an invitation is explicitly revoked by an authorized user';

COMMIT;

