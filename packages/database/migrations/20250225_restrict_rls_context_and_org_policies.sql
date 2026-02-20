-- Migration: Restrict RLS context helper and align org policies to app settings
-- Date: 2025-02-25

BEGIN;

-- Restrict set_rls_setting to trusted roles only.
REVOKE ALL ON FUNCTION public.set_rls_setting(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_rls_setting(TEXT, TEXT, BOOLEAN)
    FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_rls_setting(TEXT, TEXT, BOOLEAN)
    TO service_role;

-- Align org-scoped policies with app.current_org_code instead of auth.jwt().
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view folders in their organization" ON dam_folders;
DROP POLICY IF EXISTS "Users can create folders in their organization" ON dam_folders;
DROP POLICY IF EXISTS "Users can update folders in their organization" ON dam_folders;
DROP POLICY IF EXISTS "Users can delete folders in their organization" ON dam_folders;
DROP POLICY IF EXISTS "Users can view assets in their organization" ON dam_assets;
DROP POLICY IF EXISTS "Users can create assets in their organization" ON dam_assets;
DROP POLICY IF EXISTS "Users can update assets in their organization" ON dam_assets;
DROP POLICY IF EXISTS "Users can delete assets in their organization" ON dam_assets;
DROP POLICY IF EXISTS "Users can view collections in their organization" ON dam_collections;
DROP POLICY IF EXISTS "Users can create collections in their organization" ON dam_collections;
DROP POLICY IF EXISTS "Users can update collections in their organization" ON dam_collections;
DROP POLICY IF EXISTS "Users can delete collections in their organization" ON dam_collections;

CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT USING (
    kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
  );

CREATE POLICY "Users can update their organization" ON organizations
  FOR UPDATE USING (
    kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
  );

CREATE POLICY "Users can view folders in their organization" ON dam_folders
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can create folders in their organization" ON dam_folders
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can update folders in their organization" ON dam_folders
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can delete folders in their organization" ON dam_folders
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can view assets in their organization" ON dam_assets
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can create assets in their organization" ON dam_assets
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can update assets in their organization" ON dam_assets
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can delete assets in their organization" ON dam_assets
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can view collections in their organization" ON dam_collections
  FOR SELECT USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can create collections in their organization" ON dam_collections
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can update collections in their organization" ON dam_collections
  FOR UPDATE USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

CREATE POLICY "Users can delete collections in their organization" ON dam_collections
  FOR DELETE USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE kinde_org_id = NULLIF(current_setting('app.current_org_code', true), '')
    )
  );

COMMIT;
