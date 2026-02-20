import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

// Load environment variables from multiple possible locations
config({ path: join(__dirname, '../../apps/saas-web/.env.local') });
config({ path: join(__dirname, '.env.local') });
config({ path: '.env.local' });

async function setupProducts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing Supabase environment variables');
    console.log('Please ensure these are set in your .env.local files:');
    console.log('- NEXT_PUBLIC_SUPABASE_URL');
    console.log('- SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  console.log('🚀 Setting up Product Information Management (PIM) schema...');
  console.log(`📍 Connecting to: ${supabaseUrl}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // Test connection first
    console.log('🔗 Testing connection...');
    const { data, error: testError } = await supabase.from('organizations').select('id').limit(1);
    if (testError) {
      console.error('❌ Connection failed:', testError.message);
      return;
    }
    console.log('✅ Connection successful!');

    // Read and execute the product migration
    console.log('\n📄 Running PIM migration...');
    const migrationPath = join(__dirname, 'migrations', '010_product_information_management.sql');
    const sql = readFileSync(migrationPath, 'utf-8');

    // Execute the migration using Supabase's SQL editor functionality
    console.log('  Creating product tables and relationships...');
    const { data: result, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('❌ Migration failed:', error.message);
      return;
    }

    console.log('✅ Successfully created PIM schema!');
    
    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
    const tables = ['products', 'product_families', 'product_assets'];
    
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error && !error.message.includes('relation')) {
        console.log(`❌ Issue with ${table}:`, error.message);
      } else {
        console.log(`✅ Table ${table} is ready`);
      }
    }

    console.log('\n🎉 PIM setup complete!');
    console.log('📋 Next steps:');
    console.log('  1. Create API routes for product CRUD operations');
    console.log('  2. Build product creation forms');
    console.log('  3. Connect PIM table to real data');

  } catch (err) {
    console.error('❌ Setup failed:', err);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupProducts().catch(console.error);
}

export { setupProducts };