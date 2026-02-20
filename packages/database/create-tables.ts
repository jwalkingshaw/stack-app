import { createClient } from '@supabase/supabase-js';

async function createTables() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing Supabase environment variables');
    console.log('Please ensure these are set in your .env.local:');
    console.log('- NEXT_PUBLIC_SUPABASE_URL');
    console.log('- SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  console.log('🚀 Creating database tables...');
  console.log(`📍 Connecting to: ${supabaseUrl}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // Create organizations table
    console.log('\n📋 Creating organizations table...');
    await supabase.rpc('exec_sql', {
      sql: `
        -- Enable UUID extension
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        -- Organizations table (synced from Kinde)
        CREATE TABLE IF NOT EXISTS organizations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          kinde_org_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          storage_used BIGINT DEFAULT 0,
          storage_limit BIGINT DEFAULT 5368709120,
          industry TEXT,
          team_size TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
        CREATE INDEX IF NOT EXISTS idx_organizations_kinde_org_id ON organizations(kinde_org_id);
        CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations(industry);
      `
    });

    console.log('✅ Organizations table created');

    // Create folders table
    console.log('\n📁 Creating dam_folders table...');
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS dam_folders (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          parent_id UUID REFERENCES dam_folders(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_dam_folders_organization_id ON dam_folders(organization_id);
        CREATE INDEX IF NOT EXISTS idx_dam_folders_parent_id ON dam_folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_dam_folders_path ON dam_folders(path);
      `
    });

    console.log('✅ DAM folders table created');

    // Create assets table
    console.log('\n🖼️ Creating dam_assets table...');
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS dam_assets (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          folder_id UUID REFERENCES dam_folders(id) ON DELETE SET NULL,
          filename TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          file_type TEXT NOT NULL,
          file_size BIGINT NOT NULL,
          mime_type TEXT NOT NULL,
          s3_key TEXT NOT NULL,
          s3_url TEXT NOT NULL,
          thumbnail_urls JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          tags TEXT[] DEFAULT '{}',
          description TEXT,
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_dam_assets_organization_id ON dam_assets(organization_id);
        CREATE INDEX IF NOT EXISTS idx_dam_assets_folder_id ON dam_assets(folder_id);
        CREATE INDEX IF NOT EXISTS idx_dam_assets_file_type ON dam_assets(file_type);
        CREATE INDEX IF NOT EXISTS idx_dam_assets_created_at ON dam_assets(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_dam_assets_tags ON dam_assets USING GIN(tags);
      `
    });

    console.log('✅ DAM assets table created');

    // Create collections table
    console.log('\n📚 Creating dam_collections table...');
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS dam_collections (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          asset_ids UUID[] DEFAULT '{}',
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_dam_collections_organization_id ON dam_collections(organization_id);
      `
    });

    console.log('✅ DAM collections table created');

    // Create triggers and functions
    console.log('\n⚙️ Creating triggers and functions...');
    await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    console.log('✅ Triggers and functions created');

    // Create demo organization
    console.log('\n🏢 Creating demo organization...');
    await supabase.rpc('exec_sql', {
      sql: `
        INSERT INTO organizations (kinde_org_id, name, slug, industry, team_size)
        VALUES ('demo-org', 'Demo Organization', 'demo-org', 'technology', '1-5')
        ON CONFLICT (slug) DO UPDATE SET 
          industry = EXCLUDED.industry,
          team_size = EXCLUDED.team_size;
      `
    });

    console.log('✅ Demo organization created');

    console.log('\n🎉 Database setup complete!');
    console.log('\n📋 Next steps:');
    console.log('  1. Test the signup flow at http://localhost:3000');
    console.log('  2. Create an organization through onboarding');
    console.log('  3. Access your DAM at http://localhost:3001/your-org/dam');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    console.log('\n💡 Try manually running the SQL in your Supabase dashboard:');
    console.log('   Dashboard → SQL Editor → New Query');
  }
}

// Run setup if called directly
if (require.main === module) {
  createTables().catch(console.error);
}

export { createTables };