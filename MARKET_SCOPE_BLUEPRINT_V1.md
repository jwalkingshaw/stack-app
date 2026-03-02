# Market Scope Blueprint (Assets + Products)

## Objective
Define a single, consistent way to create, enrich, and share both assets and products across:
- Markets
- Languages (locales)
- Channels
- Destinations

This blueprint is focused on front-end interaction design plus the minimum backend wiring needed to support future syndication and translation.

## Why This Is Critical
Without explicit scope wiring, users cannot confidently answer:
- "Is this asset/product global or scoped?"
- "Which market/channel/locale is this content for?"
- "What is published where?"

This causes content drift, duplicate manual work, and weak readiness for destination integrations (Shopify, Walmart, etc.).

## Current State (in this repo)

### Working context exists (global picker)
- `MarketContextProvider` stores selected market/channel/locale/destination globally.
- Header scope picker is now hidden on `/assets/upload` to avoid misleading behavior.

### Assets
- `/assets/upload` captures folder + metadata + product links.
- Upload API supports scoped fields on `product_asset_links` (`channel_id`, `market_id`, `destination_id`, `locale_id`) when provided.
- Current upload UI does not explicitly capture link scope per row (or global scope assignment) in a first-class way.
- Share sets already support scope arrays on `share_set_items` (`market_ids`, `channel_ids`, `locale_ids`).

### Products
- Product creation is global (`products` row); modal currently passes market/channel/locale in query but create API does not use these as content scope write targets.
- Scoped product content is partially modeled through `product_field_values` using `locale` + `channel` string columns.
- `product_field_values` currently has no `market_id` or `destination_id` dimension.

### Destinations
- `channel_destinations` exists.
- Destination selection exists in market context.
- No full publish pipeline yet (mapping, validation, export job lifecycle).

## Design Principles
1. Separate **working context** from **content scope**.
2. Creation flows must show a clear "applies to" scope panel.
3. Global records (asset/product) remain canonical; scoped overlays hold market/channel/locale/destination differences.
4. Keep one scope grammar across assets and products.
5. Do not block future destination connectors by hardcoding per-channel logic into core entities.

## UX Model

### 1) Working Context (top bar)
- Purpose: navigation/filtering/completeness view context.
- Never silently interpreted as write scope.
- On create/upload pages, show context as helper text only, or hide controls if not actionable.

### 2) Content Scope (explicit write scope)
Use a shared `ScopePicker` component in both flows:
- Scope mode:
  - `global`
  - `scoped`
- Scoped fields:
  - `marketIds[]`
  - `channelIds[]`
  - `localeIds[]`
  - `destinationIds[]`
- Optional presets:
  - "Use current context"
  - "Use set default"

### 3) Assets upload interaction
On `/assets/upload` add a dedicated "Apply scope" section:
- Default mode: `global`.
- Optional scoped mode:
  - Assign scope to product links created during upload.
  - Optionally assign scope tags at asset level for filtering and governance (see data model).
- Row-level override allowed (same pattern as folder override).

### 4) Product creation interaction
In add-product modal and quick-create:
- Keep core create minimal: model + name + sku/status.
- Add optional "Initial scope" block:
  - If scoped chosen, create initial scoped content entries (or placeholders) for selected market/channel/locale/destination.
- After create, route into product detail with selected scope active.

### 5) Product detail editing
- Show a scope chip bar: `Market x Channel x Locale x Destination`.
- Show field badges:
  - `global`
  - `scoped`
  - `inherited`
  - `missing in this scope`
- Add coverage matrix drawer: scopes vs required fields.

## Data Model Target

### Keep existing canonical entities
- `products`
- `dam_assets`

### Extend scoped content storage

#### Products
Current:
- `product_field_values(product_id, product_field_id, locale, channel, ...)`

Recommended evolution:
1. Add optional foreign keys:
- `market_id UUID NULL`
- `destination_id UUID NULL`
2. Normalize locale/channel to IDs over time (or maintain compatibility layer):
- `locale_id UUID NULL` (future)
- `channel_id UUID NULL` (future)
3. Update uniqueness to include scope dimensions.

#### Assets
Current scoped association is mostly through `product_asset_links`.
Recommended addition:
- `asset_scope_assignments` table for direct asset scope availability (optional but recommended), keyed by:
  - `asset_id`
  - `market_id` / `channel_id` / `locale_id` / `destination_id`
  - `is_active`
