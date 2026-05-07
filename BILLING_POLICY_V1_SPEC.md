# Billing Policy V1 Source of Truth

Status: Reviewed against code on 2026-05-04  
Owner: Product + Engineering  
Purpose: document the billing limits the app actually enforces today, and the gaps between runtime enforcement and the database billing catalog.

## 1) Executive Summary

The app currently has two billing catalogs:

1. Runtime enforcement catalog in `apps/saas-web/src/lib/billing-policy.ts`
2. Seeded database catalog in `billing_plans` and `billing_addons` migrations

These are not the same.

The runtime catalog is the current source of truth for app behavior because all active limit checks resolve limits from `BILLING_PLAN_CATALOG` and `ADDON_DELTAS` in code, not from `billing_plans` or `billing_addons`.

The database catalog is partially in place, but it is not currently used by the app to enforce plan limits.

## 2) Source-of-Truth Precedence

Until the app is changed, billing truth should be read in this order:

1. `apps/saas-web/src/lib/billing-policy.ts`
   - Effective plan limits
   - Effective add-on increments
   - Feature flags tied to plans
2. Enforcement routes and metering helpers
   - What is actually blocked
   - What is actually counted
3. Database migrations
   - Intended billing schema and seeded catalog
   - Not authoritative for enforcement today

## 3) Current Findings

### 3.1 Runtime catalog is authoritative today

`getOrganizationBillingLimits()` resolves the org plan from `organization_subscriptions`, but it does not read `billing_plans`. It applies limits from the hardcoded runtime catalog and add-on constants.

### 3.2 SQL catalog and runtime catalog drift

The SQL seed and runtime catalog disagree on monthly prices:

- `Starter`: runtime `$59`, SQL `$49`
- `Growth`: runtime `$149`, SQL `$129`
- `Scale`: runtime `$349`, SQL `$299`

All other reviewed hard caps for SKU/storage/delivery/internal users/partner invites/DeepL match between runtime and SQL.

### 3.3 Runtime-only limits exist

The following limits or plan flags are enforced in runtime code but are not represented in the seeded SQL plan catalog:

- `agentRunsCount`
- `maxUploadBytes`
- `publicShareLinksEnabled`

### 3.4 Agent metering is incomplete at schema level

The runtime code reads and writes `ai_agent_runs_count` on:

- `organization_usage_daily`
- `organization_usage_monthly_snapshots`

No reviewed migration adds those columns. That means agent billing exists in runtime code, but the database foundation for it is not present in the reviewed migration set.

### 3.5 Some spec items were aspirational, not implemented

The following ideas existed in the prior draft but are not fully enforced in reviewed code:

- `total_sku_count` guardrail is defined in schema, but not enforced in reviewed product routes
- 12-month discontinued archive behavior is not enforced
- delivery bandwidth enforcement is conditional, not always-on
- database `billing_plans` / `billing_addons` are not used as live entitlement sources

## 4) Effective Plan Catalog

This section is the current source of truth for app behavior.

### 4.1 Free (Sandbox)

- Price: `$0/month`
- Active SKUs: `10`
- Storage: `2 GB`
- Monthly delivery bandwidth: `4 GB`
- Internal users: `1`
- Partner invites: `2`
- DeepL chars/month: `0`
- Agent runs/month: `0`
- Max upload size: `25 MB`
- Public share links: `disabled`

### 4.2 Starter

- Price: `$59/month`
- Active SKUs: `50`
- Storage: `15 GB`
- Monthly delivery bandwidth: `25 GB`
- Internal users: `2`
- Partner invites: `10`
- DeepL chars/month: `50,000`
- Agent runs/month: `25`
- Max upload size: `250 MB`
- Public share links: `enabled`

### 4.3 Growth

- Price: `$149/month`
- Active SKUs: `500`
- Storage: `100 GB`
- Monthly delivery bandwidth: `200 GB`
- Internal users: `8`
- Partner invites: `100`
- DeepL chars/month: `250,000`
- Agent runs/month: `100`
- Max upload size: `1 GB`
- Public share links: `enabled`

### 4.4 Scale

- Price: `$349/month`
- Active SKUs: `2,500`
- Storage: `500 GB`
- Monthly delivery bandwidth: `1,000 GB`
- Internal users: `unlimited`
- Partner invites: `unlimited`
- DeepL chars/month: `500,000`
- Agent runs/month: `500`
- Max upload size: `2 GB`
- Public share links: `enabled`

### 4.5 Enterprise

- Price: custom
- Active SKUs: `unlimited`
- Storage: `unlimited`
- Monthly delivery bandwidth: `unlimited`
- Internal users: `unlimited`
- Partner invites: `unlimited`
- DeepL chars/month: `unlimited`
- Agent runs/month: `unlimited`
- Max upload size: `unlimited`
- Public share links: `enabled`

## 5) Effective Add-On Catalog

This is the current runtime add-on behavior:

- `sku_pack_3000`: `+3,000 active SKUs`
- `storage_pack_100gb`: `+100 GB storage`
- `delivery_pack_500gb`: `+500 GB monthly delivery bandwidth`
- `seat_pack_5`: `+5 internal users`
- `partner_invite_pack_100`: `+100 partner invites`

No reviewed runtime add-on exists for:

- DeepL characters
- Agent runs
- Max upload size
- Public share links

## 6) Effective Meter Definitions

### 6.1 `activeSkuCount`

Counted from `products` where:

