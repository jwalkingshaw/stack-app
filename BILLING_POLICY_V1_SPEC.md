# Billing Policy V1 Spec

Status: Draft for review  
Last updated: 2026-02-26  
Owner: Product + Engineering

## 1) Goals
- Keep pricing accessible for supplement and health/wellbeing brands.
- Protect gross margin with hard caps on high-cost usage.
- Support partner organizations that can be invited by many brands.
- Keep authorization/billing coherent: invite permissions and billing limits must both pass.

## 1.1) Current build status
- Billing foundation tables are in place (`billing_plans`, `billing_addons`, subscriptions, daily usage, monthly usage snapshots, billing events).
- Billing webhook receipt table is in place for durable idempotency (`billing_webhook_receipts`).
- Product create/update/status and variant bulk operations enforce active SKU caps.
- Invite create enforces:
  - internal seat cap (`team_member`),
  - external partner invite cap (`partner`).
- Invite accept now re-checks internal seat cap before activating team membership.
- Brand orgs can send `team_member` and `partner` invites.
- Partner orgs can send `team_member` invites for their own workspace, but cannot send `partner` invites.
- Partner invite acceptance supports three onboarding outcomes:
  - auto-link when invitee has exactly one active partner workspace,
  - explicit workspace selection when invitee has multiple partner workspaces,
  - create-new partner workspace onboarding when invitee has none (or chooses to create new).
- Self-serve partner signup is supported via onboarding (`/onboarding?type=partner&create=1`) and can convert to paid plan without changing workspace identity.
- Kinde billing webhook endpoint implemented at `/api/webhooks/kinde/billing`.
- Local fallback subscription update endpoint persists subscription + billing audit events when provider setup is pending.

## 2) Plan Catalog (Locked)
### Free (Sandbox)
- Price: $0 / month
- Ideal for: Product discovery
- 10 active SKUs
- 2 GB storage
- 4 GB monthly delivery bandwidth
- 1 internal user
- 2 external partner invites
- DeepL usage not included
- Max file upload size: 50MB per file
- Public share links: disabled (authenticated org access required)

### Starter
- Price: $49 / month
- Ideal for: Single-brand founders
- 50 active SKUs
- 15 GB storage
- 25 GB monthly delivery bandwidth
- 2 internal users
- 10 external partner invites
- 750,000 DeepL characters / month (combined translate + write)

### Growth
- Price: $129 / month
- Ideal for: Established teams
- 500 active SKUs
- 100 GB storage
- 200 GB monthly delivery bandwidth
- 8 internal users
- 100 external partner invites
- 3,000,000 DeepL characters / month (combined translate + write)

### Scale
- Price: $299 / month
- Ideal for: Global brands and retailers
- 2,500 active SKUs
- 500 GB storage
- 1 TB monthly delivery bandwidth
- Unlimited internal users
- Unlimited external partner invites
- 12,000,000 DeepL characters / month (combined translate + write)

### Enterprise
- Custom contract


## 3) Commercial Rules (Locked)
- Billing model: per organization subscription (not per user subscription).
- Caps: hard caps (no usage overage billing in V1).
- Trial/onboarding: free sandbox tier plus optional 14-day paid-plan trial.
- Annual billing: not offered at launch.
- Add-ons: prorated when purchased mid-cycle; removal applies end of cycle by default.
- Partner conversion: invited partner access is free, but partner org can convert to paid plan for own workspace features.

## 4) Meter Definitions (Authoritative)
Track and bill separately:
- `active_sku_count`
- `storage_gb`
- `delivery_bandwidth_gb`
- `internal_user_count`
- `partner_invite_count`
- `deepl_total_char_count`

### 4.1 active_sku_count
- Count only products where `type IN ('variant', 'standalone')`.
- Do not count `parent` products.
- Included statuses: `Draft`, `Enrichment`, `Review`, `Active`.
- Excluded statuses: `Discontinued`, `Archived`.
- Billing measurement: monthly peak active SKU count (or daily max rolled up monthly).

### 4.2 discontinued SKU policy
- `Discontinued` SKUs are excluded from active count for 12 months from discontinuation timestamp.
- After 12 months, discontinued records move to a low-cost archive meter in V2, or count against a total-record guardrail in V1.
- Any reactivation from `Discontinued` back to active statuses immediately re-enters `active_sku_count`.

### 4.3 total SKU guardrail (anti-gaming)
- Add non-billable but enforceable guardrail: `total_sku_count` across `variant + standalone` all statuses.
- Suggested default cap: `3x` active SKU entitlement.

### 4.4 storage_gb
- Derived from `organizations.storage_used` (bytes to GB conversion).
- Includes current assets and version history storage.
- Hard cap behavior: block uploads and version creates when cap would be exceeded.

### 4.5 delivery_bandwidth_gb
- Sum outbound asset bytes in billing month:
  - authenticated download endpoints,
  - public/share-link downloads,
  - asset previews/derivative delivery where externally served.
- Hard cap behavior:
  - block new external downloads/share-link deliveries,
  - keep admin/settings/billing access available for remediation.

### 4.6 internal_user_count
- Count active organization members for the subscriber org.
- Suggested counted statuses: `active`.
- Hard cap behavior: block new internal member invites/acceptance once at cap.

