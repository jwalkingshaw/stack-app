BEGIN;

CREATE TABLE IF NOT EXISTS locale_catalog (
  code VARCHAR(32) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_locale_catalog_sort_order ON locale_catalog(sort_order);
CREATE INDEX IF NOT EXISTS idx_locale_catalog_is_active ON locale_catalog(is_active);

ALTER TABLE locale_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'locale_catalog'
      AND policyname = 'Authenticated read access for locale catalog'
  ) THEN
    CREATE POLICY "Authenticated read access for locale catalog" ON locale_catalog
      FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'locale_catalog'
      AND policyname = 'Service role can manage locale catalog'
  ) THEN
    CREATE POLICY "Service role can manage locale catalog" ON locale_catalog
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

INSERT INTO locale_catalog (code, name, sort_order, is_active) VALUES
  ('en-US', 'English (United States)', 10, true),
  ('en-GB', 'English (United Kingdom)', 20, true),
  ('en-CA', 'English (Canada)', 30, true),
  ('en-AU', 'English (Australia)', 40, true),
  ('es-ES', 'Spanish (Spain)', 50, true),
  ('es-MX', 'Spanish (Mexico)', 60, true),
  ('es-US', 'Spanish (United States)', 70, true),
  ('pt-BR', 'Portuguese (Brazil)', 80, true),
  ('pt-PT', 'Portuguese (Portugal)', 90, true),
  ('fr-FR', 'French (France)', 100, true),
  ('fr-CA', 'French (Canada)', 110, true),
  ('de-DE', 'German (Germany)', 120, true),
  ('it-IT', 'Italian (Italy)', 130, true),
  ('nl-NL', 'Dutch (Netherlands)', 140, true),
  ('sv-SE', 'Swedish (Sweden)', 150, true),
  ('da-DK', 'Danish (Denmark)', 160, true),
  ('nb-NO', 'Norwegian Bokmal (Norway)', 170, true),
  ('fi-FI', 'Finnish (Finland)', 180, true),
  ('pl-PL', 'Polish (Poland)', 190, true),
  ('cs-CZ', 'Czech (Czechia)', 200, true),
  ('ro-RO', 'Romanian (Romania)', 210, true),
  ('hu-HU', 'Hungarian (Hungary)', 220, true),
  ('tr-TR', 'Turkish (Turkiye)', 230, true),
  ('el-GR', 'Greek (Greece)', 240, true),
  ('ja-JP', 'Japanese (Japan)', 250, true),
  ('ko-KR', 'Korean (South Korea)', 260, true),
  ('zh-CN', 'Chinese (Simplified)', 270, true),
  ('zh-TW', 'Chinese (Traditional)', 280, true),
  ('ar-SA', 'Arabic (Saudi Arabia)', 290, true),
  ('he-IL', 'Hebrew (Israel)', 300, true),
  ('hi-IN', 'Hindi (India)', 310, true),
  ('id-ID', 'Indonesian (Indonesia)', 320, true),
  ('ms-MY', 'Malay (Malaysia)', 330, true),
  ('th-TH', 'Thai (Thailand)', 340, true),
  ('vi-VN', 'Vietnamese (Vietnam)', 350, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

COMMIT;
