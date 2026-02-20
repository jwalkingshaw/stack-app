# Invites & Permissions V2 Spec

Status: Approved for implementation
Date: 2026-02-18

## 1) Terminology
- Use `Permission Bundle` (instead of "Access Package"):
- A reusable preset of module levels (`None/View/Edit/Admin`) plus optional scope defaults.
- Applied at invite time to reduce post-invite manual setup.

## 2) Actor Model
- Brand workspace users:
- Internal team users with roles: `owner/admin/editor/viewer`.
- Partner organizations invited by Brand.

- Partner workspace users:
- Can access multiple invited brands.
- Cannot invite downstream users to brand-owned content.

## 3) Invite Ownership (Hard Rule)
- Only Brand organizations can create invitations.
- Two separate invite flows:
- `Invite Team Member`
- `Invite Partner Access`

No mixed invite form.

## 4) V2 Invite Flows

### A) Invite Team Member (Brand -> Internal User)
1. Enter email.
2. Choose baseline role (`admin/editor/viewer`).
3. Choose module levels by matrix.
4. Choose markets (multi-select).
5. Optional: DAM Shared Asset Sets constraints.
6. Send invite.

On acceptance:
- Create/activate org membership.
- Apply module permissions + scopes atomically.
- Emit audit log chain.

### B) Invite Partner Access (Brand -> Partner Org/User)
1. Enter email.
2. Set partner baseline (`partner:view`).
3. Choose module levels (typically view-only defaults).
4. Choose markets (multi-select).
5. Optional: Shared Asset Sets constraints for DAM.
6. Send invite.

On acceptance:
- Existing partner org: attach relationship + apply grants.
- New partner org: onboarding (`retailer/distributor/wholesaler`), then attach + apply grants.
- Emit audit log chain.

## 5) Permission Layering (Authoritative)
Effective access requires ALL:
1. Baseline role allow
2. Module permission allow
3. Scope allow (market + optional collection/shared-set)

Default deny.
No module infers write/admin access from role alone.

## 6) Module Matrix Model (Amazon-style)
- UI shape:
- Left: module rows
- Right: level columns (`None/View/Edit/Admin`)
- Top scope controls: markets multi-select

Initial modules:
- Products (PIM)
- Assets (DAM)
- Share Links (DAM distribution)

Level guidance:
- Products:
- `View`: read product data
- `Edit`: edit attributes/media mapping
- `Admin`: publish-state + model/admin operations (where allowed)

- Assets:
- `View`: list/preview derivatives
- `Edit`: metadata/edit operations
- `Admin`: originals/version/manage controls

- Share Links:
- `View`: see shared links
- `Edit`: create/regenerate links
- `Admin`: revoke/audit/share policy controls

## 7) Data Model V2 (Supabase)

## 7.1 Invitations
Add fields to `invitations`:
- `permission_bundle_id UUID NULL`
- `invite_permissions JSONB NOT NULL DEFAULT '{}'::jsonb`
  - canonical payload snapshot at send time
  - includes module levels and scope selections

Example `invite_permissions`:
```json
{
  "module_levels": {
    "products": "view",
    "assets": "view",
    "share_links": "edit"
  },
  "scopes": {
    "market_ids": ["uuid-1", "uuid-2"],
    "collection_ids": ["uuid-3"]
  }
}
```

## 7.2 Permission Bundles
Create:
- `permission_bundles`
  - `id, organization_id, name, subject_type(team_member|partner), is_default, created_by, created_at`
- `permission_bundle_rules`
  - normalized rows per bundle/module/level and optional scope defaults

Note:
- Invitation stores snapshot to avoid drift when bundles are later edited.

## 8) API Contract V2

Brand-only endpoints:
- `POST /api/[tenant]/invites/team`
- `POST /api/[tenant]/invites/partner`
- `POST /api/[tenant]/permission-bundles`
- `PATCH /api/[tenant]/permission-bundles/:id`
- `GET /api/[tenant]/permission-bundles`

Acceptance path:
- Existing `/api/invitations/accept` reads `invite_permissions` snapshot and applies grants in one transaction.

Required behavior:
- Idempotent.
- Replay-safe.
- Fails closed if any scope target is invalid for the brand org.

## 9) UI IA V2

Brand settings IA:
- `Team > Members`
- `Team > Invites`
- `Team > Permissions`
- `Team > Shared Asset Sets`

Invites page:
- Tabs:
- `Team Invites`
- `Partner Invites`

Each invite form includes:
- Role/baseline
- Module matrix
- Market multi-select
- Optional DAM shared set constraints
- Save as bundle / Load bundle

Partner workspace:
- No invite controls.
- Read-only visibility of granted access.

## 10) Audit & Activity
Add and expose logs for:
- `invite.created`
- `invite.accepted`
- `invite.revoked`
- `permission.bundle.applied`
- `permission.changed`
- `workspace.accessed`
- `asset.downloaded`
- `share_link.created`

Brand activity view should answer:
- who accessed
- which brand
- what action
- when
- from where (IP/user-agent where available)

## 11) Security Guardrails
- Default deny.
- Brand-managed invites only.
- Partner non-transitive.
- Strong token lifecycle: pending/accepted/declined/revoked/expired.
- One active pending invite per org/email/type.
- Rate limits on create/revoke/accept + anomaly detection.
- No tenant existence leakage in errors.

## 12) Implementation Order
1. DB: invitation payload + bundle tables + constraints.
2. API: new invite endpoints + acceptance application logic.
3. UI: Invites page split + module matrix + bundle save/load.
4. Audit UI: brand activity stream.
5. Hardening/tests: mixed-role + mixed-tenant regression suite.
