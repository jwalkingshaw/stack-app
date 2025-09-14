-- Add additional organization metadata fields for onboarding
ALTER TABLE organizations 
ADD COLUMN industry TEXT,
ADD COLUMN team_size TEXT;

-- Add index for industry queries (for analytics/reporting)
CREATE INDEX idx_organizations_industry ON organizations(industry);

-- Add some sample data for the demo organization if it doesn't exist
INSERT INTO organizations (kinde_org_id, name, slug, industry, team_size)
VALUES ('demo-org', 'Demo Organization', 'demo-org', 'technology', '1-5')
ON CONFLICT (slug) DO UPDATE SET 
  industry = EXCLUDED.industry,
  team_size = EXCLUDED.team_size;