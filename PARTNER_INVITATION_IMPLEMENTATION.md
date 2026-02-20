# Partner Invitation Implementation - Phase 1 & 2 Complete

## Overview
Implemented a comprehensive partner invitation system that allows brands to invite partners (retailers, distributors, agencies) to access their content. The system intelligently detects if a partner already has an organization or needs onboarding.

---

## Phase 1: Database & Types ✅

### Database Migration: `20250210_add_partner_organizations.sql`

**New Tables:**
- `brand_partner_relationships` - Tracks which partners have access to which brands' content

**Columns Added:**
- `organizations.organization_type` - VARCHAR(20) 'brand' or 'partner'
- `invitations.partner_organization_id` - UUID reference to existing partner org
- `invitations.requires_onboarding` - BOOLEAN flag for new partners

**Database Functions:**
- `get_partner_brands(partner_org_id)` - Returns all brands accessible to a partner
- `get_brand_partners(brand_org_id)` - Returns all partners with access to a brand

**Features:**
- Unique constraints prevent duplicate active relationships
- Self-partnership prevention
- Status tracking: 'active', 'suspended', 'revoked'
- Access levels: 'view' (read-only) or 'edit' (can modify)
- Comprehensive indexing for performance

### TypeScript Types Updated

**File**: `packages/database/src/types.ts`

```typescript
organizations: {
  organization_type: 'brand' | 'partner';
  // ... other fields
}

brand_partner_relationships: {
  Row: {
    id: string;
    brand_organization_id: string;
    partner_organization_id: string;
    access_level: 'view' | 'edit';
    invited_by: string;
    created_at: string;
    status: 'active' | 'suspended' | 'revoked';
    status_updated_at: string | null;
    settings: Record<string, any>;
  };
  // ... Insert & Update types
}
```

### Database Query Functions

**File**: `packages/database/src/queries.ts`

10 new methods added:
1. `getPartnerBrands(partnerOrgId)` - Get accessible brands
2. `getBrandPartners(brandOrgId)` - Get partners with access
3. `createBrandPartnerRelationship(data)` - Establish relationship
4. `updatePartnerAccessLevel()` - Change view/edit permissions
5. `revokePartnerAccess()` - Permanently remove access
6. `suspendPartnerAccess()` - Temporarily suspend access
7. `restorePartnerAccess()` - Restore suspended access
8. `hasPartnerAccess()` - Check if relationship exists
9. `getPartnerRelationship()` - Get relationship details
10. `getUserPartnerBrands(userId)` - Get brands for a user in a partner org

---

## Phase 2: Backend - Partner Invitation ✅

### Team Invitation API Enhanced

**File**: `apps/saas-web/src/app/api/[tenant]/team/route.ts`

#### New Request Parameters:
```typescript
{
  email: string;
  role?: string; // For team_member invites
  invitation_type?: 'team_member' | 'partner'; // Default: 'team_member'
  access_level?: 'view' | 'edit'; // For partner invites
}
```

#### Partner Invitation Logic:

**Step 1: Check for Existing Partner Organization**
```typescript
// Query organization_members for existing partner org membership
const existingPartnerMember = await supabase
  .from('organization_members')
  .select('organization_id, organizations!inner(organization_type)')
  .eq('email', email)
  .eq('organizations.organization_type', 'partner')
  .single();
```

**Step 2: Set Flags Based on Result**
- If existing partner org found:
  - `partner_organization_id` = existing org ID
  - `requires_onboarding` = false
  - Check if relationship already exists (prevent duplicates)

- If no partner org found:
  - `partner_organization_id` = null
  - `requires_onboarding` = true

**Step 3: Create Invitation with Partner-Specific Fields**
```typescript
const invitationData = {
  email,
  organization_id,
  invitation_type: 'partner',
  role_or_access_level: access_level, // 'view' or 'edit'
  partner_organization_id,
  requires_onboarding,
  invited_by,
  token,
  expires_at
};
```

#### Validation:
- Only brands can invite partners
- Partner invites require valid access_level ('view' or 'edit')
- Duplicate relationship prevention

---

### Database Function Updated

**File**: `packages/database/migrations/20250211_update_accept_invitation_for_partners.sql`

The `accept_invitation()` function now returns JSONB and handles three scenarios:

#### 1. Team Member Invitation
```sql
-- Creates/updates organization_members record
-- Returns: { invitation_type: 'team_member', organization_id: UUID }
```

#### 2. Partner Invitation - Requires Onboarding
```sql
-- User needs to create partner organization
-- Marks invitation as accepted (will be linked after onboarding)
-- Returns: {
--   invitation_type: 'partner',
--   requires_onboarding: true,
--   brand_organization_id: UUID,
--   access_level: 'view' | 'edit'
-- }
```

#### 3. Partner Invitation - Existing Organization
```sql
-- Creates brand_partner_relationship
-- Verifies user is member of partner org
-- Returns: {
--   invitation_type: 'partner',
--   requires_onboarding: false,
--   partner_organization_id: UUID,
--   brand_organization_id: UUID,
--   access_level: 'view' | 'edit'
-- }
```

---

### Invitation Acceptance API Updated

**File**: `apps/saas-web/src/app/api/invitations/accept/route.ts`

#### Response Handling:

