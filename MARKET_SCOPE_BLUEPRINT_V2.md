# Market Scope Blueprint V2 (Assets + Products)

_Last updated: March 2, 2026_

## 1. Decision Summary

The platform should treat **Market / Channel / Language / Destination** as a first-class authoring scope for both Assets and Products, while keeping the existing top-bar selector as a **working context** only.

- **Working Context**: controls what the user sees/filters.
- **Authoring Scope**: controls what the user writes/publishes.

This mirrors proven PIM behavior (Akeneo channel+locale context and completeness by context) while keeping us compatible with DAM-first workflows.

## 2. Benchmark Patterns (what to copy)

As of February 28, 2026, common patterns across Akeneo, Plytix, and Pimberly are:

1. Context-aware editing and completeness per channel/locale.
2. Publish/feed outputs tied to specific channels/destinations.
3. Validation gates before outbound syndication.
4. Connector-level mapping and error logs (not direct hardcoding in core entities).

Implication for us: we need one scope model that works in create/edit/upload, then destination connectors consume that scoped data.

## 3. Canonical Scope Model

Use one shared tuple everywhere:

- `market_id` (optional)
- `channel_id` (optional)
- `locale_id` (optional)
- `destination_id` (optional)

Rules:

1. `destination_id` requires a valid `channel_id` relationship.
2. If `market_id` is set and market-locale restrictions exist, `locale_id` must be valid for that market.
3. `global` mode is represented by all four values `NULL`.

## 4. UX Wiring (Frontend)

## 4.1 Top Header

Keep existing header controls but relabel behavior in help text:

- "Viewing context only"
- "Does not automatically set authoring scope"

On create/upload pages, either hide global selector (current `/assets/upload` behavior) or show read-only context chip.

## 4.2 Assets List (`/assets`)

Add native drag-and-drop entry (already started) and when dropped:

1. If user is inside folder path, pass `folderId` to upload workflow.
2. Pre-open upload with `Scope preset = current working context` as a suggestion, not forced.

## 4.3 Upload Page (`/assets/upload`)

Add an **Authoring Scope** panel near Upload Destination:

- Mode: `Global` / `Scoped`
- Scoped selectors: Market, Channel, Language, Destination
- Quick action: "Use current context"
- Scope chips shown per row; row override allowed.

Behavior:

1. Scope applies to product links created during upload.
2. Optional direct asset scope assignment (new table, see section 5).
3. Bulk apply supports scope updates exactly like tags/categories.

## 4.4 Product Create

In add-product modal:

- Add "Initial Authoring Scope" section (collapsed by default).
- If scoped selected, seed scoped values for required localizable/channelable fields.

## 4.5 Product Detail

Add a scope switch bar directly in product detail:

- Scope chips: Market x Channel x Locale x Destination
- Field badges: `Global`, `Scoped`, `Inherited`, `Missing in scope`
- Completeness should be computed for selected scope tuple.

## 4.6 Bulk Editing (Products + Assets)

Both modules need the same bulk scope operations:

1. Set scope
2. Add additional scope
3. Clear scope
4. Copy values from one scope to another

## 5. Backend/Data Wiring

## 5.1 Assets

Current state: scoped links exist via `product_asset_links` scope columns.

Add table:

- `asset_scope_assignments`
  - `id`, `organization_id`, `asset_id`
  - `market_id`, `channel_id`, `locale_id`, `destination_id`
  - `source` (`upload`, `bulk_edit`, `rule`, `manual`)
  - `is_active`, timestamps
  - unique on `(organization_id, asset_id, coalesce(scope tuple))`

Why: avoids overloading product links for assets that are scoped but not linked to a product yet.

## 5.2 Products

Current state: `product_field_values` uses `locale` + `channel` text.

Target:

1. Keep current columns for compatibility.
2. Add nullable FK scope columns:
   - `market_id`, `channel_id`, `locale_id`, `destination_id`
3. Write routes store both:
   - IDs as source of truth,
   - text code mirror during migration window.
4. Add composite uniqueness including scope IDs.

## 5.3 API Contracts

### Upload
`POST /api/[tenant]/assets/upload`

Support:

```json
{
  "scope": {
    "mode": "global|scoped",
    "marketIds": ["..."],
    "channelIds": ["..."],
    "localeIds": ["..."],
    "destinationIds": ["..."]
  }
}
```

### Product Create
`POST /api/[tenant]/products`

Support:

```json
{
  "initialScope": {
    "mode": "global|scoped",
    "marketIds": ["..."],
    "channelIds": ["..."],
    "localeIds": ["..."],
    "destinationIds": ["..."]
  }
}
```

