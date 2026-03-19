# Partner Updates V1 Spec

Status: Draft for review  
Last updated: 2026-03-04  
Owner: Product + Engineering

## 1) Problem and Goal

Partners do not have a strong reason to return to the platform, and brands cannot reliably prove who acted on important product updates.

V1 goal:
- Let brands publish any update as a structured package (`Update` + `Kit Contents`).
- Also allow message-only announcements (no kit items).
- Notify the right partners immediately.
- Track partner response (`opened`, `acknowledged`, `activated`) with auditable timestamps.

## 2) Naming and IA (Locked)

- Brand module: `Partner Updates`
- Partner queue: `Notifications`
- Core object: `Update`
- Package section on detail page: `Kit Contents`
- Brand routes:
  - list: `/{tenant}/updates`
  - detail: `/{tenant}/updates/{updateId}`
- Partner routes:
  - queue: `/{tenant}/notifications`
  - all shared updates list: `/{tenant}/view/{scope}/updates`
  - detail: `/{tenant}/view/{scope}/updates/{updateId}`
- Notification placement:
  - full inbox: `/notifications`
  - summary widgets: partner home surface `/{tenant}/view/all` (and brand dashboard optional in V1.1)
- No standalone `/{tenant}/kits` module in V1.
  - Kits are a presentation layer inside Update detail, not a top-level resource.

Do not use `Campaign` as the default V1 term.  
Reason: V1 must support compliance, formula, discontinued, pricing, and generic operational updates, not only marketing.

## 3) Product Principles (Locked)

1. Event-type agnostic:
   - No hardcoded enum such as `formula_update` or `discontinued`.
   - Brand enters freeform update title/message and optional labels.
2. PIM is source of truth:
   - Update links to product record(s); details are read from existing PIM views/history.
3. Kit-driven action:
   - Update bundles supporting assets/docs/links so partners can act fast.
   - Kit items are references to existing records, never duplicated files.
4. Measurable response:
   - Track activity and timing per partner recipient.
5. Security first:
   - Respect active relationship, share-set access, and market/channel/locale scope rules.

## 4) V1 Scope

In scope:
- Brand creates draft update with freeform message and urgency.
- Brand can choose either:
  - `message-only announcement`, or
  - `update with kit contents`.
- Brand attaches kit contents:
  - linked products (PIM records),
  - linked assets/documents from DAM,
  - optional external URLs,
  - optional text blocks for copy instructions.
  - no asset uploads/copies inside kit creation.
- Brand can publish announcement-only updates with zero kit items.
- Brand selects recipients by:
  - partner organizations,
  - saved partner segments/lists (optional),
  - share sets,
  - market scope filters.
- Brand publishes update:
  - creates in-app notifications,
  - sends transactional email notification via Resend.
- Partner onboarding captures messaging consent with two explicit checkboxes:
  - email updates from Stackcess and invited brands,
  - SMS updates from Stackcess and invited brands.
- Partner can manage messaging preferences after onboarding:
  - global opt-out from all Stackcess + brand update messages by channel,
  - per-brand opt-out/opt-in overrides by channel.
- Partner notification flow:
  - list notifications,
  - open update,
  - review message and optional kit,
  - for actionable updates: acknowledge and optionally activate,
  - for announcement-only updates: informational read/open only (no required acknowledge).
- Brand reporting:
  - recipient counts,
  - open rate for all updates,
  - acknowledge/activate rates for actionable updates,
  - time-to-acknowledge / time-to-activate for actionable updates,
  - overdue recipients.

Out of scope:
- Hardcoded event taxonomy enforcement.
- Full attribution (UTM redirect, GA4, JS snippet revenue loop).
- Partner outbound sending infrastructure (Mailchimp/Klaviyo ownership stays partner-side).
- MDF payout automation.
- Gamification/points/leaderboards.
- Asset cloning, file duplication, or separate kit-specific asset storage.

## 5) Primary User Flows

### 5.1 Brand Flow
1. Create `Update` (title, summary, urgency, optional labels, due date).
2. Optionally attach `Kit Contents`:
   - products (PIM IDs),
   - assets/docs (DAM IDs),
   - optional URL/text blocks.
