# Delete Invitation Feature ✅

## Overview
Added ability for admins/owners to delete pending team invitations from the Team page.

## Changes Made

### 1. Backend API Endpoint ✅
**File:** `apps/saas-web/src/app/api/[tenant]/team/route.ts`

Added new DELETE handler:
```typescript
// DELETE /api/[tenant]/team?invitationId=xxx
export async function DELETE(request, { params })
```

**Features:**
- ✅ Requires admin/owner permissions (canManageTeam)
- ✅ Validates invitation exists and belongs to organization
- ✅ Prevents deletion of already accepted invitations
- ✅ Deletes invitation from database
- ✅ Returns success message with deleted email

**Security:**
- Permission check: Only admins/owners can delete
- Ownership validation: Invitation must belong to the organization
- Status check: Cannot delete accepted invitations

**Example Request:**
```http
DELETE /api/acme/team?invitationId=123e4567-e89b-12d3-a456-426614174000
Authorization: [Kinde session]
```

**Example Response:**
```json
{
  "success": true,
  "message": "Invitation to user@example.com has been deleted"
}
```

### 2. Frontend UI Component ✅
**File:** `apps/saas-web/src/app/[tenant]/team/TeamClient.tsx`

**Added:**
- Import `Trash2` icon from lucide-react
- State: `deletingInviteId` to track which invitation is being deleted
- Function: `handleDeleteInvitation()` with confirmation dialog
- Button: Delete button next to Copy Link button in pending invitations

**UI Changes:**
```tsx
<div className="flex items-center gap-2">
  <Button variant="outline" size="sm">
    Copy Link
  </Button>
  <Button
    variant="ghost"
    size="sm"
    className="text-red-600 hover:text-red-700 hover:bg-red-50"
    onClick={() => handleDeleteInvitation(id, email)}
  >
    <Trash2 className="h-4 w-4" />
    {deletingInviteId === id ? "Deleting..." : "Delete"}
  </Button>
</div>
```

**Features:**
- ✅ Confirmation dialog: "Are you sure you want to delete the invitation for {email}?"
- ✅ Loading state: Button shows "Deleting..." while request in progress
- ✅ Disabled state: Button disabled during deletion
- ✅ Auto-refresh: Team list refreshes after successful deletion
- ✅ Error handling: Shows alert if deletion fails
- ✅ Red styling: Delete button uses red color scheme

## User Flow

### 1. View Pending Invitations
```
Navigate to /{tenant}/team
↓
See "Pending Invitations" section (if any exist)
↓
Each invitation shows:
- Email address
- Role badge
- Expiration date
- "Copy Link" button
- "Delete" button ← NEW!
```

### 2. Delete an Invitation
```
Click "Delete" button
↓
Confirmation dialog: "Are you sure you want to delete the invitation for user@example.com?"
↓
Click "OK"
↓
Button shows "Deleting..."
↓
Invitation removed from database
↓
Pending invitations list refreshes
↓
Invitation no longer appears in list
```

### 3. Error Scenarios

**Scenario A: Already Accepted**
```
User tries to delete invitation that was already accepted
↓
Server returns 400 error
↓
Alert: "Cannot delete an invitation that has already been accepted"
```

**Scenario B: Not Found**
```
User tries to delete non-existent invitation
↓
Server returns 404 error
↓
Alert: "Invitation not found"
```

**Scenario C: Insufficient Permissions**
```
Viewer tries to delete invitation
↓
Server returns 403 error
↓
Alert: "Access denied. You must be an admin or owner to delete invitations."
```

**Scenario D: Wrong Organization**
```
User tries to delete invitation from different org
↓
Server returns 403 error
↓
Alert: "Access denied. This invitation belongs to a different organization."
```

## Testing Checklist

### Setup
- [x] Have at least one pending invitation
- [x] Be logged in as admin or owner
- [x] Navigate to Team page

### Test Cases

**Test 1: Successful Deletion**
```
1. Send invitation to test@example.com
2. Click "Delete" button next to invitation
3. Confirm in dialog
4. Verify button shows "Deleting..."
5. Verify invitation disappears from list
6. Verify database: invitation should be deleted
✅ Expected: Invitation successfully deleted
```

**Test 2: Cancel Deletion**
```
1. Click "Delete" button
2. Click "Cancel" in confirmation dialog
3. Verify invitation still appears in list
✅ Expected: No changes made
```

**Test 3: Multiple Invitations**
```
1. Send 3 invitations
2. Delete the middle one
3. Verify only that invitation is deleted
4. Verify other 2 remain
✅ Expected: Only selected invitation deleted
```

