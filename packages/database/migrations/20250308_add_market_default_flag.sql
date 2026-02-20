BEGIN;

ALTER TABLE markets
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS unique_default_market_per_org
    ON markets (organization_id)
    WHERE is_default;

ALTER TABLE organizations
    DROP COLUMN IF EXISTS default_market_id,
    DROP COLUMN IF EXISTS default_locale_id,
    DROP COLUMN IF EXISTS default_currency_code,
    DROP COLUMN IF EXISTS default_timezone;

COMMIT;
