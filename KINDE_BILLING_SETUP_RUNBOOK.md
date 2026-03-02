# Kinde Billing Setup Runbook (V1)

Status: Ready for implementation  
Last updated: 2026-02-26  
Scope: B2B organizations (Brands + Partners)

## 1) Product decisions locked for V1
- Subscription owner: organization (not individual user).
- Plans: Free (Sandbox) / Starter / Growth / Scale / Enterprise.
- Trial: one 14-day trial for paid plans, plus free sandbox tier for low-volume evaluation.
- Enforcement: hard caps (no overage charging in-app).
- Add-ons: prorated mid-cycle.

## 2) Free sandbox tier (new)
Use this as a low-risk trial/sandbox entry point.

### Fixed monthly charge (`base_subscription_fee`)
- Free (Sandbox): `$0`

### Feature limits
| Feature key | Free (Sandbox) |
|---|---:|
| `internal_user_count` | 1 |
| `active_sku_count` | 10 |
| `storage_gb` | 2 |
| `delivery_bandwidth_gb` | 4 |
| `partner_invite_count` | 2 |

Behavior notes:
- Same hard-cap enforcement model as paid plans.
- Upgrade path should be immediate from sandbox to paid plan.
- Keep sandbox included in billing portal/pricing table only if you want self-serve downgrade to free.
- Free-tier uploads are capped at `50MB` per file in-app.
- Free-tier shared asset links require authenticated org access (no anonymous/public access).

## 3) Kinde facts to design around
- Kinde billing currently uses Stripe; Stripe is the only supported processor.
- Kinde docs state existing Stripe accounts cannot be directly connected as-is; onboarding creates/links via Kinde flow.
- Billing cycles default monthly; fixed charges billed in advance, metered usage billed in arrears.
- Pricing tables support up to 4 plans per table.
- For plans with any fixed or metered charges, card collection is required.
- Billing webhooks are delivered as JWT payloads and retried with backoff on non-200 responses.
- Account API is not the right source for org plan entitlements; use Kinde Management API for org-level billing data.

## 4) Meter model mapping (app -> Kinde)
Use these keys consistently across Kinde and app code:
- `active_sku_count`
- `storage_gb`
- `delivery_bandwidth_gb`
- `internal_user_count`
- `partner_invite_count`
- `deepl_total_char_count`

Type guidance:
- `active_sku_count`, `storage_gb`, `delivery_bandwidth_gb`, `deepl_total_char_count`: metered features.
- `internal_user_count`, `partner_invite_count`: metered non-chargeable or unmetered numeric entitlement (either works).

Recommended V1:
- Keep enforcement authoritative in app DB (`organization_subscriptions`, add-ons, usage snapshots).
- Use Kinde for checkout/subscription lifecycle and customer-facing billing UX.

## 5) Plan modeling in Kinde
For each plan:
1. Add one fixed charge line item (`base_subscription_fee`).
2. Add metered features for usage meters:
   - `active_sku_count`
   - `storage_gb`
   - `delivery_bandwidth_gb`
   - `deepl_total_char_count`
3. Add plan limit features:
   - `internal_user_count`
   - `partner_invite_count`

Notes:
- Keep feature keys stable forever; labels can change, keys should not.
- Enterprise can use very high limits or contract-managed custom values.

## 5.1) Exact plan values to enter in Kinde

### Fixed monthly charge (`base_subscription_fee`)
- Free (Sandbox): `$0` (Ideal for product discovery)
- Starter: `$49` (Ideal for single-brand founders)
- Growth: `$129` (Ideal for established teams)
- Scale: `$299` (Ideal for global brands and retailers)
- Enterprise: `$0` (custom contract; can be hidden from self-serve checkout)

### Feature limits per plan
| Feature key | Free (Sandbox) | Starter | Growth | Scale | Enterprise |
|---|---:|---:|---:|---:|---:|
| `active_sku_count` | 10 | 50 | 500 | 2500 | 2147483647 |
| `storage_gb` | 2 | 15 | 100 | 500 | 2147483647 |
| `delivery_bandwidth_gb` | 4 | 25 | 200 | 1000 | 2147483647 |
| `internal_user_count` | 1 | 2 | 8 | 2147483647 | 2147483647 |
| `partner_invite_count` | 2 | 10 | 100 | 2147483647 | 2147483647 |
| `deepl_total_char_count` | 0 | 750000 | 3000000 | 12000000 | 2147483647 |

