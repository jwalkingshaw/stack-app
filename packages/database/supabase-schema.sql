-- Complete Database Schema for Tradetool DAM
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table (synced from Kinde)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kinde_org_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  storage_used BIGINT DEFAULT 0,
  storage_limit BIGINT DEFAULT 5368709120, -- 5GB default
  industry TEXT,
  team_size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_kinde_org_id ON organizations(kinde_org_id);
CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations(industry);

-- DAM Folders table
CREATE TABLE IF NOT EXISTS dam_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES dam_folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL, -- Computed path for fast queries (e.g., "/folder1/subfolder2")
  created_by TEXT NOT NULL, -- Kinde user ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for folder queries
CREATE INDEX IF NOT EXISTS idx_dam_folders_organization_id ON dam_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_dam_folders_parent_id ON dam_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_dam_folders_path ON dam_folders(path);

-- DAM Assets table
CREATE TABLE IF NOT EXISTS dam_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES dam_folders(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- image, video, document, other
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  thumbnail_urls JSONB DEFAULT '{}', -- {small: url, medium: url, large: url}
  metadata JSONB DEFAULT '{}', -- EXIF, dimensions, etc
  tags TEXT[] DEFAULT '{}',
  description TEXT,
  created_by TEXT NOT NULL, -- Kinde user ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for asset queries
CREATE INDEX IF NOT EXISTS idx_dam_assets_organization_id ON dam_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_dam_assets_folder_id ON dam_assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_dam_assets_file_type ON dam_assets(file_type);
CREATE INDEX IF NOT EXISTS idx_dam_assets_created_at ON dam_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dam_assets_tags ON dam_assets USING GIN(tags);

-- Full-text search index on filename and description
CREATE INDEX IF NOT EXISTS idx_dam_assets_search ON dam_assets USING GIN(
  to_tsvector('english', filename || ' ' || COALESCE(description, ''))
);

-- DAM Collections table
CREATE TABLE IF NOT EXISTS dam_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  asset_ids UUID[] DEFAULT '{}',
  created_by TEXT NOT NULL, -- Kinde user ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for collections
CREATE INDEX IF NOT EXISTS idx_dam_collections_organization_id ON dam_collections(organization_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_dam_folders_updated_at ON dam_folders;
CREATE TRIGGER update_dam_folders_updated_at BEFORE UPDATE ON dam_folders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_dam_assets_updated_at ON dam_assets;
CREATE TRIGGER update_dam_assets_updated_at BEFORE UPDATE ON dam_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_dam_collections_updated_at ON dam_collections;
CREATE TRIGGER update_dam_collections_updated_at BEFORE UPDATE ON dam_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update storage usage when assets are added/removed
CREATE OR REPLACE FUNCTION update_organization_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations 
    SET storage_used = storage_used + NEW.file_size 
    WHERE id = NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations 
    SET storage_used = storage_used - OLD.file_size 
    WHERE id = OLD.organization_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for storage tracking
DROP TRIGGER IF EXISTS update_storage_on_asset_insert ON dam_assets;
CREATE TRIGGER update_storage_on_asset_insert 
  AFTER INSERT ON dam_assets 
  FOR EACH ROW EXECUTE FUNCTION update_organization_storage();

DROP TRIGGER IF EXISTS update_storage_on_asset_delete ON dam_assets;
CREATE TRIGGER update_storage_on_asset_delete 
  AFTER DELETE ON dam_assets 
  FOR EACH ROW EXECUTE FUNCTION update_organization_storage();

-- Insert demo organization
INSERT INTO organizations (kinde_org_id, name, slug, industry, team_size)
VALUES ('demo-org', 'Demo Organization', 'demo-org', 'technology', '1-5')
ON CONFLICT (slug) DO UPDATE SET 
  industry = EXCLUDED.industry,
  team_size = EXCLUDED.team_size;

-- Row Level Security (RLS) Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_collections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (ignore errors if they don't exist)
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
DROP POLICY IF EXISTS "Users can insert organizations" ON organizations;
DROP POLICY IF EXISTS "Users can update their organizations" ON organizations;

DROP POLICY IF EXISTS "Users can view folders in their organizations" ON dam_folders;
DROP POLICY IF EXISTS "Users can insert folders in their organizations" ON dam_folders;
DROP POLICY IF EXISTS "Users can update folders in their organizations" ON dam_folders;
DROP POLICY IF EXISTS "Users can delete folders in their organizations" ON dam_folders;

DROP POLICY IF EXISTS "Users can view assets in their organizations" ON dam_assets;
DROP POLICY IF EXISTS "Users can insert assets in their organizations" ON dam_assets;
DROP POLICY IF EXISTS "Users can update assets in their organizations" ON dam_assets;
DROP POLICY IF EXISTS "Users can delete assets in their organizations" ON dam_assets;

DROP POLICY IF EXISTS "Users can view collections in their organizations" ON dam_collections;
DROP POLICY IF EXISTS "Users can insert collections in their organizations" ON dam_collections;
DROP POLICY IF EXISTS "Users can update collections in their organizations" ON dam_collections;
DROP POLICY IF EXISTS "Users can delete collections in their organizations" ON dam_collections;

-- Basic RLS policies (you can refine these based on your auth requirements)
-- For now, allow service role to access everything

-- Organizations: Users can only see organizations they belong to
CREATE POLICY "Users can view their organizations" ON organizations
  FOR SELECT USING (true); -- For now, allow all (will be refined with Kinde integration)

CREATE POLICY "Users can insert organizations" ON organizations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their organizations" ON organizations
  FOR UPDATE USING (true);

-- Folders: Users can only access folders in their organizations
CREATE POLICY "Users can view folders in their organizations" ON dam_folders
  FOR SELECT USING (true);

CREATE POLICY "Users can insert folders in their organizations" ON dam_folders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update folders in their organizations" ON dam_folders
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete folders in their organizations" ON dam_folders
  FOR DELETE USING (true);

-- Assets: Users can only access assets in their organizations
CREATE POLICY "Users can view assets in their organizations" ON dam_assets
  FOR SELECT USING (true);

CREATE POLICY "Users can insert assets in their organizations" ON dam_assets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update assets in their organizations" ON dam_assets
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete assets in their organizations" ON dam_assets
  FOR DELETE USING (true);

-- Collections: Users can only access collections in their organizations
CREATE POLICY "Users can view collections in their organizations" ON dam_collections
  FOR SELECT USING (true);

CREATE POLICY "Users can insert collections in their organizations" ON dam_collections
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update collections in their organizations" ON dam_collections
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete collections in their organizations" ON dam_collections
  FOR DELETE USING (true);