# Share Sets Phased Implementation Plan

## Objective
Move from mixed sharing behavior (role/market scope + `asset_scope` fallbacks) to a single, scalable model:
- Brand creates reusable Share Sets.
- Invite/relationship assignment grants set access to partner users.
- Partner sees only content included in granted sets.

This supports selective sharing (for example: wholesaler-only products/assets) and future modules.

## Build Status (February 19, 2026)
Progress checklist:
- [x] Phase 0 hardening is in place for legacy DAM write endpoints (tenant/scoped auth + cross-tenant write blocking).
- [x] Share Set database foundation migration added:
  - `share_sets`
  - `share_set_items`
  - `partner_share_set_grants`
- [x] Share Set control plane APIs started:
  - `GET /api/[tenant]/sharing/sets` now reads `share_sets` first with legacy fallback.
  - `POST /api/[tenant]/sharing/sets` now creates set headers.
  - `GET|POST|DELETE /api/[tenant]/sharing/sets/[setId]/items` now manages membership with module-safe validation.
- [x] Settings UI started:
  - `Settings > Sets` can now create asset/product sets.
  - Product set summaries are now surfaced when v2 tables are available.
  - Set summary metrics expanded:
    - accurate module totals from `share_sets` (not page-limited row count),
    - active grant and shared partner totals for current results,
    - per-set scoped item counts plus market/channel/locale footprint.
- [x] `/assets` sharing UX started:
  - Users can now select one/multiple files and folders.
  - Selected files/folders can be added to an Asset Set from `/assets`.
  - Inline set creation is available directly in the `/assets` share modal.
- [x] `/products` sharing UX started:
  - Users can select one/multiple products and variants in table view.
  - Selected products/variants can be added to a Product Set from `/products`.
  - Inline set creation is available directly in the `/products` share modal.
- [x] Partner assignment foundation started:
  - New API: `GET|POST|DELETE /api/[tenant]/sharing/sets/[setId]/grants`.
  - Validates active brand-partner relationships before grants are created.
  - `Settings > Sets` now includes partner assignment and revoke controls.
- [x] Scope-aware authoring started:
  - `/assets` and `/products` set dialogs now support optional `market/channel/locale` constraints.
  - "Use Current View" action can stamp active market context into selected set items.
  - `POST /api/[tenant]/sharing/sets/[setId]/items` now validates scoped IDs against tenant-owned markets/channels/locales.
- [~] Phase 5 runtime enforcement started:
  - Partner asset/product reads are being moved to set-grant filtering first, with legacy scoped-permission fallback only when set foundation tables are unavailable.
- [~] Phase 4 invite + assignment integration started:
  - Invite API now accepts partner `share_set_ids` and validates them against tenant-owned sets.
  - Invitation snapshot persistence added via `invitation_share_set_assignments` (new migration).
  - Partner invite acceptance and onboarding-finalization now auto-apply snapshot sets into `partner_share_set_grants`.
  - Remaining: invite-time default market / allowed market+channel snapshot and acceptance-time auto-apply.

Next in build sequence:
1. Complete runtime set-based filtering across all partner read endpoints.
2. Add invite-time default market and allowed market/channel snapshot + acceptance-time apply.
3. Add market/channel/locale aware filtering behavior to partner runtime reads after membership filtering.

## Naming
- UI term: `Sets`
- Existing DAM term in UI/API: `Shared Asset Sets`
- Phase strategy:
1. Keep current DAM labels for compatibility.
2. Introduce unified `Sets` surface in Settings.
3. Migrate DAM labels to `Asset Sets` once product sets ship.

## Key Product Decisions
1. Add `Settings > Share Sets` as the control plane (summary, governance, assignment).
2. Keep authoring in domain screens:
   - `/assets`: create/assign to Asset Sets via multi-select.
   - `/products`: create/assign to Product Sets via multi-select.
3. Keep `Share Sets` list summary-only at scale:
   - show counts and assignment status by default,
   - do not render every item in a set in the table view.
4. Keep market context as a first-class filter:
   - Share Set decides `what` can be seen.
   - Market scope decides `which localized variant/view` is shown.

## Market Relevance Model
Use a hybrid model, not an either/or choice:
1. Partner visibility gate:
   - A partner can only see assets/products that are in assigned Share Sets.
2. Market relevance gate:
   - Inside those visible items, response data is filtered to active market/channel/locale context.
3. Default market behavior:
   - Each partner tenancy has a default market.
   - If partner switches brand and same market exists, keep it.
   - If not, fall back to that brand's default market.
