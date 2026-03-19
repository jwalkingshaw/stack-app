import { createBrowserClient, createServerClient } from "@tradetool/database";

// Client-side Supabase instance
export const supabase = createBrowserClient();

// Server-side Supabase instance (for API routes)
export const supabaseServer = createServerClient();
