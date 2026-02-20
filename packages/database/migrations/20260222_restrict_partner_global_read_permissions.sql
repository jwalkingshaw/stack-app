BEGIN;

-- Partners should not receive global organization-wide read by default.
-- They must be granted explicit market/channel/collection scope via member_scope_permissions.
UPDATE role_permission_templates
SET is_allowed = FALSE
WHERE role = 'partner'
  AND permission_key IN (
    'product.market.scope.read',
    'asset.download.derivative'
  );

COMMIT;
