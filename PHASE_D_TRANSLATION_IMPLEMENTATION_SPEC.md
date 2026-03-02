# Phase D Implementation Spec: Localization, Translation, and Write Assist (DeepL)

Status: Proposed for build  
Last updated: February 28, 2026  
Owner: Product + Engineering

## 1. Scope and Outcome

Phase D delivers production-grade localization workflows for products:

1. Translation jobs with human review and approval.
2. DeepL integration for translation and same-language Write Assist.
3. Market/channel/language/destination-aware behavior.
4. Billing-metered usage, integrated with existing Kinde billing model.

This spec is intentionally implementation-level and maps directly to DB/API/UI tasks.

## 2. Key Decisions (Locked)

1. Field model strategy: `hybrid`.
2. Translation and Write Assist are `opt-in per org`, controlled in Settings.
3. Translation never auto-overwrites approved values by default.
4. Write Assist is suggestion-only and always review-before-apply.
5. Metering follows existing billing policy patterns used for active SKU and seats.

## 3. Field Model Strategy

We will not force customers into only system fields. Instead:

1. Keep first-class core targets:
   1. `product_name` (title)
   2. `short_description`
   3. `long_description`
   4. `features` (bullets/list)
2. Extend dynamic `product_fields` with translation policy flags:
   1. `is_translatable BOOLEAN DEFAULT false`
   2. `is_write_assist_enabled BOOLEAN DEFAULT false`
   3. `translation_content_type TEXT` (`title|description|bullets|other`)
3. On workspace creation:
   1. Seed standard content fields and group assignments.
   2. Set sane defaults for translatable/write-assist flags.

This preserves the Akeneo-style flexible model while guaranteeing immediate usability.

## 4. UX Architecture

## 4.1 Settings Surface

Location: `Settings > Localization`

Capabilities:

1. Provider config status (DeepL key present / missing).
2. Org toggles:
   1. `Enable Translation`
   2. `Enable Write Assist`
   3. `Allow auto-create pending tasks for new locales`
3. Language and market defaults:
   1. default source locale
   2. default target locales
4. Field policy manager:
   1. choose eligible fields for translation
   2. choose eligible fields for Write Assist
5. Glossary manager:
   1. upload/edit brand terms
   2. map glossary by source-target language pair
6. Billing/usage display:
   1. translation chars used
   2. write chars used
   3. quota warnings

## 4.2 Product Detail Surface

Location: `/[tenant]/products/[productId]`

Capabilities:

1. `Translate` action:
   1. source locale
   2. target locale(s)
   3. field selection (only eligible fields)
   4. queue job
2. `Improve` action on eligible text fields:
   1. generate suggestion
   2. inline diff
   3. edit suggestion
   4. approve apply
3. `Review queue` entry point:
   1. pending suggestions for this product and scope
4. Conflict behavior:
   1. if source changed after suggestion creation, mark item stale

## 4.3 Products List Surface

Location: `/[tenant]/products`

Capabilities:

1. Bulk translate for selected products.
2. Filter by translation status:
   1. pending review
   2. stale
   3. approved
3. Quick action to open translation jobs queue.

## 4.4 Localization Jobs Center

Location: `/[tenant]/settings/localization/jobs` (or `/[tenant]/localization/jobs`)

Capabilities:

1. Job list with status and usage cost.
2. Per-item review:
   1. source vs suggestion vs current
   2. inline editing
   3. approve/reject/bulk approve
3. Retry failed items.
4. Export failures/logs for QA.

## 4.5 Market/Language Creation Interaction

When new market/locales are configured:

1. No automatic publish of translations.
2. Optional automatic creation of `pending translation tasks` (if org setting enabled).
3. Tasks appear in jobs center and require approval.

## 5. Data Model and Migrations

Proposed migration sequence (names can be adjusted):

1. `20260323_add_translation_settings_and_field_flags.sql`
2. `20260324_add_translation_jobs_and_items.sql`
3. `20260325_add_translation_glossaries_and_mappings.sql`
4. `20260326_add_translation_usage_metering.sql`
5. `20260327_seed_default_translatable_content_fields.sql`

## 5.1 Organization-level settings

Table: `organization_localization_settings`

Columns:

