BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_fields'
          AND column_name = 'is_scopable'
    ) THEN
        ALTER TABLE product_fields
            RENAME COLUMN is_scopable TO is_channelable;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_field_values'
          AND column_name = 'scope'
    ) THEN
        ALTER TABLE product_field_values
            RENAME COLUMN scope TO channel;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_field_values'
          AND column_name = 'channel'
    ) THEN
        ALTER TABLE product_field_values
            DROP CONSTRAINT IF EXISTS unique_product_field_locale_scope;
        ALTER TABLE product_field_values
            DROP CONSTRAINT IF EXISTS unique_product_field_locale_channel;
        ALTER TABLE product_field_values
            ADD CONSTRAINT unique_product_field_locale_channel
            UNIQUE (product_id, product_field_id, locale, channel);

        DROP INDEX IF EXISTS idx_product_field_values_scope;
        CREATE INDEX IF NOT EXISTS idx_product_field_values_channel
            ON product_field_values(channel);
    END IF;
END $$;

COMMIT;