### 4.7 partner_invite_count
- Brand-side meter only.
- Count partner access units owned by the brand org.
- A partner invited to multiple brands consumes 1 unit in each brand independently.
- No cross-brand invite credit sharing.

### 4.8 deepl_total_char_count
- Combined monthly cap for DeepL Translate + DeepL Write usage.
- Source of truth usage values:
  - `organization_usage_monthly_snapshots.translation_chars`
  - `organization_usage_monthly_snapshots.write_chars`
- Enforcement uses `translation_chars + write_chars` against plan limit.
- Free plan limit is `0` (feature unavailable in sandbox).

## 5) Multi-Brand Partner Rules (Critical)
- A partner organization can have relationships with many brands.
- Billing ownership for external access always remains with the brand granting access.
- If Brand A and Brand B both invite Partner X, each brand uses its own invite capacity.
- If Partner X invites downstream external users for Brand A content:
  - action must be allowed by Brand A permissions,
  - consumption is charged to Brand A invite capacity.

## 6) Invite and Permission Integration (Required in this build)
Invite/permission authorization and billing limits are separate gates. Both must pass.

### 6.0 Kinde billing permission sync
- App role remains the source of truth in Supabase.
- Billing portal access requires Kinde org permission `org:write:billing`.
- On membership assignment:
  - `owner` and `admin` should be synced to Kinde billing-admin role.
  - `editor`, `viewer`, and `partner` should not hold billing-admin role.
- Sync is organization-scoped and idempotent.

### 6.1 Gate order
1. Authorization gate:
   - user has permission to invite/manage access for the brand.
2. Billing gate:
   - brand has remaining `partner_invite_count` capacity.
3. Domain gate:
   - invitation type and target org rules are valid.

Org-type rule:
- Brand organization:
  - can invite internal team members,
  - can invite partner organizations.
- Partner organization:
  - can invite internal team members only (for its own workspace),
  - cannot create partner invitations.

### 6.2 Counting invite consumption
- Count invite usage by brand organization with dedup logic:
  - unique by `(brand_org_id, external_identity, invitation_type='partner')`.
- `external_identity` priority:
  1. accepted `kinde_user_id` when available,
  2. otherwise normalized email for pending records.
- Count statuses:
  - include `accepted`,
  - include `pending` (not expired/revoked/declined),
  - exclude `revoked`, `declined`, `expired`.

### 6.3 Reclaiming invite units
- Reclaim capacity when:
  - invite is revoked before acceptance,
  - active partner relationship is revoked and no active external identities remain for that brand.

## 7) Partner Free Access vs Paid Conversion
- Invited partner access remains free and scoped to each brand's grants.
- Partner paid subscription unlocks partner org's own create/manage limits and modules.
- Partner conversion to paid keeps the same partner workspace tenancy, so invited brand content and partner-owned content remain visible in one workspace.
- If partner paid plan is canceled:
  - partner loses paid capabilities in their own org,
  - partner still retains free invited access to brand content where relationships/grants remain active.

## 8) Enforcement Points (API/App)
- Product create/variant create/reactivation:
  - enforce `active_sku_count` and total guardrail.
- Asset upload/version create:
  - enforce `storage_gb` cap.
- Team/partner invite create + accept:
  - enforce internal seat and external invite caps.
- Asset delivery endpoints:
  - enforce `delivery_bandwidth_gb` cap for external delivery.

## 9) Data Model Additions (V1)
Add billing source-of-truth tables:
- `billing_plans`
- `billing_addons`
- `organization_subscriptions`
- `organization_subscription_addons`
- `organization_usage_daily`
- `organization_usage_monthly_snapshots`
- `organization_billing_events` (audit trail)

Recommended new columns:
- `products.discontinued_at TIMESTAMPTZ NULL` (for 12-month rule)
- subscription period markers on organization-level billing state

## 10) Lifecycle and UX Rules
- Warn at 80%, 90%, 100% for each capped meter.
- At 100%:
  - block action with explicit reason and suggested remediation.
- Upgrade path:
  - immediate entitlement increase after successful payment.
- Downgrade path:
  - scheduled to period end unless user is already below new limits.

## 11) Payment and Reliability
- Require idempotent webhook processing for subscription/add-on updates.
- Maintain immutable billing event log for:
  - plan changes,
  - add-on purchases/removals,
  - trial start/end,
  - cap-block events.
- Add dunning and grace-period behavior in V1.1 if not in launch scope.

## 12) Acceptance Test Matrix (minimum)
- Brand at invite cap cannot create new partner invite.
- Same partner invited by two brands consumes capacity in both brands.
- Invitee with multiple partner workspaces can select which partner workspace to link during invite acceptance.
- Partner conversion to paid does not alter existing brand-granted free access.
- Storage cap blocks new upload and version insert.
- Delivery cap blocks share-link/public downloads, but allows billing/settings access.
- Reactivating discontinued SKU immediately re-enters active count.
- Discontinued SKU older than 12 months follows configured archive/guardrail behavior.
- Add-on purchased mid-cycle updates caps immediately and invoices prorated amount.

## 13) Open Items for next review
- Exact handling for delivery cap in internal authenticated download flows.
- Whether inactive/suspended members should count toward `internal_user_count`.
- Whether invite capacity is best represented as identities, partner orgs, or both meters.
- V2 decision: charge low-cost archive meter for long-discontinued SKUs vs guardrail-only.
