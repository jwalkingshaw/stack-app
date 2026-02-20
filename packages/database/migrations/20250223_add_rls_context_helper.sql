-- Migration: Add helper function to set Postgres settings via Supabase RPC
-- Date: 2025-02-23

BEGIN;

CREATE OR REPLACE FUNCTION public.set_rls_setting(
    setting_name TEXT,
    new_value TEXT,
    is_local BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM set_config(setting_name, new_value, is_local);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_rls_setting(TEXT, TEXT, BOOLEAN)
    TO anon, authenticated, service_role;

COMMIT;
