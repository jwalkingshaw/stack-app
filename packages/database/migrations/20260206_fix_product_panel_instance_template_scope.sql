-- Migration: Replace invalid check constraint with trigger validation
-- Date: 2026-02-06

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'product_panel_instances'
    ) THEN
        -- Drop invalid constraint if present
        ALTER TABLE product_panel_instances
            DROP CONSTRAINT IF EXISTS product_panel_instances_template_scope_check;

        -- Validate that template is global or matches product organization
        CREATE OR REPLACE FUNCTION validate_product_panel_instance_template_scope()
        RETURNS TRIGGER AS $fn$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM products p
                JOIN product_table_templates ptt
                  ON ptt.id = NEW.template_id
                WHERE p.id = NEW.product_id
                  AND (
                      ptt.organization_id IS NULL
                      OR ptt.organization_id = p.organization_id
                  )
            ) THEN
                RAISE EXCEPTION 'Template does not match product organization scope';
            END IF;

            RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS validate_product_panel_instance_template_scope_trigger
            ON product_panel_instances;

        CREATE TRIGGER validate_product_panel_instance_template_scope_trigger
            BEFORE INSERT OR UPDATE ON product_panel_instances
            FOR EACH ROW
            EXECUTE FUNCTION validate_product_panel_instance_template_scope();
    END IF;
END $$;

COMMIT;
