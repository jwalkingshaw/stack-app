BEGIN;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS partner_category TEXT;

-- Normalize legacy partner rows that did not capture subtype.
UPDATE organizations
SET partner_category = 'retailer'
WHERE organization_type = 'partner'
  AND partner_category IS NULL;

ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS organizations_partner_category_consistency;

ALTER TABLE organizations
ADD CONSTRAINT organizations_partner_category_consistency
CHECK (
  (organization_type = 'brand' AND partner_category IS NULL)
  OR (
    organization_type = 'partner'
    AND partner_category IN ('retailer', 'distributor', 'wholesaler')
  )
);

CREATE INDEX IF NOT EXISTS idx_organizations_partner_category
ON organizations(partner_category)
WHERE organization_type = 'partner';

COMMENT ON COLUMN organizations.partner_category IS
  'Subtype for partner organizations: retailer, distributor, wholesaler. Null for brand organizations.';

COMMIT;
