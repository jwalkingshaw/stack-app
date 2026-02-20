-- Migration: Simplify to unified workspace model
-- Remove brand/partner distinction, treat all workspaces equally

-- Step 1: Drop the type constraint and column (we'll keep it for now but ignore it)
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_type_check;

-- Step 2: Rename brand_partner_relationships to workspace_relationships  
ALTER TABLE brand_partner_relationships 
RENAME TO workspace_relationships;

-- Step 3: Rename columns to be more generic
ALTER TABLE workspace_relationships 
RENAME COLUMN brand_id TO sharing_workspace_id;

ALTER TABLE workspace_relationships 
RENAME COLUMN partner_id TO receiving_workspace_id;

-- Step 4: Update the constraint names
ALTER TABLE workspace_relationships DROP CONSTRAINT IF EXISTS brand_partner_relationships_brand_id_fkey;
ALTER TABLE workspace_relationships DROP CONSTRAINT IF EXISTS brand_partner_relationships_partner_id_fkey;

-- Add new constraints with correct names
ALTER TABLE workspace_relationships 
ADD CONSTRAINT workspace_relationships_sharing_workspace_fkey 
FOREIGN KEY (sharing_workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE workspace_relationships 
ADD CONSTRAINT workspace_relationships_receiving_workspace_fkey 
FOREIGN KEY (receiving_workspace_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Step 5: Update indexes
DROP INDEX IF EXISTS idx_brand_partner_relationships_brand_id;
DROP INDEX IF EXISTS idx_brand_partner_relationships_partner_id;
DROP INDEX IF EXISTS idx_brand_partner_relationships_status;

CREATE INDEX idx_workspace_relationships_sharing ON workspace_relationships(sharing_workspace_id);
CREATE INDEX idx_workspace_relationships_receiving ON workspace_relationships(receiving_workspace_id);
CREATE INDEX idx_workspace_relationships_status ON workspace_relationships(status);

-- Step 6: Update RLS policies
DROP POLICY IF EXISTS brand_partner_relationships_select ON workspace_relationships;
DROP POLICY IF EXISTS brand_partner_relationships_modify ON workspace_relationships;

-- Policy: Users can see relationships for workspaces they belong to
CREATE POLICY workspace_relationships_select ON workspace_relationships 
FOR SELECT USING (
  sharing_workspace_id IN (
    SELECT organization_id FROM organization_members 
    WHERE kinde_user_id = current_setting('app.current_user_id')
  )
  OR
  receiving_workspace_id IN (
    SELECT organization_id FROM organization_members 
    WHERE kinde_user_id = current_setting('app.current_user_id')
  )
);

-- Policy: Only workspace owners/admins can create/update relationships
CREATE POLICY workspace_relationships_modify ON workspace_relationships 
FOR ALL USING (
  sharing_workspace_id IN (
    SELECT organization_id FROM organization_members 
    WHERE kinde_user_id = current_setting('app.current_user_id')
    AND role IN ('owner', 'admin')
  )
);

-- Step 7: Update helper functions to be generic
DROP FUNCTION IF EXISTS get_partner_brands(UUID);
DROP FUNCTION IF EXISTS get_brand_partners(UUID);

-- Function to get all workspaces that share content with this workspace
CREATE OR REPLACE FUNCTION get_sharing_workspaces(workspace_id UUID)
RETURNS TABLE(
  sharing_workspace_id UUID,
  workspace_name VARCHAR,
  workspace_slug VARCHAR,
  relationship_status VARCHAR,
  permissions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.slug,
    wr.status,
    wr.permissions
  FROM organizations o
  JOIN workspace_relationships wr ON o.id = wr.sharing_workspace_id
  WHERE wr.receiving_workspace_id = workspace_id 
    AND wr.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all workspaces that receive content from this workspace
CREATE OR REPLACE FUNCTION get_receiving_workspaces(workspace_id UUID)
RETURNS TABLE(
  receiving_workspace_id UUID,
  workspace_name VARCHAR,
  workspace_slug VARCHAR,
  relationship_status VARCHAR,
  permissions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.slug,
    wr.status,
    wr.permissions
  FROM organizations o
  JOIN workspace_relationships wr ON o.id = wr.receiving_workspace_id
  WHERE wr.sharing_workspace_id = workspace_id 
    AND wr.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Set default storage limit to 5GB for all workspaces
UPDATE organizations 
SET storage_limit = 5368709120 
WHERE storage_limit != 5368709120;

-- Step 9: Update default partner permissions to be workspace permissions
UPDATE app_settings 
SET key = 'default_workspace_partner_permissions',
    value = '{
  "can_view_products": true,
  "can_download_assets": true,
  "can_copy_content": true,
  "can_view_shared_folders": true
}',
    description = 'Default permissions for partners accessing shared workspace content'
WHERE key = 'default_partner_permissions';

COMMENT ON TABLE workspace_relationships IS 'Manages sharing relationships between workspaces - who shares content with whom';
COMMENT ON COLUMN workspace_relationships.permissions IS 'JSONB object defining what the receiving workspace can access from the sharing workspace';