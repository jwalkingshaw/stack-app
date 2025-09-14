-- Enable Row Level Security on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_collections ENABLE ROW LEVEL SECURITY;

-- Organizations policies
-- Users can only see organizations they belong to (will be enforced by Kinde org membership)
CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT USING (
    kinde_org_id = auth.jwt() ->> 'org_code'
  );

CREATE POLICY "Users can update their organization" ON organizations
  FOR UPDATE USING (
    kinde_org_id = auth.jwt() ->> 'org_code'
  );

-- DAM Folders policies
CREATE POLICY "Users can view folders in their organization" ON dam_folders
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can create folders in their organization" ON dam_folders
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can update folders in their organization" ON dam_folders
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can delete folders in their organization" ON dam_folders
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

-- DAM Assets policies
CREATE POLICY "Users can view assets in their organization" ON dam_assets
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can create assets in their organization" ON dam_assets
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can update assets in their organization" ON dam_assets
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can delete assets in their organization" ON dam_assets
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

-- DAM Collections policies
CREATE POLICY "Users can view collections in their organization" ON dam_collections
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can create collections in their organization" ON dam_collections
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can update collections in their organization" ON dam_collections
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

CREATE POLICY "Users can delete collections in their organization" ON dam_collections
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations 
      WHERE kinde_org_id = auth.jwt() ->> 'org_code'
    )
  );

-- Service role policies (for server-side operations)
-- Allow service role to bypass RLS for syncing operations
CREATE POLICY "Service role can manage all organizations" ON organizations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all folders" ON dam_folders
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all assets" ON dam_assets
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all collections" ON dam_collections
  FOR ALL USING (auth.role() = 'service_role');