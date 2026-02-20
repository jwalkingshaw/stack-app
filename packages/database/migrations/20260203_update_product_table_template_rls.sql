-- Migration: Update product table template RLS to respect org membership
-- Date: 2026-02-03

BEGIN;

DROP POLICY IF EXISTS product_table_templates_select_policy ON product_table_templates;
DROP POLICY IF EXISTS product_table_templates_tenant_manage_policy ON product_table_templates;

-- Global templates are visible to all authenticated users.
-- Tenant templates are visible only to members of that organization.
CREATE POLICY product_table_templates_select_policy ON product_table_templates
    FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND status = 'active'
        )
    );

-- Tenant template management restricted to active org members.
CREATE POLICY product_table_templates_tenant_manage_policy ON product_table_templates
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND role IN ('owner', 'admin', 'member')
              AND status = 'active'
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE kinde_user_id = current_setting('app.current_user_id', true)
              AND role IN ('owner', 'admin', 'member')
              AND status = 'active'
        )
    );

COMMIT;
