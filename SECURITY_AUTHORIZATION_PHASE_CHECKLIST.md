# Security, Invites, Sharing, Permissions, Markets: Phased Checklist

Status date: 2026-02-18 (updated)
Owner: Platform
Scope: DAM + PIM + Team/Org security model for enterprise scale

## Phase 6: Multi-Tenant Workspace UX (Planned)
- [x] Add Slack/Discord-style persistent left workspace rail for quick tenant switching. (`WorkspaceRail` is integrated across app + settings sidebars, includes direct `All Brands` and `Notifications` entries)
- [x] (Priority 1) Build "All Brands" default view for multi-tenant users with cross-tenant feed/filter model. (`/all-brands` page added; root smart router now defaults multi-tenant users here)
- [x] Add per-tenant notification badges for new DAM assets and PIM products in workspace rail. (workspace unread counts now derive from persisted per-user read state, and include asset/product/share events)
- [x] (Priority 2) Build notification center (latest events: asset added, product added, share granted) with read/unread persistence. (`/notifications` plus `/api/me/notifications` and DB-backed `user_workspace_notification_state`)
- [x] Ensure strict tenant isolation in aggregated feeds (no cross-tenant data leaks without membership). (all aggregated notification/workspace queries are filtered by active `organization_members` for the current user)

Acceptance criteria:
- Multi-tenant users can switch between brands in one click from persistent left rail.
- Notification badges are scoped per tenant and backed by server-side authorization.
- "All Brands" view never bypasses tenant membership and scope controls.

## Phase 7: Brand vs Partner Experience Split (In Progress)
- [x] Persist partner business subtype during onboarding (`retailer`, `distributor`, `wholesaler`) via `organizations.partner_category`.
- [x] Hide workspace rail for Brand workspaces; show rail for Partner workspaces to support multi-brand switching.
- [x] Restrict partner team management UI (read-only messaging; no invite controls).
- [x] Restrict invitation APIs to Brand workspaces only.
- [x] Expand accessible workspace resolution to include Brand access via active `brand_partner_relationships`.
- [ ] Build dedicated Partner dashboard shell optimized for read/download workflows.
- [ ] Add Partner-first filter model defaults (`All Brands` then brand-specific focus).

Acceptance criteria:
- Brand users stay in a single-workspace authoring UX.
- Partner users can switch across invited brands from one partner workspace.
- Partners cannot invite users or mutate Brand-side team permissions.

## Phase 8: Invites & Permissions V2 (In Progress)
- [x] Separate invite entrypoints in API:
- [x] `POST /api/[tenant]/invites/team` (`Invite Internal Team Member`, brand admins only)
- [x] `POST /api/[tenant]/invites/partner` (`Invite Partner Access`, brand admins only)
- [x] Add permission-bundle read API for invite templates (`GET /api/[tenant]/permission-bundles`).
- [ ] Separate invite entrypoints in UI (dedicated views/wizards instead of one modal).
- [x] Replace "single-module picker" with invite-time module permission matrix support:
- [x] Rows: modules/features (Products, Assets, Share Links, future modules)
- [x] Columns: `None`, `View`, `Edit`, `Admin` (where applicable)
- [x] Support market multi-select as global scope across DAM + PIM at invite time.
- [ ] Support optional Shared Asset Set constraints for DAM visibility at invite time.
- [ ] Add invite-time auto-apply permission setup (current gap):
- [x] Persist invite permission payload (module levels + scopes) with invitation. (`20260303_add_invite_permission_bundles_foundation.sql`)
- [x] Apply payload atomically on acceptance (idempotent/replay-safe).
- [x] Keep role as baseline only; effective access is applied from explicit module + scope grants snapshot.
- [ ] Add per-brand activity visibility:
- [ ] log partner/member access events and top-level actions for brand admins.
- [ ] show "who accessed what and when" in security/activity UI.
- [ ] Add abuse controls for V2 invite flows:
- [ ] rate limit create/revoke/accept
- [ ] anomaly detection for rapid permission churn and token probing

Acceptance criteria:
- Brand can invite internal users and partners through distinct, unambiguous flows.
- One invite can grant multi-module access with multi-market scope in a single action.
- Partners remain non-transitive (no downstream invites).
- Backend remains authoritative and fail-closed for unauthorized module/scope access.

