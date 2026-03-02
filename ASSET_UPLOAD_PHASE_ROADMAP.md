# Asset Upload Phased Roadmap

## Goal
Make upload fast at scale while enforcing minimum metadata quality and downstream set/rule consistency.

## Phase 0 (Implemented)
- Parse and persist upload metadata in `POST /api/[tenant]/assets/upload`:
  - title/name, description, tags, keywords, categories, usage group, folder, product selection, inheritance flag.
- Persist product links from upload metadata to `product_asset_links`.
- Persist bulk edits for already-uploaded rows via autosave PATCH.
- Support multiple uploads at once with concurrency-limited workers (currently 4 in parallel).
- Harden autosave behavior:
  - uses latest client state for saves,
  - skips invalid empty filename PATCH payloads,
  - returns better error detail for diagnostics.

## Phase 1 (Implemented)
- Upload profiles (`Fast`, `Standard`, `Compliance`) with required-field gating.
- Validation badges per row (`Missing title`, `Missing tags`, `Missing product`, etc.).
- Ready/blocked queue counters and upload-ready CTA.
- Server-side upload validation enforces profile requirements (cannot be bypassed client-side).

## Phase 2 (Implemented, CSV deferred)
- Bulk edit drawer with explicit operation modes:
  - replace values,
  - append values,
  - clear values.
- One-step undo for the last bulk operation.
- CSV metadata import/export per upload session is intentionally deferred.

## Phase 3 (Implemented)
- Product-link intelligence:
  - parent-child expansion confidence scoring,
  - deterministic dedupe rules,
  - explainable suggestion reasons.
- Future-variant inheritance:
  - when a new variant is created under a linked parent, upload-context links now auto-propagate if `appliesToChildren` is enabled on the asset metadata.
- Suggestion metadata persistence:
  - suggestion confidence and match reason are now persisted to asset metadata and `product_asset_links` for upload-context linking.

## Phase 4
- Upload-time automation:
  - trigger rules from tags/folders/type,
  - suggest folder/set/product actions before finalize.
  - lightweight rule engine started for usage-group suggestions from metadata/file context, with one-click apply on selected assets.

## Phase 5 (Set Rules Integration)
- Rule-driven set membership from upload metadata:
  - `tag -> set` and `folder -> set` mappings.
- Folder-tag inheritance for resolution:
  - inherited tags affect rule evaluation for descendants,
  - no physical mutation of child tags required.
- Explicit include/exclude overrides stay higher priority than dynamic rules.
- Implemented foundation:
  - new `share_set_dynamic_rules` table (include/exclude criteria),
  - upload API now evaluates active rules and auto-inserts matching assets into `share_set_items`,
  - upload response returns matched set summary for UI feedback.
  - `Settings > Sets` rule management API + UI started (`set -> rules`), including asset criteria and product model-type criteria.
  - product dynamic rule runtime added via DB trigger/backfill for product create/update based on model type.
