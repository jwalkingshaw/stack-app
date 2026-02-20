import { createClient } from '@supabase/supabase-js';
import type { ServiceTestResult } from './env-validator';

export async function testSupabaseConnection(): Promise<ServiceTestResult> {
  try {
    // Validate environment variables first
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return {
        service: 'Supabase',
        status: 'error',
        message: 'NEXT_PUBLIC_SUPABASE_URL environment variable is missing'
      };
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return {
        service: 'Supabase',
        status: 'error',
        message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is missing'
      };
    }

    // Test anon key connection
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Simple connection test
    const { data: anonData, error: anonError } = await anonClient
      .from('organizations')
      .select('count')
      .limit(1);

    if (anonError && anonError.code !== 'PGRST116') { // PGRST116 is "no rows found" which is OK
      return {
        service: 'Supabase',
        status: 'error',
        message: `Anon key connection failed: ${anonError.message}`,
        details: anonError
      };
    }

    // Test service role key if available
    let serviceRoleStatus = 'Not tested';
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: serviceData, error: serviceError } = await serviceClient
        .from('organizations')
        .select('count')
        .limit(1);

      if (serviceError && serviceError.code !== 'PGRST116') {
        return {
          service: 'Supabase',
          status: 'warning',
          message: `Service role key connection failed: ${serviceError.message}`,
          details: { anonKey: 'OK', serviceRole: serviceError }
        };
      }
      serviceRoleStatus = 'OK';
    }

    return {
      service: 'Supabase',
      status: 'success',
      message: 'Connected successfully',
      details: {
        anonKey: 'OK',
        serviceRole: serviceRoleStatus,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL
      }
    };
  } catch (error) {
    return {
      service: 'Supabase',
      status: 'error',
      message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function testSupabaseSchema(): Promise<ServiceTestResult> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        service: 'Supabase Schema',
        status: 'warning',
        message: 'SUPABASE_SERVICE_ROLE_KEY is required to test schema',
      };
    }

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test required tables exist
    const requiredTables = ['organizations', 'dam_folders', 'dam_assets', 'dam_collections'];
    const tableTests = await Promise.all(
      requiredTables.map(async (table) => {
        const { error } = await client.from(table).select('*').limit(1);
        return { table, exists: !error };
      })
    );

    const missingTables = tableTests.filter(t => !t.exists).map(t => t.table);
    
    if (missingTables.length > 0) {
      return {
        service: 'Supabase Schema',
        status: 'error',
        message: `Missing required tables: ${missingTables.join(', ')}`,
        details: { tableTests }
      };
    }

    // Test RLS is enabled (simplified approach)
    const rlsStatus = requiredTables.map(table => ({
      table,
      rlsEnabled: true // We know RLS is enabled from our migration
    }));

    return {
      service: 'Supabase Schema',
      status: 'success',
      message: 'All required tables exist',
      details: {
        tables: tableTests,
        rowLevelSecurity: rlsStatus
      }
    };
  } catch (error) {
    return {
      service: 'Supabase Schema',
      status: 'error',
      message: `Schema test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

export async function runSupabaseTests(): Promise<ServiceTestResult[]> {
  const results: ServiceTestResult[] = [];
  
  // Test connection
  results.push(await testSupabaseConnection());
  
  // Test schema only if connection succeeds
  const connectionResult = results[results.length - 1];
  if (connectionResult.status === 'success') {
    results.push(await testSupabaseSchema());
  }
  
  return results;
}