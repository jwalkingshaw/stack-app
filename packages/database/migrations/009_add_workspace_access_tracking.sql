-- Migration: Add workspace access tracking for smart routing
-- Add last_accessed_at column to organization_members table for multi-workspace support

-- Add last_accessed_at column to track when user last accessed each workspace
ALTER TABLE organization_members 
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- Create index for efficient querying of last accessed workspaces
CREATE INDEX IF NOT EXISTS idx_org_members_last_accessed 
ON organization_members(kinde_user_id, last_accessed_at DESC)
WHERE status = 'active';

-- Create function to update last accessed timestamp
CREATE OR REPLACE FUNCTION update_workspace_access(
  user_id TEXT,
  workspace_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE organization_members 
  SET last_accessed_at = NOW()
  WHERE kinde_user_id = user_id 
    AND organization_id = workspace_id
    AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user's last accessed workspace
CREATE OR REPLACE FUNCTION get_last_accessed_workspace(user_id TEXT)
RETURNS TABLE(
  workspace_id UUID,
  workspace_name VARCHAR,
  workspace_slug VARCHAR,
  last_accessed TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.slug,
    om.last_accessed_at
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.kinde_user_id = user_id 
    AND om.status = 'active'
    AND om.last_accessed_at IS NOT NULL
  ORDER BY om.last_accessed_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_workspace_access(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_last_accessed_workspace(TEXT) TO authenticated;

-- Comment on the new functionality
COMMENT ON COLUMN organization_members.last_accessed_at IS 'Timestamp of when user last accessed this workspace, used for smart routing';
COMMENT ON FUNCTION update_workspace_access IS 'Updates the last accessed timestamp for a user-workspace pair';
COMMENT ON FUNCTION get_last_accessed_workspace IS 'Returns the most recently accessed workspace for a user';