**Test 4: Viewer Cannot Delete**
```
1. Log in as viewer
2. Navigate to Team page
3. Verify "Pending Invitations" section not visible
✅ Expected: Viewers don't see pending invitations
```

**Test 5: Network Error**
```
1. Disconnect network
2. Try to delete invitation
3. Verify error message appears
4. Verify invitation still in list
✅ Expected: Graceful error handling
```

**Test 6: Concurrent Deletion**
```
1. Open Team page in two browser windows
2. Delete invitation in first window
3. Try to delete same invitation in second window
4. Verify error: "Invitation not found"
✅ Expected: Second deletion fails gracefully
```

## Database Queries

### Check Pending Invitations
```sql
SELECT
  id,
  email,
  role_or_access_level,
  expires_at,
  accepted_at,
  created_at
FROM invitations
WHERE organization_id = '{your-org-id}'
  AND invitation_type = 'team_member'
  AND accepted_at IS NULL
  AND declined_at IS NULL
ORDER BY created_at DESC;
```

### Manually Delete (for testing)
```sql
DELETE FROM invitations
WHERE id = '{invitation-id}';
```

### Verify Deletion
```sql
SELECT * FROM invitations
WHERE id = '{invitation-id}';
-- Should return 0 rows
```

## UI Screenshot Description

**Pending Invitations Section:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⏰ Pending Invitations (2)                                   │
├─────────────────────────────────────────────────────────────┤
│ ✉️  user1@example.com                                        │
│     [Viewer] Expires 1/20/2025                               │
│                      [Copy Link]  [🗑️ Delete]               │
├─────────────────────────────────────────────────────────────┤
│ ✉️  user2@example.com                                        │
│     [Editor] Expires 1/21/2025                               │
│                      [Copy Link]  [🗑️ Delete]               │
└─────────────────────────────────────────────────────────────┘
```

**Delete Button States:**
- Normal: "Delete" with red text
- Hover: Red background
- Loading: "Deleting..." disabled
- Error: Returns to "Delete"

## Server Logs

**Successful Deletion:**
```
🗑️ Deleting invitation for tenant: acme
🔍 Looking for invitation: 123e4567-e89b-12d3-a456-426614174000
✅ Invitation deleted successfully: 123e4567-e89b-12d3-a456-426614174000
```

**Error - Not Found:**
```
🗑️ Deleting invitation for tenant: acme
🔍 Looking for invitation: invalid-id
Invitation not found: [error details]
```

**Error - Already Accepted:**
```
🗑️ Deleting invitation for tenant: acme
🔍 Looking for invitation: 123e4567-e89b-12d3-a456-426614174000
Cannot delete an invitation that has already been accepted
```

## Benefits

✅ **Cleans Up Mistakes**
- Can delete invitations sent to wrong email
- Can remove duplicate invitations

✅ **Security**
- Can revoke pending invitations before they're accepted
- Prevents unwanted users from joining

✅ **Organization**
- Keeps pending invitations list clean
- Removes expired invitations manually

✅ **User Experience**
- Simple one-click deletion (with confirmation)
- Visual feedback during operation
- Clear error messages

## Future Enhancements

Potential additions:
1. **Bulk Delete**: Select multiple invitations to delete at once
2. **Resend Invitation**: Button to resend email instead of delete+recreate
3. **Edit Role**: Change role of pending invitation
4. **Invitation History**: View deleted invitations (soft delete)
5. **Expiration Management**: Extend expiration date of pending invitation
6. **Cancel Reason**: Add optional reason when deleting invitation
7. **Undo Delete**: Toast notification with undo button

## Related Files

```
Modified:
├── apps/saas-web/src/app/api/[tenant]/team/route.ts
│   └── Added DELETE handler
└── apps/saas-web/src/app/[tenant]/team/TeamClient.tsx
    ├── Added Trash2 icon import
    ├── Added deletingInviteId state
    ├── Added handleDeleteInvitation function
    └── Added Delete button to UI

No changes needed:
├── Database schema (invitations table already supports deletion)
├── Permissions (canManageTeam already exists)
└── Email service (no emails sent for deletion)
```

## Summary

The delete invitation feature is **fully implemented and ready to use**. Admins and owners can now:
- View all pending invitations
- Delete any pending invitation with confirmation
- See loading state during deletion
- Get immediate feedback on success/failure

The feature is secure, user-friendly, and follows the existing design patterns in your application.
