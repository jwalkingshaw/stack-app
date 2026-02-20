BEGIN;

CREATE TABLE IF NOT EXISTS countries (
    code VARCHAR(2) PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS country_locales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
    locale_code VARCHAR(10) NOT NULL,
    locale_name VARCHAR(255) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT unique_country_locale UNIQUE (country_code, locale_code)
);

CREATE INDEX IF NOT EXISTS idx_country_locales_country_code ON country_locales(country_code);
CREATE INDEX IF NOT EXISTS idx_country_locales_locale_code ON country_locales(locale_code);

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_locales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'countries'
          AND policyname = 'Authenticated read access for countries'
    ) THEN
        CREATE POLICY "Authenticated read access for countries" ON countries
            FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'country_locales'
          AND policyname = 'Authenticated read access for country locales'
    ) THEN
        CREATE POLICY "Authenticated read access for country locales" ON country_locales
            FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'countries'
          AND policyname = 'Service role can manage countries'
    ) THEN
        CREATE POLICY "Service role can manage countries" ON countries
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'country_locales'
          AND policyname = 'Service role can manage country locales'
    ) THEN
        CREATE POLICY "Service role can manage country locales" ON country_locales
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

INSERT INTO countries (code, name) VALUES
    ('AU', 'Australia'),
    ('BR', 'Brazil'),
    ('CA', 'Canada'),
    ('CH', 'Switzerland'),
    ('CN', 'China'),
    ('DE', 'Germany'),
    ('ES', 'Spain'),
    ('FR', 'France'),
    ('GB', 'United Kingdom'),
    ('HK', 'Hong Kong'),
    ('ID', 'Indonesia'),
    ('IE', 'Ireland'),
    ('IN', 'India'),
    ('IT', 'Italy'),
    ('JP', 'Japan'),
    ('KR', 'South Korea'),
    ('MX', 'Mexico'),
    ('MY', 'Malaysia'),
    ('NL', 'Netherlands'),
    ('NZ', 'New Zealand'),
    ('PH', 'Philippines'),
    ('SA', 'Saudi Arabia'),
    ('SE', 'Sweden'),
    ('SG', 'Singapore'),
    ('TH', 'Thailand'),
    ('TR', 'Turkey'),
    ('TW', 'Taiwan'),
    ('US', 'United States'),
    ('VN', 'Vietnam'),
    ('ZA', 'South Africa')
ON CONFLICT (code) DO NOTHING;

INSERT INTO country_locales (country_code, locale_code, locale_name, is_primary) VALUES
    ('AU', 'en-AU', 'English (Australia)', true),
    ('BR', 'pt-BR', 'Portuguese (Brazil)', true),
    ('CA', 'en-CA', 'English (Canada)', true),
    ('CA', 'fr-CA', 'French (Canada)', false),
    ('CH', 'de-CH', 'German (Switzerland)', true),
    ('CH', 'fr-CH', 'French (Switzerland)', false),
    ('CH', 'it-CH', 'Italian (Switzerland)', false),
    ('CN', 'zh-CN', 'Chinese (Simplified)', true),
    ('DE', 'de-DE', 'German (Germany)', true),
    ('ES', 'es-ES', 'Spanish (Spain)', true),
    ('FR', 'fr-FR', 'French (France)', true),
    ('GB', 'en-GB', 'English (United Kingdom)', true),
    ('HK', 'zh-HK', 'Chinese (Hong Kong)', true),
    ('HK', 'en-HK', 'English (Hong Kong)', false),
    ('ID', 'id-ID', 'Indonesian (Indonesia)', true),
    ('IE', 'en-IE', 'English (Ireland)', true),
    ('IN', 'en-IN', 'English (India)', true),
    ('IN', 'hi-IN', 'Hindi (India)', false),
    ('IT', 'it-IT', 'Italian (Italy)', true),
    ('JP', 'ja-JP', 'Japanese (Japan)', true),
    ('KR', 'ko-KR', 'Korean (South Korea)', true),
    ('MX', 'es-MX', 'Spanish (Mexico)', true),
    ('MY', 'ms-MY', 'Malay (Malaysia)', true),
    ('MY', 'en-MY', 'English (Malaysia)', false),
    ('NL', 'nl-NL', 'Dutch (Netherlands)', true),
    ('NZ', 'en-NZ', 'English (New Zealand)', true),
    ('PH', 'en-PH', 'English (Philippines)', true),
    ('PH', 'fil-PH', 'Filipino (Philippines)', false),
    ('SA', 'ar-SA', 'Arabic (Saudi Arabia)', true),
    ('SE', 'sv-SE', 'Swedish (Sweden)', true),
    ('SG', 'en-SG', 'English (Singapore)', true),
    ('SG', 'zh-SG', 'Chinese (Singapore)', false),
    ('TH', 'th-TH', 'Thai (Thailand)', true),
    ('TR', 'tr-TR', 'Turkish (Turkey)', true),
    ('TW', 'zh-TW', 'Chinese (Taiwan)', true),
    ('US', 'en-US', 'English (United States)', true),
    ('US', 'es-US', 'Spanish (United States)', false),
    ('VN', 'vi-VN', 'Vietnamese (Vietnam)', true),
    ('ZA', 'en-ZA', 'English (South Africa)', true),
    ('ZA', 'af-ZA', 'Afrikaans (South Africa)', false)
ON CONFLICT ON CONSTRAINT unique_country_locale DO NOTHING;

DO $$
BEGIN
    INSERT INTO countries (code, name)
    SELECT DISTINCT m.code, 'Unknown (Legacy)'
    FROM markets m
    WHERE m.code IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM countries c WHERE c.code = m.code
      );

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'markets'
          AND constraint_name = 'markets_country_code_fkey'
    ) THEN
        ALTER TABLE markets
        ADD CONSTRAINT markets_country_code_fkey
        FOREIGN KEY (code) REFERENCES countries(code) ON DELETE RESTRICT;
    END IF;
END $$;

COMMIT;