### Product Field Writes
All value write endpoints accept full scope tuple and enforce compatibility checks.

## 6. Translation Architecture (DeepL)

Use server-side translation jobs only.

Flow:

1. User selects source locale + target locales + fields.
2. Create `translation_jobs` and `translation_job_items`.
3. Worker calls DeepL `/v2/translate` (server key only).
4. Use glossary support for brand terms.
5. Store results as draft scoped values.
6. Human review/approve before publish.

Guardrails:

- Never expose DeepL key in browser.
- Track usage with `/v2/usage` and enforce org budget limits.
- Use `context` parameter for short product titles/descriptions.

## 7. Destination Strategy (future-safe)

Do not make Shopify/Walmart behavior part of core product tables.

Add connector layer tables:

- `destination_profiles`
- `destination_field_mappings`
- `destination_publish_jobs`
- `destination_publish_job_items`
- `destination_publish_errors`

Behavior:

1. Validate scoped completeness before queueing publish.
2. Transform with destination mapping profile.
3. Execute async and log per-item errors.
4. Allow retries and "fix + republish" workflow.

## 8. Sets + Scope Interaction

Dynamic set rules can stay content-based (tags/folders/product model/name), but set membership visibility should be scope-aware at share time:

- Keep `share_set_items.market_ids/channel_ids/locale_ids` as the gate.
- Add destination-level gate only when destination-specific sharing is required.

## 9. Delivery Plan

## Phase A (immediate)

1. Add shared `AuthoringScopePicker` component.
2. Add scope panel to `/assets/upload`.
3. Add initial scope to product create.
4. Add helper text clarifying view context vs authoring scope.

### Phase A Status (implemented on February 28, 2026)

- `AuthoringScopePicker` added at `apps/saas-web/src/components/scope/authoring-scope-picker.tsx`.
- `/assets/upload` now supports:
  - top-level authoring scope defaults
  - row-level scope overrides
  - scope summary column in the upload table
  - scope autosave payloads
- `POST /api/[tenant]/assets/upload` now persists `metadata.authoringScope` when provided.
- Add Product modal now sends `initialScope`.
- `POST /api/[tenant]/products` now validates `initialScope` and persists it under `marketplace_content.authoringScope`.
- Header now displays helper copy: `Viewing context only. Authoring scope is set during create/upload.`

## Phase B

1. Add `asset_scope_assignments` table + APIs.
2. Extend product value writes with scope IDs.
3. Add scope validation engine.

### Phase B Status (implemented on February 28, 2026)

- Added migration `20260322_add_asset_scope_assignments_and_product_field_value_scope_ids.sql`:
  - creates `asset_scope_assignments` with RLS, indexes, and tuple uniqueness
  - adds `market_id/channel_id/destination_id/locale_id` to `product_field_values`
  - adds trigger to keep `locale/channel` text mirrors aligned with ID columns
- Added shared scope validation engine:
  - `apps/saas-web/src/lib/authoring-scope.ts`
  - validates market/channel/language/destination existence + compatibility
  - expands scoped selections into canonical scope tuples
- Wired APIs to enforce and persist scope:
  - `POST /api/[tenant]/assets/upload` validates scope and writes `asset_scope_assignments`
  - `PATCH /api/[tenant]/assets/[assetId]` validates scope updates and rewrites assignments
  - `POST /api/[tenant]/products` validates `initialScope`
  - `PUT/PATCH /api/[tenant]/products/[productId]` validates `initialScope` and `marketplace_content.authoringScope`

## Phase C

1. Product scope bar + scoped completeness.
2. Missing-in-scope badges/queues.
3. Bulk scope edit operations in products/assets.

### Phase C Status (completed on February 28, 2026)

- Product + variant detail headers now show:
  - current view scope chips
  - authoring scope summary
  - `Missing in this scope` and `Out of authoring scope` indicators
- Product completeness API is now scope-aware:
  - resolves and applies `market/channel/locale/destination` scope (ID-first, code fallback)
  - enforces scoped completeness for channelable/localizable required fields
  - returns completeness against the active view scope tuple
- Assets upload supports bulk scope operations (`set`, `add`, `clear`) with row-level overrides.
- Products table now supports bulk authoring scope edits via bulk toolbar:
  - set scope
  - add to existing scope
  - clear to global
  - persisted through product PATCH API
- Products table now includes scope visibility controls:
  - filter: `All Scopes`, `In Current Scope`, `Missing In Scope`
  - per-row `Missing in scope` badge

## Phase D

1. Translation job framework + DeepL integration.
2. Glossary and review workflow.