`2147483647` is used as the practical "Unlimited" value for Kinde feature limits.

## 6) Roles and permissions model (Kinde vs Supabase)
This is the critical multi-tenant split for Brands + Partners.

Kinde should own:
- Authentication and identity lifecycle.
- Organization membership context in tokens.
- Billing portal authorization (`org:write:billing`).

Supabase should own:
- Tenant membership role (`owner`, `admin`, `member`, `partner`).
- Invite role/access (`admin`, `editor`, `viewer`, partner `view/edit`).
- Module-level and scope-level permissions (`member_scope_permissions`, bundles, market/collection scope).
- Brand-partner relationship rules and access grants.

Design rule:
- Do not model `brand` vs `partner` as Kinde roles.
- Keep `organization_type` and relationships in app DB as source of truth.

## 6.1) Minimal Kinde RBAC for Free-plan limits
Kinde Free allows 2 custom roles and 10 permissions. Use this minimum set:
- Role 1: `org_billing_admin`
- Role 2: `org_member`

Required Kinde permission:
- `org:write:billing` assigned to `org_billing_admin` only.

Result:
- Billing actions are guarded by both app RBAC and Kinde org billing permission.
- Fine-grained product/asset/share authorization stays in Supabase.

## 6.2) Permission sync contract
When app role changes in Supabase:
- If user becomes `owner` or `admin` for org, ensure Kinde org role grants `org:write:billing`.
- If user is downgraded from `owner/admin`, remove billing-manage role in Kinde.
- Keep this sync idempotent and organization-scoped.

App configuration for sync:
- `KINDE_BILLING_ADMIN_ROLE_KEY` (default: `org_billing_admin`)
- `KINDE_MANAGEMENT_EXTRA_SCOPES` for role sync endpoints as needed in your tenant.
  - Example values to include (space-separated): `read:roles read:organization_user_roles create:organization_user_roles delete:organization_user_roles`

Current app behavior:
- Billing portal endpoint already enforces app owner/admin plus `org:write:billing`.
- Invite acceptance syncs Kinde identity + org membership.
- Owner/admin assignment during org creation and team invite acceptance now attempts Kinde billing-role sync.

## 7) Add-on strategy
V1 recommendation:
- Keep add-ons in app billing tables as entitlements that increase limits.
- Keep Kinde plan catalog simple while integration hardens.
- Sync add-on purchases into:
  - `organization_subscription_addons`
  - recalculated effective limits in app.

When ready, move add-ons into Kinde-native recurring charges/features if that matches Kinde capabilities and your commercial model.

## 8) Required Kinde setup sequence
1. Non-production env only first.
2. Set billing roles/permissions for B2B org admins (`org:write:billing`).
3. Connect Stripe from Kinde Billing settings.
4. Set default currency (before first plan publish).
5. Create plan group and plans (Free/Starter/Growth/Scale/Enterprise).
6. Configure plan features/limits and fixed charges.
7. Publish plans.
8. Create pricing table(s) and registration flow behavior.
9. Enable self-serve portal billing controls (org admins only).

Note:
- Because Kinde pricing tables support up to 4 plans per table, use two tables if all 5 plans are visible.

## 9) Webhook integration (must-do)
Webhook endpoint in this app:
- `POST /api/webhooks/kinde/billing`

Subscribe endpoint to events at minimum:
- `customer.agreement_created`
- `customer.plan_assigned`
- `customer.plan_changed`
- `customer.agreement_cancelled`
- `customer.payment_succeeded`
- `customer.payment_failed`
- `customer.invoice_overdue`
- `customer.meter_usage_updated`

Endpoint requirements:
- Verify Kinde webhook JWT.
- Enforce idempotency by event ID.
- Persist raw payload + normalized billing event row.
- Return fast 200 on success; retry-safe behavior on duplicates.

Current implementation status:
- Dedicated billing endpoint is implemented with JWT verification.
- Durable idempotency is implemented via `billing_webhook_receipts` table.
- Billing events are mirrored into `organization_billing_events`.
- Subscription rows are updated when event payload has enough identifiers/plan data.

## 10) App sync model
Keep these DB fields as app source of truth for enforcement:
- `organization_subscriptions.status/plan_id/period dates`
- `organization_subscription_addons`
- `organization_usage_daily` (and monthly rollups)

On webhook receive:
- upsert subscription state,
- write `organization_billing_events`,
- recalculate effective limits if plan/add-ons changed.