3. For announcements, brand may skip kit step entirely.
4. Select recipients and scope.
5. Preview partner view.
6. Publish now or schedule.
7. Monitor response dashboard and send reminders.

### 5.2 Partner Flow
1. Receive notification (in-app + optional email).
2. Open update detail.
3. Review message and optional kit contents.
4. Access linked PIM record/version history and docs/assets.
5. If actionable: acknowledge update.
6. If actionable: mark activated when applied in channel operations.
7. If announcement-only: no acknowledge required; read/open event is sufficient.

## 6) Data Model (V1)

### 6.1 `partner_updates`
Purpose: brand-authored update header.

Fields:
- `id UUID PK`
- `organization_id UUID NOT NULL` (brand org)
- `title TEXT NOT NULL`
- `summary TEXT NULL`
- `urgency TEXT NOT NULL DEFAULT 'normal'` (`low|normal|high|critical`)
- `status TEXT NOT NULL DEFAULT 'draft'` (`draft|scheduled|published|archived|canceled`)
- `event_label TEXT NULL` (freeform, not validated enum)
- `labels TEXT[] NOT NULL DEFAULT '{}'`
- `message_json JSONB NOT NULL DEFAULT '{}'::jsonb`
- `due_at TIMESTAMPTZ NULL`
- `published_at TIMESTAMPTZ NULL`
- `scheduled_for TIMESTAMPTZ NULL`
- `created_by TEXT NOT NULL`
- `updated_by TEXT NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:
- `(organization_id, status, published_at DESC)`
- `(organization_id, urgency, due_at)`
- GIN on `labels`

### 6.2 `partner_update_kit_items`
Purpose: contents attached to an update.

Fields:
- `id UUID PK`
- `organization_id UUID NOT NULL`
- `partner_update_id UUID NOT NULL FK -> partner_updates(id) ON DELETE CASCADE`
- `item_type TEXT NOT NULL` (`product|asset|url|text`)
- `product_id UUID NULL FK -> products(id)`
- `asset_id UUID NULL FK -> dam_assets(id)`
- `url TEXT NULL`
- `title TEXT NULL`
- `description TEXT NULL`
- `content_json JSONB NOT NULL DEFAULT '{}'::jsonb` (for text block payload)
- `sort_order INT NOT NULL DEFAULT 100`
- `market_ids UUID[] NOT NULL DEFAULT '{}'`
- `channel_ids UUID[] NOT NULL DEFAULT '{}'`
- `locale_ids UUID[] NOT NULL DEFAULT '{}'`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_by TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- exactly one reference by type:
  - `product` requires `product_id`
  - `asset` requires `asset_id`
  - `url` requires `url`
  - `text` requires non-empty `content_json`
- no binary/blob columns allowed on this table.
- no copied asset metadata snapshot required for V1; resolve from source record at read time.
- zero rows are valid for announcement-only updates.

Indexes:
- `(organization_id, partner_update_id, sort_order)`
- `(organization_id, product_id)` partial where `product_id is not null`
- `(organization_id, asset_id)` partial where `asset_id is not null`

### 6.3 `partner_update_recipients`
Purpose: snapshot recipients at publish/schedule time.

Fields:
- `id UUID PK`
- `organization_id UUID NOT NULL`
- `partner_update_id UUID NOT NULL FK -> partner_updates(id) ON DELETE CASCADE`
- `partner_organization_id UUID NOT NULL FK -> organizations(id)`
- `delivery_channels TEXT[] NOT NULL DEFAULT '{in_app,email}'`
- `status TEXT NOT NULL DEFAULT 'queued'`
  - `queued|notified|opened|acknowledged|activated|failed|muted`
- `first_notified_at TIMESTAMPTZ NULL`
- `opened_at TIMESTAMPTZ NULL`
- `acknowledged_at TIMESTAMPTZ NULL`
- `activated_at TIMESTAMPTZ NULL`
- `due_at TIMESTAMPTZ NULL` (copied from update at publish for SLA snapshot)
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique `(partner_update_id, partner_organization_id)`

Indexes:
- `(organization_id, partner_update_id, status)`
- `(organization_id, partner_organization_id, updated_at DESC)`
- `(organization_id, due_at, status)`

### 6.4 `partner_update_activity`
Purpose: append-only event timeline for analytics/audit.

Fields:
- `id UUID PK`
- `organization_id UUID NOT NULL`
- `partner_update_id UUID NOT NULL`
- `partner_organization_id UUID NULL`
- `actor_user_id TEXT NULL`
- `event_type TEXT NOT NULL`
  - suggested values: `published|notification_sent|opened|kit_item_viewed|kit_item_downloaded|copied|acknowledged|activated|reminder_sent`
- `event_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`

Indexes:
- `(organization_id, partner_update_id, event_at DESC)`
- `(organization_id, partner_organization_id, event_at DESC)`
- `(organization_id, event_type, event_at DESC)`

### 6.5 `partner_message_preferences`
Purpose: global and brand-level channel consent for partner messaging.

Fields:
- `id UUID PK`
- `partner_organization_id UUID NOT NULL FK -> organizations(id)`
- `brand_organization_id UUID NULL FK -> organizations(id)` (`NULL` means global Stackcess-level setting)
- `scope_type TEXT NOT NULL` (`global|brand`)
- `channel TEXT NOT NULL` (`email|sms`)
- `status TEXT NOT NULL` (`opted_in|opted_out`)
- `consent_source TEXT NOT NULL` (`onboarding|settings|support`)
- `consent_text_version TEXT NULL`
- `consented_at TIMESTAMPTZ NULL`
- `revoked_at TIMESTAMPTZ NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- `scope_type='global'` requires `brand_organization_id IS NULL`.
- `scope_type='brand'` requires `brand_organization_id IS NOT NULL`.
- unique global row per partner/channel.
- unique brand row per partner/brand/channel.