This avoids overloading product links when an asset is market-scoped but not tied to a specific product.

#### Share/visibility
- Continue using `share_set_items.market_ids/channel_ids/locale_ids` for partner visibility constraints.
- Add destination scope support later only if destination-specific sharing is required.

## API Contract Changes

### Assets upload
`POST /api/[tenant]/assets/upload`
- Add optional payload block in metadata:
```json
{
  "scope": {
    "mode": "global|scoped",
    "marketIds": [],
    "channelIds": [],
    "localeIds": [],
    "destinationIds": []
  }
}
```
- Apply to:
  - created `product_asset_links` (when links exist)
  - optional `asset_scope_assignments` rows (if table added)

### Product create
`POST /api/[tenant]/products`
- Add optional:
```json
{
  "initialScope": {
    "mode": "global|scoped",
    "marketIds": [],
    "channelIds": [],
    "localeIds": [],
    "destinationIds": []
  }
}
```
- If scoped, seed scoped editable context for required fields.

### Product field value writes
- Accept full scope tuple in write routes.
- Enforce allowed combinations (market->locale, channel->destination).

## Validation Rules
1. Destination must be valid for selected channel/market pair.
2. Locale must be active for selected market when market-locale rules are configured.
3. In scoped mode, at least one of market/channel/locale/destination must be selected.
4. Required-field completeness calculated per active scope profile.

## Translation (DeepL) Plan

### Product translation scope
- Translate only localizable text fields.
- Source: one locale (e.g., `en_US`).
- Targets: selected locales in selected market/channel scope.

### Flow
1. User selects fields + source locale + target locales.
2. Create async translation jobs.
3. Execute server-side via DeepL API (never browser direct).
4. Store outputs as draft scoped field values.
5. Human review/approve before publish.

### DeepL implementation notes
- Use `/v2/translate`.
- Use glossary support for brand terms.
- Use `context` parameter for higher quality on short text.
- Keep auth key server-side only.

## Destination Integration Readiness
Treat destination as a publish target profile, not just a filter:
- Connector metadata and credential state
- Field mapping templates
- Validation rules per destination
- Publish jobs + logs + retry

Future table candidates:
- `destination_profiles`
- `destination_mappings`
- `destination_publish_jobs`
- `destination_publish_job_items`

## Front-End Build Plan

### Phase A: Scope UX foundation (now)
- Add shared `ScopePicker` component.
- Add "Apply scope" section to `/assets/upload`.
- Add optional "Initial scope" to add-product modal.
- Add explicit helper text: "working context vs content scope".

### Phase B: Persistence + APIs
- Persist scope in upload + product create flows.
- Add/extend scoped tables and write paths.
- Add validation for allowed scope combinations.

### Phase C: Coverage and governance
- Scope coverage matrix in product detail.
- Missing-content badges and filtered queues.
- Scope-aware publish readiness indicators.

### Phase D: Translation
- DeepL server integration + job queue.
- Glossary management.
- Review workflow and approval state.

### Phase E: Destination publishing
- Connector mapping UI.
- Publish pipeline + monitoring + retries.

## Immediate Recommendation
Implement Phase A + B first and keep destination publishing in a separate project track. This gives users immediate scoped authoring control now, while preserving clean architecture for Shopify/Walmart connectors later.

## External product references (for pattern alignment)
- Akeneo channels/locales concepts and management:
  - https://help.akeneo.com/en_US/v7-build-your-catalog/v7-manage-your-channels
  - https://api.akeneo.com/concepts/target-market-settings.html
  - https://help.akeneo.com/serenity-your-first-steps-with-akeneo/serenity-what-is-a-locale
- Plytix channels/feed-based syndication:
  - https://help.plytix.com/en/creating-a-channel
  - https://help.plytix.com/en/google-shopping-template
  - https://www.plytix.com/blog/what-is-product-content-syndication
- Pimberly market/channel scoping + connectors:
  - https://pimberly.com/video/new-channels/
  - https://pimberly.com/blog/how-pim-simplifies-localization/
  - https://pimberly.com/shopify-connector/
- DeepL API docs:
  - https://developers.deepl.com/api-reference
  - https://support.deepl.com/hc/en-us/articles/9773914250012-About-DeepL-API
