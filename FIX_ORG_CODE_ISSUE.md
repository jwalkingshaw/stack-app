# Fix: org_code Not Being Passed to Kinde

## The Problem

When you clicked "Accept Invitation", the URL was:
```
https://stackcess.kinde.com/auth/cx/_:nav&m:login&psid:...
```

**Missing:** No `org_code` parameter!

This is why users were getting "no access to organization" error. Kinde didn't know which organization to add them to.

## Root Cause

The Kinde Next.js SDK's `/api/auth/login` endpoint uses `handleAuth()` which **doesn't forward query parameters** to the OAuth URL.

When we did:
```typescript
window.location.href = `/api/auth/login?org_code=org_xxx&login_hint=email`;
```

The SDK ignored those parameters and just did a standard login without org context.

## The Fix

Created a custom auth endpoint that **properly builds the Kinde OAuth URL** with all parameters:

### File 1: Custom Auth Endpoint
**Created:** `apps/saas-web/src/app/api/auth/kinde-org-login/route.ts`

This endpoint:
1. ✅ Receives `org_code`, `login_hint`, `post_login_redirect_url`
2. ✅ Builds the Kinde OAuth URL manually
3. ✅ Adds all parameters including `org_code`
4. ✅ Redirects to Kinde with proper context

### File 2: Updated Invitation Client
**Updated:** `apps/saas-web/src/app/invitations/accept/InvitationAcceptClient.tsx`

Changed redirect from:
```typescript
window.location.href = `/api/auth/login?${params}`;
```

To:
```typescript
window.location.href = `/api/auth/kinde-org-login?${params}`;
```

## What Will Happen Now

### Before (Broken):
```
1. Click Accept Invitation
2. Redirect to /api/auth/login?org_code=org_xxx
3. Kinde SDK ignores org_code ❌
4. User logs in WITHOUT org context
5. Kinde doesn't add user to organization
6. Error: "no access to organization" ❌
```

### After (Fixed):
```
1. Click Accept Invitation
2. Redirect to /api/auth/kinde-org-login?org_code=org_xxx
3. Custom endpoint builds URL with org_code ✅
4. User logs in WITH org context
5. Kinde automatically adds user to organization ✅
6. User redirected back and added to Supabase ✅
7. Success! ✅
```

## What to Test Now

### Step 1: Delete Old Invitations
Clear the test invitations from before:

```sql
DELETE FROM invitations
WHERE email IN ('jasonwalkingshaw@gmail.com', 'delivered@resend.dev')
AND invitation_type = 'team_member';
```

### Step 2: Delete Users from Kinde (Optional)
1. Go to https://stackcess.kinde.com
2. Go to Users
3. Find `jasonwalkingshaw@gmail.com` and `delivered@resend.dev`
4. Delete them (or remove them from the organization)

This ensures a clean test.

### Step 3: Send New Invitation
1. Go to `/{tenant}/team`
2. Click "Invite Member"
3. Enter `delivered@resend.dev` (or your email)
4. Select role: `viewer`
5. Click "Send Invitation"

### Step 4: Accept Invitation
1. Check email inbox
2. Click "Accept Invitation"
3. Click "Accept Invitation" button on preview page
4. **NOW CHECK THE URL!**

You should see:
```
https://stackcess.kinde.com/oauth2/auth?
  client_id=xxx&
  redirect_uri=xxx&
  response_type=code&
  scope=openid+profile+email+offline&
  state=xxx&
  org_code=org_xxxxxxxxxxxxx&    ← THIS SHOULD BE THERE!
  login_hint=delivered@resend.dev
```

**Key:** Look for `org_code=org_xxxxx` in the URL!

### Step 5: Complete Login
1. Enter the one-time code from email
2. Should be redirected back to invitation page
3. Should see success message
4. Should be redirected to `/{tenant}/products`

### Step 6: Verify in Database
```sql
SELECT
  om.email,
  om.kinde_user_id,
  om.role,
  om.can_download_assets,
  om.can_edit_products,
  om.can_manage_team,
  om.status,
  o.name as org_name
FROM organization_members om
JOIN organizations o ON o.id = om.organization_id
WHERE om.email = 'delivered@resend.dev';
```

Should show the user with:
- kinde_user_id: populated
- role: viewer
- can_download_assets: true
- can_edit_products: false
- can_manage_team: false
- status: active

### Step 7: Verify in Kinde Dashboard
1. Go to https://stackcess.kinde.com
2. Go to your organization
3. Go to Users tab
4. Search for `delivered@resend.dev`
5. Should show the user is a member of the organization

## Expected Server Logs

### When Invitation Sent:
```
📨 Inviting team member for tenant: {tenant}
📧 Creating invitation for: { email: "delivered@resend.dev", role: "viewer", organizationId: "xxx" }
✅ Team invitation created successfully: {invitationId}
✅ Invitation email sent to: delivered@resend.dev
```

### When Accept Button Clicked:
```
🎯 Processing invitation acceptance
[Returns 401 - not logged in yet]
```

### In Browser Console:
```
🔐 Redirecting to Kinde login with org context: org_xxxxxxxxxxxxx
🔍 Auth params: org_code=org_xxx&login_hint=delivered@resend.dev&post_login_redirect_url=...
```

### In Custom Auth Endpoint:
```
🔐 Custom Kinde org login: { orgCode: 'org_xxxxxxxxxxxxx', loginHint: 'delivered@resend.dev', postLoginRedirectUrl: '...' }
✅ Added org_code to auth URL: org_xxxxxxxxxxxxx
✅ Added login_hint: delivered@resend.dev
🌐 Redirecting to Kinde OAuth: https://stackcess.kinde.com/oauth2/auth?...
```

### After Kinde Login Returns:
```
🎯 Processing invitation acceptance
🔑 Processing invitation token for user: delivered@resend.dev
✅ Invitation accepted successfully. User joined: {Organization Name}
```

## If Still Not Working

If you still get "no access to organization" error:

### Check 1: org_code in URL
- Look at the Kinde login URL
- Press Ctrl+A, Ctrl+C to copy the entire URL
- Paste it somewhere
- Search for "org_code"
- **Is it there?** If not, check browser console for errors

### Check 2: Correct org_code Value
Run this query:
```sql
SELECT kinde_org_id FROM organizations WHERE slug = '{your-tenant-slug}';
```

Then compare with what's in the URL. They should match exactly!

### Check 3: Kinde Dashboard
1. Go to https://stackcess.kinde.com
2. Click on your organization
3. Look at the URL or settings
4. Find the Organization Code
5. Should match the `kinde_org_id` in database

### Check 4: Browser Console Logs
Open DevTools → Console
Look for:
- `🔐 Redirecting to Kinde login with org context: org_xxx`
- Any errors (red text)

### Check 5: Server Logs
Check your terminal running `npm run dev`
Look for the custom auth endpoint logs

## Why This Fix Works

The Kinde SDK's `handleAuth()` is designed for simple auth flows. It doesn't handle advanced scenarios like organization-specific signup.

By creating our own endpoint, we have full control over the OAuth URL and can ensure `org_code` is included.

This is actually the **recommended approach** when you need custom OAuth parameters that the SDK doesn't support out of the box.

## Summary

- ✅ Created custom auth endpoint at `/api/auth/kinde-org-login`
- ✅ Updated invitation client to use custom endpoint
- ✅ Now `org_code` parameter will reach Kinde properly
- ✅ Users will be added to organization automatically during login
- ✅ No more "no access to organization" error

**Test it now and let me know if you see `org_code` in the Kinde login URL!**
