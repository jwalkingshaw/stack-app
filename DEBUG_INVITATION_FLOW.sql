-- DEBUG: Check Invitation Flow
-- Run these queries in your Supabase SQL editor

-- 1. Check if invitations are being created
SELECT
  i.id,
  i.email,
  i.role_or_access_level,
  i.organization_id,
  o.name as org_name,
  o.kinde_org_id,
  i.token,
  i.expires_at,
  i.accepted_at,
  i.created_at
FROM invitations i
LEFT JOIN organizations o ON o.id = i.organization_id
WHERE i.invitation_type = 'team_member'
  AND i.email IN ('jasonwalkingshaw@gmail.com', 'delivered@resend.dev')
ORDER BY i.created_at DESC
LIMIT 5;

-- Expected: Should show invitation records with accepted_at = NULL if not accepted yet


-- 2. Check if users were added to organization_members after accepting
SELECT
  om.id,
  om.email,
  om.kinde_user_id,
  om.role,
  om.can_download_assets,
  om.can_edit_products,
  om.can_manage_team,
  om.status,
  om.organization_id,
  o.name as org_name,
  o.kinde_org_id,
  om.joined_at,
  om.created_at
FROM organization_members om
LEFT JOIN organizations o ON o.id = om.organization_id
WHERE om.email IN ('jasonwalkingshaw@gmail.com', 'delivered@resend.dev')
ORDER BY om.created_at DESC;

-- Expected: Should show user IF they completed the acceptance flow


-- 3. Check what organization you're testing with
SELECT
  id,
  name,
  slug,
  kinde_org_id,
  created_at
FROM organizations
ORDER BY created_at DESC
LIMIT 3;

-- This shows your organization and the kinde_org_id being used


-- 4. Test the accept_invitation function manually
-- Replace these values with actual data from query #1
/*
SELECT accept_invitation(
  '{token_from_invitation}',
  '{kinde_user_id}',
  'jasonwalkingshaw@gmail.com'
);
*/

-- This will tell you if the database function works correctly
