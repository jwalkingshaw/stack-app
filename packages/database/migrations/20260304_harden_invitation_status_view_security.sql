BEGIN;

-- Ensure the invitation status projection uses caller permissions/RLS,
-- not the view owner's privileges.
ALTER VIEW IF EXISTS public.invitation_status_view
SET (security_invoker = true);

-- Defensive hardening: do not expose this derived view to broad API roles by default.
DO $$
BEGIN
  REVOKE ALL ON TABLE public.invitation_status_view FROM PUBLIC;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.invitation_status_view FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.invitation_status_view FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON TABLE public.invitation_status_view TO service_role;
  END IF;
END
$$;

COMMENT ON VIEW public.invitation_status_view IS
  'Canonical derived status for invitation lifecycle: pending, accepted, declined, revoked, expired. SECURITY INVOKER enforced so base-table RLS applies to querying role.';

COMMIT;
