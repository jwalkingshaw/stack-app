# Invitation Flow Debug Checklist

## The Issue
Users accepting invitations are getting "no access to organization" error.

## Current Flow (Option 2 Implementation)

### Step 1: Send Invitation ✅
```
Admin clicks "Invite Member" → Enters email → Clicks "Send Invitation"
↓
POST /api/{tenant}/team
↓
Creates invitation in database (NO Kinde user creation)
↓
Sends email via Resend
```

**What to check:**
1. Open your terminal running `npm run dev`
2. Look for these logs when you send invitation:
   ```
   📨 Inviting team member for tenant: {tenant}
   📧 Creating invitation for: { email, role, organizationId }
   ✅ Team invitation created successfully: {invitationId}
   ✅ Invitation email sent to: {email}
   ```
3. **IMPORTANT**: You should NOT see any Kinde API logs (we removed that!)

**Check in Database** (run query #1 from DEBUG_INVITATION_FLOW.sql):
- Invitation should exist with `accepted_at = NULL`
- Should have a `token` (UUID)
- Should have the correct `organization_id`
- Should show the `kinde_org_id` from the organization

### Step 2: User Clicks Email Link ✅
```
User receives email → Clicks "Accept Invitation"
↓
Navigates to: /invitations/accept?token={uuid}
↓
Frontend loads InvitationAcceptClient
↓
Fetches invitation details via GET /api/invitations/accept?token={token}
```

**What to check:**
1. Email received? Check spam folder if using Gmail
2. Click the link - should go to invitation preview page
3. Should show organization name, role, etc.
4. Browser console should show: `👀 Getting invitation details for token preview`

**Check in Database** (run query #1):
- Invitation should still exist
- `accepted_at` should still be NULL
- `expires_at` should be in the future

### Step 3: User Clicks "Accept Invitation" ✅
```
User clicks "Accept Invitation" button
↓
POST /api/invitations/accept (not logged in)
↓
Returns 401 Unauthorized
↓
Frontend redirects to Kinde login
```

**What to check in browser console:**
```
🔐 Redirecting to Kinde login with org context: org_xxxxx
```

**The redirect URL should be:**
```
/api/auth/login?org_code=org_xxxxx&login_hint=user@example.com&post_login_redirect_url=/invitations/accept?token=xxx
```

**CRITICAL**: Check if `org_code` is in the URL!

### Step 4: Kinde Login ⚠️ THIS IS WHERE IT BREAKS
```
Redirected to Kinde login page
↓
Email should be pre-filled (from login_hint)
↓
User receives one-time code via email
↓
User enters code
↓
Kinde should:
  - Create user (if new)
  - Add user to organization (via org_code parameter) ← THIS IS KEY
  - Create session
  - Redirect back to post_login_redirect_url
```

**What to check:**
1. Does the Kinde login page URL include `org_code`?
2. After entering the code, what happens?
3. Do you get redirected back to `/invitations/accept?token=xxx`?
4. OR do you get an error page?

**If you see "no access to organization":**
- This means Kinde didn't add the user to the org
- Possible reasons:
  - `org_code` parameter not being passed correctly
  - `org_code` value is incorrect (not matching your Kinde org)
  - Kinde SDK not forwarding the parameter

### Step 5: After Kinde Login (Should Happen) ✅
```
User redirected back to /invitations/accept?token=xxx
↓
Now has Kinde session
↓
Frontend calls POST /api/invitations/accept again
↓
This time user IS authenticated
↓
Server calls accept_invitation() database function
↓
User added to organization_members in Supabase
↓
Redirected to /{orgSlug}/products
```

**What to check in server logs:**
```
🎯 Processing invitation acceptance
🔑 Processing invitation token for user: {email}
✅ Invitation accepted successfully. User joined: {Organization Name}
```

**Check in Database** (run query #2):
- User should appear in organization_members
- `kinde_user_id` should be populated
- `role` should match invitation
- `can_download_assets`, `can_edit_products`, `can_manage_team` should be set

## Debug Steps to Run NOW

### 1. Check Kinde Organization ID
Run this in Supabase:
```sql
SELECT name, slug, kinde_org_id FROM organizations WHERE slug = '{your-tenant-slug}';
```

**Copy the `kinde_org_id`** - it should look like: `org_xxxxxxxxxxxxx`

### 2. Verify in Kinde Dashboard
1. Go to https://stackcess.kinde.com
2. Click on your organization
3. Check the organization code/ID
4. **Does it match** the `kinde_org_id` from Supabase?

### 3. Check Kinde Users
1. In Kinde dashboard, go to Users
2. Search for `jasonwalkingshaw@gmail.com` or `delivered@resend.dev`
3. Do these users exist?
4. If yes, are they members of your organization?

### 4. Test the Auth URL Manually
When you click "Accept Invitation", check the URL in the address bar:
```
/api/auth/login?org_code=org_xxxxx&login_hint=email@example.com&post_login_redirect_url=...
```

**Copy the full URL and paste it here!**

### 5. Check Browser Console
Open Developer Tools → Console tab
Look for:
- Any errors (red text)
- The log: `🔐 Redirecting to Kinde login with org context: org_xxxxx`

### 6. Check Server Terminal
After you click Accept and go through Kinde login, check your terminal for:
- `🎯 Processing invitation acceptance`
- `✅ Invitation accepted successfully`
- OR any errors

## Common Issues & Fixes

### Issue 1: org_code Not Being Passed
**Symptom**: Kinde login URL doesn't have `org_code` parameter
**Fix**: Check InvitationAcceptClient.tsx line 104

### Issue 2: Wrong org_code Value
**Symptom**: org_code is there but doesn't match Kinde org
**Fix**: Check database `organizations.kinde_org_id` matches Kinde dashboard

### Issue 3: Kinde SDK Not Forwarding org_code
**Symptom**: org_code in URL but Kinde ignores it
**Fix**: Need to check Kinde SDK configuration

### Issue 4: User Already Exists Without Org Membership
**Symptom**: User exists in Kinde but not in the org
**Fix**: Manually add user to org in Kinde dashboard, or delete user and try again

### Issue 5: accept_invitation() Function Fails
**Symptom**: User logs in successfully but not added to Supabase
**Fix**: Check server logs for database errors

## What to Report Back

Please provide:

1. **Database query results** (run queries 1, 2, 3 from DEBUG_INVITATION_FLOW.sql)
2. **Server logs** when you:
   - Send an invitation
   - Accept an invitation
3. **Browser console logs** (open DevTools → Console)
4. **The exact error message** you're seeing
5. **The URL** you're redirected to (especially the Kinde login URL)
6. **Kinde dashboard check**: Do the users exist? Are they in the org?

This will help me identify exactly where the flow is breaking!
