BEGIN;

ALTER TABLE markets
    ADD COLUMN IF NOT EXISTS currency_code TEXT,
    ADD COLUMN IF NOT EXISTS timezone TEXT,
    ADD COLUMN IF NOT EXISTS default_locale_id UUID REFERENCES locales(id) ON DELETE SET NULL;

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS default_market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS default_locale_id UUID REFERENCES locales(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS default_currency_code TEXT,
    ADD COLUMN IF NOT EXISTS default_timezone TEXT;

COMMIT;
