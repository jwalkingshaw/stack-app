BEGIN;

ALTER TABLE IF EXISTS organization_localization_settings
  ADD COLUMN IF NOT EXISTS deepl_glossary_id TEXT,
  ADD COLUMN IF NOT EXISTS brand_instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferred_tone TEXT NOT NULL DEFAULT 'neutral';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_localization_settings'
      AND column_name = 'preferred_tone'
  ) THEN
    BEGIN
      ALTER TABLE organization_localization_settings
        ADD CONSTRAINT organization_localization_settings_preferred_tone_check
          CHECK (preferred_tone IN ('neutral', 'formal', 'informal', 'professional', 'friendly'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

UPDATE organization_localization_settings
SET
  brand_instructions = COALESCE(brand_instructions, ''),
  preferred_tone = CASE
    WHEN preferred_tone IN ('neutral', 'formal', 'informal', 'professional', 'friendly')
      THEN preferred_tone
    ELSE 'neutral'
  END;

COMMENT ON COLUMN organization_localization_settings.deepl_glossary_id IS
  'Default DeepL glossary ID used by translation/write jobs for this organization.';
COMMENT ON COLUMN organization_localization_settings.brand_instructions IS
  'Brand writing guidance injected into provider write/translation context.';
COMMENT ON COLUMN organization_localization_settings.preferred_tone IS
  'Preferred writing tone for AI-generated suggestions.';

COMMIT;

