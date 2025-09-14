import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Client-side Supabase client (with user auth)
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// Server-side Supabase client (with service role for bypassing RLS)
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Server-side client with user context (respects RLS)
export function createServerClientWithAuth(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  return createClient<Database>(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
    },
  });
}

// Set custom JWT for Supabase to enforce RLS based on Kinde org
export function setSupabaseJWT(client: ReturnType<typeof createClient>, kindeOrgCode: string, kindeUserId: string) {
  // Create a custom JWT payload that Supabase RLS can use
  const customPayload = {
    sub: kindeUserId,
    org_code: kindeOrgCode,
    role: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
  };
  
  // Note: In production, you'd want to sign this JWT with your Supabase JWT secret
  // For now, we'll rely on the organization filtering in RLS policies
  return client;
}