- `type IN ('variant', 'standalone')`
- `status IN ('Draft', 'Enrichment', 'Review', 'Active')`

Not counted:

- `parent` products
- `Discontinued`
- `Archived`

Current enforcement behavior:

- checked on product create
- checked on variant create
- checked on reactivation/status changes that move a record back into a counted state

Current implementation behavior:

- enforced as current count, not monthly peak

### 6.2 `storageGb`

Source:

- `organizations.storage_used`

Current enforcement behavior:

- upload blocked if file exceeds plan max upload size
- upload/version blocked if resulting storage exceeds storage limit

### 6.3 `deliveryBandwidthGb`

Source:

- `organization_usage_monthly_snapshots.delivery_bandwidth_gb_total`

Metering behavior:

- metered only through current delivery metering helpers
- bytes converted to billing GB with 3 decimal precision

Enforcement behavior:

- public download route checks bandwidth only when `BANDWIDTH_LIMIT_ENFORCEMENT=true`
- metering increments only when `BANDWIDTH_METERING_MODE=estimate`

Implication:

- delivery bandwidth is not universally enforced or universally metered in all environments today

### 6.4 `internalUserCount`

Source:

- active `organization_members` rows for the subscriber org

Current enforcement behavior:

- checked on team invite create
- checked again on team invite accept
- pending team invites are included in create-time projection

### 6.5 `partnerInviteCount`

Current runtime behavior counts unique external access units for a brand using:

- pending actionable partner invites
- accepted partner invites
- active brand-partner relationships

Dedup behavior today is effectively:

- by `partner_organization_id` when present
- otherwise by normalized email

Current enforcement behavior:

- checked on partner invite create
- partner orgs cannot create partner invites

### 6.6 `deeplTotalCharCount`

Source:

- `organization_usage_monthly_snapshots.translation_chars`
- `organization_usage_monthly_snapshots.write_chars`

Effective limit check:

- `translation_chars + write_chars`

Current enforcement behavior:

- checked before localization job execution
- Free plan is blocked from translation entirely

Current intended commercial limits:

- Starter: `50,000`
- Growth: `250,000`
- Scale: `500,000`

### 6.7 `agentRunsCount`

Runtime source:

- `organization_usage_monthly_snapshots.ai_agent_runs_count`

Current enforcement behavior:

- checked before AI agent run
- incremented after successful agent completion

Important limitation:

- no reviewed migration adds `ai_agent_runs_count`, so this meter is not yet fully backed by the reviewed schema

## 7) Effective Plan-Gated Features

### 7.1 Public share links

Plan gate:

- Free: disabled
- Starter and above: enabled

Actual behavior:

- public asset download route forces authenticated access when plan does not allow public share links

### 7.2 Max upload size

Plan gate:

- Free: `25 MB`
- Starter: `250 MB`
- Growth: `1 GB`
- Scale: `2 GB`
- Enterprise: unlimited

Actual behavior:

- enforced on asset upload
- enforced on asset version upload

### 7.3 DeepL access

Plan gate:

- Free: unavailable
- Starter/Growth/Scale/Enterprise: available

Actual behavior:

- translate jobs blocked on Free before usage check

### 7.4 AI Agent access

Plan gate by quota:

- Free: `0`
- Starter: `25`
- Growth: `100`
- Scale: `500`
- Enterprise: unlimited

Actual behavior:

- partners cannot use the agent
- users are also subject to separate per-user rate limits

## 8) Enforcement Map

Reviewed enforcement points:

- Product create: `activeSkuCount`
- Product reactivation/status changes: `activeSkuCount`
- Variant bulk create/update: `activeSkuCount`
- Team invite create: `internalUserCount`
- Team invite accept: `internalUserCount`
- Partner invite create: `partnerInviteCount`
- Asset upload: `maxUploadBytes`, `storageGb`
- Asset version upload: `maxUploadBytes`, `storageGb`
- Public asset download: `publicShareLinksEnabled`, optional `deliveryBandwidthGb`
- Localization jobs: `deeplTotalCharCount`
- AI agent run: `agentRunsCount`

## 9) Database Catalog Status

The following database billing structures exist and are useful foundations:

- `billing_plans`
- `billing_addons`
- `organization_subscriptions`
- `organization_subscription_addons`
- `organization_usage_daily`
- `organization_usage_monthly_snapshots`
- `organization_billing_events`
- `billing_webhook_receipts`

However, for plan limits specifically:

- `billing_plans.limits` is not the live entitlement source for reviewed enforcement code
- `billing_addons.increments` is not the live add-on source for reviewed enforcement code

## 10) Required Follow-Up

To make billing truly single-source-of-truth, the next implementation step should be:

1. choose one canonical catalog source
2. make runtime enforcement read from that source
3. remove drift between SQL seeds and runtime constants
4. update both runtime and SQL DeepL limits to:
   - Starter: `50,000`
   - Growth: `250,000`
   - Scale: `500,000`
5. add missing schema for `ai_agent_runs_count` if agent billing remains in scope
6. decide whether delivery bandwidth enforcement should be always-on or explicitly environment-gated
7. either implement or remove the undocumented V1 aspirations:
   - total SKU guardrail
   - discontinued-after-12-month behavior

## 11) Decision

For the current build, this document defines the source of truth as:

- runtime billing catalog for effective limits
- reviewed route enforcement for actual behavior
- database billing tables as supporting infrastructure, not canonical commercial truth
