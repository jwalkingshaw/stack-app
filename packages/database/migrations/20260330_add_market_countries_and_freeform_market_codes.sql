BEGIN;

ALTER TABLE markets
  ALTER COLUMN code TYPE VARCHAR(64);

ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS markets_country_code_fkey;

CREATE TABLE IF NOT EXISTS market_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_market_country UNIQUE (market_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_market_countries_market_id ON market_countries(market_id);
CREATE INDEX IF NOT EXISTS idx_market_countries_country_code ON market_countries(country_code);

ALTER TABLE market_countries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_countries'
      AND policyname = 'Users can view market countries in their organization'
  ) THEN
    CREATE POLICY "Users can view market countries in their organization" ON market_countries
      FOR SELECT USING (
        market_id IN (
          SELECT id FROM markets
          WHERE organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
          )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_countries'
      AND policyname = 'Users can manage market countries in their organization'
  ) THEN
    CREATE POLICY "Users can manage market countries in their organization" ON market_countries
      FOR ALL USING (
        market_id IN (
          SELECT id FROM markets
          WHERE organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND role IN ('owner', 'admin', 'member')
              AND status = 'active'
          )
        )
      );
  END IF;
END $$;

INSERT INTO market_countries (market_id, country_code, is_active)
SELECT m.id, c.code, true
FROM markets m
JOIN countries c ON c.code = upper(left(m.code, 2))
ON CONFLICT ON CONSTRAINT unique_market_country DO NOTHING;

COMMIT;