Fallback mode while Kinde billing setup is blocked:
- Use `POST /api/organizations/[slug]/billing/subscription` to persist local plan changes.
- Endpoint writes `organization_subscriptions` + `organization_billing_events`.
- Restrict to owner/admin only.

### 10.0) Plans-only hookup mode (works before feature setup)
You can connect Kinde billing now even if plan features are not yet configurable in dashboard.

What works now:
- Kinde checkout + plan assignment
- Kinde self-serve portal open from app billing page
- Billing webhook ingestion, idempotency, and subscription state sync

Requirements for this mode:
- Ensure each organization row has `kinde_org_id` set correctly.
- Set webhook URL in Kinde to `POST /api/webhooks/kinde/billing`.
- Ensure Kinde plan key/name contains one of: `free`, `starter`, `growth`, `scale`, `enterprise`.
  - Or configure explicit mapping with `KINDE_BILLING_PLAN_MAP`.
  - Example: `KINDE_BILLING_PLAN_MAP=sandbox-plan:free,starter-v1:starter,growth-v1:growth,scale-v1:scale`

Notes:
- Metered feature limits are still enforced from app DB plan limits until Kinde features are fully configured.
- Add-ons remain app-managed in V1.

## 10.1) Self-service portal integration (recommended path)
Use Kinde recommended portal link path with user access token context.

Implementation in this app:
- Billing UI calls `GET /api/organizations/[slug]/billing/portal`.
- Endpoint checks:
  - user has workspace access,
  - user is owner/admin in app RBAC,
  - Kinde permission `org:write:billing` is granted in current org context.
- On success it returns:
  - `/api/auth/portal?subNav=organization_billing&returnUrl=<workspace billing page>`

## 10.2) Partner signup and conversion UX
- Self-serve partner signup path: `/api/auth/register?post_login_redirect_url=/onboarding?type=partner&create=1`
- On partner workspace creation (non-invite context), redirect to:
  - `/<partner-slug>/settings/billing?source=partner_signup`
- Billing page should show upgrade CTA copy that clarifies:
  - invited brand access remains free,
  - paid plan applies to partner-owned workspace capabilities.
- Partner invite acceptance should preserve single-workspace identity:
  - if one partner workspace exists, auto-link invite;
  - if multiple exist, require explicit workspace selection;
  - allow create-new workspace as fallback.

## 11) Meter submission guidance
For usage recorded into Kinde:
- resolve customer agreement ID,
- submit usage against feature key via Kinde metered usage API,
- send usage on fixed cadence (daily recommended) with idempotent job keys.

Keep app DB counters as enforcement source until Kinde parity is proven.

## 12) Launch checklist
- [ ] Plans and keys match app constants exactly.
- [ ] Free sandbox plan is configured and visible/hidden by intended GTM behavior.
- [ ] Webhook JWT verification implemented.
- [ ] Webhook idempotency table in place.
- [ ] Failed payment behavior defined (`past_due` grace + cap behavior).
- [ ] Trial expiration behavior enforced.
- [ ] Billing admin UI shows current plan, limits, usage, upgrade actions.
- [ ] Partner self-serve signup route is available and redirects to billing CTA.
- [ ] Invite acceptance handles multi-partner-org selection without forcing duplicate onboarding.
- [ ] Kinde billing permission sync process defined for owner/admin changes.

## References
- Kinde billing model: https://docs.kinde.com/billing/about-billing/kinde-billing-model/
- Connect Stripe processor: https://docs.kinde.com/billing/payment-management/payment-processor/
- Plan composition (fixed/metered/unmetered): https://docs.kinde.com/billing/manage-plans/about-plans/
- Pricing models (metered limits): https://docs.kinde.com/billing/pricing/pricing-models/
- Meter usage API workflow: https://docs.kinde.com/billing/manage-subscribers/add-metered-usage/
- Billing webhooks and events: https://docs.kinde.com/billing/manage-subscribers/manage-customer-activity-webhooks/
- Setup flow overview: https://docs.kinde.com/billing/get-started/setup-overview/
- Pricing table constraints: https://docs.kinde.com/billing/billing-user-experience/plan-selection/
- Account API limitations for org entitlements: https://docs.kinde.com/developer-tools/account-api/about-account-api/
- Self-serve portal for orgs: https://docs.kinde.com/build/self-service-portal/self-serve-portal-for-orgs/
