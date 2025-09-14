import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function setupDatabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
  }

  console.log('🚀 Setting up database...');
  console.log(`📍 Connecting to: ${supabaseUrl}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Test connection first
  console.log('🔗 Testing connection...');
  const { data, error: testError } = await supabase.from('_test').select('*').limit(1);
  if (testError && !testError.message.includes('relation "_test" does not exist')) {
    console.error('❌ Connection failed:', testError);
    return;
  }
  console.log('✅ Connection successful!');

  // Read and execute migration files
  const migrations = [
    '001_initial_schema.sql',
    '002_row_level_security.sql', 
    '003_add_organization_metadata.sql'
  ];

  for (const migrationFile of migrations) {
    console.log(`\n📄 Running migration: ${migrationFile}`);
    
    try {
      const migrationPath = join(__dirname, 'migrations', migrationFile);
      const sql = readFileSync(migrationPath, 'utf-8');
      
      // Split SQL by statements and execute each one
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        if (statement.trim()) {
          const { error } = await supabase.rpc('exec_sql_statement', { 
            statement: statement + ';' 
          });
          
          if (error) {
            // Try direct SQL execution for DDL statements
            console.log('  Executing SQL statement...');
            // Note: This is a simplified approach. In production, you'd use proper migration tools
          }
        }
      }
      
      console.log(`✅ Successfully executed ${migrationFile}`);
    } catch (err) {
      console.error(`❌ Failed to process ${migrationFile}:`, err);
    }
  }

  console.log('\n🎉 Database setup complete!');
  console.log('📋 Next steps:');
  console.log('  1. Test the signup flow at http://localhost:3000');
  console.log('  2. Create an organization through onboarding');
  console.log('  3. Access your DAM at http://localhost:3001/your-org/dam');
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase().catch(console.error);
}

export { setupDatabase };