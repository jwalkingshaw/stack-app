BEGIN;

REVOKE EXECUTE ON FUNCTION accept_invitation(TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION accept_invitation(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT, TEXT, TEXT) TO service_role;

COMMIT;
