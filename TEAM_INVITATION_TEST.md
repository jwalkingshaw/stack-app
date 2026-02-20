# Team Invitation System - End-to-End Test Guide

## System Overview

Your team invitation system is now fully implemented with:
- ✅ Team management UI at `/{tenant}/team`
- ✅ Kinde Management API integration
- ✅ Resend email service
- ✅ Database permissions model
- ✅ Passwordless authentication flow

## Test Workflow

### Step 1: Navigate to Team Page
1. Open your browser at `http://localhost:3001`
2. Login with your Kinde account
3. Select your organization
4. Click "Team" in the sidebar (or navigate to `/{tenant}/team`)

**Expected Result:**
- You should see the Team page with your current members
- Page header shows member count
- "Invite Member" button is visible (if you're admin/owner)

### Step 2: Invite a Team Member
1. Click the "Invite Member" button
2. A modal should open with:
   - Email input field
   - Role dropdown (Admin, Editor, Viewer)
3. Enter a test email address (use a real email you can access)
4. Select a role (try "Viewer" first for testing)
5. Click "Send Invitation"

**Expected Result:**
- Success message: "Invitation sent successfully!"
- Modal closes after 2 seconds
- New invitation appears in "Pending Invitations" section

**Backend Actions:**
- ✅ User created in Kinde (if new)
- ✅ User added to Kinde organization
- ✅ Invitation record created in database
- ✅ Email sent via Resend

### Step 3: Check Server Logs
Look for these console messages:
```
📨 Inviting team member for tenant: {tenant}
📧 Creating invitation for: { email, role, organizationId }
✅ User created and added to Kinde organization: {userId}
✅ Team invitation created successfully: {invitationId}
✅ Invitation email sent to: {email}
```

### Step 4: Check Email
1. Open the email inbox for the invited email address
2. You should receive an email from `onboarding@resend.dev`
3. Subject: "You've been invited to join {Organization Name}"
4. Email includes:
   - Inviter's name
   - Organization name
   - Role description
   - "Accept Invitation" button
   - Expiration notice (7 days)

### Step 5: Accept Invitation
1. Click "Accept Invitation" button in email
2. You'll be redirected to `/invitations/accept?token={token}`
3. Kinde authentication flow:
   - If user doesn't exist: Sign up screen
   - If user exists: Login screen
   - **Passwordless flow**: Enter email → receive code → enter code → logged in
4. After authentication, invitation is accepted

**Expected Result:**
- User is redirected to the organization workspace
- User appears in team members list with correct role
- Invitation is removed from "Pending Invitations"

### Step 6: Test Permissions
Test the role-based permissions:

**As Viewer:**
- Navigate to `/assets` - Should see assets
- Try to download an asset - Should work ✅
- Navigate to `/products` - Should see products but can't edit
- Navigate to `/team` - Should NOT see "Invite Member" button

**As Editor:**
- Can download assets ✅
- Can edit products ✅
- Cannot manage team (no invite button)

**As Admin:**
- Can download assets ✅
- Can edit products ✅
- Can invite team members ✅

## Copy Invitation Link Feature
1. In "Pending Invitations" section
2. Click "Copy Link" button next to any pending invitation
3. Button changes to "Copied" with checkmark
4. Paste the link - should be in format:
   `http://localhost:3001/invitations/accept?token={uuid}`

## Troubleshooting

### Email Not Received
- Check Resend dashboard at https://resend.com/emails
- Verify RESEND_API_KEY is correct in .env.local
- Check spam folder
- Try with a different email provider

### Kinde Error
- Check server logs for Kinde API errors
- Verify KINDE_MANAGEMENT_* environment variables
- Ensure user has permission to create users in Kinde

### Permission Denied
- Check database: `SELECT * FROM organization_members WHERE kinde_user_id = '{userId}';`
- Verify role is set correctly
- Check can_manage_team column

### Invitation Already Accepted
- Check invitations table: `SELECT * FROM invitations WHERE token = '{token}';`
- Verify accepted_at is NULL

## Database Queries for Testing

```sql
-- Check team members
SELECT
  email,
  role,
  can_download_assets,
  can_edit_products,
  can_manage_team,
  status
FROM organization_members
WHERE organization_id = '{your-org-id}';

-- Check pending invitations
SELECT
  email,
  role_or_access_level,
  expires_at,
  accepted_at,
  created_at
FROM invitations
WHERE organization_id = '{your-org-id}'
  AND invitation_type = 'team_member'
  AND accepted_at IS NULL;

-- Check user permissions
SELECT get_user_permissions('{kinde-user-id}', '{org-id}');
```

## Test Scenarios to Try

### Scenario 1: Invite Existing User
- Invite an email that already has a Kinde account
- Should add to organization without creating new user

### Scenario 2: Invite to Multiple Roles
- Invite same email multiple times with different roles
- First one should create user
- Subsequent should fail with "already a member" error

### Scenario 3: Expired Invitation
- Manually set expires_at to past date in database
- Try to accept - should fail with "expired" message

### Scenario 4: Role Validation
- Try to POST to API with invalid role (e.g., "superadmin")
- Should return 400 error

### Scenario 5: Permission Enforcement
- Login as Viewer
- Try to POST to `/api/{tenant}/team`
- Should return 403 "Access denied"

## Success Criteria

✅ Team page loads with current members
✅ Invite modal opens and submits successfully
✅ Email is sent via Resend
✅ User can accept invitation via email link
✅ Kinde passwordless authentication works
✅ User appears in team list with correct role
✅ Permissions are enforced correctly
✅ Copy link feature works
✅ Pending invitations appear for admins/owners only

## Next Steps After Testing

Once the core flow works:
1. Add role change functionality (promote/demote members)
2. Add remove member functionality
3. Add invitation cancellation
4. Add invitation resend
5. Add email customization (custom from address)
6. Add audit logging for team changes
7. Add team activity feed