Implementation spec:
- See `PHASE_D_TRANSLATION_IMPLEMENTATION_SPEC.md`

### Phase D0 Status (started on February 28, 2026)

- Added migration `20260323_add_localization_translation_foundation.sql` for:
  - organization localization settings
  - translation jobs + job items
  - translation glossary tables
  - product field translation policy columns
  - translation/write usage meter columns
- Added localization APIs:
  - `GET/PUT /api/[tenant]/localization/settings`
  - `GET/POST /api/[tenant]/localization/jobs`
  - `GET /api/[tenant]/localization/jobs/[jobId]`
  - `POST /api/[tenant]/localization/jobs/[jobId]/cancel`
- Added DeepL provider service scaffold:
  - `apps/saas-web/src/lib/deepl.ts`
- Added usage metering helper for translation/write character consumption:
  - `apps/saas-web/src/lib/localization-metering.ts`
- Added initial UI page:
  - `Settings > Localization` with provider status, defaults, and recent jobs.
- Added tenant-level DeepL write controls:
  - migration `20260324_add_localization_write_controls.sql`
  - `organization_localization_settings` now stores `deepl_glossary_id`, `brand_instructions`, and `preferred_tone`
  - settings API/UI now supports editing these values
- Added glossary management APIs and UI:
  - `GET/POST /api/[tenant]/localization/glossaries`
  - `PATCH/DELETE /api/[tenant]/localization/glossaries/[glossaryId]`
  - `GET/PUT /api/[tenant]/localization/glossaries/[glossaryId]/entries`
  - Localization Settings now includes glossary creation/listing and default glossary selection
- Write Assist jobs now call DeepL Write (`/v2/write/rephrase`) with tone/style mapped from `preferred_tone`.
- Brand instructions now influence Write Assist control selection (tone/style inference) and are recorded in provider metadata for auditability.

### Phase D1 Status (completed on March 2, 2026)

- Added stale-source protection before apply:
  - `POST /api/[tenant]/localization/jobs/[jobId]/items/[itemId]/apply`
  - recomputes current source hash from live product/source-scope content
  - marks item `stale` and blocks apply when source has changed
- Added dynamic custom field translation support:
  - job creation now accepts `productFieldIds`
  - resolves translatable/write-enabled text custom fields from `product_fields`
  - builds work items from scoped `product_field_values` (with parent fallback for variants)
- Added bulk item APIs:
  - `POST /api/[tenant]/localization/jobs/[jobId]/items/bulk`
  - supports bulk `approve`, `reject`, and `apply` actions
- Added optional async execution path:
  - `POST /api/[tenant]/localization/jobs` now supports `executionMode: "sync" | "async"`
  - async jobs are created in `queued` status
  - `POST /api/[tenant]/localization/jobs/[jobId]/run` executes queued jobs
- Localization Settings UI now supports:
  - execution mode selection (sync vs async)
  - custom field selection in job creation
  - run queued job button
  - bulk approve/reject/apply controls in Job Review

## Phase E

1. Destination connector mapping and publish pipeline.
2. Per-destination monitoring and replay.

## 10. Why this approach

- Gives immediate operational value in upload/create flows.
- Preserves existing schema and APIs while migrating safely.
- Enables multilingual, market-aware authoring now.
- Keeps Shopify/Walmart-ready architecture without overbuilding this sprint.

## References

- Akeneo channel/locale/context/completeness:
  - https://api.akeneo.com/concepts/target-market-settings.html
  - https://help.akeneo.com/v7-discover-akeneo-concepts/v7-what-is-a-channel
  - https://help.akeneo.com/v7-your-first-steps-with-akeneo/v7-understand-product-completeness
  - https://help.akeneo.com/serenity-get-familiar-with-the-product-grid
- Plytix channels/completeness/integrations:
  - https://help.plytix.com/en/creating-a-channel
  - https://help.plytix.com/migration/en/completeness-tracking
  - https://help.plytix.com/en/shopify-connector
  - https://help.plytix.com/en/shopify-metafields
- Pimberly localization/integration patterns:
  - https://pimberly.com/blog/how-pim-simplifies-localization/
  - https://pimberly.com/integrations/
  - https://pimberly.com/integrations/shopify-connector/
- DeepL API:
  - https://developers.deepl.com/docs/getting-started/auth
  - https://developers.deepl.com/docs/resources/usage-limits
  - https://developers.deepl.com/api-reference/usage-and-quota/check-usage-and-limits
  - https://developers.deepl.com/docs/learning-how-tos/examples-and-guides/how-to-use-context-parameter
  - https://developers.deepl.com/docs/api-reference/glossaries