4. Set design guidance:
   - Create sets around business relationships and assortments (for example `Mexico Distributor Core`, `US Retail Exclusive`).
   - Do not rely on set names alone for localization; market filters still apply at read time.
5. Result for mixed catalogs:
   - Same SKU sold globally can be in one set, while market-scoped fields show Mexico-specific data to Mexico context.
   - Region-exclusive SKUs are controlled by set membership plus market filters.

## Data Model Direction
Use module-agnostic set primitives:
- `share_sets` (header): organization, module, name, metadata.
- `share_set_items` (membership): resource references.
- `partner_share_set_grants` (assignment): which partner relationship/member gets which set and level.

Short-term compatibility:
- Map existing `dam_collections` into Asset Set behavior.
- Keep existing `member_scope_permissions` reads until new grants fully replace them.

## Phases

### Phase 0: Security Hardening (mandatory first)
Scope:
- Replace/lock legacy DAM mutation endpoints that bypass tenant/scoped checks:
  - `POST /api/[tenant]/assets/upload`
  - `PATCH /api/[tenant]/assets/bulk-update`
  - `PATCH|DELETE /api/[tenant]/assets/[assetId]`

Acceptance:
- Every DAM write requires tenant access + scoped permission.
- Cross-tenant/shared-brand write attempts always return `403`.

### Phase 1: Share Sets Control Plane (foundation)
Scope:
- Introduce `Settings > Share Sets` page.
- Add summary API for scalable list rendering (counts only, no full item payloads).
- Show:
  - set name
  - asset/folder/product counts
  - assignment counts
  - updated at

Acceptance:
- Brand admins can review set inventory quickly even with large sets.
- Page load remains stable as set size grows.

### Phase 2: Product Set Authoring
Scope:
- Add Product Set data structures and APIs.
- Enable multi-select in `/products` to add/remove products (single/parent/variant) from Product Sets.
- Add "include descendants" semantics for parent products.
- Store optional market/channel constraints per set item (or set grant) for precise relevance.

Acceptance:
- Brand can create wholesaler-specific product sets.
- Partner product visibility can be driven by sets (not just market/channel broad scope).
- Mexico-context partner sees Mexico-relevant product data by default.

### Phase 3: Asset Set Authoring Improvements
Scope:
- In `/assets`, add bulk actions:
  - add selected assets to set
  - add selected folders to set
  - remove from set
- Keep per-set item browsing out of list view; provide detail drawer/page on demand only.

Acceptance:
- Large-tenant DAM workflow remains fast.
- Set membership can be managed directly from daily DAM work.

### Phase 4: Invite + Assignment Integration
Scope:
- In Invite flow, add "Assign Share Sets" step.
- Persist selected set IDs in invitation snapshot.
- On acceptance, apply relationship + set grants atomically.
- Add optional invite defaults:
  - default market
  - allowed markets/channels for this partner relationship

Acceptance:
- New partner invite can be provisioned with exact assets/products from day one.
- Partner lands in relevant market context without manual setup.

### Phase 5: Runtime Enforcement
Scope:
- Assets and products read APIs enforce granted set membership as canonical filter.
- Remove/disable legacy fallback based on `asset_scope='shared'` for partner visibility.
- Keep optional org-wide grant path explicit (not implicit).
- Apply market/channel/locale filtering after set membership filtering in every read endpoint.

Acceptance:
- Partner sees only content from assigned sets.
- Exclusive products/assets are reliably isolated per partner.
- Partner sees the most relevant localized data for their active/default market.

### Phase 6: Market-Aware UX + Fallbacks
Scope:
- Persist market/channel/locale selection across brand views when valid.
- If selected market is unavailable in target brand, auto-fallback to brand default market.
- Add visible indicator of active market context in shared-brand views.

Acceptance:
- Partner context switching is predictable and low-friction.
- No empty/incorrect localized views during brand switching.

### Phase 7: Migration, Performance, and Audit
Scope:
- Backfill existing DAM collections into Share Sets.
- Add indexes/materialized counters as needed.
- Add audit events for:
  - set creation/update/delete
  - item membership changes
  - invite assignment
  - grant changes

Acceptance:
- No regression in partner visibility after migration.
- Operational audit trail for every share decision.

## Immediate Build Sequence
1. Finish Phase 0 hardening patch.
2. Keep current Phase 1 scaffolding and expand Set summary metrics.
3. Design/ship Product Sets schema + APIs with market-aware constraints (Phase 2).
4. Wire invite assignment with default/allowed market context (Phase 4).
5. Enforce runtime order: set membership first, market relevance second (Phase 5).
6. Deliver market persistence/fallback UX behavior (Phase 6).
