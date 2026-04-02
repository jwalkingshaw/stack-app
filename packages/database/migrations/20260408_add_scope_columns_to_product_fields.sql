-- Add scope filter columns to product_fields
-- These allow fields to be scoped to specific channels, markets, or locales.
-- Without these columns the field-groups API falls back to a legacy query on
-- every request (42703 error → retry), doubling the number of round trips.
--
-- All three columns are nullable arrays, defaulting to NULL (= no restriction).
-- An empty array means "not available in any scope"; NULL means "available in all".

ALTER TABLE public.product_fields
  ADD COLUMN IF NOT EXISTS allowed_channel_ids UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_market_ids  UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_locale_ids  UUID[] DEFAULT NULL;

-- GIN indexes for efficient @> / && array operators used by scope filtering
CREATE INDEX IF NOT EXISTS idx_product_fields_allowed_channel_ids
  ON public.product_fields USING GIN (allowed_channel_ids)
  WHERE allowed_channel_ids IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_fields_allowed_market_ids
  ON public.product_fields USING GIN (allowed_market_ids)
  WHERE allowed_market_ids IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_fields_allowed_locale_ids
  ON public.product_fields USING GIN (allowed_locale_ids)
  WHERE allowed_locale_ids IS NOT NULL;