1. `organization_id UUID PK/FK`
2. `translation_enabled BOOLEAN NOT NULL DEFAULT false`
3. `write_assist_enabled BOOLEAN NOT NULL DEFAULT false`
4. `auto_create_pending_tasks_for_new_locale BOOLEAN NOT NULL DEFAULT false`
5. `default_source_locale_id UUID NULL`
6. `default_target_locale_ids UUID[] NOT NULL DEFAULT '{}'::uuid[]`
7. `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
8. timestamps

## 5.2 Product field policy extensions

Table: `product_fields` add columns:

1. `is_translatable BOOLEAN NOT NULL DEFAULT false`
2. `is_write_assist_enabled BOOLEAN NOT NULL DEFAULT false`
3. `translation_content_type TEXT NOT NULL DEFAULT 'other'`

Constraint:

1. `translation_content_type IN ('title','description','bullets','other')`

## 5.3 Translation jobs

Table: `translation_jobs`

Columns:

1. `id UUID PK`
2. `organization_id UUID FK`
3. `requested_by TEXT`
4. `job_type TEXT` (`translate|write_assist`)
5. `status TEXT` (`queued|running|review_required|completed|failed|cancelled`)
6. `source_locale_id UUID NULL`
7. `target_locale_ids UUID[]`
8. `scope JSONB` (market/channel/locale/destination tuples)
9. `field_selection JSONB` (system fields + custom field IDs)
10. `provider TEXT` (`deepl`)
11. `provider_meta JSONB`
12. `estimated_chars BIGINT`
13. `actual_chars BIGINT`
14. `error_summary TEXT NULL`
15. timestamps

## 5.4 Translation job items

Table: `translation_job_items`

Columns:

1. `id UUID PK`
2. `job_id UUID FK`
3. `organization_id UUID FK`
4. `product_id UUID FK`
5. `product_field_id UUID NULL` (NULL for system fields)
6. `field_code TEXT NOT NULL` (system code or custom code)
7. `source_scope JSONB NOT NULL`
8. `target_scope JSONB NOT NULL`
9. `source_value JSONB NOT NULL`
10. `suggested_value JSONB NULL`
11. `edited_value JSONB NULL`
12. `final_value JSONB NULL`
13. `source_hash TEXT NOT NULL`
14. `status TEXT` (`queued|generated|reviewed|approved|rejected|applied|failed|stale`)
15. `reviewed_by TEXT NULL`
16. `reviewed_at TIMESTAMPTZ NULL`
17. `applied_by TEXT NULL`
18. `applied_at TIMESTAMPTZ NULL`
19. `provider_request_meta JSONB`
20. `provider_response_meta JSONB`
21. `error_message TEXT NULL`
22. timestamps

Indexes:

1. `(organization_id, status, updated_at DESC)`
2. `(product_id, status)`
3. `(job_id, status)`

## 5.5 Glossary

Tables:

1. `translation_glossaries`
2. `translation_glossary_entries`
3. `translation_glossary_locale_pairs`

Purpose:

1. maintain brand terminology
2. map glossary usage to source-target language pairs
3. sync glossary IDs with DeepL provider metadata

## 5.6 Metering data

Table: `organization_usage_daily` add columns:

1. `translation_chars BIGINT NOT NULL DEFAULT 0`
2. `write_chars BIGINT NOT NULL DEFAULT 0`

Table: `organization_usage_monthly_snapshots` add columns:

1. `translation_chars BIGINT NOT NULL DEFAULT 0`
2. `write_chars BIGINT NOT NULL DEFAULT 0`

Optional:

1. `translation_usage_events` for immutable event-level audit.

## 6. API Contract

## 6.1 Jobs

1. `POST /api/[tenant]/localization/jobs`
2. `GET /api/[tenant]/localization/jobs`
3. `GET /api/[tenant]/localization/jobs/[jobId]`
4. `POST /api/[tenant]/localization/jobs/[jobId]/cancel`

Create payload:

```json
{
  "jobType": "translate",
  "sourceLocaleId": "uuid",
  "targetLocaleIds": ["uuid"],
  "productIds": ["uuid"],
  "fieldSelection": {
    "systemFields": ["product_name", "short_description", "long_description", "features"],
    "productFieldIds": ["uuid"]
  },
  "scope": {
    "marketIds": ["uuid"],
    "channelIds": ["uuid"],
    "localeIds": ["uuid"],
    "destinationIds": ["uuid"]
  }
}
```

## 6.2 Item review/apply

1. `PATCH /api/[tenant]/localization/items/[itemId]` (edit suggestion)
2. `POST /api/[tenant]/localization/items/[itemId]/approve`
3. `POST /api/[tenant]/localization/items/[itemId]/reject`
4. `POST /api/[tenant]/localization/items/bulk-approve`

Approval behavior:

1. write approved value into scoped product value target
2. preserve audit trail in `translation_job_items`
3. mark stale if source hash changed before apply

## 6.3 Write Assist

1. `POST /api/[tenant]/localization/write-assist`

Payload:

```json
{
  "productId": "uuid",
  "fieldCode": "short_description",
  "scope": {
    "marketId": "uuid",
    "channelId": "uuid",
    "localeId": "uuid",
    "destinationId": "uuid"
  },
  "inputText": "existing content",
  "tone": "neutral",
  "targetAudience": "retail consumer"
}
```

Response:

1. suggestion text
2. usage chars consumed
3. review token/item reference

## 7. DeepL Adapter Rules

Provider endpoints:

1. Translate: `/v2/translate`
2. Write Assist: `/v2/write/rephrase`
3. Usage: `/v2/usage`

Rules:

1. Server-side calls only.
2. Request chunking by endpoint limits.
3. Always pass context for short fields where possible.
4. Glossary ID included when locale pair mapping exists.
5. Retry with bounded backoff; terminal failures persisted per item.

## 8. Billing and Metering Integration (Kinde-aligned)

## 8.1 Internal meter model

Extend billing policy limits/usage:

1. `translationCharCount`
2. `writeCharCount`

Extend `LimitSet`, usage snapshot, and enforcement helpers in:

1. `apps/saas-web/src/lib/billing-policy.ts`

## 8.2 Kinde feature keys

Define feature keys in Kinde:

1. `translation_chars`
2. `write_chars`

Mapping:

1. internal `translationCharCount` -> Kinde `translation_chars`
2. internal `writeCharCount` -> Kinde `write_chars`

## 8.3 Enforcement points

1. At job creation:
   1. estimate chars and enforce hard cap preflight
2. At item processing:
   1. settle actual chars and increment usage
3. At approval/apply:
   1. no extra meter usage (already counted at generation)

## 8.4 Usage sync

1. Daily reconciliation worker:
   1. compare internal aggregate with provider usage
   2. record audit mismatch events
2. Submit metered usage to Kinde on fixed cadence using idempotent keys.

## 9. Permissions and Security

New permission keys:

1. `product.translate.run`
2. `product.translate.review`
3. `product.translate.approve`
4. `product.translate.override`
5. `product.write_assist.use`

Enforcement:

1. Product-level permissions + scope permissions + billing cap must all pass.
2. Cross-tenant shared-brand view remains read-only.
3. API keys stored server-side only, never exposed to client.

## 10. Review and Override Policy

1. Suggestions are draft state until approved.
2. User can edit suggestion before approval.
3. Approved value writes scoped value only.
4. Manual override marks item with `override=true` in metadata.
5. Future auto-runs do not overwrite override content unless user chooses force replace.

## 11. Rollout Plan

## Phase D0: Foundation

1. Migrations for settings, field flags, jobs/items, usage columns.
2. DeepL service adapter with provider abstraction.
3. Billing policy meter extensions and preflight checks.

## Phase D1: Product Detail UX

1. Translate modal.
2. Write Assist action per field.
3. Item review panel with approve/reject.

## Phase D2: Bulk and Jobs Center

1. Bulk translation from products table.
2. Jobs list and item queue views.
3. Retry and stale handling UX.

## Phase D3: Glossary and Governance

1. Glossary management UI.
2. Localization settings page.
3. Locale onboarding to pending tasks.

## Phase D4: Hardening

1. Load testing and failure drills.
2. Observability dashboards and alerting.
3. Billing reconciliation validation with Kinde.

## 12. Acceptance Criteria

1. Org can enable/disable translation and write assist independently.
2. User can run translate on selected fields and review before apply.
3. User can run write assist and edit suggestion before apply.
4. Scoped values respect market/channel/locale/destination tuple.
5. Source changes create stale review state and block blind apply.
6. Meter caps block new jobs with clear remediation message.
7. Usage appears in billing page and reconciles with provider totals.
8. No DeepL secrets exposed to browser.

## 13. Open Product Decisions

1. Plan packaging for included chars by tier.
2. Overage behavior in V1:
   1. hard cap only
   2. optional overage in V2
3. Default eligible custom fields for new tenants.
4. Whether Write Assist should be available on Free tier at all.

