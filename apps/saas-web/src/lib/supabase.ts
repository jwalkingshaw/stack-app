import { createBrowserClient, createServerClient } from "@stack-app/database";

let _supabaseServer: ReturnType<typeof createServerClient> | null = null;

export function getSupabaseServer() {
  if (!_supabaseServer) _supabaseServer = createServerClient();
  return _supabaseServer;
}

let _supabase: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!_supabase) _supabase = createBrowserClient();
  return _supabase;
}