Delivery resolution rule:
- channel send allowed only when:
  - global preference for channel is `opted_in`,
  - brand-specific preference is not `opted_out` (or absent),
  - recipient contact endpoint for channel exists and is deliverable.

## 7) Permissions and Access Rules

### 7.1 Brand
- Create/edit/publish/archive updates:
  - `owner/admin`, and future permission key `partner_updates.manage`.
- Read analytics:
  - `owner/admin/editor`, and future permission key `partner_updates.view`.

### 7.2 Partner
- View notifications and update detail only when:
  - active brand-partner relationship exists,
  - recipient snapshot row exists for partner org,
  - current scope + set permissions still allow linked resources.

Fail-closed behavior:
- If relationship revoked, update becomes inaccessible regardless of historical snapshot.

## 8) Recipient and Scope Resolution

At publish/schedule time:
1. Resolve target partner orgs from explicit selection and optional saved segments/lists.
2. Restrict resolution to active invited partner relationships for the brand (no implicit broadcast mode).
3. Optionally intersect by selected share sets.
4. Optionally apply market/channel/locale constraints.
5. Persist resolved recipients to `partner_update_recipients`.

Runtime read:
- Apply existing set-based and market-scope checks before rendering linked product/asset items.

## 8.1 Sets vs Kits (Authoritative)

- `Sets`:
  - Access-control and distribution boundary.
  - Define which partners can see which resources.
  - Reusable across many updates.
- `Kit Contents`:
  - Curated, front-facing package for one update.
  - Ordered and contextual (message + instructions + selected assets/products/docs).
  - Uses references to resources already managed by DAM/PIM and governed by Sets/scope.

In short:
- Sets decide visibility.
- Kits decide presentation and action context.

## 9) API Contract (V1)

Brand endpoints:
- `GET /api/[tenant]/updates`
- `POST /api/[tenant]/updates`
- `GET /api/[tenant]/updates/[updateId]`
- `PATCH /api/[tenant]/updates/[updateId]`
- `POST /api/[tenant]/updates/[updateId]/publish`
- `POST /api/[tenant]/updates/[updateId]/schedule`
- `POST /api/[tenant]/updates/[updateId]/remind`
- `GET /api/[tenant]/updates/[updateId]/analytics`