## Phase 0: Authorization Foundation (In Progress)
- [x] Create canonical permission registry table.
- [x] Create role-to-permission template mapping table.
- [x] Create member scoped grants table (`organization` / `market` / `channel` / `collection`).
- [x] Add DB function to evaluate effective permission (`authz_has_permission`).
- [x] Add indexes for high-volume permission checks.
- [x] Add RLS policies on new authorization tables.
- [x] Seed DAM/PIM/team permission keys.
- [x] Seed default role templates (owner/admin/editor/viewer/partner).
- [x] Define API convention: every route performs explicit authz check before data access. (tenant API routes now use `requireTenantAccess` + scoped permission checks)
- [x] Add security tests for cross-tenant denial cases. (tenant access decision tests now cover Kinde org mismatch, missing membership fallback denial, and fail-closed denial for unmapped tenant Kinde org IDs)

Acceptance criteria:
- One server-side function can answer "can user X do action Y in scope Z?"
- Permission checks support market-aware scope and DAM/PIM resource scopes.
- New tables are fully RLS-protected.

## Phase 1: Invite Lifecycle + Membership Safety (Planned)
- [x] Normalize invitation statuses and transitions (`pending`, `accepted`, `expired`, `revoked`, `declined`). (terminal-state consistency constraint + `invitation_status_view`)
- [x] Enforce invitation acceptance idempotency. (atomic row lock + replay-safe idempotent success path in `accept_invitation`)
- [x] Add invite revocation endpoint audit trail.
- [x] Add invitation attempt throttling by IP + token + email.
- [x] Add invitation acceptance audit events (who, when, org, role, scope).
- [x] Add strict email normalization and case-insensitive uniqueness guard.
- [x] Add anti-enumeration error responses for invite-token checks.
- [x] Add replay protection for stale/used tokens. (revoked invitations + pending-only token checks + conditional finalize updates)

Acceptance criteria:
- Token guessing and replay attempts are throttled and logged.
- Invite acceptance cannot create duplicate active memberships.

## Phase 2: Market-Scoped Access (Planned)
- [x] Add membership-to-market scope grants. (sharing scopes now support `scope_type = market` with validation, market container loading, and Team UI grant/revoke flows)
- [ ] Enforce market locale constraints in PIM reads/writes. (in progress; product field create/update now validates channel/market IDs by tenant and validates locale IDs against active `market_locales`, including locale-to-selected-market consistency; product update now rejects panel instance locale/channel values that do not match request scope)
- [ ] Enforce market scope in DAM + PIM API filters. (in progress; expanded to markets/channels/locales, family/field assignment APIs, and tenant reference settings routes (`markets`, `channels`, `locales`, `countries`, `country-locales`, `channel-locales`, `market-locales`) with market-scope enforcement; product-links read/write (including asset-derivative visibility checks) now use market-scope enforcement for consistent scope validation/denial; variant-types routes now use market-scope enforcement; `field-groups/*` routes now use market/locale/channel-aware enforcement; `product-fields/*` routes now use market/locale/channel-aware enforcement; all `product-families/*` read/write endpoints now use market/locale/channel-aware enforcement; and `measurement-families` is now market-aware)
- [ ] Ensure non-authorized market content is never returned in list endpoints. (in progress; cache keys include user+scope and scoped checks added on high-risk endpoints, with tenant routes now uniformly gated; product family list/detail/attributes/field-groups/variant-attributes routes now fail closed on unauthorized market scope)
- [ ] Add tests for mixed-market users and external users. (in progress; unit negative tests added for market scope denial paths)

Acceptance criteria:
- Any DAM/PIM query requires authorized `organization_id` and `market_id`.
- Users only see locales attached to authorized markets.

## Phase 3: Container-Level Sharing (Planned)
- [x] DAM sharing scope: collection-level grants.
- [x] PIM sharing scope: channel-level grants.
- [x] Add container grant UI and backend endpoints. (backend endpoints added: `/api/[tenant]/sharing/containers`, `/api/[tenant]/sharing/scopes`, and collection management APIs; Team UI supports grant/revoke plus collection folder/file definition workflows)
- [ ] Enforce external-user visibility only via explicitly shared containers. (in progress; DAM scoped enforcement now covers tenant + legacy org-slug asset/folder/tag/category routes, PIM channel-scoped visibility is applied to `products`, `products/basic`, `products/[productId]`, variants, completeness, product families, and variant matrix/bulk parent resolution guards, and `product-links` now enforces both channel-scoped product visibility and collection-scoped asset visibility)
- [x] Add policy tests for "no implicit global module access." (scope helper tests now assert explicit channel/collection propagation and deny-by-default behavior when scoped org-level checks fail)

