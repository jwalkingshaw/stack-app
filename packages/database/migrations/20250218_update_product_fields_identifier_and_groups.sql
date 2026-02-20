-- Update product field configuration:
-- 1. Allow 'identifier' type in product_fields constraint.
-- 2. Migrate legacy field_group_id column to assignment table and remove it.

BEGIN;

-- 1. Extend allowed field types to include identifier (idempotent)
ALTER TABLE product_fields
    DROP CONSTRAINT IF EXISTS product_fields_field_type_check;

ALTER TABLE product_fields
    ADD CONSTRAINT product_fields_field_type_check CHECK (field_type IN (
        'identifier',
        'text',
        'textarea',
        'number',
        'decimal',
        'boolean',
        'date',
        'datetime',
        'select',
        'multiselect',
        'file',
        'image',
        'url',
        'price',
        'measurement',
        'table'
    ));

-- 2. Migrate legacy field_group_id values into assignment table, then drop column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_fields'
          AND column_name = 'field_group_id'
    ) THEN
        INSERT INTO product_field_group_assignments (
            product_field_id,
            field_group_id,
            sort_order
        )
        SELECT
            pf.id,
            pf.field_group_id,
            pf.sort_order
        FROM product_fields pf
        WHERE pf.field_group_id IS NOT NULL
        ON CONFLICT (product_field_id, field_group_id) DO NOTHING;

        -- Drop dependent index if it exists
        IF EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'idx_product_fields_field_group_id'
        ) THEN
            DROP INDEX idx_product_fields_field_group_id;
        END IF;

        ALTER TABLE product_fields
            DROP COLUMN field_group_id;
    END IF;
END $$;

COMMIT;