Kit item endpoints:
- `POST /api/[tenant]/updates/[updateId]/kit-items`
- `PATCH /api/[tenant]/updates/[updateId]/kit-items/[itemId]`
- `DELETE /api/[tenant]/updates/[updateId]/kit-items/[itemId]`

Partner endpoints:
- `GET /api/[tenant]/view/[scope]/updates`
- `GET /api/[tenant]/view/[scope]/updates/[updateId]`
- `POST /api/[tenant]/view/[scope]/updates/[updateId]/acknowledge` (actionable updates)
- `POST /api/[tenant]/view/[scope]/updates/[updateId]/activate` (actionable updates)
- `POST /api/[tenant]/view/[scope]/updates/[updateId]/events` (client event beacon: open/copy/view)

Partner preference endpoints:
- `GET /api/me/notification-preferences` (global channel preferences)
- `PUT /api/me/notification-preferences`
- `GET /api/me/notification-preferences/brands`
- `PUT /api/me/notification-preferences/brands/[brandOrganizationId]`

Notification integration:
- Extend existing `/api/me/notifications` event builder to include update events:
  - `update_published`
  - `update_reminder`
- Home/dashboard widgets should consume `/api/me/notifications` with:
  - workspace filter (`all` or selected brand slug),
  - event-type filtering (`update_*`, `asset_added`, `product_added`),
  - compact payload mode for card rendering.

### 9.1 Example Payloads

Create update draft:
```json
{
  "title": "Protein Blend Formula Revision - March",
  "summary": "New formula and panel files are now active.",
  "urgency": "high",
  "event_label": "Formula revision",
  "labels": ["formula", "label", "ops"],
  "message_json": {
    "blocks": [
      { "type": "paragraph", "text": "Please replace old label assets before next send." }
    ]
  },
  "due_at": "2026-03-12T23:59:00Z"
}
```

Attach kit items:
```json
{
  "items": [
    { "itemType": "product", "productId": "uuid-product-1", "title": "Updated PIM record" },
    { "itemType": "asset", "assetId": "uuid-asset-1", "title": "Updated Label PDF" },
    { "itemType": "asset", "assetId": "uuid-asset-2", "title": "Updated Facts Panel" },
    {
      "itemType": "text",
      "title": "Partner instruction",
      "contentJson": { "text": "Retire old panel in all active campaigns." }
    }
  ]
}
```

Publish update:
```json
{
  "recipientSelection": {
    "partnerOrganizationIds": ["uuid-partner-1", "uuid-partner-2"],
    "partnerSegmentIds": ["uuid-segment-1"],
    "shareSetIds": ["uuid-set-1"],
    "marketIds": ["uuid-market-1"],
    "channelIds": [],
    "localeIds": []
  },
  "deliveryChannels": ["in_app", "email"]
}
```

## 10) Notification Delivery and Consent

V1 channel behavior:
- In-app notifications are mandatory.
- Email notifications are transactional via Resend when channel includes `email` and consent passes.
- SMS notifications require channel consent and a verified SMS delivery path (provider integration may be feature-flagged if not yet enabled).

Consent gating:
- No email/SMS send unless channel is globally opted in by partner.
- Partner can opt out per brand even when globally opted in.
- Global opt-out blocks all brand and Stackcess update messages for that channel.
- In-app updates continue regardless of email/SMS opt-out.

Email payload minimum:
- brand name
- update title
- urgency
- due date (if set)
- CTA: `View Update`

Delivery/audit:
- store `provider_message_id` in activity metadata on `notification_sent`.
- store send failures as `event_type='notification_failed'`.
- store consent decision metadata for each attempted send (`allowed|blocked` and reason).

## 11) UI/UX Scope

Brand:
- New nav/module: `Partner Updates`
- Pages:
  - updates list (filters: status, urgency, due, partner segment)
  - create/edit update
  - update analytics detail
  - no separate `/kits` module required in V1

Partner:
- Continue using `Notifications` queue.
- On onboarding, show two consent checkboxes:
  - "Email me update notifications from Stackcess and invited brands."
  - "SMS me update notifications from Stackcess and invited brands."
