import { createBrowserClient, createServerClient } from "@stack-app/database";

// Client-side Supabase instance
export const supabase: any = createBrowserClient();

// Server-side Supabase instance (for API routes)
export const supabaseServer: any = createServerClient();
