# Phase 5 Set Rules Spec (Asset Sets)

## Objective
Define rule-driven Asset Set membership so users can share by intent, not only by manual item selection.

This phase extends existing explicit set membership (`share_set_items`) with dynamic rules such as:
- asset has tag X
- asset in folder Y (including descendants)
- asset in folder tagged Z

## Product Decisions
1. Dynamic rules are additive to explicit membership.
2. Explicit include/exclude always wins over dynamic evaluation.
3. Folder tag inheritance should flow down for set membership resolution, not by writing tags onto child folders/assets.
4. Folder tag inheritance defaults to recursive (subfolders + files), with per-rule override.
5. Runtime visibility remains: `set membership` first, then `market/channel/locale` filters.

## Answer To Key Question
If a folder is tagged, should that flow down to all subfolders and files?

Yes for set membership behavior.

No for physical tag mutation.
- We should not copy/persist the folder tag to every descendant folder or asset.
- We should compute inherited membership from folder ancestry at read/materialization time.
- This avoids destructive cascading updates and keeps undo/remove behavior safe.

## Rule Model
Rules apply to `module_key = 'assets'` sets.

Supported rule types:
1. `asset_has_any_tags`
- Include assets when asset tags intersect the configured tag IDs.
2. `asset_has_all_tags`
- Include assets when asset contains every configured tag ID.
3. `asset_in_folders`
- Include assets in selected folders.
- `include_descendants` controls recursion.
4. `asset_in_folders_with_tags`
- Include assets in folders that have configured folder tags.
- `include_descendants` defaults `true`.
5. `asset_created_within_days` (optional for phase 5.2)
- Include recent uploads for rolling sets.

## Data Model Additions
Add `share_set_rules`:
- `id`
- `share_set_id`
- `organization_id`
- `module_key` (`assets` only in phase 5)
- `rule_type`
- `config` JSONB (tag IDs, folder IDs, days window, includeDescendants)
- `is_active`
- `priority` (smallint, default 100)
- `created_by`, `created_at`, `updated_at`

Add `share_set_rule_overrides`:
- explicit allow/deny resource overrides
- columns: `share_set_id`, `resource_type='asset'`, `resource_id`, `effect ('include'|'exclude')`

Folder tags:
- Reuse `asset_tags` taxonomy.
- Add `folder_tag_assignments`:
  - `id`, `organization_id`, `folder_id`, `tag_id`, `assigned_by`, `assigned_at`
  - unique `(folder_id, tag_id)`

## Membership Resolution Order
Given a set S:
1. Start with explicit includes from `share_set_items` (`resource_type='asset'` + folder expansion rules).
2. Evaluate active `share_set_rules` and add matching asset IDs.
3. Apply overrides:
- remove explicit excludes
- add explicit includes
4. Apply existing scoped constraints (`market/channel/locale`) where relevant.

## Runtime vs Materialized Strategy
Phase 5.1 (ship fast):
- Resolve dynamic rules at read time with bounded queries and caching.

Phase 5.2 (scale hardening):
- Add materialized table `share_set_resolved_assets`:
  - `share_set_id`, `asset_id`, `source` (`explicit|rule|override`)
- Recompute incrementally on:
  - asset tag changes
  - folder move/change
  - folder tag changes
  - rule create/update/delete

## API Changes
New endpoints:
1. `GET /api/[tenant]/sharing/sets/[setId]/rules`
2. `POST /api/[tenant]/sharing/sets/[setId]/rules`
3. `PATCH /api/[tenant]/sharing/sets/[setId]/rules/[ruleId]`
4. `DELETE /api/[tenant]/sharing/sets/[setId]/rules/[ruleId]`

Folder tag endpoints:
1. `GET /api/organizations/[slug]/assets/folders/[folderId]/tags`
2. `PUT /api/organizations/[slug]/assets/folders/[folderId]/tags`

No breaking changes to current `share_set_items` APIs.

## UI Changes
In `Settings > Sets > Asset Set`:
1. Add "Rules" tab.
2. Rule builder rows with:
- type selector
- tag/folder selector
- include descendants toggle
- active toggle
3. Preview panel:
- "Estimated matched assets"
- sample results list (first N)
4. Overrides panel:
- explicit include asset
- explicit exclude asset

In Folder UI:
1. Folder tags control (uses same tag dictionary as assets).
2. Tooltip:
- "Folder tags are inherited by descendants for rule matching. Descendant records are not mutated."

## Guardrails
1. Prevent circular recursion by always relying on `dam_folders.path`.
2. Enforce org ownership on every rule/folder/tag reference.
3. Cap max active rules per set (for example 50) in phase 5.1.
4. Add audit events:
- rule created/updated/deleted
- folder tags changed
- override changed

## Acceptance Criteria
1. Tag rule:
- Adding tag `seasonal` to an asset makes it visible in sets with `asset_has_any_tags=seasonal`.
2. Folder tag inheritance:
- Tagging folder `Campaign A` with `q2-launch` includes assets in all descendants when rule uses `asset_in_folders_with_tags(q2-launch, include_descendants=true)`.
3. Non-mutation:
- Descendant folder/assets do not receive persisted copied tags automatically.
4. Override precedence:
- Explicit exclude removes an otherwise matched dynamic asset.
5. Runtime enforcement:
- Partner APIs only return assets in resolved set membership.

## Rollout Plan
1. Migration: add rule + folder tag tables.
2. API: rule CRUD + folder tag assignment.
3. Resolver: extend `resolvePartnerGrantedAssetIds` to include dynamic rule matches.
4. UI: Rules tab in Sets and folder tag picker.
5. Scale: add materialized resolver if read-time cost exceeds SLO.
