BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_ui_locale TEXT NOT NULL DEFAULT 'en-US';

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS ui_locale_override TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_default_ui_locale_format'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_default_ui_locale_format
      CHECK (default_ui_locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_members_ui_locale_override_format'
  ) THEN
    ALTER TABLE organization_members
      ADD CONSTRAINT organization_members_ui_locale_override_format
      CHECK (
        ui_locale_override IS NULL
        OR ui_locale_override ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
      );
  END IF;
END $$;

UPDATE organizations
SET default_ui_locale = 'en-US'
WHERE default_ui_locale IS NULL OR btrim(default_ui_locale) = '';

COMMENT ON COLUMN organizations.default_ui_locale IS
  'Default workspace UI locale (for example en-US, es-MX).';
COMMENT ON COLUMN organization_members.ui_locale_override IS
  'Per-member UI locale override for a workspace. Null means use workspace default.';

COMMIT;