- Add `Updates` list page to browse all currently shared updates (not only unread notifications).
- Use `/{tenant}/view/all` as the partner default home surface with widgets:
  - `Updates Requiring Action` (new or overdue updates),
  - `New Assets Shared`,
  - `New Products Shared`.
- Widget behavior must respect view scope:
  - `scope=all`: cross-brand aggregated cards,
  - `scope={brandSlug}`: only that brand's cards.
- Add update notification cards with urgency and due chips.
- Update detail sections:
  - Summary
  - Kit Contents
  - Linked Product Records
  - Acknowledge + Activate actions
- Add partner settings surface for message controls:
  - global email/sms toggles,
  - per-brand email/sms overrides,
  - recent consent change log.

Announcement-only rendering:
- If update has no kit items, hide `Kit Contents` section and render message-focused layout.

## 12) Metrics and Success Criteria

Core metrics:
- `publish_count`
- `recipient_count`
- `notified_rate`
- `open_rate`
- `acknowledge_rate`
- `activation_rate`
- `median_time_to_acknowledge`
- `median_time_to_activate`
- `overdue_recipient_count`

Metric interpretation:
- announcement-only updates contribute to notify/open metrics.
- acknowledge/activate/timing metrics are computed on actionable updates only.

V1 success threshold:
- Brand can answer: "Who has acted on this update, and who is overdue?"

## 12.1 Retention and History (V1)

- Partner-visible update history is kept forever in V1.
- No automatic time-based purge or archive window in V1.
- Updates remain visible while partner relationship and permissions remain active.
- If access is revoked, update history is no longer visible to that partner.

## 13) Rollout Plan

Phase 1: Foundation
- Migrations for 5 new tables + RLS + indexes (including `partner_message_preferences`).
- Brand CRUD for draft updates and kit items.

Phase 2: Publish + Notifications
- Recipient resolution.
- Publish/schedule flows.
- Resend integration and in-app notification event wiring.

Phase 3: Partner Actions + Analytics
- Acknowledge/activate endpoints.
- Activity capture and dashboard metrics.
- Reminder workflow.

## 14) RLS and Security Notes

- All new tables are org-scoped with RLS enabled.
- Brand writes limited to own `organization_id`.
- Partner reads allowed only through active relationship and explicit recipient membership checks.
- Keep security audit logging for publish/remind/acknowledge/activate actions.
- Log consent preference changes and blocked send decisions for auditability.

## 15) Open Questions

1. Should `acknowledge` be mandatory before `activate`?
2. Should due date be required for `high/critical` urgency?
3. Should recipient snapshot include member-level targeting in V1, or org-level only?
4. Should update emails support digest mode in V1.1?
5. Should partner action require optional confirmation text ("where applied") in V1?

## 16) Explicitly Deferred to V2+

- UTM/redirect click tracking and downstream attribution.
- Retailer snippet and revenue linkage.
- Auto-generated update types from product field diffs.
- MDF/reward mechanics.
- Cross-brand benchmark scoring.

## 17) Acceptance Criteria (V1)

1. Brand can create, edit, and publish an update without selecting a fixed event type.
2. Brand can publish either:
   - announcement-only message (no kit items), or
   - update with one or more kit items.
3. Publish creates recipient snapshot rows and notification events.
4. Partner can see update in `Notifications` and open detail:
   - announcement-only: informational read/open only (no required acknowledge),
   - actionable: acknowledge and activate actions available.
5. Brand analytics shows per-recipient status and timestamps.
6. Revoked partner relationship blocks further access immediately.
7. All update actions are auditable via update activity and security audit logs.
8. Kit creation never creates duplicate DAM assets; every asset item references existing `dam_assets.id`.
9. Partner downloads in kit detail use existing DAM access paths and permission checks.
10. Partner `/{tenant}/view/all` shows update + asset + product widgets and respects selected brand/view-all scope logic.
11. Onboarding captures explicit partner consent for email and SMS channels via two independent checkboxes.
12. Partner can opt out globally by channel and set per-brand overrides by channel.
13. Email/SMS sends are blocked when consent rules fail; in-app notifications remain available.