**Partner - Requires Onboarding:**
```json
{
  "success": true,
  "data": {
    "invitation_type": "partner",
    "requires_onboarding": true,
    "brand_organization_id": "...",
    "access_level": "view",
    "redirect_url": "/onboarding/partner?brand_id=...&access_level=..."
  },
  "message": "Please create your partner organization to access this brand's content."
}
```

**Partner - Existing Organization:**
```json
{
  "success": true,
  "data": {
    "invitation_type": "partner",
    "requires_onboarding": false,
    "partner_organization": {
      "id": "...",
      "name": "GNC",
      "slug": "gnc"
    },
    "access_level": "edit",
    "redirect_url": "/gnc/products"
  },
  "message": "You can now access this brand's content from your GNC dashboard."
}
```

**Team Member:**
```json
{
  "success": true,
  "data": {
    "invitation_type": "team_member",
    "member": { ... },
    "organization": {
      "id": "...",
      "name": "Stack Brand",
      "slug": "stack-brand",
      "redirect_url": "/stack-brand/products"
    }
  },
  "message": "Welcome to Stack Brand! You've been added as a viewer."
}
```

---

### Frontend Updated

**File**: `apps/saas-web/src/app/invitations/accept/InvitationAcceptClient.tsx`

#### Redirect Logic:
```typescript
if (invitationType === 'partner') {
  if (data.data?.requires_onboarding) {
    // Redirect to partner onboarding page
    window.location.href = redirectUrl || '/onboarding/partner';
  } else {
    // Redirect to partner organization dashboard
    window.location.href = redirectUrl || '/';
  }
} else {
  // Team member - redirect to organization
  window.location.href = `/${orgSlug}`;
}
```

---

## Testing the Implementation

### Test Case 1: Invite New Partner (Requires Onboarding)

**Request:**
```bash
POST /api/stack-brand/team
{
  "email": "john@gnc.com",
  "invitation_type": "partner",
  "access_level": "view"
}
```

**Expected Flow:**
1. API checks if john@gnc.com has a partner org → None found
2. Creates invitation with `requires_onboarding: true`
3. John accepts invitation
4. Redirected to `/onboarding/partner?brand_id=...&access_level=view`
5. Creates partner org "GNC"
6. Brand-partner relationship established
7. John can now view Stack Brand's content from GNC dashboard

---

### Test Case 2: Invite Existing Partner

**Request:**
```bash
POST /api/stack-brand/team
{
  "email": "sarah@gnc.com",
  "invitation_type": "partner",
  "access_level": "edit"
}
```

**Expected Flow:**
1. API checks if sarah@gnc.com has a partner org → Found "GNC"
2. Creates invitation with `partner_organization_id: GNC_ID`, `requires_onboarding: false`
3. Sarah accepts invitation
4. Brand-partner relationship created immediately
5. Redirected to `/gnc/products`
6. Sarah can now edit Stack Brand's content from GNC dashboard

---

### Test Case 3: Team Member Invitation (Unchanged)

**Request:**
```bash
POST /api/stack-brand/team
{
  "email": "jane@example.com",
  "role": "editor"
}
```

**Expected Flow:**
1. Standard team invitation created
2. Jane accepts invitation
3. Added to Stack Brand as editor
4. Redirected to `/stack-brand/products`

---

## Next Steps: Phase 3 - Partner Onboarding

**Still TODO:**
1. Create `/onboarding/partner` page
2. Partner organization creation form
3. Establish brand-partner relationship after org creation
4. Handle edge cases (multiple pending invitations)

**Still TODO: Phase 4 - Partner Dashboard**
1. Modify product queries to include partner-accessible content
2. Add brand filter UI
3. Show "Shared by [Brand]" badges
4. Update assets view similarly

**Still TODO: Phase 5 - Permissions & Access Control**
1. Implement permission check functions
2. Add middleware to validate partner access
3. Restrict edit permissions based on access_level

**Still TODO: Phase 6 - Partner Team Management**
1. Allow partners to invite their own team members
2. Team members inherit partner org's brand relationships

---

## Database Schema Summary

```
organizations
├── organization_type ('brand' | 'partner')
└── ... existing fields

brand_partner_relationships (NEW)
├── brand_organization_id → organizations.id
├── partner_organization_id → organizations.id
├── access_level ('view' | 'edit')
├── status ('active' | 'suspended' | 'revoked')
├── invited_by
├── created_at
├── status_updated_at
└── settings (JSONB)

invitations
├── partner_organization_id → organizations.id (NEW)
├── requires_onboarding (BOOLEAN) (NEW)
└── ... existing fields
```

---

## API Changes Summary

### New Endpoints: None (extended existing)

### Modified Endpoints:

**POST /api/[tenant]/team**
- Now accepts `invitation_type` and `access_level` parameters
- Checks for existing partner organizations
- Creates partner-specific invitations

**POST /api/invitations/accept**
- Returns different response structure based on invitation type
- Handles partner onboarding redirect
- Establishes brand-partner relationships

---

## Key Implementation Details

1. **Email-based Partner Detection**: Uses email to find existing partner org memberships
2. **No Duplicate Relationships**: Prevents inviting same partner twice
3. **Flexible Access Levels**: View (read-only) vs Edit (can modify)
4. **Status Management**: Active, Suspended, Revoked states
5. **Security**: Only brands can invite partners
6. **Audit Trail**: Tracks who invited whom and when
7. **Auto-Accept Flow**: Compatible with existing auto-accept after login
8. **Fresh Auth Required**: 5-minute session freshness check still applies