Acceptance criteria:
- External partner can only access explicitly shared containers.
- Internal users can be limited to selected containers when required.

## Phase 4: Module Granularity (Planned)
- [x] Refactor Team permissions UI to multi-module matrix (assign Products + Assets in one save instead of single-module mode).
- [x] Split Team IA into dedicated pages (`Members`, `Permissions`, `Shared Asset Sets`) to keep permission controls scalable with large member counts.
- [x] Treat Market as global scope in permissions UI for both DAM and PIM actions (not PIM-only semantics).
- [x] Add market multi-select in permissions UI for bulk scope assignment across multiple markets in one save.
- [ ] Enforce DAM permissions:
- [x] `asset.upload`
- [x] `asset.metadata.edit`
- [x] `asset.download.original`
- [x] `asset.download.derivative`
- [x] `asset.version.manage`
- [ ] Enforce PIM permissions:
- [x] `product.attribute.edit`
- [x] `product.media.map`
- [x] `product.market.scope.read`
- [x] `product.market.scope.edit`
- [x] `product.publish.state`
- [ ] Add API-level checks for every critical write. (in progress; product create/update/delete, variant update/delete, variant matrix/bulk creation, convert-to-parent, org product status publish, and variant-types write routes enforce scoped permission checks without legacy org-access fallback; `product-families/*` write routes (families, attributes, variant-attributes, field-groups, batch operations) now use market-aware scoped checks; Team + Sharing write routes now use centralized security permission gates with one authorization path)

Acceptance criteria:
- Module actions are permission-gated independently from role names.
- "Original download" and "publish state change" are explicitly restricted.

## Phase 5: Enterprise Hardening (Planned)
- [ ] Add rate limits for sensitive routes (team invites, invite acceptance, download links, auth-adjacent routes). (in progress; team invites, invitation accept/preview, partner relationship finalization, asset share management, tenant/org original download, and public token download endpoints now rate-limited with security logging)
- [x] Add structured security audit logs.
- [ ] Add alerting for anomalous behavior (token failures, bulk downloads, rapid permission changes). (in progress; rate-limit exceed events now logged, download/share/public token endpoints are rate-limited, and `/api/[tenant]/security/anomalies` now detects rate-limit spikes, token-abuse pressure, and permission-change spikes)
- [x] Add incident-ready access-debug endpoint for admins/support. (`GET /api/[tenant]/security/access-debug` with admin/audit guard and scoped permission decision breakdown)
- [x] Add performance budgets for authorization queries (p95 targets). (`authz_has_permission` duration sampling + slow-query logging added; anomaly analysis computes authz p95 and flags `authz_latency_degraded` over threshold; index-optimization migration added for membership/template/scoped-grant lookup paths)
- [ ] Add load tests for high-member organizations. (in progress; `npm run perf:authz` harness added and baseline captured; awaiting post-index migration rerun + high-member dataset validation)

Acceptance criteria:
- Brute-force attempts are throttled.
- Security events are traceable and queryable.
- Permission checks remain performant under enterprise load.

## Non-Negotiable Guardrails
- [ ] Every query includes `organization_id` guard. (in progress; product family variant-attribute routes now enforce explicit family ownership checks before RPC/read/write mutations, and product-links DAM asset updates/link lookups now include explicit `organization_id` guards)
- [ ] Every DAM/PIM query includes `market_id` guard where applicable.
- [ ] External users must pass container scope check.
- [ ] Server-side authz is authoritative; UI is only advisory. (in progress; tenant API routes no longer use `hasOrganizationAccess`; authorization is enforced via `requireTenantAccess` + market-aware scoped permission checks, with Team/Sharing/Security gate checks centralized in `security-permissions`; tenant API route-level direct scoped permission calls are removed in favor of centralized gates)
- [ ] No endpoint leaks existence of unauthorized tenant data.
